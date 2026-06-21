export function formatLapTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '--:--.---'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)
  return `${mins}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}


export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return '--:--:--'
  }
}
