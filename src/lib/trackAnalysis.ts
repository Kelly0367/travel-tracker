import type { TrackPoint } from './types'

const EARTH_RADIUS = 6371000 // 地球半径，米

/** Haversine 公式计算两点间距离（米） */
export function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS * c
}

/** 计算轨迹总移动距离（米） */
export function totalDistance(track: TrackPoint[]): number {
  if (track.length < 2) return 0
  let dist = 0
  for (let i = 1; i < track.length; i++) {
    dist += haversine(
      track[i - 1].latitude,
      track[i - 1].longitude,
      track[i].latitude,
      track[i].longitude,
    )
  }
  return dist
}

/** 停留点 / 移动段 */
export interface TrackSegment {
  type: 'stay' | 'move'
  start: TrackPoint
  end: TrackPoint
  durationMs: number
  distanceMeters: number
  points: TrackPoint[]
}

/**
 * 停留点检测：
 * - 将连续的、彼此距离小于 stayRadius 米的点归为一组
 * - 若该组持续时间 >= stayMinMs，则判定为停留段
 * - 否则归为移动段
 */
export function detectSegments(
  track: TrackPoint[],
  stayRadius = 50, // 停留半径阈值（米）
  stayMinMs = 5 * 60 * 1000, // 最短停留时长（5 分钟）
): TrackSegment[] {
  if (track.length === 0) return []
  if (track.length === 1) {
    return [
      {
        type: 'stay',
        start: track[0],
        end: track[0],
        durationMs: 0,
        distanceMeters: 0,
        points: [track[0]],
      },
    ]
  }

  const segments: TrackSegment[] = []
  let clusterStart = 0

  for (let i = 1; i <= track.length; i++) {
    const cur = track[i]

    // 判断是否还在停留簇内
    const stillInCluster =
      cur != null &&
      haversine(
        track[clusterStart].latitude,
        track[clusterStart].longitude,
        cur.latitude,
        cur.longitude,
      ) <= stayRadius

    if (!stillInCluster || i === track.length) {
      const clusterPoints = track.slice(clusterStart, i)
      const durationMs =
        clusterPoints[clusterPoints.length - 1].timestamp - clusterPoints[0].timestamp
      const isStay = durationMs >= stayMinMs

      segments.push({
        type: isStay ? 'stay' : 'move',
        start: clusterPoints[0],
        end: clusterPoints[clusterPoints.length - 1],
        durationMs,
        distanceMeters: isStay ? 0 : totalDistance(clusterPoints),
        points: clusterPoints,
      })

      clusterStart = i
    }
  }

  // 合并相邻的同类型段
  return mergeAdjacent(segments)
}

function mergeAdjacent(segments: TrackSegment[]): TrackSegment[] {
  if (segments.length <= 1) return segments
  const merged: TrackSegment[] = []
  for (const seg of segments) {
    const last = merged[merged.length - 1]
    if (last && last.type === seg.type) {
      last.end = seg.end
      last.durationMs = seg.end.timestamp - last.start.timestamp
      last.distanceMeters += seg.distanceMeters
      last.points.push(...seg.points)
    } else {
      merged.push({ ...seg, points: [...seg.points] })
    }
  }
  return merged
}

/** 统计信息 */
export interface TrackStats {
  totalPoints: number
  totalDistance: number
  stayCount: number
  totalDurationMs: number
  firstTimestamp: number | null
  lastTimestamp: number | null
}

export function computeStats(track: TrackPoint[]): TrackStats {
  const segs = detectSegments(track)
  return {
    totalPoints: track.length,
    totalDistance: totalDistance(track),
    stayCount: segs.filter((s) => s.type === 'stay').length,
    totalDurationMs:
      track.length >= 2
        ? track[track.length - 1].timestamp - track[0].timestamp
        : 0,
    firstTimestamp: track.length > 0 ? track[0].timestamp : null,
    lastTimestamp: track.length > 0 ? track[track.length - 1].timestamp : null,
  }
}
