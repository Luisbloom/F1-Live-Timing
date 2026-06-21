import { useState, useEffect, useRef, useCallback } from 'react'
import { openf1 } from '../services/openf1'
import type { Driver, Position, Lap, Stint, Session, Weather, RaceControlMessage } from '../types/openf1'

export interface StintInfo {
  compound: Stint['compound']
  lapStart: number
  lapEnd: number | null
  age: number
  isNew: boolean
}

export interface BestSectors {
  s1: number | null
  s2: number | null
  s3: number | null
}

export interface DriverTiming {
  driver: Driver
  position: number
  positionChange: number
  gap: number | null
  interval: number | null
  isDNF: boolean              // retired from race (> 4 laps behind leader)
  lastLap: Lap | null
  bestLap: Lap | null
  // Individual best sectors (from ANY lap, not necessarily the best complete lap)
  bestSectors: BestSectors
  potentialLap: number | null  // bestSectors.s1 + s2 + s3
  currentStint: Stint | null
  stintHistory: StintInfo[]
  pitCount: number
  lapCount: number
  speedI1: number | null
  speedI2: number | null
  speedST: number | null
}

export type TrackStatus = 'clear' | 'sc' | 'vsc' | 'red_flag' | 'yellow'
export type SessionMode  = 'live' | 'results'

export interface TimingState {
  session: Session | null
  sessionMode: SessionMode
  drivers: DriverTiming[]
  weather: Weather | null
  raceControl: RaceControlMessage[]
  overallBestLap: Lap | null
  // True overall best per sector across ALL drivers
  overallBestSectors: BestSectors
  trackStatus: TrackStatus
  drsEnabled: boolean
  loading: boolean
  error: string | null
  lastUpdate: Date | null
}

const FAST_MS    = 30_000   // positions + laps
const SLOW_MS    = 120_000  // drivers, stints, weather, race control
const SESSION_MS = 10 * 60_000

