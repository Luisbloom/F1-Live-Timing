import { useState, useEffect } from 'react'
import { X, ChevronRight, Trophy, Timer, Zap, BarChart2, Loader } from 'lucide-react'
import { openf1 } from '../services/openf1'
import type { Session, Meeting } from '../types/openf1'

interface Props {
  onSelect: (session: Session) => void
  onClose: () => void
}

const YEARS = [2026, 2025, 2024, 2023]

const SESSION_TYPE_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  Race:               { icon: <Trophy   size={11} strokeWidth={2.5} />, label: 'Carrera',   color: '#E8002D' },
  Qualifying:         { icon: <Timer    size={11} strokeWidth={2.5} />, label: 'Clasificación', color: '#FFD700' },
  Sprint:             { icon: <Zap      size={11} strokeWidth={2.5} />, label: 'Sprint',     color: '#FF8C00' },
  'Sprint Qualifying':{ icon: <Zap      size={11} strokeWidth={2.5} />, label: 'Sprint Q',  color: '#FFA500' },
  'Sprint Shootout':  { icon: <Zap      size={11} strokeWidth={2.5} />, label: 'Sprint Q',  color: '#FFA500' },
  Practice:           { icon: <BarChart2 size={11} strokeWidth={2.5}/>, label: 'Práctica',  color: '#64C4FF' },
}

function sessionCfg(name: string) {
  return SESSION_TYPE_CONFIG[name] ?? { icon: <Timer size={11} />, label: name, color: '#888' }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  } catch { return '' }
}

// Group sessions by meeting_key
function groupByMeeting(meetings: Meeting[], sessions: Session[]) {
  const sessMap: Record<number, Session[]> = {}
  sessions.forEach(s => {
    if (!sessMap[s.meeting_key]) sessMap[s.meeting_key] = []
    sessMap[s.meeting_key].push(s)
  })
  return meetings
    .filter(m => sessMap[m.meeting_key]?.length)
    .map(m => ({ meeting: m, sessions: sessMap[m.meeting_key].sort((a, b) => a.date_start.localeCompare(b.date_start)) }))
    .sort((a, b) => a.meeting.date_start.localeCompare(b.meeting.date_start))
    .reverse()  // newest first
}

export default function SessionPicker({ onSelect, onClose }: Props) {
  const [year, setYear]               = useState(2025)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [grouped, setGrouped]         = useState<ReturnType<typeof groupByMeeting>>([])
  const [expanded, setExpanded]       = useState<number | null>(null)  // expanded meeting_key

  useEffect(() => {
    setLoading(true)
    setError(null)
    setGrouped([])
    setExpanded(null)

    Promise.all([openf1.getMeetings(year), openf1.getSessions(year)])
      .then(([meetings, sessions]) => {
        setGrouped(groupByMeeting(meetings as Meeting[], sessions as Session[]))
        setLoading(false)
      })
      .catch(e => {
        setError(e instanceof Error ? e.message : 'Error cargando sesiones')
        setLoading(false)
      })
  }, [year])

  return (
    <div className="picker-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="picker-panel">
        {/* Header */}
        <div className="picker-header">
          <div className="picker-header__left">
            <span className="picker-title">REPETICIONES</span>
            <span className="picker-subtitle">Selecciona una sesión para reproducir</span>
          </div>
          <button className="picker-close" onClick={onClose}><X size={16} strokeWidth={2.5} /></button>
        </div>

        {/* Year tabs */}
        <div className="picker-years">
          {YEARS.map(y => (
            <button
              key={y}
              className={`picker-year-tab ${year === y ? 'picker-year-tab--active' : ''}`}
              onClick={() => setYear(y)}
            >
              {y}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="picker-body">
          {loading && (
            <div className="picker-loading">
              <Loader size={20} strokeWidth={2} className="picker-spinner" />
              <span>Cargando calendario {year}...</span>
            </div>
          )}

          {error && <div className="picker-error">{error}</div>}

          {!loading && !error && grouped.map(({ meeting, sessions }) => (
            <div key={meeting.meeting_key} className="picker-gp">
              <button
                className={`picker-gp-header ${expanded === meeting.meeting_key ? 'picker-gp-header--open' : ''}`}
                onClick={() => setExpanded(e => e === meeting.meeting_key ? null : meeting.meeting_key)}
              >
                <div className="picker-gp-info">
                  <span className="picker-gp-flag">{countryToFlag(meeting.country_code)}</span>
                  <div className="picker-gp-names">
                    <span className="picker-gp-name">{meeting.meeting_name}</span>
                    <span className="picker-gp-circuit">{meeting.circuit_short_name} · {formatDate(meeting.date_start)}</span>
                  </div>
                </div>
                <div className="picker-gp-right">
                  <div className="picker-gp-types">
                    {sessions.map(s => {
                      const cfg = sessionCfg(s.session_name)
                      return (
                        <span key={s.session_key} className="picker-session-dot" style={{ color: cfg.color }} title={cfg.label}>
                          {cfg.icon}
                        </span>
                      )
                    })}
                  </div>
                  <ChevronRight
                    size={14}
                    strokeWidth={2}
                    className={`picker-chevron ${expanded === meeting.meeting_key ? 'picker-chevron--open' : ''}`}
                  />
                </div>
              </button>

              {expanded === meeting.meeting_key && (
                <div className="picker-sessions">
                  {sessions.map(s => {
                    const cfg = sessionCfg(s.session_name)
                    return (
                      <button
                        key={s.session_key}
                        className="picker-session-item"
                        onClick={() => onSelect(s)}
                      >
                        <span className="picker-session-icon" style={{ color: cfg.color }}>{cfg.icon}</span>
                        <span className="picker-session-name">{cfg.label}</span>
                        <span className="picker-session-date">{formatDate(s.date_start)}</span>
                        <span className="picker-session-status">{s.status === 'Finished' ? '✓' : s.status}</span>
                        <ChevronRight size={12} strokeWidth={2} className="picker-session-arrow" />
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ))}

          {!loading && !error && grouped.length === 0 && (
            <div className="picker-empty">No hay datos disponibles para {year}</div>
          )}
        </div>
      </div>
    </div>
  )
}

// Simple country code → flag emoji converter
function countryToFlag(code: string): string {
  if (!code || code.length !== 3) return '🏁'
  // Map 3-letter → 2-letter for flag emoji
  const map: Record<string, string> = {
    AUS: 'AU', CHN: 'CN', JPN: 'JP', BHR: 'BH', SAU: 'SA', MIA: 'US', USA: 'US',
    ITA: 'IT', MCO: 'MC', ESP: 'ES', CAN: 'CA', AUT: 'AT', GBR: 'GB', HUN: 'HU',
    BEL: 'BE', NED: 'NL', AZE: 'AZ', SGP: 'SG', MEX: 'MX', BRA: 'BR', LVG: 'US',
    ABU: 'AE', UAE: 'AE', QAT: 'QA',
  }
  const two = map[code.toUpperCase()]
  if (!two) return '🏁'
  return two.split('').map(c => String.fromCodePoint(0x1F1E0 + c.charCodeAt(0) - 65)).join('')
}
