import { useEffect, useMemo, useRef, useState } from 'react'
import type { TrackPoint } from '@/lib/types'
import { formatCoord, formatTime, formatBattery } from '@/lib/format'
import {
  AMAP_KEY,
  AMAP_SECURITY,
  AMAP_SERVICE_TYPE,
  AMAP_ENTRY,
  isAmapConfigured,
} from '@/lib/map-config'

interface MapViewProps {
  current: TrackPoint | null
  track: TrackPoint[]
  variant?: 'share' | 'watch'
  address?: string
}

/* ==================================================================
   降级方案：自绘轨迹示意图
   纯 SVG，不请求任何第三方瓦片，永不白屏
   在「未配置地图 Key」或地图加载失败时启用
   ================================================================== */

function projectToSvg(
  points: TrackPoint[],
  w: number,
  h: number,
  pad: number,
): { x: number; y: number }[] {
  if (!points.length) return []
  const lats = points.map((p) => p.latitude)
  const lngs = points.map((p) => p.longitude)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)

  // 等距方位投影 + 经度按纬度余弦修正，保证轨迹形状不走样
  const midLat = (minLat + maxLat) / 2
  const cosLat = Math.cos((midLat * Math.PI) / 180) || 1

  const spanX = Math.max((maxLng - minLng) * cosLat, 1e-6)
  const spanY = Math.max(maxLat - minLat, 1e-6)
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY)

  const offX = (w - spanX * scale) / 2
  const offY = (h - spanY * scale) / 2

  return points.map((p) => ({
    x: offX + (p.longitude - minLng) * cosLat * scale,
    y: offY + (maxLat - p.latitude) * scale,
  }))
}

function TrackSketch({
  current,
  track,
  variant,
  note,
}: {
  current: TrackPoint | null
  track: TrackPoint[]
  variant: 'share' | 'watch'
  note?: string
}) {
  const W = 640
  const H = 360
  const PAD = 44

  const all = useMemo(() => {
    const list = [...track]
    if (current && !list.some((p) => p.timestamp === current.timestamp)) list.push(current)
    return list
  }, [track, current])

  const pts = useMemo(() => projectToSvg(all, W, H, PAD), [all])
  const color = variant === 'watch' ? '#FF8A3D' : '#00E5A0'

  if (pts.length === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[#0F1F38] text-center">
        <div className="text-sm text-white/60">还没有轨迹点</div>
        <div className="text-xs text-white/35">开始共享位置后，这里会画出当天的行走路线</div>
      </div>
    )
  }

  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const first = pts[0]
  const last = pts[pts.length - 1]

  const lngs = all.map((p) => p.longitude)
  const midLat = all.reduce((s, p) => s + p.latitude, 0) / all.length
  const spanMeters =
    (Math.max(...lngs) - Math.min(...lngs)) * 111320 * Math.cos((midLat * Math.PI) / 180)
  const scaleLabel =
    spanMeters >= 1000 ? `${(spanMeters / 1000).toFixed(1)} km 跨度` : `${Math.round(spanMeters)} m 跨度`

  return (
    <div className="relative h-full w-full bg-[#0F1F38]">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
        {/* 经纬网格，给一点地图感 */}
        {Array.from({ length: 7 }).map((_, i) => (
          <line
            key={`gx${i}`}
            x1={PAD + ((W - PAD * 2) / 6) * i}
            y1={PAD * 0.5}
            x2={PAD + ((W - PAD * 2) / 6) * i}
            y2={H - PAD * 0.5}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="1"
          />
        ))}
        {Array.from({ length: 5 }).map((_, i) => (
          <line
            key={`gy${i}`}
            x1={PAD * 0.5}
            y1={PAD + ((H - PAD * 2) / 4) * i}
            x2={W - PAD * 0.5}
            y2={PAD + ((H - PAD * 2) / 4) * i}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="1"
          />
        ))}

        {pts.length > 1 && (
          <path
            d={d}
            fill="none"
            stroke={color}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.9"
          />
        )}

        {pts.length > 2 &&
          pts.slice(1, -1).map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="4" fill="#4A9FE0" stroke="#0F1F38" strokeWidth="1.5" />
          ))}

        <circle cx={first.x} cy={first.y} r="6" fill="#F0A02A" stroke="#0F1F38" strokeWidth="2" />
        <circle cx={last.x} cy={last.y} r="7" fill="#C0392B" stroke="#fff" strokeWidth="2.5" />
        <circle cx={last.x} cy={last.y} r="14" fill="none" stroke="#C0392B" strokeWidth="1.5" opacity="0.4" />
      </svg>

      <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/45 px-2.5 py-1.5 text-[11px] leading-tight text-white/75 backdrop-blur">
        <div className="font-medium text-white/90">轨迹示意图</div>
        <div>
          {scaleLabel} · {all.length} 个点
        </div>
      </div>

      {note && (
        <div className="pointer-events-none absolute bottom-3 right-3 max-w-[60%] rounded-md bg-black/50 px-2 py-1 text-right text-[10px] leading-tight text-amber-300/80 backdrop-blur">
          {note}
        </div>
      )}

      <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-3 text-[10px] text-white/55">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-[#F0A02A]" />起点
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-[#4A9FE0]" />途经
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-[#C0392B]" />最新
        </span>
      </div>
    </div>
  )
}

