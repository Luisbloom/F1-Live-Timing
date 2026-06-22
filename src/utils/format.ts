export function formatLapTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '--:--.---'
  const t    = Math.max(0, seconds)
  const hrs  = Math.floor(t / 3600)
  const mins = Math.floor((t % 3600) / 60)
  const secs = Math.floor(t % 60)
  // Use integer arithmetic to avoid IEEE-754 drift in the fractional part
  const ms   = Math.round(t * 1000) % 1000
  const base = `${mins}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
  return hrs > 0 ? `${hrs}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}.${String(ms).padStart(3,'0')}` : base
}


export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return '--:--:--'
  }
}
