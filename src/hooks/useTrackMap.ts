import { useState, useEffect, useRef, useCallback } from 'react'
import { openf1 } from '../services/openf1'
import type { Lap } from '../types/openf1'

export interface TrackPoint { x: number; y: number; date: string }
export interface CarPos    { driverNumber: number; x: number; y: number; date: string }

const GRID_SNAP    = 5
const LIVE_POLL_MS = 8_000
const LIVE_WINDOW  = 12
const LIVE_AGE_MS  = 3 * 60 * 60 * 1000

const SIM_WINDOW_MS  = 90_000   // 90s data window
const SIM_PRELOAD_MS = 15_000   // pre-load next window 15s before end
const TARGET_FPS     = 30

function addSecs(iso: string, s: number): string {
  return new Date(new Date(iso).getTime() + s * 1000).toISOString()
}
function isRecent(d?: string | null): boolean {
  if (!d) return false
  return Date.now() - new Date(d).getTime() < LIVE_AGE_MS
}

// ── Outlier removal ──────────────────────────────────────────
function removeOutliers(pts: TrackPoint[]): TrackPoint[] {
  if (pts.length < 4) return pts
  const dists: number[] = []
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x-pts[i-1].x, dy = pts[i].y-pts[i-1].y
    dists.push(Math.sqrt(dx*dx+dy*dy))
  }
  dists.sort((a,b)=>a-b)
  const lim = Math.max(dists[dists.length>>1]*20, 200)
  const out: TrackPoint[] = [pts[0]]
  for (let i=1;i<pts.length;i++){
    const l = out[out.length-1]
    const dx=pts[i].x-l.x, dy=pts[i].y-l.y
    if (Math.sqrt(dx*dx+dy*dy)<=lim) out.push(pts[i])
  }
  return out
}

function buildPath(raw: any[]): TrackPoint[] {
  if (!raw.length) return []
  const sorted = [...raw].sort((a,b)=>a.date<b.date?-1:1)
  const pts: TrackPoint[] = []
  let lastKey = ''
  for (const d of sorted) {
    const gx=Math.round(d.x/GRID_SNAP)*GRID_SNAP
    const gy=Math.round(d.y/GRID_SNAP)*GRID_SNAP
    const key=`${gx},${gy}`
    if (key!==lastKey){ pts.push({x:gx,y:gy,date:d.date}); lastKey=key }
  }
  return removeOutliers(pts)
}

function extractOrderedPath(raw: any[]): TrackPoint[] {
  if (!raw.length) return []
  const byD: Record<number,any[]> = {}
  for (const d of raw){ if(!byD[d.driver_number])byD[d.driver_number]=[]; byD[d.driver_number].push(d) }
  const best = Object.values(byD).sort((a,b)=>b.length-a.length)[0]??[]
  return buildPath(best)
}

function extractCars(raw: any[]): CarPos[] {
  const latest: Record<number,CarPos> = {}
  for (const d of raw)
    if (!latest[d.driver_number]||d.date>latest[d.driver_number].date)
      latest[d.driver_number]={driverNumber:d.driver_number,x:d.x,y:d.y,date:d.date}
  return Object.values(latest)
}

// ── Simulation bucket ─────────────────────────────────────────
interface SortedPoint { t: number; x: number; y: number }
interface SimBucket {
  startMs: number; endMs: number
  byDriver: Record<number, SortedPoint[]>
}

function buildBucket(raw: any[]): SimBucket {
  const byDriver: Record<number, SortedPoint[]> = {}
  let minT = Infinity, maxT = -Infinity
  for (const d of raw) {
    const t = new Date(d.date).getTime()
    if (!byDriver[d.driver_number]) byDriver[d.driver_number] = []
    byDriver[d.driver_number].push({ t, x: d.x, y: d.y })
    if (t < minT) minT = t
    if (t > maxT) maxT = t
  }
  // Sort each driver's points by time
  for (const arr of Object.values(byDriver)) arr.sort((a,b)=>a.t-b.t)
  return { startMs: minT, endMs: maxT, byDriver }
}

/** Linear interpolation of a driver's position at time t */
function interpolate(pts: SortedPoint[], t: number): { x: number; y: number } | null {
  if (!pts.length) return null
  // Binary search
  let lo = 0, hi = pts.length - 1
  if (t <= pts[lo].t) return { x: pts[lo].x, y: pts[lo].y }
  if (t >= pts[hi].t) return { x: pts[hi].x, y: pts[hi].y }
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (pts[mid].t <= t) lo = mid; else hi = mid
  }
  const a = pts[lo], b = pts[hi]
  const alpha = (t - a.t) / (b.t - a.t)
  return { x: a.x + (b.x - a.x) * alpha, y: a.y + (b.y - a.y) * alpha }
}