/* ==================================================================
   合规底图：高德海外地图（新加坡节点，覆盖东南亚 / 泰国）
   海外坐标为 WGS84 原始 GPS，无需 GCJ-02 转换
   ================================================================== */

let amapLoader: Promise<unknown> | null = null

/** 按官方要求：先设全局配置，再加载入口脚本 */
function loadAmap(): Promise<unknown> {
  if (amapLoader) return amapLoader
  amapLoader = new Promise((resolve, reject) => {
    const w = window as unknown as Record<string, unknown>
    if (w.AMap) return resolve(w.AMap)

    // 两行配置都必须在入口脚本之前设置
    w._AMapSecurityConfig = { securityJsCode: AMAP_SECURITY }
    w._AMapServiceConfig = { type: AMAP_SERVICE_TYPE }

    const s = document.createElement('script')
    s.src = `${AMAP_ENTRY}&key=${encodeURIComponent(AMAP_KEY)}`
    s.onload = () =>
      w.AMap ? resolve(w.AMap) : reject(new Error('地图脚本已加载但 AMap 未就绪，请检查 Key'))
    s.onerror = () => reject(new Error('地图脚本加载失败，请检查网络或 Key 配置'))
    document.head.appendChild(s)
  })
  return amapLoader
}

const svgIcon = (svg: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)

/** 内联 SVG 图标，不引用任何外部图片资源 */
function makeDotIcon(AMap: any, color: string, r = 7) {
  const s = r * 2 + 4
  return new AMap.Icon({
    size: new AMap.Size(s, s),
    imageSize: new AMap.Size(s, s),
    image: svgIcon(`
      <svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">
        <circle cx="${s / 2}" cy="${s / 2}" r="${r + 1.5}" fill="${color}" opacity="0.28"/>
        <circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="${color}" stroke="#ffffff" stroke-width="2"/>
      </svg>`),
  })
}

function makePinIcon(AMap: any, color: string, ring: string) {
  return new AMap.Icon({
    size: new AMap.Size(26, 34),
    imageSize: new AMap.Size(26, 34),
    image: svgIcon(`
      <svg xmlns="http://www.w3.org/2000/svg" width="26" height="34" viewBox="0 0 26 34">
        <path d="M13 33C13 33 24 20.5 24 12.5C24 5.6 19.1 0 13 0C6.9 0 2 5.6 2 12.5
                 C2 20.5 13 33 13 33Z" fill="${color}" stroke="${ring}" stroke-width="2"/>
        <circle cx="13" cy="12.5" r="4.6" fill="#ffffff"/>
      </svg>`),
  })
}

