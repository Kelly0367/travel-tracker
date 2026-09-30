import { create } from 'zustand'
import type { TrackPoint } from '@/lib/types'

interface TrackerState {
  code: string | null
  nickname: string
  isOnline: boolean
  current: TrackPoint | null
  track: TrackPoint[]
  reportCount: number

  setSession: (code: string, nickname: string) => void
  setOnline: (online: boolean) => void
  addPoint: (point: TrackPoint) => void
  setTrack: (track: TrackPoint[]) => void
  reset: () => void
}

export const useTrackerStore = create<TrackerState>((set) => ({
  code: null,
  nickname: '',
  isOnline: false,
  current: null,
  track: [],
  reportCount: 0,

  setSession: (code, nickname) => set({ code, nickname }),
  setOnline: (isOnline) => set({ isOnline }),
  addPoint: (point) =>
    set((state) => ({
      current: point,
      track: [...state.track, point],
      reportCount: state.reportCount + 1,
    })),
  setTrack: (track) =>
    set({
      track,
      current: track.length > 0 ? track[track.length - 1] : null,
    }),
  reset: () =>
    set({
      code: null,
      nickname: '',
      isOnline: false,
      current: null,
      track: [],
      reportCount: 0,
    }),
}))
