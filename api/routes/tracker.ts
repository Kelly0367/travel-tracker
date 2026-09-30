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
}

// 创建会话
router.post('/sessions', (req: Request, res: Response) => {
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
    existing = getSession.get(code) as SessionRow | undefined
  } while (existing)

  const now = Date.now()
  createSession.run(code, trimmed, now, now)

  const shareUrl = `${req.protocol}://${req.get('host')}/watch/${code}`

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
router.get('/sessions/:code', (req: Request, res: Response) => {
  const { code } = req.params
  const session = getSession.get(code.toUpperCase()) as SessionRow | undefined

  if (!session) {
    return res.status(404).json({ success: false, error: '分享码不存在' })
  }

  const latest = getLatestLocation.get(code) as
    | { latitude: number; longitude: number; accuracy: number | null; timestamp: number }
    | undefined

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
router.get('/sessions/:code/track', (req: Request, res: Response) => {
  const { code } = req.params
  const dateParam = (req.query.date as string) || todayStr()
  const upperCode = code.toUpperCase()

  const session = getSession.get(upperCode) as SessionRow | undefined
  if (!session) {
    return res.status(404).json({ success: false, error: '分享码不存在' })
  }

  const { start, end } = getDayRange(dateParam)
  const track = getTrackByRange.all(upperCode, start, end) as Array<{
    latitude: number
    longitude: number
    accuracy: number | null
    timestamp: number
  }>

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
router.get('/sessions/:code/dates', (req: Request, res: Response) => {
  const { code } = req.params
  const upperCode = code.toUpperCase()
  const session = getSession.get(upperCode) as SessionRow | undefined

  if (!session) {
    return res.status(404).json({ success: false, error: '分享码不存在' })
  }

  const dates = getTrackDates(upperCode)
  return res.json({
    success: true,
    data: {
      code: session.code,
      dates,
    },
  })
})

// 上报位置
router.post('/locations', (req: Request, res: Response) => {
  const body = req.body as LocationBody
  const { code, latitude, longitude, accuracy, timestamp } = body

  if (!code || typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({ success: false, error: '参数不完整' })
  }

  const upperCode = code.toUpperCase()
  const session = getSession.get(upperCode) as SessionRow | undefined
  if (!session) {
    return res.status(404).json({ success: false, error: '分享码不存在' })
  }

  const ts = timestamp || Date.now()
  insertLocation.run(upperCode, latitude, longitude, accuracy ?? null, ts)
  setSessionOnline.run(1, ts, upperCode)

  // 通过 app.locals 触发 socket 推送
  const io = req.app.locals.io
  if (io) {
    io.to(`room:${upperCode}`).emit('location:update', {
      code: upperCode,
      latitude,
      longitude,
      accuracy: accuracy ?? null,
      timestamp: ts,
    })
  }

  return res.json({ success: true })
})

// 停止共享
router.post('/sessions/:code/offline', (req: Request, res: Response) => {
  const { code } = req.params
  const upperCode = code.toUpperCase()
  const session = getSession.get(upperCode) as SessionRow | undefined

  if (!session) {
    return res.status(404).json({ success: false, error: '分享码不存在' })
  }

  setSessionOnline.run(0, Date.now(), upperCode)

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
