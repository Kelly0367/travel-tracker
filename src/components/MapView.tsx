import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { TrackPoint } from '@/lib/types'
import { formatCoord, formatTime, formatBattery } from '@/lib/format'

interface MapViewProps {
  current: TrackPoint | null
  track: TrackPoint[]
  variant?: 'share' | 'watch'
  address?: string
}

function makeIcon(variant: 'share' | 'watch') {
  return L.divIcon({
    className: '',
    html: `<div class="location-pulse ${variant === 'watch' ? 'watch' : ''}"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

function Recenter({ point }: { point: TrackPoint | null }) {
  const map = useMap()
  useEffect(() => {
    if (point) {
      map.flyTo([point.latitude, point.longitude], Math.max(map.getZoom(), 15), {
        duration: 0.8,
      })
    }
  }, [point, map])
  return null
}

export default function MapView({ current, track, variant = 'share', address = '' }: MapViewProps) {
  const icon = useMemo(() => makeIcon(variant), [variant])

  const center: [number, number] = current
    ? [current.latitude, current.longitude]
    : track.length > 0
      ? [track[track.length - 1].latitude, track[track.length - 1].longitude]
      : [13.7563, 100.5018] // 曼谷默认中心

  const positions: [number, number][] = track.map((p) => [p.latitude, p.longitude])

  const pathColor = variant === 'watch' ? '#FF8A3D' : '#00E5A0'

  return (
    <MapContainer
      center={center}
      zoom={14}
      className="h-full w-full"
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
        maxZoom={19}
      />
      {positions.length > 1 && (
        <Polyline
          positions={positions}
          pathOptions={{ color: pathColor, weight: 4, opacity: 0.85, lineCap: 'round' }}
        />
      )}
      {current && (
        <Marker position={[current.latitude, current.longitude]} icon={icon}>
          <Popup>
            <div className="space-y-1">
              <div className="font-semibold text-teal">
                {variant === 'watch' ? '当前位置' : '我的位置'}
              </div>
              {address && (
                <div className="text-xs text-white/90 leading-snug max-w-[220px]">
                  {address}
                </div>
              )}
              <div className="text-xs text-white/70">
                {formatCoord(current.latitude)}, {formatCoord(current.longitude)}
              </div>
              <div className="text-xs text-white/50">
                {formatTime(current.timestamp)}
                {current.accuracy != null && ` · 精度 ${Math.round(current.accuracy)}m`}
                {current.battery != null && ` · ${formatBattery(current.battery)}`}
              </div>
            </div>
          </Popup>
        </Marker>
      )}
      <Recenter point={current} />
    </MapContainer>
  )
}
