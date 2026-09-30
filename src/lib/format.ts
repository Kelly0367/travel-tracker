export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatCoord(value: number, digits = 5): string {
  return value.toFixed(digits)
}

export function timeAgo(ts: number): string {
  const diff = Math.max(0, Date.now() - ts)
  const sec = Math.floor(diff / 1000)
  if (sec < 5) return '刚刚'
  if (sec < 60) return `${sec} 秒前`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  return `${hr} 小时前`
}

/** 十进制度 -> 度分秒（DMS），带 N/S/E/W 方向 */
export function toDMS(deg: number, isLat: boolean): string {
  const dir = isLat ? (deg >= 0 ? 'N' : 'S') : deg >= 0 ? 'E' : 'W'
  const abs = Math.abs(deg)
  const d = Math.floor(abs)
  const mFloat = (abs - d) * 60
  const m = Math.floor(mFloat)
  const s = (mFloat - m) * 60
  return `${d}°${String(m).padStart(2, '0')}′${s.toFixed(1)}″${dir}`
}

/** 经纬度 DMS 组合显示 */
export function coordDMS(lat: number, lon: number): string {
  return `${toDMS(lat, true)} ${toDMS(lon, false)}`
}

/** 距离格式化：米或公里 */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} 米`
  return `${(meters / 1000).toFixed(2)} 公里`
}

/** 时长格式化：X时Y分 或 Y分 */
export function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60000)
  if (totalMin < 1) return '不足 1 分钟'
  const hr = Math.floor(totalMin / 60)
  const min = totalMin % 60
  if (hr === 0) return `${min} 分钟`
  if (min === 0) return `${hr} 小时`
  return `${hr} 时 ${min} 分`
}

/** 电池电量显示 */
export function formatBattery(battery: number | null | undefined): string {
  if (battery == null) return '—'
  return `${Math.round(battery * 100)}%`
}
