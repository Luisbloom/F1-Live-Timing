import { useState, useEffect, useRef, useCallback } from 'react'
import { openf1 } from '../services/openf1'
import type { Driver, Position, Lap, Stint, Session, Weather, RaceControlMessage } from '../types/openf1'
import type { DriverTiming, TimingState, StintInfo, TrackStatus } from './useTimingData'

export type ReplaySpeed = 1 | 5 | 15 | 30

export interface ReplayLoadState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  progress: number   // 0-100
  step: string
  error?: string
}

export interface ReplayPlayback {
  isPlaying: boolean
  speed: ReplaySpeed
  virtualTime: number    // ms since epoch
  startTime: number
  endTime: number
  progressPct: number    // 0-100
}

interface RawSessionData {
  session: Session
  drivers: Driver[]
  positions: Position[]
  laps: Lap[]
  stints: Stint[]
  raceControl: RaceControlMessage[]
  weather: Weather[]
}

const TICK_MS = 100  // real-time tick interval

export function useReplay() {
  const [loadState, setLoad] = useState<ReplayLoadState>({ status: 'idle', progress: 0, step: '' })
  const [playback, setPlayback] = useState<ReplayPlayback | null>(null)
  const [timing, setTiming]     = useState<TimingState | null>(null)
  const [totalLaps, setTotalLaps] = useState<number>(0)

  const rawRef     = useRef<RawSessionData | null>(null)
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Load a full session ───────────────────────────────────────

  const loadSession = useCallback(async (session: Session) => {
    setLoad({ status: 'loading', progress: 0, step: 'Cargando pilotos...' })
    setTiming(null)
    setPlayback(null)
    rawRef.current = null

    try {
      const key = session.session_key

      const step = (label: string, pct: number) =>
        setLoad(prev => ({ ...prev, step: label, progress: pct }))

      step('Cargando pilotos...', 5)
      const drivers: Driver[] = await openf1.getDrivers(key)

      step('Cargando posiciones...', 20)
      const positions: Position[] = await openf1.getPositions(key)

      step('Cargando vueltas...', 40)
      const laps: Lap[] = await openf1.getLaps(key)

      step('Cargando stints...', 60)
      const stints: Stint[] = await openf1.getStints(key)

      step('Cargando Race Control...', 75)
      const raceControl: RaceControlMessage[] = await openf1.getRaceControl(key)

      step('Cargando meteorología...', 90)
      const weather: Weather[] = await openf1.getWeather(key)

      rawRef.current = { session, drivers, positions, laps, stints, raceControl, weather }

      // Total laps = highest lap_number recorded in the session
      const maxLap = laps.reduce((m, l) => Math.max(m, l.lap_number), 0)
      setTotalLaps(maxLap)

      const startTime = new Date(session.date_start).getTime()
      const endTime   = new Date(session.date_end).getTime()

      setLoad({ status: 'ready', progress: 100, step: 'Listo' })
      setPlayback({
        isPlaying: false,
        speed: 5,
        virtualTime: startTime,
        startTime,
        endTime,
        progressPct: 0,
      })

      // Show initial state (beginning of session)
      setTiming(computeAt(startTime, rawRef.current))
    } catch (e) {
      setLoad({ status: 'error', progress: 0, step: 'Error', error: e instanceof Error ? e.message : 'Error cargando sesión' })
    }
  }, [])

  // ── Playback timer ────────────────────────────────────────────

  useEffect(() => {
    if (!playback?.isPlaying) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      return
    }

    timerRef.current = setInterval(() => {
      setPlayback(prev => {
        if (!prev) return prev
        const next = prev.virtualTime + TICK_MS * prev.speed
        if (next >= prev.endTime) {
          // Reached end
          return { ...prev, virtualTime: prev.endTime, isPlaying: false, progressPct: 100 }
        }
        const pct = ((next - prev.startTime) / (prev.endTime - prev.startTime)) * 100
        return { ...prev, virtualTime: next, progressPct: pct }
      })
    }, TICK_MS)

    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [playback?.isPlaying, playback?.speed])

  // Recompute timing state when virtual time changes
  useEffect(() => {
    if (!playback || !rawRef.current) return
    setTiming(computeAt(playback.virtualTime, rawRef.current))
  }, [playback?.virtualTime])

  // ── Controls ──────────────────────────────────────────────────

  const play  = useCallback(() => setPlayback(p => p ? { ...p, isPlaying: true } : p), [])
  const pause = useCallback(() => setPlayback(p => p ? { ...p, isPlaying: false } : p), [])
  const setSpeed = useCallback((speed: ReplaySpeed) => setPlayback(p => p ? { ...p, speed } : p), [])

  const seek = useCallback((pct: number) => {
    setPlayback(prev => {
      if (!prev) return prev
      const vt = prev.startTime + (prev.endTime - prev.startTime) * (pct / 100)
      return { ...prev, virtualTime: vt, progressPct: pct }
    })
  }, [])

  const reset = useCallback(() => {
    rawRef.current = null
    setLoad({ status: 'idle', progress: 0, step: '' })
    setPlayback(null)
    setTiming(null)
  }, [])

  return {
    loadState, playback, timing, totalLaps, loadSession, play, pause, setSpeed, seek, reset,
    get rawLaps() { return rawRef.current?.laps ?? [] },
  }
}