export function useTimingData() {
  const [state, setState] = useState<TimingState>({
    session: null,
    sessionMode: 'results',
    drivers: [],
    weather: null,
    raceControl: [],
    overallBestLap: null,
    overallBestSectors: { s1: null, s2: null, s3: null },
    trackStatus: 'clear',
    drsEnabled: false,
    loading: true,
    error: null,
    lastUpdate: null,
  })

  const sessionRef      = useRef<Session | null>(null)
  const driversRef      = useRef<Driver[]>([])
  const stintsRef       = useRef<Stint[]>([])
  const weatherRef      = useRef<Weather | null>(null)
  const rcRef           = useRef<RaceControlMessage[]>([])
  const prevPositionRef = useRef<Record<number, number>>({})
  const isFetchingRef   = useRef(false)
  const rawLapsRef      = useRef<Lap[]>([])

  const fastTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const slowTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── track status from race control ───────────────────────────────

  function deriveTrackStatus(messages: RaceControlMessage[]): TrackStatus {
    // Messages are stored newest-first. Return on first match = current status.
    for (const msg of messages) {
      const txt = msg.message.toUpperCase()
      const flag = msg.flag?.toUpperCase() ?? ''

      // RED FLAG
      if (txt.includes('RED FLAG') || txt.includes('SESSION SUSPENDED') || flag === 'RED') return 'red_flag'
      // SC
      if (txt.includes('SAFETY CAR DEPLOYED')) return 'sc'
      // VSC
      if (txt.includes('VIRTUAL SAFETY CAR DEPLOYED') || txt.includes('VSC DEPLOYED')) return 'vsc'
      // Explicit CLEAR conditions (flag or message)
      if (flag === 'CLEAR' || flag === 'GREEN') return 'clear'
      if (txt.includes('TRACK CLEAR') || txt.includes('ALL CLEAR')) return 'clear'
      if (txt.includes('SAFETY CAR IN THIS LAP') || txt.includes('SAFETY CAR ENDING')) return 'clear'
      if (txt.includes('VSC ENDING')) return 'clear'
      if (txt.includes('GREEN LIGHT') || txt.includes('SESSION STARTED')) return 'clear'
      // YELLOW flag (only block on explicit flag field, not message text which is too broad)
      if (flag === 'YELLOW' || flag === 'DOUBLE YELLOW') return 'yellow'
    }
    return 'clear'
  }

  function deriveDrsEnabled(messages: RaceControlMessage[]): boolean {
    for (const msg of messages) {
      const txt = msg.message.toUpperCase()
      if (txt.includes('DRS ENABLED'))  return true
      if (txt.includes('DRS DISABLED')) return false
    }
    return false
  }

  // ── build per-driver timings ──────────────────────────────────────

  const buildDriverTimings = useCallback((
    positions: Position[],
    laps: Lap[],
    stints: Stint[],
    drivers: Driver[],
    sessionType?: string,
  ): DriverTiming[] => {
    const latestPos   = latestByDate<Position>(positions)
    const latestLap   = latestPerDriver<Lap>(laps, 'lap_number')
    const bestLaps    = computeBestLaps(laps)
    const bestSectors = computeBestSectors(laps)
    const latestStint = latestPerDriver<Stint>(stints, 'stint_number')

    const posMap: Record<number, number> = {}
    latestPos.forEach(p => { posMap[p.driver_number] = p.position })

    const lapCountMap: Record<number, number> = {}
    latestLap.forEach(l => { lapCountMap[l.driver_number] = l.lap_number })

    // Build stint history per driver (sorted by stint_number)
    const stintsByDriver: Record<number, Stint[]> = {}
    stints.forEach(s => {
      if (!stintsByDriver[s.driver_number]) stintsByDriver[s.driver_number] = []
      stintsByDriver[s.driver_number].push(s)
    })
    Object.values(stintsByDriver).forEach(arr =>
      arr.sort((a, b) => a.stint_number - b.stint_number)
    )

    const result: DriverTiming[] = drivers
      .map(d => {
        const num        = d.driver_number
        const pos        = posMap[num] ?? 99
        const prevPos    = prevPositionRef.current[num] ?? pos
        const change     = prevPos - pos   // positive = moved forward
        const lastL      = latestLap.find(l => l.driver_number === num) ?? null
        const stintList  = stintsByDriver[num] ?? []
        const currStint  = latestStint.find(s => s.driver_number === num) ?? null

        // Potential lap = best S1 + best S2 + best S3 ever in session
        const bs         = bestSectors[num]
        const potential  = (bs?.s1 !== null && bs?.s2 !== null && bs?.s3 !== null)
          ? (bs.s1! + bs.s2! + bs.s3!) : null

        // Stint history
        const history: StintInfo[] = stintList.map(s => ({
          compound: s.compound,
          lapStart: s.lap_start,
          lapEnd: s.lap_end,
          age: s.tyre_age_at_start,
          isNew: s.tyre_age_at_start === 0,
        }))

        return {
          driver: d,
          position: pos,
          positionChange: change,
          gap: null,
          interval: null,
          isDNF: false,      // set in fillGaps after sorting
          lastLap: lastL,
          bestLap: bestLaps[num] ?? null,
          bestSectors: { s1: bs?.s1 ?? null, s2: bs?.s2 ?? null, s3: bs?.s3 ?? null },
          potentialLap: potential,
          currentStint: currStint,
          stintHistory: history,
          pitCount: Math.max(0, stintList.length - 1),
          lapCount: lapCountMap[num] ?? 0,
          speedI1: lastL?.i1_speed ?? null,
          speedI2: lastL?.i2_speed ?? null,
          speedST: lastL?.st_speed ?? null,
        }
      })
      .sort((a, b) => a.position - b.position)

    fillGaps(result, laps, sessionType)

    // Save positions for next diff
    result.forEach(d => { prevPositionRef.current[d.driver.driver_number] = d.position })

    return result
  }, [])

  const pushState = useCallback((positions: Position[], laps: Lap[]) => {
    rawLapsRef.current   = laps
    const overallBest    = computeOverallBest(laps)
    const allBestSectors = computeBestSectors(laps)
    const overallBestSectors = computeOverallBestSectors(allBestSectors)
    const drivers        = buildDriverTimings(positions, laps, stintsRef.current, driversRef.current, sessionRef.current?.session_type)
    const rc             = rcRef.current
    const trackStatus    = deriveTrackStatus(rc)
    const drsEnabled     = deriveDrsEnabled(rc)

    // ── Additional DNF detection: position-timestamp method ────────────
    // Lap-gap heuristic (>4 laps) catches obvious retirements but misses
    // drivers who retire late in the race with only 1-2 laps difference.
    // Solution: if a driver's last position update was >3 min before the
    // session ended, they must have retired (position feed stops on crash).
    const session = sessionRef.current
    const isRaceSession = session?.session_type === 'Race' || session?.session_type === 'Sprint'
    const isFinished    = session?.status === 'Finished'

    if (isRaceSession && isFinished) {
      const DNF_THRESHOLD = 3 * 60 * 1000   // 3 minutes gap = retired

      // Build last-position-time map in O(n)
      const lastPosMs: Record<number, number> = {}
      for (const pos of positions) {
        const t = new Date(pos.date).getTime()
        if (!lastPosMs[pos.driver_number] || t > lastPosMs[pos.driver_number])
          lastPosMs[pos.driver_number] = t
      }

      // Use the LATEST position from ANY driver as the race-end reference.
      // session.date_end is the scheduled end (2h from start), not the actual
      // race finish time — using it would make everyone look like a DNF.
      const raceEndMs = Math.max(0, ...Object.values(lastPosMs))
      if (raceEndMs === 0) return  // no position data yet

      for (const d of drivers) {
        if (d.isDNF) continue
        const lastT = lastPosMs[d.driver.driver_number]
        if (!lastT) continue
        if (raceEndMs - lastT > DNF_THRESHOLD) d.isDNF = true
      }
    }

    setState(prev => ({
      ...prev,
      session:     sessionRef.current,
      sessionMode: sessionRef.current?.status === 'Started' ? 'live' : 'results',
      drivers,
      weather: weatherRef.current,
      raceControl: rc,
      overallBestLap: overallBest,
      overallBestSectors,
      trackStatus,
      drsEnabled,
      loading: false,
      error: null,
      lastUpdate: new Date(),
    }))
  }, [buildDriverTimings])

  // ── fetchers ──────────────────────────────────────────────────────

  const fetchSession = useCallback(async () => {
    try {
      const latest: Session = await openf1.getLatestSession()
      if (!latest) return

      // ── If a session is currently live → use it directly ──────────
      if (latest.status === 'Started') {
        sessionRef.current = latest
        setState(prev => ({ ...prev, session: latest, sessionMode: 'live' }))
        return
      }

      // ── If the latest session IS a finished Race → show its results
      if (latest.session_type === 'Race' && latest.status === 'Finished') {
        sessionRef.current = latest
        setState(prev => ({ ...prev, session: latest, sessionMode: 'results' }))
        return
      }

      // ── Otherwise (practice / qualifying / unknown) → find the most
      //    recent finished Race and show it as standing results ────────
      const year  = new Date(latest.date_start).getFullYear()
      const found = await findLastRace(year)
      const target = found ?? latest          // fallback to whatever we have
      sessionRef.current = target
      setState(prev => ({
        ...prev,
        session:     target,
        sessionMode: target.status === 'Started' ? 'live' : 'results',
      }))
    } catch { /* keep cached */ }
  }, [])

  const fetchSlow = useCallback(async () => {
    const key = sessionRef.current?.session_key
    if (!key) return
    try {
      driversRef.current = await openf1.getDrivers(key) as Driver[]
      stintsRef.current  = await openf1.getStints(key) as Stint[]
      const rawW         = await openf1.getWeather(key) as Weather[]
      weatherRef.current = rawW[rawW.length - 1] ?? null
      const rc           = await openf1.getRaceControl(key) as RaceControlMessage[]
      rcRef.current      = rc.slice().reverse()  // newest first
      setState(prev => ({ ...prev, weather: weatherRef.current, raceControl: rcRef.current }))
    } catch (e) {
      setState(prev => ({ ...prev, error: e instanceof Error ? e.message : 'Error slow fetch' }))
    }
  }, [])

  const fetchFast = useCallback(async () => {
    const key = sessionRef.current?.session_key
    if (!key || isFetchingRef.current) return
    isFetchingRef.current = true
    try {
      const positions = await openf1.getPositions(key) as Position[]
      const laps      = await openf1.getLaps(key) as Lap[]
      pushState(positions, laps)
    } catch (e) {
      setState(prev => ({ ...prev, loading: false, error: e instanceof Error ? e.message : 'Error fast fetch' }))
    } finally {
      isFetchingRef.current = false
    }
  }, [pushState])

  const refresh = useCallback(async () => {
    setState(prev => ({ ...prev, error: null }))
    await fetchSession()
    await fetchSlow()
    await fetchFast()
  }, [fetchSession, fetchSlow, fetchFast])

  useEffect(() => {
    let active = true  // guard against React StrictMode double-mount

    const init = async () => {
      await fetchSession()
      if (!active) return
      await fetchSlow()
      if (!active) return
      await fetchFast()
    }
    init()

    sessionTimerRef.current = setInterval(() => { if (active) fetchSession() }, SESSION_MS)
    slowTimerRef.current    = setInterval(() => { if (active) fetchSlow() },    SLOW_MS)
    fastTimerRef.current    = setInterval(() => { if (active) fetchFast() },    FAST_MS)

    return () => {
      active = false
      clearInterval(sessionTimerRef.current!)
      clearInterval(slowTimerRef.current!)
      clearInterval(fastTimerRef.current!)
    }
  }, [fetchSession, fetchSlow, fetchFast])

  return {
    ...state,
    refresh,
    get rawLaps() { return rawLapsRef.current },
  }
}

