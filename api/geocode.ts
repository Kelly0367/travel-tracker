/**
 * 反向地理编码：经纬度 -> 可读地址
 * 使用 BigDataCloud（免费、无需 key、全球可用、支持中文）
 * 带内存缓存
 */

interface CacheEntry {
  address: string
  ts: number
}

const cache = new Map<string, CacheEntry>()
const CACHE_TTL = 24 * 60 * 60 * 1000 // 缓存 24 小时
const CACHE_PRECISION = 4 // 经纬度保留 4 位小数（约 11m）

function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(CACHE_PRECISION)},${lon.toFixed(CACHE_PRECISION)}`
}

async function bigDataCloudReverse(lat: number, lon: number): Promise<string> {
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh`
  const res = await fetch(url, {
    headers: { 'Accept-Language': 'zh-CN' },
  })

  if (!res.ok) {
    throw new Error(`geocode failed: ${res.status}`)
  }

  const data = (await res.json()) as {
    city?: string
    locality?: string
    principalSubdivision?: string
    countryName?: string
    localityInfo?: {
      administrative?: Array<{ name: string; order: number; adminLevel?: number }>
    }
  }

  // 从 administrative 列表中按 order 从小到大拼接（国家 -> 最详细区域）
  const adminList = data.localityInfo?.administrative || []
  if (adminList.length > 0) {
    const sorted = [...adminList].sort((a, b) => a.order - b.order)
    // 去重（相邻同名的只保留一个），并从最详细的往国家方向取，最多 4 层
    const seen = new Set<string>()
    const parts: string[] = []
    for (const item of sorted) {
      const name = item.name.trim()
      if (name && !seen.has(name)) {
        seen.add(name)
        parts.push(name)
      }
    }
    // 取最后 4 个（最详细的 4 层）
    const detail = parts.slice(-4)
    if (detail.length > 0) {
      return detail.join(' ')
    }
  }

  // fallback: 用顶层字段拼接
  const parts = [data.locality, data.city, data.principalSubdivision, data.countryName].filter(
    Boolean,
  ) as string[]
  // 去重
  const deduped = parts.filter((v, i, arr) => arr.indexOf(v) === i)
  return deduped.join(' ') || '未知地址'
}

/**
 * 反向地理编码，失败时返回空字符串（不抛错，避免影响主流程）
 */
export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
    return ''
  }

  const key = cacheKey(lat, lon)
  const cached = cache.get(key)
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.address
  }

  try {
    const address = await bigDataCloudReverse(lat, lon)
    cache.set(key, { address, ts: Date.now() })
    return address
  } catch {
    return ''
  }
}