// ── Compute timing state at a given virtual time ──────────────

function computeAt(virtualTimeMs: number, raw: RawSessionData): TimingState {
  const { session, drivers, positions, laps, stints, raceControl, weather } = raw

  // Filter to data available at virtualTime
  const filteredPositions = positions.filter(p => ts(p.date) <= virtualTimeMs)
  const filteredLaps      = laps.filter(l =>
    l.date_start ? ts(l.date_start) + (l.lap_duration ?? 0) * 1000 <= virtualTimeMs : false
  )
  const filteredRC        = raceControl
    .filter(m => ts(m.date) <= virtualTimeMs)
    .slice(-20)
    .reverse()

  const latestPos   = latestByDate<Position>(filteredPositions)
  const latestLap   = latestPerDriver<Lap>(filteredLaps, 'lap_number')
  const bestLaps    = computeBestLaps(filteredLaps)
  const bestSectors = computeBestSectors(filteredLaps)

  const posMap: Record<number, number> = {}
  latestPos.forEach(p => { posMap[p.driver_number] = p.position })

  const lapCountMap: Record<number, number> = {}
  latestLap.forEach(l => { lapCountMap[l.driver_number] = l.lap_number })

  // ── Filter stints by virtual time ──────────────────────────────
  // Stints have no timestamp — only lap numbers (lap_start / lap_end).
  //
  // A stint is visible when the driver has STARTED it.
  // lapCountMap[d] = laps COMPLETED → driver is currently on lap (completed + 1).
  // So: show a stint if  lap_start <= completedLaps + 1
  //
  // Example (lap_start=1, completedLaps=0):
  //   1 <= 0 + 1  → true  → show starting tyre ✓
  //
  // Example (lap_start=32, completedLaps=31):
  //   32 <= 31 + 1  → true  → show post-pit stint ✓
  //
  // Example (lap_start=32, completedLaps=5):
  //   32 <= 5 + 1   → false → hide future stint ✓
  const stintsByDriver: Record<number, Stint[]> = {}
  stints.forEach(s => {
    const completedLaps = lapCountMap[s.driver_number] ?? 0
    if (s.lap_start > completedLaps + 1) return   // stint hasn't started yet
    if (!stintsByDriver[s.driver_number]) stintsByDriver[s.driver_number] = []
    stintsByDriver[s.driver_number].push(s)
  })

  // Build filtered latestStint from the filtered stintsByDriver
  const activeStintPerDriver: Record<number, Stint> = {}
  Object.entries(stintsByDriver).forEach(([numStr, arr]) => {
    const sorted = arr.sort((a, b) => a.stint_number - b.stint_number)
    activeStintPerDriver[Number(numStr)] = sorted[sorted.length - 1]
  })

  const driverTimings: DriverTiming[] = drivers
    .map(d => {
      const num = d.driver_number
      const bs  = bestSectors[num]
      const potential = bs?.s1 != null && bs?.s2 != null && bs?.s3 != null
        ? bs.s1 + bs.s2 + bs.s3 : null

      const stintList = (stintsByDriver[num] ?? [])
        .sort((a, b) => a.stint_number - b.stint_number)

      const history: StintInfo[] = stintList.map(s => ({
        compound: s.compound,
        lapStart: s.lap_start,
        lapEnd:   s.lap_end,
        age:      s.tyre_age_at_start,
        isNew:    s.tyre_age_at_start === 0,
      }))

      const lastL = latestLap.find(l => l.driver_number === num) ?? null

      return {
        driver: d,
        position: posMap[num] ?? 99,
        positionChange: 0,
        gap: null,
        interval: null,
        isDNF: false,    // set by fillGaps
        lastLap: lastL,
        bestLap: bestLaps[num] ?? null,
        bestSectors: { s1: bs?.s1 ?? null, s2: bs?.s2 ?? null, s3: bs?.s3 ?? null },
        potentialLap: potential,
        currentStint: activeStintPerDriver[num] ?? null,
        stintHistory: history,
        pitCount: Math.max(0, stintList.length - 1),
        lapCount: lapCountMap[num] ?? 0,
        speedI1: lastL?.i1_speed ?? null,
        speedI2: lastL?.i2_speed ?? null,
        speedST: lastL?.st_speed ?? null,
      }
    })
    .sort((a, b) => a.position - b.position)

  fillGaps(driverTimings, filteredLaps, session.session_type)

  // ── DNF by position timestamp ─────────────────────────────────
  // If a driver's last position update is >3 min before virtual time,
  // they've crashed/retired (their position feed stops on retirement).
  const isRaceSession = session.session_type === 'Race' || session.session_type === 'Sprint'
  if (isRaceSession) {
    const DNF_THRESHOLD = 3 * 60 * 1000

    const lastPosMs: Record<number, number> = {}
    for (const pos of filteredPositions) {
      const t = ts(pos.date)
      if (!lastPosMs[pos.driver_number] || t > lastPosMs[pos.driver_number])
        lastPosMs[pos.driver_number] = t
    }

    // Use latest position from any driver as the actual race-end reference
    // (same fix as in useTimingData — session.date_end is scheduled, not actual)
    const raceEndMs = Math.max(0, ...Object.values(lastPosMs))
    if (raceEndMs > 0) {
      for (const d of driverTimings) {
        if (d.isDNF) continue
        const lastT = lastPosMs[d.driver.driver_number]
        if (!lastT) continue
        if (raceEndMs - lastT > DNF_THRESHOLD) d.isDNF = true
      }
    }
  }

  const overallBest    = computeOverallBest(filteredLaps)
  const overallBestSectors = computeOverallBestSectorsReplay(bestSectors)
  const filteredW      = weather.filter(w => ts(w.date) <= virtualTimeMs)
  const lastWeather    = filteredW[filteredW.length - 1] ?? null
  const trackStatus    = deriveTrackStatus(filteredRC)
  const drsEnabled     = deriveDrsEnabled(filteredRC)

  return {
    session,
    sessionMode: 'results' as const,
    drivers: driverTimings,
    weather: lastWeather,
    raceControl: filteredRC,
    overallBestLap: overallBest,
    overallBestSectors,
    trackStatus,
    drsEnabled,
    loading: false,
    error: null,
    lastUpdate: new Date(virtualTimeMs),
  }
}

