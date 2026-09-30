import { Router, type Request, type Response } from 'express'
import {
  createSession,
  getSession,
  getTrackByRange,
  getTrackDates,
  getLatestLocation,
  insertLocation,
  setSessionOnline,
  type SessionRow,
  type TrackPoint,
} from '../db.js'
import { generateCode, getDayRange, todayStr } from '../utils.js'
import { reverseGeocode } from '../geocode.js'

const router = Router()

interface CreateSessionBody {
  nickname: string
}

interface LocationBody {
  code: string
  latitude: number
  longitude: number
  accuracy: number
  timestamp: number
  battery?: number | null
}

// 创建会话
router.post('/sessions', async (req: Request, res: Response) => {
  const { nickname } = req.body as CreateSessionBody

  if (!nickname || typeof nickname !== 'string') {
    return res.status(400).json({ success: false, error: '昵称不能为空' })
  }

  const trimmed = nickname.trim()
  if (!trimmed) {
    return res.status(400).json({ success: false, error: '昵称不能为空' })
  }

  let code: string
  let existing: SessionRow | undefined
  // 确保分享码唯一
  do {
    code = generateCode(6)
    existing = await getSession(code)
  } while (existing)

  const now = Date.now()
  await createSession(code, trimmed, now, now)

  // 分享链接必须使用对外可访问的域名。
  // 部署环境里服务在反向代理之后，req.get('host') 会拿到内部沙箱主机名，
  // 家人打开会失败。优先用显式配置的公网地址，其次才回退到请求头。
  const publicOrigin =
    process.env.PUBLIC_ORIGIN?.replace(/\/+$/, '') ||
    (req.get('x-forwarded-host')
      ? `${req.get('x-forwarded-proto') || 'https'}://${req.get('x-forwarded-host')}`
      : `${req.protocol}://${req.get('host')}`)

  const shareUrl = `${publicOrigin}/watch/${code}`

  return res.json({
    success: true,
    data: {
      code,
      shareUrl,
      nickname: trimmed,
    },
  })
})

// 获取会话信息
router.get('/sessions/:code', async (req: Request, res: Response) => {
  const { code } = req.params
  const session = await getSession(code.toUpperCase())

  if (!session) {
    return res.status(404).json({ success: false, error: '分享码不存在' })
  }

  const latest = await getLatestLocation(code)

  return res.json({
    success: true,
    data: {
      code: session.code,
      nickname: session.nickname,
      is_online: session.is_online === 1,
      created_at: session.created_at,
      last_seen: session.last_seen,
      latest_location: latest || null,
    },
  })
})

// 获取轨迹（支持 ?date=YYYY-MM-DD，默认当天）
router.get('/sessions/:code/track', async (req: Request, res: Response) => {
  const { code } = req.params
  const dateParam = (req.query.date as string) || todayStr()
  const upperCode = code.toUpperCase()

  const session = await getSession(upperCode)
  if (!session) {
    return res.status(404).json({ success: false, error: '分享码不存在' })
  }

  const { start, end } = getDayRange(dateParam)
  const track: TrackPoint[] = await getTrackByRange(upperCode, start, end)

  return res.json({
    success: true,
    data: {
      code: session.code,
      nickname: session.nickname,
      is_online: session.is_online === 1,
      date: dateParam,
      track,
    },
  })
})

// 获取有轨迹记录的日期列表
router.get('/sessions/:code/dates', async (req: Request, res: Response) => {
  const { code } = req.params
  const upperCode = code.toUpperCase()
  const session = await getSession(upperCode)

  if (!session) {
    return res.status(404).json({ success: false, error: '分享码不存在' })
  }

  const dates = await getTrackDates(upperCode)
  return res.json({
    success: true,
    data: {
      code: session.code,
      dates,
    },
  })
})

// 上报位置
router.post('/locations', async (req: Request, res: Response) => {
  const body = req.body as LocationBody
  const { code, latitude, longitude, accuracy, timestamp, battery } = body

  if (!code || typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({ success: false, error: '参数不完整' })
  }

  const upperCode = code.toUpperCase()
  const session = await getSession(upperCode)
  if (!session) {
    return res.status(404).json({ success: false, error: '分享码不存在' })
  }

  const ts = timestamp || Date.now()
  const bat = typeof battery === 'number' ? battery : null
  await insertLocation(upperCode, latitude, longitude, accuracy ?? null, ts, bat)
  await setSessionOnline(upperCode, 1, ts)

  // 通过 app.locals 触发 socket 推送
  const io = req.app.locals.io
  if (io) {
    io.to(`room:${upperCode}`).emit('location:update', {
      code: upperCode,
      latitude,
      longitude,
      accuracy: accuracy ?? null,
      timestamp: ts,
      battery: bat,
    })
  }

  return res.json({ success: true })
})

// 停止共享
router.post('/sessions/:code/offline', async (req: Request, res: Response) => {
  const { code } = req.params
  const upperCode = code.toUpperCase()
  const session = await getSession(upperCode)

  if (!session) {
    return res.status(404).json({ success: false, error: '分享码不存在' })
  }

  await setSessionOnline(upperCode, 0, Date.now())

  const io = req.app.locals.io
  if (io) {
    io.to(`room:${upperCode}`).emit('session:offline', { code: upperCode })
  }

  return res.json({ success: true })
})

// 反向地理编码：经纬度 -> 地址
router.get('/geocode/reverse', async (req: Request, res: Response) => {
  const lat = parseFloat(req.query.lat as string)
  const lon = parseFloat(req.query.lon as string)
  if (isNaN(lat) || isNaN(lon)) {
    return res.status(400).json({ success: false, error: '经纬度参数无效' })
  }
  const address = await reverseGeocode(lat, lon)
  return res.json({ success: true, data: { latitude: lat, longitude: lon, address } })
})

export default router