// ── pure helpers ──────────────────────────────────────────────────

function latestPerDriver<T extends { driver_number: number }>(items: T[], key: keyof T): T[] {
  const map: Record<number, T> = {}
  for (const item of items) {
    const curr = map[item.driver_number]
    if (!curr || (item[key] as number) > (curr[key] as number)) map[item.driver_number] = item
  }
  return Object.values(map)
}

/** Latest record per driver sorted by ISO date string (lexicographically comparable). */
function latestByDate<T extends { driver_number: number; date: string }>(items: T[]): T[] {
  const map: Record<number, T> = {}
  for (const item of items) {
    const curr = map[item.driver_number]
    if (!curr || item.date > curr.date) map[item.driver_number] = item
  }
  return Object.values(map)
}

function computeBestLaps(laps: Lap[]): Record<number, Lap> {
  const best: Record<number, Lap> = {}
  for (const lap of laps) {
    if (lap.lap_duration === null) continue
    const curr = best[lap.driver_number]
    if (!curr || !curr.lap_duration || lap.lap_duration < curr.lap_duration) best[lap.driver_number] = lap
  }
  return best
}

// Valid sector time range
// MIN 3s  — no real F1 sector is under 3 seconds
// MAX 60s — covers Spa S2 (longest sector in F1, ~52s for slowest cars)
//           LEC's VSC sector (51.2s) is caught by the 125s lap filter, not this
const MIN_SECTOR = 3
const MAX_SECTOR = 60