// ── Hook ──────────────────────────────────────────────────────
export function useTrackMap(
  sessionKey:         number | null,
  sessionDateEnd?:    string | null,
  sessionDateStart?:  string | null,
  referenceLap?:      Lap | null,
  virtualTime?:       number | null,
) {
  const [orderedPath,    setOrderedPath] = useState<TrackPoint[]>([])
  const [carPositions,   setCarPos]      = useState<CarPos[]>([])
  const [hasData,        setHasData]     = useState(false)
  const [loadingCircuit, setLoading]     = useState(false)
  const [drsZones,       setDrsZones]    = useState<TrackPoint[]>([])

  const driverPathsRef = useRef<Record<number,{pts:TrackPoint[];lastDate:string}>>({})
  const timerRef       = useRef<ReturnType<typeof setInterval>|null>(null)
  const rafRef         = useRef<number|null>(null)
  const loadedKeyRef   = useRef<number|null>(null)
  const loadedRefRef   = useRef<string|null>(null)

  // Simulation state
  const bucketRef      = useRef<SimBucket|null>(null)
  const loadingSimRef  = useRef(false)
  const vtRef          = useRef<number|null>(null)  // current virtual time (updated each render)

  // Keep vtRef in sync with prop without re-running effects
  vtRef.current = virtualTime ?? null

  // ── Rebuild ordered path from live per-driver paths ──────────
  const rebuildPath = useCallback(() => {
    const best = Object.values(driverPathsRef.current).sort((a,b)=>b.pts.length-a.pts.length)[0]
    if (best?.pts.length > 20) { setOrderedPath([...best.pts]); setHasData(true) }
  }, [])

  // ── Load a simulation bucket ──────────────────────────────────
  const loadBucket = useCallback(async (key: number, centreMs: number) => {
    if (loadingSimRef.current) return
    loadingSimRef.current = true
    try {
      const from = new Date(centreMs - SIM_WINDOW_MS/2).toISOString()
      const to   = new Date(centreMs + SIM_WINDOW_MS/2).toISOString()
      const raw  = await openf1.getLocation(key, from, to)
      if (!raw.length) return
      bucketRef.current = buildBucket(raw)
      setHasData(true)
      // Also build circuit outline if we don't have one
      if (orderedPath.length < 50) {
        const path = extractOrderedPath(raw)
        if (path.length > 50) setOrderedPath(path)
      }
    } catch { /* silent */ }
    finally { loadingSimRef.current = false }
  }, [orderedPath.length])

  // ── RAF loop: smooth 30fps interpolation ─────────────────────
  useEffect(() => {
    if (!sessionKey || virtualTime == null) {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      return
    }

    let lastFrame = 0
    const FRAME_MS = 1000 / TARGET_FPS

    const animate = (ts: number) => {
      if (ts - lastFrame >= FRAME_MS) {
        lastFrame = ts
        const vt     = vtRef.current
        const bucket = bucketRef.current

        if (vt !== null && bucket) {
          // Pre-load next bucket when approaching the end
          if (vt > bucket.endMs - SIM_PRELOAD_MS && !loadingSimRef.current) {
            loadBucket(sessionKey, vt + SIM_WINDOW_MS / 2)
          }

          // Compute interpolated positions for all drivers
          const positions: CarPos[] = []
          for (const [numStr, pts] of Object.entries(bucket.byDriver)) {
            const pos = interpolate(pts, vt)
            if (pos) positions.push({
              driverNumber: Number(numStr),
              x: pos.x, y: pos.y,
              date: new Date(vt).toISOString(),
            })
          }
          if (positions.length) setCarPos(positions)
        } else if (vt !== null && !loadingSimRef.current) {
          // No bucket yet — load initial one
          loadBucket(sessionKey, vt)
        }
      }
      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => { if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null } }
  }, [sessionKey, virtualTime != null, loadBucket])  // only re-run when sim mode toggles

  // ── Historical load (non-live, non-sim) ──────────────────────
  const loadHistorical = useCallback(async (
    key: number, refLap: Lap|null|undefined, fbStart: string, fbEnd: string,
  ) => {
    if (loadedKeyRef.current === key) return
    setLoading(true)
    let ordered: TrackPoint[] = []
    try {
      let locationForLap: TrackPoint[] = []
      if (refLap?.date_start && refLap?.lap_duration) {
        const lapEnd = addSecs(refLap.date_start, refLap.lap_duration + 0.5)
        const raw    = await openf1.getLocation(key, refLap.date_start, lapEnd, refLap.driver_number)
        ordered      = buildPath(raw)
        locationForLap = ordered
      }
      if (ordered.length < 50) {
        const end2 = addSecs(fbStart, 4*60)
        const raw2 = await openf1.getLocation(key, fbStart, end2)
        ordered    = extractOrderedPath(raw2)
        if (!locationForLap.length) locationForLap = ordered
      }
      if (ordered.length > 50) { setOrderedPath(ordered); setHasData(true) }
      const posStart = addSecs(fbEnd, -300)
      const posRaw   = await openf1.getLocation(key, posStart, fbEnd)
      if (posRaw.length) { setCarPos(extractCars(posRaw)); setHasData(true) }
      loadedKeyRef.current  = key
      loadedRefRef.current  = refLap?.date_start ?? null

      // ── Detect DRS zones ────────────────────────────────────────
      if (refLap?.date_start && refLap?.lap_duration && refLap?.driver_number && locationForLap.length > 0) {
        const lapStart = refLap.date_start
        const lapEnd   = addSecs(lapStart, refLap.lap_duration + 0.5)
        try {
          const carDataRaw = await openf1.getCarData(key, refLap.driver_number, lapStart, lapEnd)
          const drsOpen    = carDataRaw.filter((d: any) => (d.drs ?? 0) >= 10)
          const drsZonePoints: TrackPoint[] = []
          for (const carEntry of drsOpen) {
            const entryTime = new Date(carEntry.date).getTime()
            let best: TrackPoint | null = null
            let bestDiff = Infinity
            for (const pt of locationForLap) {
              const diff = Math.abs(new Date(pt.date).getTime() - entryTime)
              if (diff < bestDiff) { bestDiff = diff; best = pt }
            }
            if (best && bestDiff < 500) drsZonePoints.push(best)
          }
          if (drsZonePoints.length > 0) setDrsZones(drsZonePoints)
        } catch { /* silent — DRS zones are optional */ }
      }
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  // ── Live poll ─────────────────────────────────────────────────
  const pollLive = useCallback(async (key: number) => {
    try {
      const since = new Date(Date.now() - LIVE_WINDOW * 1000).toISOString()
      const raw: any[] = await openf1.getLocation(key, since)
      if (!raw.length) return
      let changed = false
      for (const d of raw) {
        const entry = driverPathsRef.current[d.driver_number]
        if (!entry || d.date > entry.lastDate) {
          const gx=Math.round(d.x/GRID_SNAP)*GRID_SNAP, gy=Math.round(d.y/GRID_SNAP)*GRID_SNAP
          if (!entry) driverPathsRef.current[d.driver_number]={pts:[{x:gx,y:gy,date:d.date}],lastDate:d.date}
          else {
            const l = entry.pts[entry.pts.length-1]
            if (!l||l.x!==gx||l.y!==gy) entry.pts.push({x:gx,y:gy,date:d.date})
            entry.lastDate = d.date
          }
          changed = true
        }
      }
      if (changed) rebuildPath()
      setCarPos(extractCars(raw))
    } catch { /* silent */ }
  }, [rebuildPath])

  // ── Main effect ───────────────────────────────────────────────
  useEffect(() => {
    if (!sessionKey) return
    let active = true

    const sessionChanged = loadedKeyRef.current !== sessionKey
    const refImproved    = !loadedRefRef.current && !!(referenceLap?.date_start)

    if (sessionChanged || refImproved) {
      driverPathsRef.current = {}
      bucketRef.current      = null
      setOrderedPath([])
      setCarPos([])
      setHasData(false)
      loadedKeyRef.current   = null
    }

    // Simulation mode: only need the circuit outline
    if (virtualTime != null) {
      if (!orderedPath.length && sessionDateStart && referenceLap?.date_start && referenceLap?.lap_duration) {
        setLoading(true)
        const lapEnd = addSecs(referenceLap.date_start, referenceLap.lap_duration + 0.5)
        openf1.getLocation(sessionKey, referenceLap.date_start, lapEnd, referenceLap.driver_number)
          .then(raw => { if (active) { const p=buildPath(raw); if(p.length>50){setOrderedPath(p);setHasData(true)} }})
          .catch(()=>{})
          .finally(()=>{ if(active) setLoading(false) })
      }
      return
    }

    const live = isRecent(sessionDateEnd)
    if (live) {
      const run = () => { if (active) pollLive(sessionKey) }
      run()
      timerRef.current = setInterval(run, LIVE_POLL_MS)
    } else if (sessionDateStart && sessionDateEnd && !loadedKeyRef.current) {
      loadHistorical(sessionKey, referenceLap, sessionDateStart, sessionDateEnd)
    }

    return () => {
      active = false
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    }
  }, [sessionKey, sessionDateStart, sessionDateEnd, referenceLap,
      virtualTime, pollLive, loadHistorical, orderedPath.length])

  return { orderedPath, carPositions, hasData, loadingCircuit, drsZones }
}
