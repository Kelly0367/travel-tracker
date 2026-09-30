import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Search,
  Wifi,
  WifiOff,
  Clock,
  MapPin,
  AlertTriangle,
  Loader2,
  CalendarDays,
  Battery,
  Footprints,
  MapPinned,
  Timer,
} from 'lucide-react'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import type { TrackPoint } from '@/lib/types'
import {
  formatCoord,
  formatTime,
  timeAgo,
  coordDMS,
  formatDistance,
  formatDuration,
  formatBattery,
} from '@/lib/format'
import { detectSegments, computeStats } from '@/lib/trackAnalysis'
import MapView from '@/components/MapView'

function todayStr(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function formatDateLabel(dateStr: string): string {
  const today = todayStr()
  if (dateStr === today) return '今天'
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`
  if (dateStr === yStr) return '昨天'
  const [, m, d] = dateStr.split('-')
  return `${parseInt(m)}月${parseInt(d)}日`
}

export default function Watch() {
  const navigate = useNavigate()
  const { code: urlCode } = useParams()

  const [code, setCode] = useState(urlCode?.toUpperCase() || '')
  const [inputCode, setInputCode] = useState(urlCode?.toUpperCase() || '')
  const [nickname, setNickname] = useState('')
  const [isOnline, setIsOnline] = useState(false)
  const [track, setTrack] = useState<TrackPoint[]>([])
  const [availableDates, setAvailableDates] = useState<string[]>([])
  const [selectedDate, setSelectedDate] = useState<string>(todayStr())
  const [loading, setLoading] = useState(!!urlCode)
  const [loadingTrack, setLoadingTrack] = useState(false)
  const [error, setError] = useState('')
  const [lastUpdate, setLastUpdate] = useState<number | null>(null)
  const [showTimeline, setShowTimeline] = useState(false)
  const [address, setAddress] = useState('')
  const [addressLoading, setAddressLoading] = useState(false)

  const current = useMemo(
    () => (track.length > 0 ? track[track.length - 1] : null),
    [track],
  )

  const segments = useMemo(() => detectSegments(track), [track])
  const stats = useMemo(() => computeStats(track), [track])

  const isToday = selectedDate === todayStr()

  // 加载指定日期的轨迹
  const loadTrack = useCallback(async (sessionCode: string, date: string) => {
    setLoadingTrack(true)
    try {
      const data = await api.getTrack(sessionCode, date)
      setTrack(data.track)
    } catch {
      setTrack([])
    } finally {
      setLoadingTrack(false)
    }
  }, [])

  // 加载会话 + 可用日期 + 当天轨迹
  const loadSession = useCallback(async (sessionCode: string) => {
    setLoading(true)
    setError('')
    try {
      const [session, datesData] = await Promise.all([
        api.getSession(sessionCode),
        api.getTrackDates(sessionCode),
      ])
      setNickname(session.nickname)
      setIsOnline(session.is_online)
      setAvailableDates(datesData.dates)
      if (session.latest_location) {
        setLastUpdate(session.latest_location.timestamp)
      }
      setCode(sessionCode.toUpperCase())
      setInputCode(sessionCode.toUpperCase())

      const today = todayStr()
      setSelectedDate(today)
      await loadTrack(sessionCode.toUpperCase(), today)
    } catch (e) {
      setError(e instanceof Error ? e.message : '分享码无效')
      setTrack([])
      setAvailableDates([])
    } finally {
      setLoading(false)
    }
  }, [loadTrack])

  // 切换日期
  const handleDateChange = (date: string) => {
    if (!code || date === selectedDate) return
    setSelectedDate(date)
    setShowTimeline(false)
    loadTrack(code, date)
  }

  // 连接 socket 监听实时位置
  useEffect(() => {
    if (!code) return

    const socket = getSocket()
    socket.emit('watch:join', { code })

    const onLocation = (data: TrackPoint & { code: string }) => {
      // 只有查看今天时才实时追加
      const today = todayStr()
      const pointDate = new Date(data.timestamp)
      const pStr = `${pointDate.getFullYear()}-${String(pointDate.getMonth() + 1).padStart(2, '0')}-${String(pointDate.getDate()).padStart(2, '0')}`
      if (pStr === today && selectedDate === today) {
        setTrack((prev) => [...prev, data])
      }
      setLastUpdate(data.timestamp)
      setIsOnline(true)
    }

    const onOffline = () => {
      setIsOnline(false)
    }

    socket.on('location:update', onLocation)
    socket.on('session:offline', onOffline)

    return () => {
      socket.emit('watch:leave', { code })
      socket.off('location:update', onLocation)
      socket.off('session:offline', onOffline)
    }
  }, [code, selectedDate])

  // 初始加载
  useEffect(() => {
    if (urlCode) {
      loadSession(urlCode)
    }
  }, [urlCode, loadSession])

  // 当前位置变化时解析地址
  const lastGeocodeKey = useRef('')
  useEffect(() => {
    if (!current) {
      setAddress('')
      return
    }
    const key = `${current.latitude.toFixed(4)},${current.longitude.toFixed(4)}`
    if (key === lastGeocodeKey.current) return
    lastGeocodeKey.current = key

    let cancelled = false
    setAddressLoading(true)
    api
      .reverseGeocode(current.latitude, current.longitude)
      .then((data) => {
        if (!cancelled) setAddress(data.address)
      })
      .catch(() => {
        if (!cancelled) setAddress('')
      })
      .finally(() => {
        if (!cancelled) setAddressLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [current])

  const handleSearch = () => {
    const trimmed = inputCode.trim().toUpperCase()
    if (!trimmed) return
    navigate(`/watch/${trimmed}`, { replace: true })
    loadSession(trimmed)
  }

  // 未加载到会话时的输入界面
  if (!code && !loading) {
    return (
      <div className="min-h-screen flex flex-col px-5 py-8 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -bottom-20 -right-10 w-80 h-80 rounded-full bg-sunset/15 blur-3xl" />
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
              <h2 className="font-display text-2xl font-bold">查看实时位置</h2>
              <p className="text-white/55 text-sm">
                输入旅行者分享的 6 位分享码，即可查看其实时位置与当日轨迹。
              </p>
            </div>

            <div className="glass rounded-2xl p-5 space-y-4">
              <input
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="输入分享码"
                maxLength={6}
                className="w-full bg-navy-900/60 border border-white/10 rounded-xl px-4 py-4 text-center font-mono text-2xl tracking-[0.3em] text-white placeholder:text-white/30 focus:outline-none focus:border-sunset/50 transition-colors"
              />
              {error && (
                <div className="flex items-center gap-2 text-sm text-red-400">
                  <AlertTriangle size={16} />
                  {error}
                </div>
              )}
              <button
                onClick={handleSearch}
                disabled={!inputCode.trim()}
                className="w-full bg-gradient-to-r from-sunset to-sunset-dark text-navy-900 font-semibold py-3.5 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-sunset/20 transition-all active:scale-[0.98]"
              >
                查看位置
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col relative">
      {/* 地图 */}
      <div className="absolute inset-0 z-0">
        <MapView current={current} track={track} variant="watch" address={address} />
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
            <div className="w-9 h-9 rounded-full bg-sunset/20 flex items-center justify-center text-sunset font-semibold text-sm">
              {nickname.charAt(0).toUpperCase() || '?'}
            </div>
            <div className="text-right">
              <div className="text-sm font-medium leading-tight">{nickname || '加载中...'}</div>
              <div className="flex items-center gap-1 text-xs text-white/50">
                {isOnline ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-teal animate-breathe" />
                    在线
                  </>
                ) : (
                  <>
                    <WifiOff size={11} />
                    离线
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="w-9" />
        </div>
      </div>

      {/* 加载中 */}
      {loading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-navy-900/60 backdrop-blur-sm">
          <div className="flex items-center gap-3 text-white/70">
            <Loader2 size={24} className="animate-spin text-sunset" />
            正在获取位置信息...
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {error && !loading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-navy-900/70 backdrop-blur-sm px-6">
          <div className="glass rounded-2xl p-6 max-w-sm text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center mx-auto">
              <AlertTriangle size={24} className="text-red-400" />
            </div>
            <div className="font-semibold">{error}</div>
            <p className="text-sm text-white/50">
              请确认分享码是否正确，或让旅行者重新生成分享码。
            </p>
            <button
              onClick={() => {
                setError('')
                setCode('')
              }}
              className="mt-2 px-5 py-2 rounded-xl bg-white/10 text-sm hover:bg-white/15 transition-colors"
            >
              重新输入
            </button>
          </div>
        </div>
      )}

      {/* 底部信息面板 */}
      {!loading && !error && (
        <div className="relative z-50 mt-auto p-4 space-y-3">
          {/* 日期选择器 */}
          <div className="glass rounded-2xl p-3 animate-slide-up">
            <div className="flex items-center gap-2 mb-2">
              <CalendarDays size={14} className="text-sunset" />
              <span className="text-xs text-white/50">选择日期查看历史轨迹</span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto scroll-thin pb-1">
              {availableDates.length === 0 ? (
                <span className="text-xs text-white/40 px-1">暂无历史轨迹</span>
              ) : (
                availableDates.map((date) => (
                  <button
                    key={date}
                    onClick={() => handleDateChange(date)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      selectedDate === date
                        ? 'bg-sunset text-navy-900'
                        : 'bg-white/5 text-white/60 hover:bg-white/10'
                    }`}
                  >
                    {formatDateLabel(date)}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* 当前位置卡片 */}
          <div className="glass rounded-2xl p-4 animate-slide-up">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 text-sm">
                {isToday && isOnline ? (
                  <span className="flex items-center gap-1.5 text-teal">
                    <Wifi size={14} /> 实时位置
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-white/50">
                    <MapPin size={14} /> {formatDateLabel(selectedDate)}轨迹
                  </span>
                )}
              </div>
              {loadingTrack ? (
                <Loader2 size={14} className="animate-spin text-white/40" />
              ) : lastUpdate ? (
                <div className="flex items-center gap-1 text-xs text-white/50">
                  <Clock size={12} />
                  {timeAgo(lastUpdate)}
                </div>
              ) : null}
            </div>

            {current ? (
              <div className="space-y-3">
                {/* 地址 */}
                <div className="flex items-start gap-1.5">
                  <MapPin size={13} className="text-sunset mt-0.5 flex-shrink-0" />
                  <div className="text-sm leading-snug">
                    {addressLoading ? (
                      <span className="text-white/40">解析地址中...</span>
                    ) : address ? (
                      address
                    ) : (
                      <span className="text-white/40">暂无地址信息</span>
                    )}
                  </div>
                </div>

                {/* 坐标（十进制 + DMS） */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-xs text-white/50">
                    <MapPin size={12} /> 坐标
                  </div>
                  <div className="font-mono text-sm">
                    {formatCoord(current.latitude, 5)}°N, {formatCoord(current.longitude, 5)}°E
                  </div>
                  <div className="font-mono text-xs text-white/50">
                    {coordDMS(current.latitude, current.longitude)}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1 text-xs text-white/50">
                      <Clock size={12} /> 时间
                    </div>
                    <div className="text-sm">{formatTime(current.timestamp)}</div>
                    <div className="text-xs text-white/50">
                      {current.accuracy != null ? `精度 ±${Math.round(current.accuracy)} 米` : '—'}
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1 text-xs text-white/50">
                      <Battery size={12} /> 设备电量
                    </div>
                    <div className={`text-sm ${current.battery != null && current.battery < 0.2 ? 'text-red-400' : ''}`}>
                      {formatBattery(current.battery)}
                    </div>
                    <div className="text-xs text-white/50">
                      {current.battery != null && current.battery < 0.2 ? '电量偏低' : '正常'}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-white/40 py-2 text-center">
                旅行者尚未上报位置，请稍候...
              </div>
            )}

            {/* 当日统计 */}
            {track.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="bg-white/5 rounded-xl p-2.5 text-center">
                  <div className="flex items-center justify-center gap-1 text-xs text-white/50 mb-1">
                    <Footprints size={12} /> 移动距离
                  </div>
                  <div className="text-sm font-semibold">{formatDistance(stats.totalDistance)}</div>
                </div>
                <div className="bg-white/5 rounded-xl p-2.5 text-center">
                  <div className="flex items-center justify-center gap-1 text-xs text-white/50 mb-1">
                    <MapPinned size={12} /> 停留点
                  </div>
                  <div className="text-sm font-semibold">{stats.stayCount}</div>
                </div>
                <div className="bg-white/5 rounded-xl p-2.5 text-center">
                  <div className="flex items-center justify-center gap-1 text-xs text-white/50 mb-1">
                    <Timer size={12} /> 主要时间
                  </div>
                  <div className="text-sm font-semibold">{formatDuration(stats.totalDurationMs)}</div>
                </div>
              </div>
            )}

            <button
              onClick={() => setShowTimeline((v) => !v)}
              className="mt-3 w-full text-xs text-white/50 hover:text-white/80 transition-colors flex items-center justify-center gap-1"
            >
              {showTimeline ? '收起轨迹时间轴' : `查看${formatDateLabel(selectedDate)}轨迹 (${track.length} 个点)`}
            </button>
          </div>

          {/* 轨迹时间轴（按停留/移动分段） */}
          {showTimeline && track.length > 0 && (
            <div className="glass rounded-2xl p-4 max-h-72 overflow-y-auto scroll-thin animate-slide-up">
              <div className="text-xs text-white/50 mb-3">{formatDateLabel(selectedDate)}轨迹时间轴 · 点按可在地图定位</div>
              <div className="space-y-3">
                {[...segments].reverse().map((seg, i) => {
                  const isCurrent = i === 0 && isToday && seg.type === 'stay'
                  return (
                    <div key={i} className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-5 flex flex-col items-center pt-1">
                        <div
                          className={`w-2.5 h-2.5 rounded-full ${
                            seg.type === 'stay' ? 'bg-teal' : 'bg-sunset/70'
                          }`}
                        />
                        {i < segments.length - 1 && <div className="w-px h-8 bg-white/10 mt-1" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">
                            {formatTime(seg.start.timestamp)}
                          </span>
                          {seg.type === 'stay' ? (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-teal/15 text-teal">
                              停留 {formatDuration(seg.durationMs)}
                            </span>
                          ) : (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-sunset/15 text-sunset">
                              移动 {formatDistance(seg.distanceMeters)}
                            </span>
                          )}
                          {isCurrent && (
                            <span className="text-xs text-sunset">当前</span>
                          )}
                        </div>
                        <div className="text-xs text-white/50 mt-0.5">
                          {formatTime(seg.start.timestamp)} – {formatTime(seg.end.timestamp)}
                        </div>
                        <div className="font-mono text-xs text-white/40 mt-0.5">
                          {formatCoord(seg.end.latitude, 4)}, {formatCoord(seg.end.longitude, 4)}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* 全部行程统计 */}
              <div className="mt-4 pt-3 border-t border-white/10 grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-white/50">点位总数</div>
                  <div className="text-sm font-semibold">{stats.totalPoints}</div>
                </div>
                <div>
                  <div className="text-xs text-white/50">累计移动</div>
                  <div className="text-sm font-semibold">{formatDistance(stats.totalDistance)}</div>
                </div>
                <div>
                  <div className="text-xs text-white/50">停留点</div>
                  <div className="text-sm font-semibold">{stats.stayCount}</div>
                </div>
                <div>
                  <div className="text-xs text-white/50">最近定位</div>
                  <div className="text-sm font-semibold">
                    {stats.lastTimestamp ? formatTime(stats.lastTimestamp) : '—'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 搜索其他 */}
          <button
            onClick={() => {
              setCode('')
              setError('')
              setInputCode('')
              navigate('/watch', { replace: true })
            }}
            className="w-full glass rounded-xl py-2.5 text-sm text-white/60 hover:text-white flex items-center justify-center gap-1.5 transition-colors"
          >
            <Search size={16} /> 查看其他分享码
          </button>
        </div>
      )}
    </div>
  )
}