function validSector(v: number | null | undefined): v is number {
  return v != null && v > MIN_SECTOR && v < MAX_SECTOR
}

// 125s: Barcelona VSC lap = 125.258s → filtered ✓
//       Spa slowest normal lap = 118.8s  → kept ✓
//       SC/VSC at any circuit  = 130s+   → filtered ✓
const MAX_RACING_LAP = 125

function computeBestSectors(laps: Lap[]): Record<number, { s1: number | null; s2: number | null; s3: number | null }> {
  const best: Record<number, { s1: number | null; s2: number | null; s3: number | null }> = {}
  for (const lap of laps) {
    if (lap.is_pit_out_lap) continue              // sectors include pit lane time
    if (lap.lap_duration === null) continue        // crashed/incomplete lap
    if (lap.lap_duration > MAX_RACING_LAP) continue  // SC/VSC lap

    if (!best[lap.driver_number]) best[lap.driver_number] = { s1: null, s2: null, s3: null }
    const b = best[lap.driver_number]
    if (validSector(lap.duration_sector_1) && (b.s1 === null || lap.duration_sector_1 < b.s1)) b.s1 = lap.duration_sector_1
    if (validSector(lap.duration_sector_2) && (b.s2 === null || lap.duration_sector_2 < b.s2)) b.s2 = lap.duration_sector_2
    if (validSector(lap.duration_sector_3) && (b.s3 === null || lap.duration_sector_3 < b.s3)) b.s3 = lap.duration_sector_3
  }
  return best
}

function computeOverallBestSectors(perDriver: Record<number, { s1: number|null; s2: number|null; s3: number|null }>): BestSectors {
  let s1: number|null = null, s2: number|null = null, s3: number|null = null
  for (const b of Object.values(perDriver)) {
    if (validSector(b.s1) && (s1 === null || b.s1 < s1)) s1 = b.s1
    if (validSector(b.s2) && (s2 === null || b.s2 < s2)) s2 = b.s2
    if (validSector(b.s3) && (s3 === null || b.s3 < s3)) s3 = b.s3
  }
  return { s1, s2, s3 }
}

