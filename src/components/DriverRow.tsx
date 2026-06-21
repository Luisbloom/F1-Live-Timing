import { TrendingUp, TrendingDown } from 'lucide-react'
import type { DriverTiming, BestSectors } from '../hooks/useTimingData'
import type { ColumnConfig } from './ColumnToggle'
import { getTeamColor, getTeamLogo } from '../utils/teamColors'
import { getHeadshotUrl } from '../utils/driverHeadshots'
import { formatLapTime } from '../utils/format'
import MiniSectors from './MiniSectors'
import StintHistory from './StintHistory'
import type { Lap } from '../types/openf1'

interface Props {
  timing:              DriverTiming
  overallBest:         Lap | null
  overallBestSectors:  BestSectors
  isEven:              boolean
  columns:             ColumnConfig
  onSelect?:           (num: number) => void
}

// ── Pirelli tyre SVGs ─────────────────────────────────────────
const TYRE_SVG: Partial<Record<string, string>> = {
  SOFT:   '/tyres/soft.svg',
  MEDIUM: '/tyres/medium.svg',
  HARD:   '/tyres/hard.svg',
}
const TYRE_SVG_USED: Partial<Record<string, string>> = {
  SOFT: '/tyres/soft_used.svg',
}
const COMPOUND_COLORS: Record<string, string> = {
  SOFT: '#E8002D', MEDIUM: '#FFD700', HARD: '#DEDEDE',
  INTERMEDIATE: '#39B54A', WET: '#4488FF',
}
const COMPOUND_LETTER: Record<string, string> = {
  SOFT: 'S', MEDIUM: 'M', HARD: 'H', INTERMEDIATE: 'I', WET: 'W',
}

function TyreIcon({ compound, isUsed }: { compound: string; isUsed: boolean }) {
  const svgPath = (isUsed && TYRE_SVG_USED[compound]) || TYRE_SVG[compound]
  if (svgPath) return <img src={svgPath} alt={compound} className="tyre-svg-icon" />
  return (
    <span className="tyre-circle-fallback" style={{ background: COMPOUND_COLORS[compound] ?? '#888' }}>
      {COMPOUND_LETTER[compound] ?? '?'}
    </span>
  )
}

// ── Country code → flag emoji ─────────────────────────────────
const CC3_TO_2: Record<string, string> = {
  // Common F1 nationalities (ISO 3166-1 alpha-3 → alpha-2)
  GBR:'GB', NLD:'NL', ESP:'ES', FIN:'FI', GER:'DE', DEU:'DE',
  AUS:'AU', MEX:'MX', CAN:'CA', THA:'TH', JPN:'JP', CHN:'CN', FRA:'FR',
  ITA:'IT', BRA:'BR', USA:'US', DNK:'DK', DEN:'DK', NOR:'NO', BEL:'BE',
  CHE:'CH', NZL:'NZ', ARG:'AR', PER:'PE', IRL:'IE', AUT:'AT', POL:'PL',
  ISR:'IL', UAE:'AE', HUN:'HU', SWE:'SE', POR:'PT', RSA:'ZA', IND:'IN',
  // Monaco (Monegasque) — OpenF1 uses MCO
  MCO:'MC', MON:'MC',
  // China — OpenF1 sometimes uses ZHO for Zhou Guanyu (not a real ISO code)
  ZHO:'CN',
  // Other overrides
  GUA:'GT', CUB:'CU',
}

function flagEmoji(code: string): string {
  if (!code) return ''
  const two = CC3_TO_2[code.toUpperCase()]
  if (!two) return ''
  return two.split('').map(c => String.fromCodePoint(0x1F1E0 + c.charCodeAt(0) - 65)).join('')
}

// ── Lap time / sector helpers ─────────────────────────────────
function lapClass(dur: number | null | undefined, pb: number | null | undefined, ob: number | null | undefined): string {
  if (!dur) return ''
  if (ob && dur <= ob) return 'lt-purple'
  if (pb && dur <= pb) return 'lt-green'
  if (pb && dur > pb * 1.005) return 'lt-yellow'
  return ''
}

function sectorClass(t: number | null | undefined, pb: number | null | undefined, ob: number | null | undefined): string {
  if (t == null || t <= 0) return 'sec-dim'       // no data
  if (ob != null && ob > 0 && t <= ob + 0.001) return 'sec-purple'  // overall best
  if (pb != null && pb > 0 && t <= pb + 0.001) return 'sec-green'   // personal best
  if (pb != null && pb > 0) return 'sec-yellow'   // slower than personal best → yellow
  return ''                                         // no comparison possible → normal white
}