// ── Shared computation helpers ────────────────────────────────

const MIN_SECTOR = 3
const MAX_SECTOR = 60   // covers Spa S2 (~52s max); SC/VSC laps caught by 125s lap filter

function validSectorR(v: number | null | undefined): v is number {
  return v != null && v > MIN_SECTOR && v < MAX_SECTOR
}

function computeOverallBestSectorsReplay(
  perDriver: Record<number, { s1: number|null; s2: number|null; s3: number|null }>
): import('./useTimingData').BestSectors {
  let s1: number|null = null, s2: number|null = null, s3: number|null = null
  for (const b of Object.values(perDriver)) {
    if (validSectorR(b.s1) && (s1 === null || b.s1 < s1)) s1 = b.s1
    if (validSectorR(b.s2) && (s2 === null || b.s2 < s2)) s2 = b.s2
    if (validSectorR(b.s3) && (s3 === null || b.s3 < s3)) s3 = b.s3
  }
  return { s1, s2, s3 }
}

function ts(iso: string | null | undefined): number {
  if (!iso) return 0
  return new Date(iso).getTime()
}

function latestPerDriver<T extends { driver_number: number }>(items: T[], key: keyof T): T[] {
  const map: Record<number, T> = {}
  for (const item of items) {
    const curr = map[item.driver_number]
    if (!curr || (item[key] as number) > (curr[key] as number)) map[item.driver_number] = item
  }
  return Object.values(map)
}

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

