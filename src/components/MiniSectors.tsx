import type { Lap } from '../types/openf1'
import type { BestSectors } from '../hooks/useTimingData'

// F1 broadcast standard mini-sector colors
const C = {
  purple: '#B26FF5',           // overall fastest (any driver)
  green:  '#00D2BE',           // personal best (this driver)
  yellow: '#FFD700',           // slower than personal best
  dim:    'rgba(255,255,255,0.10)',  // no data
} as const

const FLOAT_TOL  = 0.001  // seconds — prevents false negatives from floating-point drift
const MIN_SECTOR = 3      // matches the server-side filter
const MAX_SECTOR = 60     // 60s covers Spa S2 (~52s); SC/VSC sectors caught upstream

function validS(v: number | null | undefined): v is number {
  return v != null && v > MIN_SECTOR && v < MAX_SECTOR
}

function sectorColor(
  time: number | null | undefined,
  personalBest: number | null | undefined,
  overallBest:  number | null | undefined,
): string {
  if (!validS(time)) return C.dim

  // Overall best (purple)
  if (validS(overallBest) && time <= overallBest + FLOAT_TOL) return C.purple

  // Personal best (green)
  if (validS(personalBest) && time <= personalBest + FLOAT_TOL) return C.green

  // Slower than personal best (yellow)
  return C.yellow
}

/**
 * Distribute `total` bars across 3 sectors proportional to their durations.
 * Each sector gets a minimum of MIN_BARS so the display is always balanced.
 */
function distributeBars(
  s1: number | null | undefined,
  s2: number | null | undefined,
  s3: number | null | undefined,
  total = 18,
  minPerSector = 3,
): [number, number, number] {
  const MIN = minPerSector
  const avail = total - MIN * 3   // bars to allocate beyond the minimum

  if (!s1 || !s2 || !s3 || s1 <= 0 || s2 <= 0 || s3 <= 0)
    return [MIN + Math.floor(avail/3), MIN + Math.floor(avail/3), MIN + avail - 2*Math.floor(avail/3)]

  const sum  = s1 + s2 + s3
  // Use floor so e1+e2 <= avail, guaranteeing e3 >= 0
  const e1   = Math.floor(avail * s1 / sum)
  const e2   = Math.floor(avail * s2 / sum)
  const e3   = avail - e1 - e2   // always >= 0 with floor

  return [MIN + e1, MIN + e2, MIN + e3]
}

interface Props {
  lastLap:            Lap | null
  bestSectors:        BestSectors
  overallBestSectors: BestSectors
}

export default function MiniSectors({ lastLap, bestSectors, overallBestSectors }: Props) {
  // Ignore pit-out laps: their sectors are inflated by pit lane time
  const isPitOut = lastLap?.is_pit_out_lap === true
  const s1 = isPitOut ? null : (lastLap?.duration_sector_1 ?? null)
  const s2 = isPitOut ? null : (lastLap?.duration_sector_2 ?? null)
  const s3 = isPitOut ? null : (lastLap?.duration_sector_3 ?? null)

  const c1 = sectorColor(s1, bestSectors.s1, overallBestSectors.s1)
  const c2 = sectorColor(s2, bestSectors.s2, overallBestSectors.s2)
  const c3 = sectorColor(s3, bestSectors.s3, overallBestSectors.s3)

  // Use the driver's own best sector durations for stable layout
  // (avoids bars jumping size on every lap)
  const [n1, n2, n3] = distributeBars(bestSectors.s1, bestSectors.s2, bestSectors.s3)

  return (
    <div className="mini-sectors-v" title={`S1: ${s1?.toFixed(3) ?? '--'}  S2: ${s2?.toFixed(3) ?? '--'}  S3: ${s3?.toFixed(3) ?? '--'}`}>
      {Array.from({ length: n1 }, (_, i) => <div key={`s1-${i}`} className="msv-bar" style={{ background: c1 }} />)}
      <div className="msv-sector-gap" />
      {Array.from({ length: n2 }, (_, i) => <div key={`s2-${i}`} className="msv-bar" style={{ background: c2 }} />)}
      <div className="msv-sector-gap" />
      {Array.from({ length: n3 }, (_, i) => <div key={`s3-${i}`} className="msv-bar" style={{ background: c3 }} />)}
    </div>
  )
}
