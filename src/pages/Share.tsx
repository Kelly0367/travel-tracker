import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Copy,
  Check,
  StopCircle,
  Share2,
  User,
  AlertTriangle,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useTrackerStore } from '@/store/useTrackerStore'
import MapView from '@/components/MapView'
import StatusPanel from '@/components/StatusPanel'

type Phase = 'setup' | 'sharing'

export default function Share() {
  const navigate = useNavigate()
  const { code, nickname, isOnline, current, track, reportCount, setSession, setOnline, addPoint, setTrack, reset } =
    useTrackerStore()

  const [phase, setPhase] = useState<Phase>('setup')
  const [nameInput, setNameInput] = useState('')
  const [shareUrl, setShareUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [geoError, setGeoError] = useState('')
  const [address, setAddress] = useState('')

  const watchIdRef = useRef<number | null>(null)
  const lastReportRef = useRef(0)
  const lastGeocodeKeyRef = useRef('')

  // 开始共享
  const handleStart = async () => {
    const name = nameInput.trim()
    if (!name) {
      setError('请输入昵称')
      return
    }
    try {
      const result = await api.createSession(name)
      setSession(result.code, result.nickname)
      setShareUrl(result.shareUrl)
      setPhase('sharing')
      setOnline(true)
      startWatching(result.code)
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建会话失败')
    }
  }

  // 启动位置监听
  const startWatching = (sessionCode: string) => {
    if (!navigator.geolocation) {
      setGeoError('当前浏览器不支持定位功能')
      return
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const point = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: Date.now(),
        }
        addPoint(point)

        // 解析地址（去重，4位小数精度）
        const gkey = `${point.latitude.toFixed(4)},${point.longitude.toFixed(4)}`
        if (gkey !== lastGeocodeKeyRef.current) {
          lastGeocodeKeyRef.current = gkey
          api
            .reverseGeocode(point.latitude, point.longitude)
            .then((data) => setAddress(data.address))
            .catch(() => {})
        }

        // 节流：至少间隔 3 秒上报一次
        const now = Date.now()
        if (now - lastReportRef.current >= 3000) {
          lastReportRef.current = now
          try {
            await api.reportLocation(
              sessionCode,
              point.latitude,
              point.longitude,
              point.accuracy,
              point.timestamp,
            )
          } catch {
            // 上报失败不阻塞，下次重试
          }
        }
      },
      (err) => {
        const messages: Record<number, string> = {
          1: '定位权限被拒绝，请在浏览器设置中允许定位',
          2: '暂时无法获取位置信息，请检查网络或 GPS',
          3: '获取位置超时，请稍后重试',
        }
        setGeoError(messages[err.code] || err.message)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000,
      },
    )
  }

  // 停止共享
  const handleStop = async () => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    if (code) {
      try {
        await api.goOffline(code)
      } catch {
        // ignore
      }
    }
    setOnline(false)
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl || `${window.location.origin}/watch/${code}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
      const input = document.createElement('input')
      input.value = shareUrl
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // 清理
  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [])

  // 加载已有轨迹
  useEffect(() => {
    if (phase === 'sharing' && code) {
      api.getTrack(code).then((data) => setTrack(data.track)).catch(() => {})
    }
  }, [phase, code, setTrack])

  if (phase === 'setup') {
    return (
      <div className="min-h-screen flex flex-col px-5 py-8 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-20 -left-10 w-80 h-80 rounded-full bg-teal/20 blur-3xl" />
        </div>

        <button
          onClick={() => navigate('/')}
          className="relative z-10 flex items-center gap-1.5 text-white/60 text-sm w-fit hover:text-white transition-colors"
        >
          <ArrowLeft size={18} /> 返回
        </button>

        <div className="relative z-10 flex-1 flex flex-col justify-center max-w-md w-full mx-auto">
          <div className="space-y-6 animate-slide-up">
            <div className="space-y-2">
              <h2 className="font-display text-2xl font-bold">开启位置共享</h2>
              <p className="text-white/55 text-sm">
                输入你的昵称，系统会生成一个分享码，将其发送给家人即可让他们实时看到你的位置。
              </p>
            </div>

            <div className="glass rounded-2xl p-5 space-y-4">
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-sm text-white/70">
                  <User size={16} /> 你的昵称
                </label>
                <input
                  value={nameInput}
                  onChange={(e) => {
                    setNameInput(e.target.value)
                    setError('')
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleStart()}
                  placeholder="例如：小明"
                  maxLength={20}
                  className="w-full bg-navy-900/60 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-teal/50 transition-colors"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-400">
                  <AlertTriangle size={16} />
                  {error}
                </div>
              )}

              <button
                onClick={handleStart}
                disabled={!nameInput.trim()}
                className="w-full bg-gradient-to-r from-teal to-teal-dark text-navy-900 font-semibold py-3.5 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-teal/20 transition-all active:scale-[0.98]"
              >
                生成分享码并开始
              </button>
            </div>

            <div className="text-xs text-white/40 leading-relaxed">
              点击开始后，浏览器会请求定位权限。请保持页面打开以持续上报位置，建议将手机连接电源并保持屏幕常亮。
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 共享中界面
  return (
    <div className="h-screen flex flex-col relative">
      {/* 地图 */}
      <div className="absolute inset-0">
        <MapView current={current} track={track} variant="share" address={address} />
      </div>

      {/* 顶部栏 */}
      <div className="relative z-10 p-4">
        <div className="glass rounded-2xl px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-white/70 text-sm hover:text-white"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-teal/20 flex items-center justify-center text-teal font-semibold text-sm">
              {nickname.charAt(0).toUpperCase()}
            </div>
            <span className="font-medium">{nickname}</span>
          </div>
          <div className="w-9" />
        </div>
      </div>

      {/* 分享码卡片 */}
      <div className="relative z-10 px-4 -mt-2">
        <div className="glass rounded-2xl p-4 animate-slide-up">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-white/50">分享码</span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs text-teal hover:text-teal-dark transition-colors"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? '已复制' : '复制链接'}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="font-mono text-3xl font-bold tracking-[0.2em] text-teal">
              {code}
            </div>
            <div className="flex-1 text-xs text-white/50 leading-relaxed">
              将此码或链接发给家人，
              <br />
              在「我是家人」处输入即可查看
            </div>
            <Share2 size={20} className="text-sunset flex-shrink-0" />
          </div>
        </div>
      </div>

      {/* 状态面板 + 底部控制 */}
      <div className="relative z-10 mt-auto p-4 space-y-3">
        {geoError && (
          <div className="glass rounded-xl px-4 py-3 flex items-start gap-2 text-sm text-amber-300 animate-fade-in">
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
            <span>{geoError}</span>
          </div>
        )}

        <StatusPanel
          isOnline={isOnline}
          current={current}
          reportCount={reportCount}
          lastSeen={current?.timestamp ?? null}
          address={address}
        />

        {isOnline ? (
          <button
            onClick={handleStop}
            className="w-full glass border border-red-500/30 text-red-400 font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-red-500/10 transition-colors active:scale-[0.98]"
          >
            <StopCircle size={20} />
            停止共享
          </button>
        ) : (
          <div className="glass rounded-xl px-4 py-3 text-center text-sm text-white/60">
            共享已停止，家人端将显示离线状态。
            <button
              onClick={() => {
                reset()
                setPhase('setup')
                setGeoError('')
              }}
              className="ml-2 text-teal underline"
            >
              重新开始
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