function computeBestSectors(laps: Lap[]): Record<number, { s1: number | null; s2: number | null; s3: number | null }> {
  const best: Record<number, { s1: number | null; s2: number | null; s3: number | null }> = {}
  for (const lap of laps) {
    if (lap.is_pit_out_lap) continue              // sectors include pit lane time
    if (lap.lap_duration === null) continue        // crashed lap
    if (lap.lap_duration > 125) continue           // SC/VSC lap (Spa max normal = 118.8s)
    if (!best[lap.driver_number]) best[lap.driver_number] = { s1: null, s2: null, s3: null }
    const b = best[lap.driver_number]
    if (validSectorR(lap.duration_sector_1) && (b.s1 == null || lap.duration_sector_1 < b.s1)) b.s1 = lap.duration_sector_1
    if (validSectorR(lap.duration_sector_2) && (b.s2 == null || lap.duration_sector_2 < b.s2)) b.s2 = lap.duration_sector_2
    if (validSectorR(lap.duration_sector_3) && (b.s3 == null || lap.duration_sector_3 < b.s3)) b.s3 = lap.duration_sector_3
  }
  return best
}

function computeOverallBest(laps: Lap[]): Lap | null {
  let best: Lap | null = null
  for (const lap of laps) {
    if (lap.lap_duration === null) continue
    if (!best || !best.lap_duration || lap.lap_duration < best.lap_duration) best = lap
  }
  return best
}

const LAP_BEHIND_FACTOR = 100_000

function computeTotalTimesReplay(laps: Lap[]): Record<number, number> {
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
    const totalTimes  = computeTotalTimesReplay(laps)
    const leaderTotal = totalTimes[leader.driver.driver_number] ?? 0
    const leaderLaps  = leader.lapCount

    const DNF_LAP_THRESHOLD = 4

    drivers.forEach((d, i) => {
      if (i === 0) { d.gap = 0; d.interval = 0; return }
      const dLaps   = d.lapCount
      const dTotal  = totalTimes[d.driver.driver_number] ?? 0
      const gapLaps = leaderLaps - dLaps

      if (gapLaps > DNF_LAP_THRESHOLD) d.isDNF = true

      // DNF signal 2: last lap entry has null duration = crashed mid-lap
      if (!d.isDNF && gapLaps >= 1 && d.lastLap !== null && d.lastLap.lap_duration === null) {
        d.isDNF = true
      }

      if (gapLaps > 0) {
        d.gap = gapLaps * LAP_BEHIND_FACTOR
      } else if (leaderTotal > 0 && dTotal > 0) {
        const raw = dTotal - leaderTotal
        d.gap = raw >= 0 ? raw : null
      }

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

function deriveTrackStatus(messages: RaceControlMessage[]): TrackStatus {
  for (const msg of messages) {
    const txt  = msg.message.toUpperCase()
    const flag = msg.flag?.toUpperCase() ?? ''
    if (txt.includes('RED FLAG') || txt.includes('SESSION SUSPENDED') || flag === 'RED') return 'red_flag'
    if (txt.includes('SAFETY CAR DEPLOYED')) return 'sc'
    if (txt.includes('VIRTUAL SAFETY CAR DEPLOYED') || txt.includes('VSC DEPLOYED')) return 'vsc'
    if (flag === 'CLEAR' || flag === 'GREEN') return 'clear'
    if (txt.includes('TRACK CLEAR') || txt.includes('ALL CLEAR')) return 'clear'
    if (txt.includes('SAFETY CAR IN THIS LAP') || txt.includes('SAFETY CAR ENDING')) return 'clear'
    if (txt.includes('VSC ENDING')) return 'clear'
    if (txt.includes('GREEN LIGHT') || txt.includes('SESSION STARTED')) return 'clear'
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
