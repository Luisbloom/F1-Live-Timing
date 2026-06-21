import { Play, Pause, SkipBack, SkipForward } from 'lucide-react'
import type { ReplayPlayback, ReplaySpeed } from '../hooks/useReplay'

interface Props {
  playback: ReplayPlayback
  onPlay: () => void
  onPause: () => void
  onSeek: (pct: number) => void
  onSpeed: (s: ReplaySpeed) => void
  onExit: () => void
}

const SPEEDS: ReplaySpeed[] = [1, 5, 15, 30]

function formatVirtualTime(ms: number, startMs: number): string {
  const elapsed = Math.max(0, ms - startMs) / 1000
  const h = Math.floor(elapsed / 3600)
  const m = Math.floor((elapsed % 3600) / 60)
  const s = Math.floor(elapsed % 60)
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

function formatAbsTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

export default function ReplayControls({ playback, onPlay, onPause, onSeek, onSpeed, onExit }: Props) {
  const { isPlaying, speed, virtualTime, startTime, endTime, progressPct } = playback

  const totalSecs = (endTime - startTime) / 1000
  const totalH    = Math.floor(totalSecs / 3600)
  const totalM    = Math.floor((totalSecs % 3600) / 60)
  const totalStr  = totalH > 0 ? `${totalH}h ${totalM}m` : `${totalM}m`

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const pct  = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
    onSeek(pct)
  }

  const jump = (seconds: number) => {
    const range = endTime - startTime
    const delta = (seconds * 1000 / range) * 100
    onSeek(Math.max(0, Math.min(100, progressPct + delta)))
  }

  return (
    <div className="replay-controls">
      {/* Replay badge + exit */}
      <div className="rc-replay-badge">
        <span className="rc-replay-dot" />
        <span className="rc-replay-label">REPETICIÓN</span>
        <button className="rc-exit-btn" onClick={onExit}>× Salir</button>
      </div>

      {/* Scrubber */}
      <div className="rc-scrubber-wrap">
        <span className="rc-time-label">{formatAbsTime(startTime)}</span>

        <div className="rc-scrubber" onClick={handleScrub}>
          <div className="rc-scrubber-track">
            <div className="rc-scrubber-fill" style={{ width: `${progressPct}%` }} />
            <div className="rc-scrubber-thumb" style={{ left: `${progressPct}%` }} />
          </div>
        </div>

        <span className="rc-time-label">{formatAbsTime(endTime)}</span>
      </div>

      {/* Controls row */}
      <div className="rc-controls-row">
        <div className="rc-transport">
          <button className="rc-btn" onClick={() => jump(-60)} title="−1 min">
            <SkipBack size={14} strokeWidth={2.5} />
          </button>

          {isPlaying ? (
            <button className="rc-btn rc-btn--primary" onClick={onPause}>
              <Pause size={16} strokeWidth={2.5} />
            </button>
          ) : (
            <button className="rc-btn rc-btn--primary" onClick={onPlay}>
              <Play size={16} strokeWidth={2.5} />
            </button>
          )}

          <button className="rc-btn" onClick={() => jump(60)} title="+1 min">
            <SkipForward size={14} strokeWidth={2.5} />
          </button>
        </div>

        <div className="rc-time-display">
          <span className="rc-elapsed">{formatVirtualTime(virtualTime, startTime)}</span>
          <span className="rc-total"> / {totalStr}</span>
        </div>

        <div className="rc-speeds">
          {SPEEDS.map(s => (
            <button
              key={s}
              className={`rc-speed-btn ${speed === s ? 'rc-speed-btn--active' : ''}`}
              onClick={() => onSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
