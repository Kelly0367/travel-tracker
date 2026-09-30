import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dbPath = path.join(__dirname, '..', 'tracker-data.json')

interface DataFile {
  sessions: SessionRow[]
  locations: LocationRow[]
  nextLocationId: number
}

interface SessionRow {
  code: string
  nickname: string
  is_online: number
  created_at: number
  last_seen: number
}

interface LocationRow {
  id: number
  code: string
  latitude: number
  longitude: number
  accuracy: number | null
  timestamp: number
}

const data: DataFile = loadData()

function loadData(): DataFile {
  try {
    if (fs.existsSync(dbPath)) {
      const raw = fs.readFileSync(dbPath, 'utf-8')
      return JSON.parse(raw) as DataFile
    }
  } catch {
    // ignore corrupt file
  }
  return { sessions: [], locations: [], nextLocationId: 1 }
}

let saveTimer: NodeJS.Timeout | null = null
function saveDebounced() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(dbPath, JSON.stringify(data), 'utf-8')
    } catch {
      // ignore write errors
    }
  }, 200)
}

// 模拟 prepared statement 接口
interface PreparedStatement {
  run(...args: unknown[]): void
  get(...args: unknown[]): unknown
  all(...args: unknown[]): unknown[]
}

export const createSession: PreparedStatement = {
  run(code: string, nickname: string, created_at: number, last_seen: number) {
    data.sessions.push({ code, nickname, is_online: 1, created_at, last_seen })
    saveDebounced()
  },
  get() {
    return undefined
  },
  all() {
    return []
  },
}

export const getSession: PreparedStatement = {
  run() {},
  get(code: string) {
    return data.sessions.find((s) => s.code === code)
  },
  all() {
    return data.sessions
  },
}

export const setSessionOnline: PreparedStatement = {
  run(is_online: number, last_seen: number, code: string) {
    const s = data.sessions.find((x) => x.code === code)
    if (s) {
      s.is_online = is_online
      s.last_seen = last_seen
      saveDebounced()
    }
  },
  get() {
    return undefined
  },
  all() {
    return []
  },
}

export const insertLocation: PreparedStatement = {
  run(
    code: string,
    latitude: number,
    longitude: number,
    accuracy: number | null,
    timestamp: number,
  ) {
    data.locations.push({
      id: data.nextLocationId++,
      code,
      latitude,
      longitude,
      accuracy,
      timestamp,
    })
    saveDebounced()
  },
  get() {
    return undefined
  },
  all() {
    return []
  },
}

export const getTodayTrack: PreparedStatement = {
  run() {},
  get() {
    return undefined
  },
  all(code: string, startOfToday: number) {
    return data.locations
      .filter((l) => l.code === code && l.timestamp >= startOfToday)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(({ latitude, longitude, accuracy, timestamp }) => ({
        latitude,
        longitude,
        accuracy,
        timestamp,
      }))
  },
}

// 按时间范围查询轨迹
export const getTrackByRange: PreparedStatement = {
  run() {},
  get() {
    return undefined
  },
  all(code: string, startTs: number, endTs: number) {
    return data.locations
      .filter((l) => l.code === code && l.timestamp >= startTs && l.timestamp <= endTs)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(({ latitude, longitude, accuracy, timestamp }) => ({
        latitude,
        longitude,
        accuracy,
        timestamp,
      }))
  },
}

// 获取该会话有轨迹记录的日期列表（YYYY-MM-DD）
export function getTrackDates(code: string): string[] {
  const dates = new Set<string>()
  data.locations
    .filter((l) => l.code === code)
    .forEach((l) => {
      const d = new Date(l.timestamp)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      dates.add(key)
    })
  return Array.from(dates).sort().reverse()
}

export const getLatestLocation: PreparedStatement = {
  run() {},
  get(code: string) {
    const locs = data.locations
      .filter((l) => l.code === code)
      .sort((a, b) => b.timestamp - a.timestamp)
    if (locs.length === 0) return undefined
    const l = locs[0]
    return {
      latitude: l.latitude,
      longitude: l.longitude,
      accuracy: l.accuracy,
      timestamp: l.timestamp,
    }
  },
  all() {
    return []
  },
}

export type { SessionRow, LocationRow }
