import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient, type Client } from '@libsql/client'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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
  battery: number | null
}

export interface TrackPoint {
  latitude: number
  longitude: number
  accuracy: number | null
  timestamp: number
  battery: number | null
}

export type { SessionRow, LocationRow }

// ---------------------------------------------------------------------------
// Turso（libSQL）云端模式：配置了 TURSO_DATABASE_URL 时启用
// ---------------------------------------------------------------------------

const tursoUrl = process.env.TURSO_DATABASE_URL
const tursoToken = process.env.TURSO_AUTH_TOKEN

let sql: Client | null = null
let useSql = false

export async function initDb(): Promise<void> {
  if (!tursoUrl) {
    // 本地开发：JSON 文件兜底
    loadFileData()
    return
  }

  sql = createClient({ url: tursoUrl, authToken: tursoToken })
  useSql = true

  await sql.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
    code        TEXT PRIMARY KEY,
    nickname    TEXT NOT NULL,
    is_online   INTEGER NOT NULL DEFAULT 1,
    created_at  INTEGER NOT NULL,
    last_seen   INTEGER NOT NULL
  )`)
  await sql.execute(`
    CREATE TABLE IF NOT EXISTS locations (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    code      TEXT NOT NULL,
    latitude  REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy  REAL,
    timestamp INTEGER NOT NULL,
    battery   REAL
  )`)
  await sql.execute(
    'CREATE INDEX IF NOT EXISTS idx_locations_code_ts ON locations(code, timestamp)',
  )
}

function toSession(row: Record<string, unknown>): SessionRow {
  return {
    code: String(row.code),
    nickname: String(row.nickname),
    is_online: Number(row.is_online),
    created_at: Number(row.created_at),
    last_seen: Number(row.last_seen),
  }
}

function toTrackPoint(row: Record<string, unknown>): TrackPoint {
  return {
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    accuracy: row.accuracy === null || row.accuracy === undefined ? null : Number(row.accuracy),
    timestamp: Number(row.timestamp),
    battery: row.battery === null || row.battery === undefined ? null : Number(row.battery),
  }
}

// ---------------------------------------------------------------------------
// 本地 JSON 文件兜底（未配置云数据库时使用，保持本地开发零配置）
// ---------------------------------------------------------------------------

interface DataFile {
  sessions: SessionRow[]
  locations: LocationRow[]
  nextLocationId: number
}

const dbPath = path.join(__dirname, '..', 'tracker-data.json')

let fileData: DataFile = { sessions: [], locations: [], nextLocationId: 1 }

function loadFileData(): void {
  try {
    if (fs.existsSync(dbPath)) {
      const raw = fs.readFileSync(dbPath, 'utf-8')
      fileData = JSON.parse(raw) as DataFile
    }
  } catch {
    // ignore corrupt file
  }
}

let saveTimer: NodeJS.Timeout | null = null
function saveFileDebounced(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(dbPath, JSON.stringify(fileData), 'utf-8')
    } catch {
      // ignore write errors
    }
  }, 200)
}

// ---------------------------------------------------------------------------
// 统一的异步数据访问接口
// ---------------------------------------------------------------------------

export async function createSession(
  code: string,
  nickname: string,
  created_at: number,
  last_seen: number,
): Promise<void> {
  if (useSql && sql) {
    await sql.execute({
      sql: 'INSERT INTO sessions (code, nickname, is_online, created_at, last_seen) VALUES (?, ?, 1, ?, ?)',
      args: [code, nickname, created_at, last_seen],
    })
    return
  }
  fileData.sessions.push({ code, nickname, is_online: 1, created_at, last_seen })
  saveFileDebounced()
}

export async function getSession(code: string): Promise<SessionRow | undefined> {
  if (useSql && sql) {
    const rs = await sql.execute({
      sql: 'SELECT code, nickname, is_online, created_at, last_seen FROM sessions WHERE code = ?',
      args: [code],
    })
    const row = rs.rows[0] as Record<string, unknown> | undefined
    return row ? toSession(row) : undefined
  }
  return fileData.sessions.find((s) => s.code === code)
}

export async function setSessionOnline(
  code: string,
  is_online: number,
  last_seen: number,
): Promise<void> {
  if (useSql && sql) {
    await sql.execute({
      sql: 'UPDATE sessions SET is_online = ?, last_seen = ? WHERE code = ?',
      args: [is_online, last_seen, code],
    })
    return
  }
  const s = fileData.sessions.find((x) => x.code === code)
  if (s) {
    s.is_online = is_online
    s.last_seen = last_seen
    saveFileDebounced()
  }
}

export async function insertLocation(
  code: string,
  latitude: number,
  longitude: number,
  accuracy: number | null,
  timestamp: number,
  battery: number | null,
): Promise<void> {
  if (useSql && sql) {
    await sql.execute({
      sql: 'INSERT INTO locations (code, latitude, longitude, accuracy, timestamp, battery) VALUES (?, ?, ?, ?, ?, ?)',
      args: [code, latitude, longitude, accuracy, timestamp, battery],
    })
    return
  }
  fileData.locations.push({
    id: fileData.nextLocationId++,
    code,
    latitude,
    longitude,
    accuracy,
    timestamp,
    battery,
  })
  saveFileDebounced()
}

export async function getTrackByRange(
  code: string,
  startTs: number,
  endTs: number,
): Promise<TrackPoint[]> {
  if (useSql && sql) {
    const rs = await sql.execute({
      sql: `SELECT latitude, longitude, accuracy, timestamp, battery
            FROM locations
            WHERE code = ? AND timestamp >= ? AND timestamp <= ?
            ORDER BY timestamp ASC`,
      args: [code, startTs, endTs],
    })
    return rs.rows.map((r) => toTrackPoint(r as Record<string, unknown>))
  }
  return fileData.locations
    .filter((l) => l.code === code && l.timestamp >= startTs && l.timestamp <= endTs)
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(({ latitude, longitude, accuracy, timestamp, battery }) => ({
      latitude,
      longitude,
      accuracy,
      timestamp,
      battery,
    }))
}

export async function getTrackDates(code: string): Promise<string[]> {
  let timestamps: number[]
  if (useSql && sql) {
    const rs = await sql.execute({
      sql: 'SELECT timestamp FROM locations WHERE code = ?',
      args: [code],
    })
    timestamps = rs.rows.map((r) => Number((r as Record<string, unknown>).timestamp))
  } else {
    timestamps = fileData.locations.filter((l) => l.code === code).map((l) => l.timestamp)
  }

  const dates = new Set<string>()
  timestamps.forEach((ts) => {
    const d = new Date(ts)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`
    dates.add(key)
  })
  return Array.from(dates).sort().reverse()
}

export async function getLatestLocation(
  code: string,
): Promise<TrackPoint | undefined> {
  if (useSql && sql) {
    const rs = await sql.execute({
      sql: `SELECT latitude, longitude, accuracy, timestamp, battery
            FROM locations WHERE code = ? ORDER BY timestamp DESC LIMIT 1`,
      args: [code],
    })
    const row = rs.rows[0] as Record<string, unknown> | undefined
    return row ? toTrackPoint(row) : undefined
  }
  const locs = fileData.locations
    .filter((l) => l.code === code)
    .sort((a, b) => b.timestamp - a.timestamp)
  if (locs.length === 0) return undefined
  const l = locs[0]
  return {
    latitude: l.latitude,
    longitude: l.longitude,
    accuracy: l.accuracy,
    timestamp: l.timestamp,
    battery: l.battery,
  }
}
