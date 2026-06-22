import { X, BarChart2 } from 'lucide-react'
import { useCarTelemetry, isDrsOpen } from '../hooks/useCarTelemetry'
import type { DriverTiming } from '../hooks/useTimingData'
import { getTeamColor } from '../utils/teamColors'

interface Props {
  driverNum:    number
  sessionKey:   number
  sessionYear?: number        // hide DRS UI for 2026+ (DRS abolished)
  isLive:       boolean
  virtualTime?: number | null
  onClose:      () => void
  onOpenDetail?: () => void
  drivers:      DriverTiming[]
}

export default function TelemetryPanel({
  driverNum, sessionKey, sessionYear, isLive, virtualTime, onClose, onOpenDetail, drivers,
}: Props) {
  // DRS was abolished for the 2026 season — hide all DRS indicators
  const showDRS = !sessionYear || sessionYear < 2026
  const telemetry = useCarTelemetry(sessionKey, driverNum, isLive, virtualTime)

  const driverTiming = drivers.find(d => d.driver.driver_number === driverNum)
  const driver       = driverTiming?.driver

  const teamColor = driver
    ? (driver.team_colour ? `#${driver.team_colour}` : (getTeamColor(driver.team_name) ?? '#888'))
    : '#888'

  const acronym = driver?.name_acronym ?? String(driverNum)

  const speed    = telemetry?.speed    ?? null
  const rpm      = telemetry?.rpm      ?? null
  const gear     = telemetry?.gear     ?? null
  const throttle = telemetry?.throttle ?? null
  const brake    = telemetry?.brake    ?? null
  const drs      = telemetry?.drs      ?? null

  const drsOpen = drs !== null && isDrsOpen(drs)
  const hasData = telemetry !== null

  return (
    <div className="telemetry-panel">
      {/* Driver badge */}
      <div className="telem-driver">
        <span
          className="telem-driver-badge"
          style={{ background: teamColor }}
        >
          {acronym}
        </span>
      </div>

      {/* Speed */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, minWidth: 90, justifyContent: 'flex-end' }}>
        <span className="telem-speed" style={{ opacity: hasData ? 1 : 0.3 }}>
          {speed !== null ? String(speed).padStart(3, ' ') : ' -- '}
        </span>
        <span className="telem-speed-unit">km/h</span>
      </div>

      {/* Gear */}
      <div className="telem-gear" style={{ opacity: hasData ? 1 : 0.3, borderColor: hasData ? teamColor : undefined }}>
        {gear !== null ? (gear === 0 ? 'N' : gear) : '-'}
      </div>

      {/* RPM bar */}
      <div className="telem-bar-wrap" style={{ minWidth: 100 }}>
        <span className="telem-bar-label">RPM</span>
        <div className="telem-bar-track">
          <div
            className="telem-bar-fill"
            style={{
              width: `${rpm !== null ? Math.min(100, (rpm / 15000) * 100) : 0}%`,
              background: '#00BCD4',
              opacity: hasData ? 1 : 0.3,
            }}
          />
        </div>
        <span style={{ fontSize: 7, color: 'var(--text-dimmer)', fontFamily: 'var(--font-num)' }}>
          {rpm !== null ? rpm.toLocaleString() : '--'}
        </span>
      </div>

      {/* Throttle bar */}
      <div className="telem-bar-wrap" style={{ minWidth: 80 }}>
        <span className="telem-bar-label">Throttle</span>
        <div className="telem-bar-track">
          <div
            className="telem-bar-fill"
            style={{
              width: `${throttle !== null ? Math.min(100, throttle) : 0}%`,
              background: '#22c55e',
              opacity: hasData ? 1 : 0.3,
            }}
          />
        </div>
        <span style={{ fontSize: 7, color: 'var(--text-dimmer)', fontFamily: 'var(--font-num)' }}>
          {throttle !== null ? `${throttle}%` : '--'}
        </span>
      </div>

      {/* Brake indicator */}
      <div className="telem-bar-wrap" style={{ minWidth: 60 }}>
        <span className="telem-bar-label">Brake</span>
        <div className="telem-bar-track">
          <div
            className="telem-bar-fill"
            style={{
              width: `${brake !== null && brake > 0 ? 100 : 0}%`,
              background: '#E8002D',
              opacity: hasData ? 1 : 0.3,
            }}
          />
        </div>
      </div>

      {/* DRS pill — only for pre-2026 sessions */}
      {showDRS && (
        <span className={`telem-drs ${drsOpen ? 'telem-drs--open' : 'telem-drs--closed'}`} style={{ opacity: hasData ? 1 : 0.3 }}>
          {drsOpen ? 'DRS OPEN' : 'DRS CLOSED'}
        </span>
      )}

      {/* Open detail panel */}
      {onOpenDetail && (
        <button
          className="telem-close"
          onClick={onOpenDetail}
          title="Ver detalles del piloto"
          style={{ color: 'var(--text-dim)' }}
        >
          <BarChart2 size={14} />
        </button>
      )}

      {/* Close */}
      <button className="telem-close" onClick={onClose} aria-label="Cerrar telemetría">
        <X size={14} />
      </button>
    </div>
  )
}
