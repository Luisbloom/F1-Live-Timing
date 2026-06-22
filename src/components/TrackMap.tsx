import { useMemo } from 'react'
import { Loader } from 'lucide-react'
import type { TrackPoint, CarPos } from '../hooks/useTrackMap'
import type { DriverTiming } from '../hooks/useTimingData'
import type { Lap } from '../types/openf1'
import { getTeamColor } from '../utils/teamColors'

// S1 red · S2 blue · S3 yellow  — same as reference image
const SEC_COLOR = ['#E8002D', '#3671C6', '#FFD60A'] as const

const SVG_W   = 600
const SVG_H   = 480
const PADDING = 28

interface Pt { x: number; y: number }

// ── Rotation: find angle that maximises width/height ratio ──────
// Uses a two-pass search: coarse (2° steps) then fine (0.25° steps
// around the winner) so compact circuits (Monaco, Hungaroring) still
// get the best possible orientation without being slow.
function optimalAngle(pts: Pt[]): number {
  if (pts.length < 2) return 0
  const step   = Math.max(1, Math.floor(pts.length / 120))
  const sample = pts.filter((_, i) => i % step === 0)

  function ratioAt(deg: number): number {
    const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r)
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const p of sample) {
      const rx = p.x * c - p.y * s, ry = p.x * s + p.y * c
      if (rx < x0) x0 = rx; if (rx > x1) x1 = rx
      if (ry < y0) y0 = ry; if (ry > y1) y1 = ry
    }
    return (x1 - x0) / ((y1 - y0) || 1)
  }

  // Pass 1: coarse scan every 2°
  let bestDeg = 0, bestRatio = 0
  for (let deg = 0; deg < 180; deg += 2) {
    const r = ratioAt(deg)
    if (r > bestRatio) { bestRatio = r; bestDeg = deg }
  }

  // Pass 2: refine ±3° around the winner at 0.25° resolution
  for (let d = bestDeg - 3; d <= bestDeg + 3; d += 0.25) {
    const r = ratioAt(d)
    if (r > bestRatio) { bestRatio = r; bestDeg = d }
  }

  const rad = bestDeg * Math.PI / 180
  return rad > Math.PI / 2 ? rad - Math.PI : rad
}

// ── Project into SVG space ────────────────────────────────────────
function project(pts: Pt[], w: number, h: number, pad: number, angle: number): Pt[] {
  if (!pts.length) return []
  const c = Math.cos(angle), s = Math.sin(angle)
  const rot = pts.map(p => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }))
  const xs = rot.map(p => p.x), ys = rot.map(p => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const rX = maxX - minX || 1, rY = maxY - minY || 1
  const sc = Math.min((w - 2*pad)/rX, (h - 2*pad)/rY)
  const ox = pad + ((w - 2*pad) - rX*sc)/2
  const oy = pad + ((h - 2*pad) - rY*sc)/2
  return rot.map(p => ({ x: ox+(p.x-minX)*sc, y: oy+(maxY-p.y)*sc }))
}

function toPoints(pts: { x: number; y: number }[]): string {
  return pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
}

// ── Safe loop close ───────────────────────────────────────────────
// Only adds `startPt` to close the circuit if the gap is ≤ 30× the
// average consecutive spacing.  A larger gap means next-lap bleed or
// bad data — better to leave the circuit open than draw a random line.
function closeSafe(seg: TrackPoint[], startPt: TrackPoint): TrackPoint[] {
  if (!seg.length) return seg
  // Estimate avg spacing from the first 20 consecutive pairs
  let total = 0, n = 0
  for (let i = 1; i < Math.min(20, seg.length); i++) {
    const dx = seg[i].x - seg[i-1].x, dy = seg[i].y - seg[i-1].y
    total += Math.sqrt(dx*dx + dy*dy); n++
  }
  const avg = n > 0 ? total / n : 1
  const last = seg[seg.length - 1]
  const gap  = Math.sqrt((startPt.x-last.x)**2 + (startPt.y-last.y)**2)
  return gap <= avg * 30 ? [...seg, startPt] : seg
}

