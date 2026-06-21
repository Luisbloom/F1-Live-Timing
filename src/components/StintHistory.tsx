import type { StintInfo } from '../hooks/useTimingData'

const TIRE_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  SOFT:         { bg: 'rgba(232,0,45,0.2)',   color: '#E8002D', border: '#E8002D' },
  MEDIUM:       { bg: 'rgba(255,215,0,0.18)', color: '#FFD700', border: '#FFD700' },
  HARD:         { bg: 'rgba(255,255,255,0.1)',color: '#DEDEDE', border: '#AAAAAA' },
  INTERMEDIATE: { bg: 'rgba(57,181,74,0.18)', color: '#39B54A', border: '#39B54A' },
  WET:          { bg: 'rgba(0,103,255,0.18)', color: '#4488FF', border: '#0067FF' },
}

const TIRE_LETTER: Record<string, string> = {
  SOFT: 'S', MEDIUM: 'M', HARD: 'H', INTERMEDIATE: 'I', WET: 'W',
}

interface Props {
  history: StintInfo[]
}

export default function StintHistory({ history }: Props) {
  if (!history.length) return <span className="stint-empty">--</span>

  return (
    <div className="stint-history">
      {history.map((stint) => {
        const cfg    = TIRE_COLORS[stint.compound] ?? TIRE_COLORS.HARD
        const letter = TIRE_LETTER[stint.compound] ?? '?'
        const laps   = stint.lapEnd != null
          ? stint.lapEnd - stint.lapStart + 1
          : null

        return (
          <div
            key={`${stint.compound}-${stint.lapStart}`}
            className={`stint-pill ${!stint.isNew ? 'stint-pill--used' : ''}`}
            style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}
            title={`${stint.compound} · ${laps != null ? laps + ' vueltas' : 'actual'} · edad inicio: ${stint.age}`}
          >
            <span className="stint-letter">{letter}</span>
            {laps != null && <span className="stint-laps">{laps}</span>}
            {!stint.isNew && <span className="stint-used-dot" style={{ background: cfg.color }} />}
          </div>
        )
      })}
    </div>
  )
}