function computeOverallBest(laps: Lap[]): Lap | null {
  let best: Lap | null = null
  for (const lap of laps) {
    if (lap.lap_duration === null) continue
    if (!best || !best.lap_duration || lap.lap_duration < best.lap_duration) best = lap
  }
  return best
}

// Gap encoding: normal time in seconds (0–999) OR laps-behind × 100_000
// Use getLapsBehind() to decode.
export const LAP_BEHIND_FACTOR = 100_000

function computeTotalTimes(laps: Lap[]): Record<number, number> {
  const totals: Record<number, number> = {}
  for (const lap of laps) {
    if (lap.lap_duration === null) continue
    totals[lap.driver_number] = (totals[lap.driver_number] ?? 0) + lap.lap_duration
  }
  return totals
}

function fillGaps(drivers: DriverTiming[], laps: Lap[], sessionType?: string) {
  const leader = drivers[0]
  if (!leader) return

  const isRace = sessionType === 'Race' || sessionType === 'Sprint'

  if (isRace) {
    // ── Race: use total accumulated time + lap count difference ──
    const totalTimes   = computeTotalTimes(laps)
    const leaderTotal  = totalTimes[leader.driver.driver_number] ?? 0
    const leaderLaps   = leader.lapCount

    // DNF threshold: > 4 laps behind leader = retired from race
    // (nobody gets lapped 5+ times in a modern F1 race)
    const DNF_LAP_THRESHOLD = 4

    drivers.forEach((d, i) => {
      if (i === 0) { d.gap = 0; d.interval = 0; return }

      const dLaps   = d.lapCount
      const dTotal  = totalTimes[d.driver.driver_number] ?? 0
      const gapLaps = leaderLaps - dLaps

      // DNF signal 1: too many laps behind (obvious retirement)
      if (gapLaps > DNF_LAP_THRESHOLD) d.isDNF = true

      // DNF signal 2: last lap has null duration = crashed/retired mid-lap.
      // e.g. LEC/ANT at Barcelona 2026 → their last lap entry exists but
      // has no duration because they didn't finish that lap.
      // PER was also 3 laps down but has a valid last lap time → NOT DNF.
      if (!d.isDNF && gapLaps >= 1 && d.lastLap !== null && d.lastLap.lap_duration === null) {
        d.isDNF = true
      }

      // Gap to leader
      if (gapLaps > 0) {
        d.gap = gapLaps * LAP_BEHIND_FACTOR
      } else if (leaderTotal > 0 && dTotal > 0) {
        const raw = dTotal - leaderTotal
        d.gap = raw >= 0 ? raw : null
      }

      // Interval to car directly ahead
      const prev      = drivers[i - 1]
      const intLaps   = prev.lapCount - dLaps
      const prevTotal = totalTimes[prev.driver.driver_number] ?? 0
      if (intLaps > 0) {
        d.interval = intLaps * LAP_BEHIND_FACTOR
      } else if (prevTotal > 0 && dTotal > 0) {
        const raw = dTotal - prevTotal
        d.interval = raw >= 0 ? raw : null
      }
    })
  } else {
    // ── Qualifying / Practice: use best lap time difference ──
    drivers.forEach((d, i) => {
      if (i === 0) { d.gap = 0; d.interval = 0; return }
      const leaderBest = leader.bestLap?.lap_duration
      const dBest      = d.bestLap?.lap_duration
      if (leaderBest && dBest) d.gap = dBest - leaderBest
      const prevBest = drivers[i - 1].bestLap?.lap_duration
      if (prevBest && dBest) d.interval = dBest - prevBest
    })
  }
}

// ── Find most recent finished Race in a given year (or year-1) ──

async function findLastRace(year: number): Promise<Session | null> {
  try {
    const sessions = await openf1.getSessions(year) as Session[]
    const races = sessions
      .filter(s => s.session_type === 'Race' && s.status === 'Finished')
      .sort((a, b) => b.date_start.localeCompare(a.date_start))

    if (races.length > 0) return races[0]

    // Nothing this year → try previous year
    const prev = await openf1.getSessions(year - 1) as Session[]
    const prevRaces = prev
      .filter(s => s.session_type === 'Race' && s.status === 'Finished')
      .sort((a, b) => b.date_start.localeCompare(a.date_start))

    return prevRaces[0] ?? null
  } catch {
    return null
  }
}
