import { useState } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'

export interface ColumnConfig {
  interval:     boolean
  leader:       boolean
  miniSectors:  boolean
  lastSectors:  boolean
  bestSectors:  boolean
  bestLap:      boolean
  potential:    boolean
  stintHistory: boolean
  pitCount:     boolean
  lapCount:     boolean
  speedI1:      boolean
  speedI2:      boolean
  speedST:      boolean
  posChange:    boolean
}

export const DEFAULT_COLUMNS: ColumnConfig = {
  interval:     true,
  leader:       true,
  miniSectors:  true,
  lastSectors:  true,
  bestSectors:  true,
  bestLap:      true,
  potential:    false,
  stintHistory: false,
  pitCount:     true,
  lapCount:     false,
  speedI1:      false,
  speedI2:      false,
  speedST:      false,
  posChange:    false,
}

interface Opt { key: keyof ColumnConfig; label: string; desc?: string }

const GROUPS: { title: string; options: Opt[] }[] = [
  {
    title: 'Gaps',
    options: [
      { key: 'interval',    label: 'Intervalo',          desc: 'Tiempo respecto al coche delante' },
      { key: 'leader',      label: 'Gap al líder',       desc: 'Tiempo respecto al P1' },
    ],
  },
  {
    title: 'Tiempos',
    options: [
      { key: 'bestLap',     label: 'Mejor vuelta',       desc: 'Mejor vuelta personal en sesión' },
      { key: 'potential',   label: 'Potencial',          desc: 'Teórico: suma de mejores S1+S2+S3' },
      { key: 'miniSectors', label: 'Mini-sectores',      desc: 'Barras visuales por sector' },
      { key: 'lastSectors', label: 'Últ. sectores',      desc: 'S1 S2 S3 de la última vuelta' },
      { key: 'bestSectors', label: 'Mejor. sectores',    desc: 'Mejor S1 S2 S3 personal (púrpura = récord)' },
    ],
  },
  {
    title: 'Estrategia',
    options: [
      { key: 'stintHistory', label: 'Historial stints', desc: 'Todos los compuestos usados' },
      { key: 'pitCount',     label: 'Paradas',          desc: 'Número de pit stops' },
      { key: 'lapCount',     label: 'Vueltas',          desc: 'Vueltas completadas' },
    ],
  },
  {
    title: 'Velocidades',
    options: [
      { key: 'speedI1', label: 'Vel. I1',    desc: 'Speed trap zona 1' },
      { key: 'speedI2', label: 'Vel. I2',    desc: 'Speed trap zona 2' },
      { key: 'speedST', label: 'Speed Trap', desc: 'Speed trap final' },
    ],
  },
  {
    title: 'Visualización',
    options: [
      { key: 'posChange', label: 'Cambio posición', desc: 'Flechas ↑↓ posiciones ganadas/perdidas' },
    ],
  },
]

interface Props {
  config:   ColumnConfig
  onChange: (c: ColumnConfig) => void
}

export default function ColumnToggle({ config, onChange }: Props) {
  const [open, setOpen] = useState(false)

  const toggle = (key: keyof ColumnConfig) =>
    onChange({ ...config, [key]: !config[key] })

  const reset = () => onChange(DEFAULT_COLUMNS)

  const activeCount = (Object.values(config) as boolean[]).filter(Boolean).length

  return (
    <div className="col-toggle-wrap">
      <button
        className={`col-toggle-btn ${open ? 'col-toggle-btn--active' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        <SlidersHorizontal size={12} strokeWidth={2.5} />
        <span>Columnas</span>
        <span className="col-toggle-count">{activeCount}</span>
      </button>

      {open && (
        <>
          <div className="col-toggle-backdrop" onClick={() => setOpen(false)} />
          <div className="col-toggle-panel">
            <div className="ctp-header">
              <span className="ctp-title">Configurar columnas</span>
              <div className="ctp-header-actions">
                <button className="ctp-reset" onClick={reset}>Restablecer</button>
                <button className="ctp-close" onClick={() => setOpen(false)}>
                  <X size={13} strokeWidth={2.5} />
                </button>
              </div>
            </div>
            <div className="ctp-body">
              {GROUPS.map(g => (
                <div key={g.title} className="ctp-group">
                  <div className="ctp-group-title">{g.title}</div>
                  {g.options.map(opt => (
                    <label key={opt.key} className="ctp-item">
                      <input type="checkbox" checked={!!config[opt.key]} onChange={() => toggle(opt.key)} />
                      <span className="ctp-checkbox" />
                      <div className="ctp-item-text">
                        <span className="ctp-item-label">{opt.label}</span>
                        {opt.desc && <span className="ctp-item-desc">{opt.desc}</span>}
                      </div>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