function fmtSec(v: number | null | undefined): string {
  if (v == null) return '--.---'   // matches width of sector like "24.038"
  return v.toFixed(3)
}

const LAP_FACTOR = 100_000

function fmtGapValue(val: number): { text: string; cls: string } {
  if (val >= LAP_FACTOR) {
    const laps = Math.round(val / LAP_FACTOR)
    return { text: `+${laps} ${laps === 1 ? 'LAP' : 'LAPS'}`, cls: 'gap-lapped' }
  }
  return { text: `+${val.toFixed(3)}`, cls: val < 1 ? 'gap-drs' : '' }
}

function fmtInterval(interval: number | null, _gap: number | null, position: number): { text: string; cls: string } {
  if (position === 1) return { text: 'Interval', cls: 'gap-dim' }
  if (interval === null) return { text: '--', cls: 'gap-dim' }
  return fmtGapValue(interval)
}

function fmtLeader(gap: number | null, position: number): { text: string; cls: string } {
  if (position === 1) return { text: 'Leader', cls: 'gap-dim' }
  if (gap === null) return { text: '--', cls: 'gap-dim' }
  return fmtGapValue(gap)
}

// ── Component ─────────────────────────────────────────────────
export default function DriverRow({ timing, overallBest, overallBestSectors, isEven, columns, onSelect }: Props) {
  const {
    driver, position, positionChange, gap: driverGap, interval,
    lastLap, bestLap, bestSectors, potentialLap,
    currentStint, stintHistory, pitCount, lapCount,
    speedI1, speedI2, speedST,
  } = timing

  // Prefer the team colour from OpenF1 API (always current season accurate)
  // over our hardcoded map which can be wrong (e.g. Alpine pink→blue in 2026)
  const apiColor  = driver.team_colour?.trim()
  const teamColor = apiColor ? `#${apiColor}` : getTeamColor(driver.team_name)
  const teamLogo   = getTeamLogo(driver.team_name)
  const headshotUrl = getHeadshotUrl(driver.name_acronym, driver.headshot_url)
  const compound  = currentStint?.compound ?? null
  // tyre age = laps at start of stint + laps driven in this stint
  // When lap_end is null (ongoing stint), use driver's current lapCount
  const tyreAge   = currentStint
    ? currentStint.tyre_age_at_start + (
        currentStint.lap_end != null
          ? currentStint.lap_end - currentStint.lap_start
          : Math.max(0, lapCount - currentStint.lap_start)
      )
    : null
  const isUsedTyre   = (currentStint?.tyre_age_at_start ?? 0) > 0
  const isPit        = lastLap?.is_pit_out_lap === true
  const isDNF        = timing.isDNF
  const isFastestLap = !!(overallBest && overallBest.driver_number === driver.driver_number)

  const iv  = fmtInterval(interval, driverGap, position)
  const ldr = fmtLeader(driverGap, position)
  const flag = driver.country_code ? flagEmoji(driver.country_code) : ''

  return (
    <div
      className={`driver-row ${isEven ? 'driver-row--even' : ''} ${isDNF ? 'driver-row--dnf' : ''}`}
      style={{
        borderLeft: `3px solid ${isDNF ? 'rgba(255,107,107,0.5)' : teamColor}`,
        cursor: onSelect ? 'pointer' : undefined,
      }}
      onClick={() => onSelect?.(driver.driver_number)}
    >

      {/* ── PIT / DNF indicator ── */}
      <div className="col-pit">
        {isDNF  && <span className="dnf-marker">DNF</span>}
        {!isDNF && isPit && <span className="pit-marker">PIT</span>}
      </div>

      {/* ── Driver cell ── */}
      <div className="col-pos-driver">
        {/* Position badge */}
        <div className="pos-badge" style={{ background: teamColor }}>
          {position}
        </div>

        {/* Team logo — always visible */}
        {teamLogo && (
          <img
            src={teamLogo}
            alt={driver.team_name}
            className="team-logo"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
        )}

        {/* Driver info */}
        <div className="driver-info">
          <div className="driver-code-row">
            {/* Headshot small circle (if available) */}
            {headshotUrl && (
              <img
                src={headshotUrl}
                alt={driver.name_acronym}
                className="driver-headshot-sm"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              />
            )}
            <span className="driver-code">{driver.name_acronym}</span>
            {isFastestLap && <span className="fl-badge">FL</span>}
            {columns.posChange && positionChange !== 0 && (
              <span className={`pos-delta ${positionChange > 0 ? 'pd-up' : 'pd-down'}`}>
                {positionChange > 0 ? <TrendingUp size={7} strokeWidth={2.5} /> : <TrendingDown size={7} strokeWidth={2.5} />}
                {Math.abs(positionChange)}
              </span>
            )}
          </div>
          <div className="driver-sub">
            {flag && <span className="driver-flag">{flag}</span>}
            <span className="driver-num-small">#{driver.driver_number}</span>
          </div>
        </div>
      </div>

      {/* ── Interval ── */}
      {columns.interval && (
        <div className={`col-cell col-interval ${iv.cls}`}>{iv.text}</div>
      )}

      {/* ── Tyre ── */}
      <div className="col-cell col-tyre">
        {compound ? (
          <>
            <TyreIcon compound={compound} isUsed={isUsedTyre} />
            <span className="tyre-age">{tyreAge ?? '--'}</span>
          </>
        ) : '--'}
      </div>

      {/* ── Best lap ── */}
      {columns.bestLap && (
        <div className={`col-cell col-laptime ${lapClass(bestLap?.lap_duration, bestLap?.lap_duration, overallBest?.lap_duration)}`}>
          {formatLapTime(bestLap?.lap_duration)}
        </div>
      )}

      {/* ── Leader gap ── */}
      {columns.leader && (
        <div className={`col-cell col-leader ${ldr.cls}`}>{ldr.text}</div>
      )}

      {/* ── Last lap ── */}
      <div className={`col-cell col-laptime ${lapClass(lastLap?.lap_duration, bestLap?.lap_duration, overallBest?.lap_duration)}`}>
        {formatLapTime(lastLap?.lap_duration)}
      </div>

      {/* ── Mini sectors ── */}
      {columns.miniSectors && (
        <div className="col-cell col-mini">
          <MiniSectors lastLap={lastLap} bestSectors={bestSectors} overallBestSectors={overallBestSectors} />
        </div>
      )}

      {/* ── Last sectors ── */}
      {columns.lastSectors && (
        <div className="col-cell col-sectors">
          <span className={`sec ${sectorClass(lastLap?.duration_sector_1, bestSectors.s1, overallBestSectors.s1)}`}>
            {fmtSec(lastLap?.duration_sector_1)}
          </span>
          <span className={`sec ${sectorClass(lastLap?.duration_sector_2, bestSectors.s2, overallBestSectors.s2)}`}>
            {fmtSec(lastLap?.duration_sector_2)}
          </span>
          <span className={`sec ${sectorClass(lastLap?.duration_sector_3, bestSectors.s3, overallBestSectors.s3)}`}>
            {fmtSec(lastLap?.duration_sector_3)}
          </span>
        </div>
      )}

      {/* ── Best sectors ── */}
      {columns.bestSectors && (
        <div className="col-cell col-sectors">
          <span className={`sec ${sectorClass(bestSectors.s1, bestSectors.s1, overallBestSectors.s1)}`}>
            {fmtSec(bestSectors.s1)}
          </span>
          <span className={`sec ${sectorClass(bestSectors.s2, bestSectors.s2, overallBestSectors.s2)}`}>
            {fmtSec(bestSectors.s2)}
          </span>
          <span className={`sec ${sectorClass(bestSectors.s3, bestSectors.s3, overallBestSectors.s3)}`}>
            {fmtSec(bestSectors.s3)}
          </span>
        </div>
      )}

      {/* ── Potential ── */}
      {columns.potential && (
        <div className="col-cell col-laptime lt-purple-dim">
          {potentialLap ? formatLapTime(potentialLap) : '--:--.---'}
        </div>
      )}

      {/* ── Stint history ── */}
      {columns.stintHistory && (
        <div className="col-cell col-stints-cell">
          <StintHistory history={stintHistory} />
        </div>
      )}

      {/* ── Speed traps ── */}
      {columns.speedI1 && <div className="col-cell col-spd">{speedI1 ?? '--'}<span className="spd-u">km/h</span></div>}
      {columns.speedI2 && <div className="col-cell col-spd">{speedI2 ?? '--'}<span className="spd-u">km/h</span></div>}
      {columns.speedST && <div className="col-cell col-spd">{speedST ?? '--'}<span className="spd-u">km/h</span></div>}

      {/* ── Pit / lap extra ── */}
      {(columns.pitCount || columns.lapCount) && (
        <div className="col-cell col-extra-small">
          {columns.pitCount && pitCount > 0 && <span className="pit-badge-sm">P{pitCount}</span>}
          {columns.lapCount && <span className="lap-sm">V{lapCount}</span>}
        </div>
      )}
    </div>
  )
}
