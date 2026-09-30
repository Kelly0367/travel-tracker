import { Wifi, WifiOff, Navigation, Clock, Activity, MapPin, Battery } from 'lucide-react'
import type { TrackPoint } from '@/lib/types'
import { formatCoord, formatTime, timeAgo, formatBattery } from '@/lib/format'

interface StatusPanelProps {
  isOnline: boolean
  current: TrackPoint | null
  reportCount: number
  lastSeen: number | null
  address?: string
}

export default function StatusPanel({
  isOnline,
  current,
  reportCount,
  lastSeen,
  address = '',
}: StatusPanelProps) {
  return (
    <div className="glass rounded-2xl p-4 space-y-3 animate-slide-up">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isOnline ? (
            <span className="flex items-center gap-1.5 text-teal text-sm font-medium">
              <Wifi size={16} />
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-teal opacity-75 animate-breathe" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-teal" />
              </span>
              正在共享
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-white/50 text-sm font-medium">
              <WifiOff size={16} />
              已停止
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-white/60">
          <Activity size={14} />
          {reportCount} 次上报
        </div>
      </div>

      {current ? (
        <div className="space-y-3">
          {address && (
            <div className="flex items-start gap-1.5">
              <MapPin size={13} className="text-teal mt-0.5 flex-shrink-0" />
              <div className="text-sm leading-snug text-white/90">{address}</div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1 text-xs text-white/50">
                <Navigation size={12} /> 经纬度
              </div>
              <div className="font-mono text-sm text-white/90">
                {formatCoord(current.latitude)}
              </div>
              <div className="font-mono text-sm text-white/90">
                {formatCoord(current.longitude)}
              </div>
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-1 text-xs text-white/50">
                <Clock size={12} /> 更新时间
              </div>
              <div className="text-sm text-white/90">{formatTime(current.timestamp)}</div>
              <div className="text-xs text-white/50">
                {lastSeen ? timeAgo(lastSeen) : '—'}
              </div>
            </div>
          </div>

          {current.battery != null && (
            <div className="flex items-center gap-1.5 text-xs text-white/60">
              <Battery size={12} className={current.battery < 0.2 ? 'text-red-400' : 'text-teal'} />
              设备电量 {formatBattery(current.battery)}
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-white/40 py-2 text-center">等待获取位置...</div>
      )}
    </div>
  )
}