// ── Sector split ─────────────────────────────────────────────────
// Priority order:
//  1. Timestamps: date_start + sector durations → exact boundaries
//  2. Proportional: sector durations without date_start → best estimate
//  3. Equal thirds: last resort (no timing data at all)
//
// All paths call closeSafe() so random lines only appear when the
// gap is actually small enough to be part of the main straight.
function splitSectors(
  pts: TrackPoint[],
  lap: Lap | null | undefined,
): [TrackPoint[], TrackPoint[], TrackPoint[]] {
  if (!pts.length) return [[], [], []]

  const s1  = lap?.duration_sector_1
  const s2  = lap?.duration_sector_2
  const dur = lap?.lap_duration
  const t0s = lap?.date_start

  // ── 1. Exact timestamp split ──────────────────────────────────
  if (t0s && s1 && s2) {
    const t0   = new Date(t0s).getTime()
    const tS2  = t0 + s1 * 1000
    const tS3  = t0 + (s1 + s2) * 1000
    const tEnd = dur ? t0 + dur * 1000 : null

    const endIdx = tEnd
      ? pts.findIndex(p => new Date(p.date).getTime() >= tEnd)
      : -1
    const clipped = endIdx > 0 ? pts.slice(0, endIdx) : pts

    const s2i = clipped.findIndex(p => new Date(p.date).getTime() >= tS2)
    const s3i = clipped.findIndex(p => new Date(p.date).getTime() >= tS3)

    if (s2i > 0 && s3i > s2i && s3i < clipped.length - 1) {
      return [
        clipped.slice(0, s2i + 1),
        clipped.slice(s2i, s3i + 1),
        closeSafe(clipped.slice(s3i), pts[0]),
      ]
    }
  }

  // ── 2. Proportional split using sector durations ─────────────
  if (s1 && s2 && dur && dur > 0) {
    const s3  = dur - s1 - s2
    const tot = s1 + s2 + Math.max(s3, 0.1)
    const n   = pts.length
    const b1  = Math.round(n * s1 / tot)
    const b2  = Math.round(n * (s1 + s2) / tot)
    if (b1 > 0 && b2 > b1 && b2 < n) {
      return [
        pts.slice(0, b1 + 1),
        pts.slice(b1, b2 + 1),
        closeSafe(pts.slice(b2), pts[0]),
      ]
    }
  }

  // ── 3. Equal thirds (last resort) ────────────────────────────
  const n  = pts.length
  const b1 = Math.floor(n / 3), b2 = Math.floor(2 * n / 3)
  return [
    pts.slice(0, b1 + 1),
    pts.slice(b1, b2 + 1),
    closeSafe(pts.slice(b2), pts[0]),
  ]
}

interface Props {
  orderedPath:    TrackPoint[]
  carPositions:   CarPos[]
  drivers:        DriverTiming[]
  overallBestLap: Lap | null
  hasData:        boolean
  loadingCircuit: boolean
  isLive:         boolean
  sessionDateEnd: string | null
  drsZones?:      TrackPoint[]
}