function AmapCanvas({
  current,
  track,
  variant,
  address,
  onFail,
}: {
  current: TrackPoint | null
  track: TrackPoint[]
  variant: 'share' | 'watch'
  address?: string
  onFail: (msg: string) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const overlaysRef = useRef<any[]>([])
  // 是否已做过一次「缩放到全天轨迹」；只做一次，之后只跟随当前位置
  const fittedRef = useRef(false)
  // 上一次居中所用的坐标 key，避免同坐标反复触发抖动
  const lastCenterKeyRef = useRef('')

  // 初始化地图（只做一次）
  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        const AMap = (await loadAmap()) as any
        if (dead || !boxRef.current || mapRef.current) return

        const map = new AMap.Map(boxRef.current, {
          viewMode: '2D',
          zoom: 14,
          zoomEnable: true,
          center: [100.5018, 13.7563], // 曼谷，海外坐标 WGS84
          showOversea: true, // 关键：开启世界地图
          resizeEnable: true,
        })
        mapRef.current = map
      } catch (e) {
        if (!dead) onFail(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      dead = true
      try {
        mapRef.current?.destroy()
      } catch {
        /* ignore */
      }
      mapRef.current = null
    }
  }, [onFail])

  // 轨迹 / 当前位置变化时重绘
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const AMap = (window as any).AMap
    if (!AMap) return

    if (overlaysRef.current.length) {
      map.remove(overlaysRef.current)
      overlaysRef.current = []
    }

    const overlays: any[] = []
    const pathColor = variant === 'watch' ? '#FF8A3D' : '#00E5A0'
    const pinColor = variant === 'watch' ? '#C0392B' : '#00B894'

    // 1) 轨迹线
    if (track.length > 1) {
      overlays.push(
        new AMap.Polyline({
          path: track.map((p) => [p.longitude, p.latitude]),
          strokeColor: pathColor,
          strokeWeight: 4,
          strokeOpacity: 0.88,
          lineJoin: 'round',
          lineCap: 'round',
          showDir: true,
          zIndex: 50,
        }),
      )
    }

    // 2) 起点
    if (track.length > 1) {
      const sm = new AMap.Marker({
        position: [track[0].longitude, track[0].latitude],
        icon: makeDotIcon(AMap, '#F0A02A', 8),
        offset: new AMap.Pixel(-10, -10),
        zIndex: 130,
      })
      sm.on('click', () => {
        const info = new AMap.InfoWindow({
          isCustom: false,
          offset: new AMap.Pixel(0, -28),
          content: `<div style="font:13px/1.6 system-ui,-apple-system,sans-serif;min-width:150px">
            <b>起点</b><br>
            <span style="color:#888;font-size:12px">${formatCoord(track[0].latitude)}, ${formatCoord(track[0].longitude)}</span><br>
            <span style="color:#888;font-size:12px">${formatTime(track[0].timestamp)}</span>
          </div>`,
        })
        info.open(map, [track[0].longitude, track[0].latitude])
      })
      overlays.push(sm)
    }

    // 3) 当前位置
    if (current) {
      const m = new AMap.Marker({
        position: [current.longitude, current.latitude],
        icon: makePinIcon(AMap, pinColor, '#ffffff'),
        offset: new AMap.Pixel(-13, -34),
        zIndex: 300,
      })
      m.on('click', () => {
        const batteryText =
          current.battery != null ? ` · 电量${formatBattery(current.battery)}` : ''
        const accuracyText =
          current.accuracy != null ? ` · 精度±${Math.round(current.accuracy)}m` : ''
        const info = new AMap.InfoWindow({
          isCustom: false,
          offset: new AMap.Pixel(0, -28),
          content: `<div style="font:13px/1.6 system-ui,-apple-system,sans-serif;min-width:170px">
            <b>${variant === 'watch' ? '当前位置' : '我的位置'}</b><br>
            ${address ? `<span style="color:#333">${address}</span><br>` : ''}
            <span style="color:#888;font-size:12px">${formatCoord(current.latitude)}, ${formatCoord(current.longitude)}</span><br>
            <span style="color:#888;font-size:12px">${formatTime(current.timestamp)}${accuracyText}${batteryText}</span>
          </div>`,
        })
        info.open(map, [current.longitude, current.latitude])
      })
      overlays.push(m)
    }

    if (overlays.length) {
      map.add(overlays)
      overlaysRef.current = overlays
    }

    // 视图策略：首次缩放到全天轨迹，之后只平移跟随当前位置，
    // 避免家人端每次刷新都被拉回全天视野、丢失当前位置焦点
    const centerKey = current
      ? `${current.latitude.toFixed(5)},${current.longitude.toFixed(5)}`
      : ''

    if (!fittedRef.current && track.length > 1) {
      try {
        map.setFitView(overlays, false, [60, 60, 60, 60])
        fittedRef.current = true
        lastCenterKeyRef.current = centerKey
      } catch {
        /* ignore */
      }
    } else if (current && centerKey !== lastCenterKeyRef.current) {
      lastCenterKeyRef.current = centerKey
      try {
        map.setCenter([current.longitude, current.latitude])
        if (map.getZoom() < 13) map.setZoom(15)
      } catch {
        /* ignore */
      }
    } else if (!fittedRef.current && current) {
      try {
        map.setCenter([current.longitude, current.latitude])
        map.setZoom(15)
      } catch {
        /* ignore */
      }
    }
  }, [track, current, variant, address, onFail])

  return <div ref={boxRef} className="h-full w-full" />
}

export default function MapView({ current, track, variant = 'share', address = '' }: MapViewProps) {
  const [mapError, setMapError] = useState<string | null>(null)
  const configured = isAmapConfigured()

  const handleFail = useMemo(
    () => (msg: string) => {
      console.warn('[MapView] 地图加载失败，降级为自绘示意图:', msg)
      setMapError(msg)
    },
    [],
  )

  // 未配置 Key 或加载失败 → 自绘示意图，绝不白屏
  if (!configured || mapError) {
    return (
      <div className="relative h-full w-full">
        <TrackSketch
          current={current}
          track={track}
          variant={variant}
          note={mapError ? '地图加载失败，已切换示意图' : undefined}
        />
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      <AmapCanvas
        current={current}
        track={track}
        variant={variant}
        address={address}
        onFail={handleFail}
      />

      {/* 地址浮层 */}
      {address && (
        <div className="pointer-events-none absolute left-3 top-3 z-[1000] max-w-[70%] rounded-md bg-black/50 px-2.5 py-1.5 text-[11px] leading-snug text-white/90 backdrop-blur">
          {address}
        </div>
      )}
    </div>
  )
}
