import type {
  ApiResponse,
  CreateSessionResult,
  SessionInfo,
  TrackPoint,
} from './types'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const json = (await res.json()) as ApiResponse<T>
  if (!json.success || !json.data) {
    throw new Error(json.error || '请求失败')
  }
  return json.data
}

export const api = {
  createSession(nickname: string): Promise<CreateSessionResult> {
    return request<CreateSessionResult>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ nickname }),
    })
  },

  getSession(code: string): Promise<SessionInfo> {
    return request<SessionInfo>(`/api/sessions/${code.toUpperCase()}`)
  },

  getTrack(
    code: string,
    date?: string,
  ): Promise<{
    code: string
    nickname: string
    is_online: boolean
    date: string
    track: TrackPoint[]
  }> {
    const url = date
      ? `/api/sessions/${code.toUpperCase()}/track?date=${date}`
      : `/api/sessions/${code.toUpperCase()}/track`
    return request(url)
  },

  getTrackDates(code: string): Promise<{ code: string; dates: string[] }> {
    return request(`/api/sessions/${code.toUpperCase()}/dates`)
  },

  reportLocation(
    code: string,
    latitude: number,
    longitude: number,
    accuracy: number,
    timestamp: number,
    battery?: number | null,
  ): Promise<void> {
    return fetch('/api/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, latitude, longitude, accuracy, timestamp, battery }),
    }).then((res) => res.json())
  },

  goOffline(code: string): Promise<void> {
    return fetch(`/api/sessions/${code.toUpperCase()}/offline`, {
      method: 'POST',
    }).then((res) => res.json())
  },

  reverseGeocode(
    latitude: number,
    longitude: number,
  ): Promise<{ latitude: number; longitude: number; address: string }> {
    return request(
      `/api/geocode/reverse?lat=${latitude}&lon=${longitude}`,
    )
  },
}
