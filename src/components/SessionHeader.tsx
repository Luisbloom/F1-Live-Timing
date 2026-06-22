import { RefreshCw, History, X } from 'lucide-react'
import type { Session, Weather } from '../types/openf1'
import type { SessionMode, TrackStatus } from '../hooks/useTimingData'
import { circuitFlag } from '../utils/countryFlags'

interface Props {
  session:       Session | null
  weather:       Weather | null
  _lastUpdate?:  Date | null
  onRefresh:     () => void
  appMode:       'live' | 'replay'
  sessionMode:   SessionMode
  trackStatus:   TrackStatus
  currentLap?:   number
  totalLaps?:    number
  onOpenPicker:  () => void
  onExitReplay:  () => void
}


const TRACK_BADGE: Record<TrackStatus, { label: string; cls: string }> = {
  clear:    { label: 'TRACK CLEAR',  cls: 'track-badge--clear' },
  sc:       { label: 'SAFETY CAR',   cls: 'track-badge--sc'    },
  vsc:      { label: 'VIRTUAL SC',   cls: 'track-badge--vsc'   },
  red_flag: { label: 'RED FLAG',     cls: 'track-badge--red'   },
  yellow:   { label: 'YELLOW FLAG',  cls: 'track-badge--sc'    },
}

export default function SessionHeader({
  session, weather, onRefresh,
  appMode, sessionMode, trackStatus,
  currentLap, totalLaps, onOpenPicker, onExitReplay,
}: Props) {
  const isReplay = appMode === 'replay'
  const badge    = TRACK_BADGE[trackStatus]

  const raceName = session
    ? `${session.location} Grand Prix · ${session.session_name}`
    : 'F1 Live Timing'

  return (
    <header className="session-header">
      {/* Left: logo + flag + race name */}
      <div className="sh-left">
        <img src="/logo.png" alt="F1 Live Timing" className="sh-logo" />
        <span className="sh-flag">{circuitFlag((session as any)?.country_code)}</span>
        <span className="sh-race-name">{raceName}</span>
        {sessionMode === 'results' && !isReplay && (
          <span className="sh-mode-badge sh-mode-results">CLASIFICACIÓN FINAL</span>
        )}
        {isReplay && (
          <span className="sh-mode-badge sh-mode-replay">REPETICIÓN</span>
        )}
      </div>

      {/* Center: weather inline */}
      {weather && (
        <div className="sh-weather">
          <span className="sh-w-item"><b>{Math.round(weather.track_temperature ?? 0)}°</b><em>TRC</em></span>
          <span className="sh-w-item"><b>{Math.round(weather.air_temperature ?? 0)}°</b><em>AIR</em></span>
          <span className="sh-w-item"><b>{Math.round(weather.humidity ?? 0)}%</b><em>HUM</em></span>
          <span className="sh-w-item"><b>{(weather.wind_speed ?? 0).toFixed(1)}</b><em>{degToCompass(weather.wind_direction ?? 0)} m/s</em></span>
          {(weather.rainfall ?? 0) > 0 && (
            <span className="sh-w-item sh-w-rain"><b>{weather.rainfall}mm</b><em>LLUVIA</em></span>
          )}
        </div>
      )}

      {/* Right: controls */}
      <div className="sh-right">
        {/* Replay toggle */}
        {!isReplay ? (
          <button className="sh-btn sh-btn-replay" onClick={onOpenPicker}>
            <History size={12} strokeWidth={2.5} />
            <span>Replay</span>
          </button>
        ) : (
          <button className="sh-btn sh-btn-exit" onClick={onExitReplay}>
            <X size={12} strokeWidth={2.5} />
            <span>Directo</span>
          </button>
        )}

        {/* Lap counter */}
        {currentLap != null && currentLap > 0 && (
          <span className="sh-lap-counter">
            <span className="sh-lap-current">{currentLap}</span>
            {totalLaps ? (
              <span className="sh-lap-total"> / {totalLaps}</span>
            ) : null}
            <span className="sh-lap-label"> LAP</span>
          </span>
        )}

        {/* Live indicator */}
        {sessionMode === 'live' && !isReplay && (
          <span className="sh-live-dot" />
        )}

        {/* Track status badge */}
        <span className={`track-badge ${badge.cls}`}>{badge.label}</span>

        {/* Refresh */}
        {!isReplay && (
          <button className="sh-btn sh-btn-icon" onClick={onRefresh}>
            <RefreshCw size={12} strokeWidth={2.5} />
          </button>
        )}

        {/* GitHub */}
        <a
          className="sh-btn sh-btn-icon"
          href="https://github.com/Luisbloom/F1-Live-Timing"
          target="_blank"
          rel="noopener noreferrer"
          title="Ver en GitHub"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
          </svg>
        </a>
      </div>
    </header>
  )
}

function degToCompass(deg: number): string {
  return ['N','NE','E','SE','S','SO','O','NO'][Math.round(deg / 45) % 8]
}