export default function TrackMap({
  orderedPath, carPositions, drivers, overallBestLap,
  hasData, loadingCircuit, isLive, drsZones = [],
}: Props) {

  // Clip orderedPath to actual lap duration so extra points don't skew the angle
  const cleanPath = useMemo((): TrackPoint[] => {
    if (!orderedPath.length || !overallBestLap?.date_start || !overallBestLap?.lap_duration) {
      return orderedPath
    }
    const tEnd = new Date(overallBestLap.date_start).getTime() + overallBestLap.lap_duration * 1000
    const endIdx = orderedPath.findIndex(p => new Date(p.date).getTime() >= tEnd)
    return endIdx > 10 ? orderedPath.slice(0, endIdx) : orderedPath
  }, [orderedPath, overallBestLap])

  const angle = useMemo(() => optimalAngle(cleanPath), [cleanPath])

  const allPts = useMemo(() => [...cleanPath, ...carPositions, ...drsZones], [cleanPath, carPositions, drsZones])
  const proj   = useMemo(() => project(allPts, SVG_W, SVG_H, PADDING, angle), [allPts, angle])

  const pTrack = proj.slice(0, cleanPath.length)
  const pCars  = proj.slice(cleanPath.length, cleanPath.length + carPositions.length)
  const pDrs   = proj.slice(cleanPath.length + carPositions.length)

  // Subsample to ≤500 pts — keep original dates for timestamp-based sector split
  const track = useMemo((): TrackPoint[] => {
    if (!pTrack.length) return []
    const step = Math.max(1, Math.ceil(pTrack.length / 500))
    const out: TrackPoint[] = []
    for (let i = 0; i < pTrack.length; i += step) {
      out.push({ x: pTrack[i].x, y: pTrack[i].y, date: cleanPath[i]?.date ?? '' })
    }
    return out
  }, [pTrack, cleanPath])

  const sectors = useMemo(() => splitSectors(track, overallBestLap), [track, overallBestLap])

  const driverMap = useMemo(() => {
    const m: Record<number, DriverTiming> = {}
    drivers.forEach(d => { m[d.driver.driver_number] = d })
    return m
  }, [drivers])

  const ready = hasData && track.length > 30

  // Use timestamps or proportional label for footer
  const usingRealTimestamps = !!(overallBestLap?.date_start && overallBestLap?.duration_sector_1)

  return (
    <div className="track-map-panel">
      {/* Header */}
      <div className="tm-header">
        <div className="tm-header-left">
          {ready && (
            <div className="tm-sectors-legend">
              {(['S1','S2','S3'] as const).map((s, i) => (
                <span key={s} className="tm-sec-chip"
                  style={{ '--sc': SEC_COLOR[i] } as React.CSSProperties}>
                  <span className="tm-sec-dot" style={{ background: SEC_COLOR[i] }} />
                  {s}
                </span>
              ))}
              {drsZones.length > 0 && (
                <span className="tm-sec-chip" style={{ '--sc': '#00BFFF' } as React.CSSProperties}>
                  <span className="tm-sec-dot" style={{ background: '#00BFFF' }} />
                  DRS
                </span>
              )}
            </div>
          )}
        </div>
        <div className="tm-header-right">
          {loadingCircuit && (
            <span className="tm-status tm-status--loading">
              <Loader size={10} className="spin" />cargando...
            </span>
          )}
          {ready && isLive && (
            <span className="tm-status tm-status--live">
              <span className="tm-live-dot"/>EN VIVO
            </span>
          )}
          {ready && !isLive && <span className="tm-status tm-status--hist">ÚLTIMO GP</span>}
        </div>
      </div>

      {/* SVG */}
      <div className="tm-svg-wrap">
        {!ready ? (
          <div className="tm-empty">
            {loadingCircuit
              ? <><Loader size={26} strokeWidth={1.5} className="tm-empty-icon spin"/>
                  <span className="tm-empty-text">Cargando circuito...</span></>
              : <span className="tm-empty-text">Sin datos de trazado</span>
            }
          </div>
        ) : (
          <svg width="100%" height="100%"
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            preserveAspectRatio="xMidYMid meet"
            className="tm-svg"
          >
            {/* ─ PASS 1: gray asphalt base — draw S3→S2→S1 so S1 base is on top ─ */}
            {([2,1,0] as const).map(si => sectors[si].length > 1 && (
              <polyline key={`base-${si}`}
                points={toPoints(sectors[si])}
                fill="none"
                stroke="rgba(85,95,125,0.85)"
                strokeWidth={16}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}

            {/* ─ PASS 2: sector colors — S3→S2→S1 so S1 red is on top at finish line ─ */}
            {([2,1,0] as const).map(si => sectors[si].length > 1 && (
              <polyline key={`color-${si}`}
                points={toPoints(sectors[si])}
                fill="none"
                stroke={SEC_COLOR[si]}
                strokeWidth={7}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}

            {/* ─ Start/finish line marker (white rectangle across the track) ─ */}
            {track.length > 0 && (() => {
              const sf = track[0]
              return (
                <g>
                  {/* White bar perpendicular to track direction */}
                  <rect
                    x={sf.x - 5} y={sf.y - 9}
                    width={10} height={18}
                    fill="white" rx={1}
                    opacity={0.95}
                  />
                </g>
              )
            })()}

            {/* ─ DRS zone markers — perpendicular gate lines ─ */}
            {pDrs.length > 0 && (() => {
              const step = Math.max(1, Math.ceil(pDrs.length / 60))
              const subsampled = pDrs.filter((_, i) => i % step === 0)
              return (
                <g>
                  {subsampled.map((p, i) => {
                    // Find adjacent DRS point for tangent direction
                    const next = subsampled[i + 1] ?? subsampled[i - 1]
                    if (!next) return null
                    const dx = next.x - p.x, dy = next.y - p.y
                    const len = Math.sqrt(dx*dx + dy*dy) || 1
                    // Perpendicular unit vector
                    const px = -dy / len, py = dx / len
                    const hl = 7  // half-length of gate line
                    return (
                      <line
                        key={i}
                        x1={(p.x + px * hl).toFixed(1)} y1={(p.y + py * hl).toFixed(1)}
                        x2={(p.x - px * hl).toFixed(1)} y2={(p.y - py * hl).toFixed(1)}
                        stroke="#00BFFF" strokeWidth={2} opacity={0.9}
                      />
                    )
                  })}
                </g>
              )
            })()}

            {/* ─ Car markers — smooth GPU-animated circles ─ */}
            {pCars.map((p, i) => {
              const pos    = carPositions[i]
              if (!pos) return null
              const timing = driverMap[pos.driverNumber]
              const color  = (timing ? getTeamColor(timing.driver.team_name) : null) ?? '#888'
              const numStr = String(pos.driverNumber)
              const fontSize = numStr.length >= 3 ? 7 : numStr.length === 2 ? 8 : 9

              return (
                // Use CSS transform so the browser GPU-animates movement smoothly
                <g
                  key={pos.driverNumber}
                  style={{
                    transform: `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`,
                    // No CSS transition here — interpolation itself is smooth at 30fps
                    willChange: 'transform',
                  }}
                >
                  {/* Glow */}
                  <circle cx={0} cy={0} r={13} fill={color} opacity={0.18} />
                  {/* Body */}
                  <circle cx={0} cy={0} r={10} fill="#0d1117" stroke={color} strokeWidth={2.5} />
                  {/* Number */}
                  <text
                    x={0} y={0}
                    textAnchor="middle" dominantBaseline="central"
                    fill={color}
                    fontSize={fontSize}
                    fontFamily="'F1Numbers', monospace"
                    fontWeight="700"
                  >{numStr}</text>
                </g>
              )
            })}
          </svg>
        )}
      </div>

      {/* Footer */}
      {ready && (
        <div className="tm-footer">
          <span>{carPositions.length} coches</span>
          <span style={{ color: usingRealTimestamps ? '#22c55e' : 'var(--text-dimmer)' }}>
            {usingRealTimestamps ? '✓ sectores exactos (API)' : '~ sectores aproximados'}
          </span>
        </div>
      )}
    </div>
  )
}
