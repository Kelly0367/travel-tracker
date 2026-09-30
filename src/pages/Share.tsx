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
  Clock,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useTrackerStore } from '@/store/useTrackerStore'
import MapView from '@/components/MapView'
import StatusPanel from '@/components/StatusPanel'
import type { TrackPoint } from '@/lib/types'

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
  const [intervalSeconds, setIntervalSeconds] = useState(300) // 上报间隔（秒），默认5分钟
  const [isCustomInterval, setIsCustomInterval] = useState(false)
  const [customSeconds, setCustomSeconds] = useState('60')

  const watchIdRef = useRef<number | null>(null)
  const lastGeocodeKeyRef = useRef('')
  const batteryRef = useRef<number | null>(null)
  const latestPointRef = useRef<TrackPoint | null>(null)
  const reportTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const intervalSecondsRef = useRef(intervalSeconds)
  const codeRef = useRef<string>('')

  // 预设间隔选项（秒）
  const PRESET_INTERVALS = [
    { value: 30, label: '30 秒' },
    { value: 60, label: '1 分钟' },
    { value: 120, label: '2 分钟' },
    { value: 180, label: '3 分钟' },
    { value: 300, label: '5 分钟' },
    { value: 480, label: '8 分钟' },
    { value: 600, label: '10 分钟' },
  ]

  // 将秒数格式化为易读文字
  const formatInterval = (sec: number): string => {
    if (sec < 60) return `${sec} 秒`
    if (sec % 60 === 0) return `${sec / 60} 分钟`
    return `${Math.floor(sec / 60)} 分 ${sec % 60} 秒`
  }

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
      codeRef.current = result.code
      intervalSecondsRef.current = intervalSeconds
      // 分享链接以浏览器当前地址为准：这是访问者真实可达的域名。
      // 后端返回的 shareUrl 在反向代理后面可能带内部主机名，不能直接给家人用。
      setShareUrl(`${window.location.origin}/watch/${result.code}`)
      setPhase('sharing')
      setOnline(true)
      startWatching()
      startReporting()
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建会话失败')
    }
  }

  // 定时上报最新位置
  const startReporting = () => {
    // 先立即上报一次
    reportLatest()
    const intervalMs = intervalSecondsRef.current * 1000
    reportTimerRef.current = setInterval(reportLatest, intervalMs)
  }

  const reportLatest = async () => {
    const point = latestPointRef.current
    if (!point || !codeRef.current) return
    try {
      await api.reportLocation(
        codeRef.current,
        point.latitude,
        point.longitude,
        point.accuracy,
        point.timestamp,
        point.battery,
      )
    } catch {
      // 上报失败不阻塞，下次重试
    }
  }

  // 启动位置监听
  const startWatching = () => {
    if (!navigator.geolocation) {
      setGeoError('当前浏览器不支持定位功能')
      return
    }

    // 采集电池电量
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number; addEventListener: (e: string, cb: () => void) => void }> }
    if (nav.getBattery) {
      nav.getBattery().then((bat) => {
        batteryRef.current = bat.level
        bat.addEventListener('levelchange', () => {
          batteryRef.current = bat.level
        })
      }).catch(() => {})
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const point: TrackPoint = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: Date.now(),
          battery: batteryRef.current,
        }
        latestPointRef.current = point
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
    if (reportTimerRef.current) {
      clearInterval(reportTimerRef.current)
      reportTimerRef.current = null
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
      if (reportTimerRef.current) {
        clearInterval(reportTimerRef.current)
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

              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-sm text-white/70">
                  <Clock size={16} /> 位置上报间隔
                </label>
                <select
                  value={isCustomInterval ? 'custom' : String(intervalSeconds)}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === 'custom') {
                      setIsCustomInterval(true)
                      setCustomSeconds(String(intervalSeconds))
                    } else {
                      setIsCustomInterval(false)
                      setIntervalSeconds(Number(v))
                    }
                  }}
                  className="w-full bg-navy-900/60 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-teal/50 transition-colors"
                >
                  {PRESET_INTERVALS.map((opt) => (
                    <option key={opt.value} value={opt.value} className="bg-navy-900">
                      {opt.label}
                    </option>
                  ))}
                  <option value="custom" className="bg-navy-900">
                    自定义
                  </option>
                </select>
                {isCustomInterval && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={10}
                      value={customSeconds}
                      onChange={(e) => {
                        const v = e.target.value
                        setCustomSeconds(v)
                        const n = parseInt(v, 10)
                        if (!isNaN(n) && n >= 10) {
                          setIntervalSeconds(n)
                        }
                      }}
                      className="flex-1 bg-navy-900/60 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-teal/50 transition-colors"
                    />
                    <span className="text-sm text-white/50">秒</span>
                  </div>
                )}
                <p className="text-xs text-white/40">
                  当前：每 {formatInterval(intervalSeconds)} 上报一次位置
                </p>
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
      <div className="absolute inset-0 z-0">
        <MapView current={current} track={track} variant="share" address={address} />
      </div>

      {/* 顶部栏 */}
      <div className="relative z-50 p-4">
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
      <div className="relative z-50 px-4 -mt-2">
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
          <div className="mt-3 flex items-center gap-1.5 text-xs text-white/40">
            <Clock size={12} />
            每 {formatInterval(intervalSeconds)} 上报一次位置
          </div>
        </div>
      </div>

      {/* 状态面板 + 底部控制 */}
      <div className="relative z-50 mt-auto p-4 space-y-3">
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
