import { AlertTriangle, CheckCircle, XCircle, Info, Flag, Circle } from 'lucide-react'
import type { RaceControlMessage } from '../types/openf1'
import { formatTime } from '../utils/format'

interface Props {
  messages: RaceControlMessage[]
}

interface FlagCfg {
  color: string
  borderColor: string
  icon: React.ReactNode
}

function getFlagCfg(flag: string | null): FlagCfg | null {
  if (!flag) return null
  switch (flag) {
    case 'GREEN':
      return { color: '#00FF88', borderColor: '#00FF88', icon: <CheckCircle size={12} strokeWidth={2.5} /> }
    case 'YELLOW':
      return { color: '#FFD700', borderColor: '#FFD700', icon: <AlertTriangle size={12} strokeWidth={2.5} /> }
    case 'DOUBLE_YELLOW':
      return { color: '#FFD700', borderColor: '#FFD700', icon: <AlertTriangle size={12} strokeWidth={2.5} /> }
    case 'RED':
      return { color: '#E8002D', borderColor: '#E8002D', icon: <XCircle size={12} strokeWidth={2.5} /> }
    case 'BLUE':
      return { color: '#4FC3F7', borderColor: '#4FC3F7', icon: <Info size={12} strokeWidth={2.5} /> }
    case 'CHEQUERED':
      return { color: '#FFFFFF', borderColor: '#FFFFFF', icon: <Flag size={12} strokeWidth={2.5} /> }
    case 'CLEAR':
      return { color: '#00FF88', borderColor: '#00FF88', icon: <CheckCircle size={12} strokeWidth={2.5} /> }
    default:
      return { color: 'var(--text-dim)', borderColor: 'var(--border)', icon: <Circle size={12} strokeWidth={2.5} /> }
  }
}

function getCategoryIcon(category: string) {
  switch (category.toLowerCase()) {
    case 'flag':        return <Flag size={10} strokeWidth={2} />
    case 'safetyCar':
    case 'safetycar':  return <AlertTriangle size={10} strokeWidth={2} />
    case 'drs':        return <Info size={10} strokeWidth={2} />
    default:           return <Circle size={10} strokeWidth={2} />
  }
}

export default function RaceControl({ messages }: Props) {
  if (!messages.length) return null

  return (
    <div className="race-control">
      <div className="race-control__header">
        <div className="rc-label-wrap">
          <Flag size={11} strokeWidth={2.5} />
          <span className="rc-label">RACE CONTROL</span>
        </div>
        <span className="rc-count">{messages.length} mensajes</span>
      </div>

      <div className="race-control__list">
        {messages.map((msg) => {
          const flagCfg = getFlagCfg(msg.flag)
          const key = `${msg.date}-${msg.category}-${msg.message.slice(0,20)}`
          return (
            <div
              key={key}
              className="rc-message"
              style={flagCfg ? { borderLeft: `3px solid ${flagCfg.borderColor}` } : undefined}
            >
              <div className="rc-message__meta">
                {flagCfg && (
                  <span className="rc-flag-icon" style={{ color: flagCfg.color }}>
                    {flagCfg.icon}
                  </span>
                )}
                <span className="rc-time">{formatTime(msg.date)}</span>
                {msg.lap_number && (
                  <span className="rc-lap">VTA {msg.lap_number}</span>
                )}
                <span className="rc-category">
                  {getCategoryIcon(msg.category)}
                  {msg.category}
                </span>
              </div>
              <div className="rc-message__text">{msg.message}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
