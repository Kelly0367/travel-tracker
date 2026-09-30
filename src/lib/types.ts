export interface TrackPoint {
  latitude: number
  longitude: number
  accuracy: number | null
  timestamp: number
}

export interface SessionInfo {
  code: string
  nickname: string
  is_online: boolean
  created_at: number
  last_seen: number
  latest_location: TrackPoint | null
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export interface CreateSessionResult {
  code: string
  shareUrl: string
  nickname: string
}
