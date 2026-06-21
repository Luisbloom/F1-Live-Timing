import { RefreshCw, History, X } from 'lucide-react'
import type { Session, Weather } from '../types/openf1'
import type { SessionMode, TrackStatus } from '../hooks/useTimingData'

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

function countryFlag(code: string | undefined): string {
  if (!code || code.length !== 3) return '🏁'
  const map: Record<string, string> = {
    AUS:'AU', CHN:'CN', JPN:'JP', BHR:'BH', SAU:'SA', MIA:'US', USA:'US',
    ITA:'IT', MCO:'MC', ESP:'ES', CAN:'CA', AUT:'AT', GBR:'GB', HUN:'HU',
    BEL:'BE', NED:'NL', AZE:'AZ', SGP:'SG', MEX:'MX', BRA:'BR', ABU:'AE',
    UAE:'AE', QAT:'QA', CHI:'CN',
  }
  const two = map[code.toUpperCase()]
  if (!two) return '🏁'
  return two.split('').map(c => String.fromCodePoint(0x1F1E0 + c.charCodeAt(0) - 65)).join('')
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
      {/* Left: flag + race name */}
      <div className="sh-left">
        <span className="sh-flag">{countryFlag((session as any)?.country_code)}</span>
        <span className="sh-race-name">{raceName}</span>
        <span className="sh-race-icon">🏁</span>
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
          <span className="sh-w-item"><b>{Math.round(weather.track_temperature)}°</b><em>TRC</em></span>
          <span className="sh-w-item"><b>{Math.round(weather.air_temperature)}°</b><em>AIR</em></span>
          <span className="sh-w-item"><b>{Math.round(weather.humidity)}%</b><em>HUM</em></span>
          <span className="sh-w-item"><b>{weather.wind_speed.toFixed(1)}</b><em>{degToCompass(weather.wind_direction)} m/s</em></span>
          {weather.rainfall > 0 && (
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
      </div>
    </header>
  )
}

function degToCompass(deg: number): string {
  return ['N','NE','E','SE','S','SO','O','NO'][Math.round(deg / 45) % 8]
}
