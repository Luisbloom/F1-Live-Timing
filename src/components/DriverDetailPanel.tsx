import { X } from 'lucide-react'
import { useMemo } from 'react'
import type { DriverTiming } from '../hooks/useTimingData'
import type { Lap } from '../types/openf1'
import { getTeamColor } from '../utils/teamColors'
import { formatLapTime } from '../utils/format'

interface Props {
  driverNum: number
  drivers:   DriverTiming[]
  allLaps:   Lap[]
  onClose:   () => void
}

const COMPOUND_COLORS: Record<string, string> = {
  SOFT:         '#E8002D',
  MEDIUM:       '#FFD700',
  HARD:         '#DEDEDE',
  INTERMEDIATE: '#39B54A',
  WET:          '#4488FF',
}

function compoundColor(compound: string | undefined): string {
  if (!compound) return '#888'
  return COMPOUND_COLORS[compound] ?? '#888'
}

function fmtSec(v: number | null | undefined): string {
  if (v == null) return '--'
  return v.toFixed(3)
}

// Chart constants
const CHART_W = 420
const CHART_H = 180
const PAD_L   = 50
const PAD_R   = 12
const PAD_T   = 12
const PAD_B   = 28

export default function DriverDetailPanel({ driverNum, drivers, allLaps, onClose }: Props) {
  const driverTiming = drivers.find(d => d.driver.driver_number === driverNum)
  if (!driverTiming) return null

  const driver    = driverTiming.driver
  const teamColor = driver.team_colour ? `#${driver.team_colour}` : (getTeamColor(driver.team_name) ?? '#FFFFFF')

  // Find teammate (same team, different driver)
  const teammate = drivers.find(
    d => d.driver.team_name === driver.team_name && d.driver.driver_number !== driverNum
  ) ?? null

  // Filter valid laps (no null duration, < 125s)
  const driverLaps = useMemo(
    () => allLaps.filter(
      l => l.driver_number === driverNum && l.lap_duration !== null && l.lap_duration < 125
    ) as (Lap & { lap_duration: number })[],
    [allLaps, driverNum]
  )

  const teammateLaps = useMemo(
    () => teammate
      ? allLaps.filter(
          l => l.driver_number === teammate.driver.driver_number && l.lap_duration !== null && l.lap_duration < 125
        ) as (Lap & { lap_duration: number })[]
      : [],
    [allLaps, teammate]
  )

  // Chart computations
  const { chartPts, tmChartPts, minT, maxT, minLap, maxLap, bestLapT } = useMemo(() => {
    const allValidLaps = [...driverLaps, ...teammateLaps]
    if (!allValidLaps.length) return { chartPts: [], tmChartPts: [], minT: 0, maxT: 200, minLap: 1, maxLap: 1, bestLapT: null }

    const times  = allValidLaps.map(l => l.lap_duration)
    const laps   = allValidLaps.map(l => l.lap_number)
    const minT   = Math.min(...times) * 0.997
    const maxT   = Math.max(...times) * 1.005
    const minLap = Math.max(1, Math.min(...laps))
    const maxLap = Math.max(...laps)

    const lapRange = maxLap - minLap || 1
    const tRange   = maxT - minT || 1

    const toX = (lap: number) => PAD_L + (lap - minLap) / lapRange * (CHART_W - PAD_L - PAD_R)
    const toY = (t: number)   => PAD_T + (t - minT)   / tRange   * (CHART_H - PAD_T - PAD_B)

    // Map stints to lap ranges
    const stintMap: Record<number, string> = {}
    for (const stint of driverTiming.stintHistory) {
      const end = stint.lapEnd ?? maxLap + 1
      for (let n = stint.lapStart; n <= end; n++) stintMap[n] = stint.compound ?? 'HARD'
    }

    const chartPts = driverLaps.map(l => ({
      x: toX(l.lap_number),
      y: toY(l.lap_duration),
      color: compoundColor(stintMap[l.lap_number]),
      lap: l.lap_number,
    }))

    const tmChartPts = teammateLaps.map(l => ({
      x: toX(l.lap_number),
      y: toY(l.lap_duration),
      color: compoundColor(undefined),
    }))

    const bestLapT = driverTiming.bestLap?.lap_duration ?? null
    const bestY    = bestLapT !== null ? toY(bestLapT) : null

    return { chartPts, tmChartPts, minT, maxT, minLap, maxLap, bestLapT: bestY }
  }, [driverLaps, teammateLaps, driverTiming])

  // Stint table
  const stintRows = driverTiming.stintHistory.map(stint => {
    const stintLaps = allLaps.filter(
      l => l.driver_number === driverNum &&
           l.lap_number >= stint.lapStart &&
           (stint.lapEnd == null || l.lap_number <= stint.lapEnd) &&
           l.lap_duration !== null
    )
    const best = stintLaps.reduce<Lap | null>((b, l) => {
      if (!b || !b.lap_duration) return l
      return (l.lap_duration ?? Infinity) < b.lap_duration ? l : b
    }, null)
    return { stint, best }
  })

  // Comparison rows
  const cmpRows: Array<{ label: string; mine: string | null; tm: string | null }> = [
    {
      label: 'Mejor vuelta',
      mine: formatLapTime(driverTiming.bestLap?.lap_duration),
      tm:   teammate ? formatLapTime(teammate.bestLap?.lap_duration) : null,
    },
    {
      label: 'Mejor S1',
      mine: fmtSec(driverTiming.bestSectors.s1),
      tm:   teammate ? fmtSec(teammate.bestSectors.s1) : null,
    },
    {
      label: 'Mejor S2',
      mine: fmtSec(driverTiming.bestSectors.s2),
      tm:   teammate ? fmtSec(teammate.bestSectors.s2) : null,
    },
    {
      label: 'Mejor S3',
      mine: fmtSec(driverTiming.bestSectors.s3),
      tm:   teammate ? fmtSec(teammate.bestSectors.s3) : null,
    },
    {
      label: 'Stints',
      mine: String(driverTiming.stintHistory.length),
      tm:   teammate ? String(teammate.stintHistory.length) : null,
    },
    {
      label: 'Paradas',
      mine: String(driverTiming.pitCount),
      tm:   teammate ? String(teammate.pitCount) : null,
    },
  ]

  function isBetter(mine: string | null, tm: string | null, label: string): boolean {
    if (!mine || !tm) return false
    // For lap/sector times: lower is better
    if (label.startsWith('Mejor') || label.includes('S1') || label.includes('S2') || label.includes('S3')) {
      const a = parseFloat(mine.replace(':', ''))
      const b = parseFloat(tm.replace(':', ''))
      if (isNaN(a) || isNaN(b)) return false
      return a <= b
    }
    return false
  }

  return (
    <div className="driver-detail-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="driver-detail-panel">
        {/* Header */}
        <div className="ddp-header">
          <div className="ddp-team-bar" style={{ background: teamColor }} />
          <div>
            <div className="ddp-name">{driver.name_acronym}</div>
            <div className="ddp-team">{driver.team_name}</div>
          </div>
          <button className="ddp-close" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="ddp-body">

          {/* Lap time chart */}
          <div>
            <div className="ddp-section-title">Tiempos por vuelta</div>
            <div className="ddp-chart">
              {chartPts.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dimmer)', fontSize: 11 }}>
                  Sin datos de vueltas
                </div>
              ) : (
                <svg
                  width="100%"
                  height={CHART_H}
                  viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                  preserveAspectRatio="xMidYMid meet"
                >
                  {/* Y-axis ticks */}
                  {[0, 0.25, 0.5, 0.75, 1].map(f => {
                    const t = minT + f * (maxT - minT)
                    const y = PAD_T + f * (CHART_H - PAD_T - PAD_B)
                    return (
                      <g key={f}>
                        <line x1={PAD_L - 4} y1={y} x2={CHART_W - PAD_R} y2={y}
                          stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
                        <text x={PAD_L - 6} y={y + 3}
                          textAnchor="end" fontSize={7} fill="rgba(255,255,255,0.3)"
                          fontFamily="monospace">
                          {formatLapTime(t)}
                        </text>
                      </g>
                    )
                  })}

                  {/* X-axis lap numbers */}
                  {[minLap, Math.round((minLap + maxLap) / 2), maxLap].map(lap => {
                    const x = PAD_L + (lap - minLap) / Math.max(maxLap - minLap, 1) * (CHART_W - PAD_L - PAD_R)
                    return (
                      <text key={lap} x={x} y={CHART_H - 8}
                        textAnchor="middle" fontSize={7} fill="rgba(255,255,255,0.3)"
                        fontFamily="monospace">
                        {lap}
                      </text>
                    )
                  })}

                  {/* Best lap dashed line */}
                  {bestLapT !== null && (
                    <line
                      x1={PAD_L} y1={bestLapT} x2={CHART_W - PAD_R} y2={bestLapT}
                      stroke={teamColor} strokeWidth={1} strokeDasharray="4,3" opacity={0.5}
                    />
                  )}

                  {/* Teammate dots (semi-transparent) */}
                  {tmChartPts.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={3} fill="rgba(255,255,255,0.2)" />
                  ))}

                  {/* Driver dots */}
                  {chartPts.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={4} fill={p.color} opacity={0.9} />
                  ))}
                </svg>
              )}
            </div>
          </div>

          {/* Stint breakdown */}
          {stintRows.length > 0 && (
            <div>
              <div className="ddp-section-title">Stints</div>
              <table className="ddp-table">
                <thead>
                  <tr>
                    <th>STINT</th>
                    <th>COMPUESTO</th>
                    <th>VUELTAS</th>
                    <th>MEJOR VUELTA</th>
                  </tr>
                </thead>
                <tbody>
                  {stintRows.map(({ stint, best }, i) => {
                    const laps = stint.lapEnd != null
                      ? stint.lapEnd - stint.lapStart + 1
                      : '?'
                    return (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td>
                          <span style={{
                            color: compoundColor(stint.compound),
                            fontWeight: 700,
                          }}>
                            {stint.compound ?? '-'}
                          </span>
                        </td>
                        <td>{laps}</td>
                        <td>{formatLapTime(best?.lap_duration)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Teammate comparison */}
          {teammate && (
            <div>
              <div className="ddp-section-title">Comparativa con compañero</div>
              <table className="ddp-table">
                <thead>
                  <tr>
                    <th>MÉTRICA</th>
                    <th>{driver.name_acronym}</th>
                    <th>{teammate.driver.name_acronym}</th>
                  </tr>
                </thead>
                <tbody>
                  {cmpRows.map(({ label, mine, tm }) => {
                    const mineWins = mine != null && tm != null && isBetter(mine, tm, label)
                    const tmWins   = mine != null && tm != null && isBetter(tm, mine, label)
                    return (
                      <tr key={label}>
                        <td style={{ color: 'var(--text-dimmer)' }}>{label}</td>
                        <td className={mineWins ? 'ddp-cmp-better' : (tmWins ? 'ddp-cmp-worse' : '')}>
                          {mine ?? '--'}
                        </td>
                        <td className={tmWins ? 'ddp-cmp-better' : (mineWins ? 'ddp-cmp-worse' : '')}>
                          {tm ?? '--'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
