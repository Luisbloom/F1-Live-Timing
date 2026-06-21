import { useState, useEffect, useRef } from 'react'
import { openf1 } from '../services/openf1'

export interface CarTelemetry {
  speed: number
  rpm: number
  gear: number
  throttle: number
  brake: number
  drs: number
  date: string
}

// DRS values: 0=off, 8=detection, 10=open, 12=open+detected, 14=fully open
export function isDrsOpen(drs: number): boolean {
  return drs >= 10
}

export function useCarTelemetry(
  sessionKey: number | null,
  driverNumber: number | null,
  isLive: boolean,
  virtualTime?: number | null,
): CarTelemetry | null {
  const [telemetry, setTelemetry] = useState<CarTelemetry | null>(null)
  const prevVtRef = useRef<number | null>(null)
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── LIVE mode: poll /car_data?date>NOW-5s every 3s ───────────
  useEffect(() => {
    if (!isLive || !sessionKey || !driverNumber) return

    const poll = async () => {
      try {
        const since = new Date(Date.now() - 5000).toISOString()
        const raw = await openf1.getCarData(sessionKey, driverNumber, since)
        if (!raw || !raw.length) return
        // Sort by date, take the latest
        const sorted = [...raw].sort((a, b) => a.date < b.date ? -1 : 1)
        const latest = sorted[sorted.length - 1]
        setTelemetry({
          speed:    latest.speed    ?? 0,
          rpm:      latest.rpm      ?? 0,
          gear:     latest.n_gear   ?? latest.gear ?? 0,  // API uses n_gear
          throttle: latest.throttle ?? 0,
          brake:    latest.brake    ?? 0,
          drs:      latest.drs      ?? 0,  // can be null → 0 = DRS off
          date:     latest.date,
        })
      } catch {
        // silent — keep last known state
      }
    }

    poll()
    timerRef.current = setInterval(poll, 3000)

    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    }
  }, [isLive, sessionKey, driverNumber])

  // ── REPLAY mode: fetch when virtualTime changes by >0.5s ─────
  useEffect(() => {
    if (isLive || !sessionKey || !driverNumber || virtualTime == null) return

    const prev = prevVtRef.current
    if (prev !== null && Math.abs(virtualTime - prev) < 500) return
    prevVtRef.current = virtualTime

    const vtDate = virtualTime

    const fetch = async () => {
      try {
        const from = new Date(vtDate - 2000).toISOString()
        const to   = new Date(vtDate + 500).toISOString()
        const raw  = await openf1.getCarData(sessionKey, driverNumber, from, to)
        if (!raw || !raw.length) return

        // Find the record closest to virtualTime
        const vtMs = vtDate
        let best: any = null
        let bestDiff = Infinity
        for (const entry of raw) {
          const diff = Math.abs(new Date(entry.date).getTime() - vtMs)
          if (diff < bestDiff) { bestDiff = diff; best = entry }
        }
        if (!best) return

        setTelemetry({
          speed:    best.speed    ?? 0,
          rpm:      best.rpm      ?? 0,
          gear:     best.n_gear   ?? best.gear ?? 0,
          throttle: best.throttle ?? 0,
          brake:    best.brake    ?? 0,
          drs:      best.drs      ?? 0,
          date:     best.date,
        })
      } catch {
        // silent
      }
    }

    fetch()
  }, [isLive, sessionKey, driverNumber, virtualTime])

  // Reset telemetry when driver or session changes
  useEffect(() => {
    setTelemetry(null)
    prevVtRef.current = null
  }, [sessionKey, driverNumber])

  return telemetry
}
