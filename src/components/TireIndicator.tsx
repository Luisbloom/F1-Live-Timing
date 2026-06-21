import type { Stint } from '../types/openf1'

const TIRE_CONFIG = {
  SOFT: {
    label: 'S',
    color: '#E8002D',
    glow: 'rgba(232,0,45,0.45)',
    tread: '#C8001D',
    inner: '#1a0004',
  },
  MEDIUM: {
    label: 'M',
    color: '#FFD700',
    glow: 'rgba(255,215,0,0.4)',
    tread: '#CCA800',
    inner: '#1a1400',
  },
  HARD: {
    label: 'H',
    color: '#DEDEDE',
    glow: 'rgba(255,255,255,0.25)',
    tread: '#AAAAAA',
    inner: '#1a1a1a',
  },
  INTERMEDIATE: {
    label: 'I',
    color: '#39B54A',
    glow: 'rgba(57,181,74,0.4)',
    tread: '#2A8A38',
    inner: '#011a04',
  },
  WET: {
    label: 'W',
    color: '#0067FF',
    glow: 'rgba(0,103,255,0.4)',
    tread: '#004FCC',
    inner: '#00051a',
  },
} as const

interface Props {
  stint: Stint | null
  size?: number
}

export default function TireIndicator({ stint, size = 28 }: Props) {
  const compound = stint?.compound ?? null
  const cfg = compound ? TIRE_CONFIG[compound] : null
  const age = stint
    ? stint.tyre_age_at_start + (stint.lap_end != null ? stint.lap_end - stint.lap_start : 0)
    : null

  return (
    <div className="tire-wrap">
      <TireSvg cfg={cfg} size={size} />
      <span className="tire-age">{age ?? '--'}</span>
    </div>
  )
}

interface SvgProps {
  cfg: typeof TIRE_CONFIG[keyof typeof TIRE_CONFIG] | null
  size: number
}

function TireSvg({ cfg, size }: SvgProps) {
  const r = size / 2
  const outerR = r - 1
  const tireW = r * 0.28        // outer rubber ring width
  const innerR = outerR - tireW // inner rim radius
  const treadsCount = 12
  const color = cfg?.color ?? '#555555'
  const tread = cfg?.tread ?? '#333333'
  const inner = cfg?.inner ?? '#111111'
  const glow  = cfg?.glow ?? 'none'
  const label = cfg?.label ?? '?'

  // Tread bumps around the outer ring
  const treads = Array.from({ length: treadsCount }, (_, i) => {
    const angle = (i / treadsCount) * Math.PI * 2 - Math.PI / 2
    const midR = outerR - tireW / 2
    const bumpW = (2 * Math.PI * midR / treadsCount) * 0.55
    const bumpH = tireW * 0.38
    return { angle, midR, bumpW, bumpH }
  })

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ filter: cfg ? `drop-shadow(0 0 4px ${glow})` : 'none', flexShrink: 0 }}
    >
      {/* Outer tire ring */}
      <circle cx={r} cy={r} r={outerR} fill={color} />

      {/* Tread blocks */}
      <g>
        {treads.map(({ angle, midR, bumpW, bumpH }, i) => {
          const x = r + Math.cos(angle) * midR
          const y = r + Math.sin(angle) * midR
          return (
            <rect
              key={i}
              x={x - bumpW / 2}
              y={y - bumpH / 2}
              width={bumpW}
              height={bumpH}
              rx={bumpH * 0.3}
              fill={tread}
              transform={`rotate(${(angle * 180) / Math.PI + 90}, ${x}, ${y})`}
            />
          )
        })}
      </g>

      {/* Sidewall grooves (thin rings) */}
      <circle cx={r} cy={r} r={outerR - tireW * 0.18} fill="none" stroke={tread} strokeWidth={0.6} />
      <circle cx={r} cy={r} r={outerR - tireW * 0.55} fill="none" stroke={tread} strokeWidth={0.4} />

      {/* Rim */}
      <circle cx={r} cy={r} r={innerR} fill={inner} />

      {/* Rim spokes */}
      {[0, 60, 120, 180, 240, 300].map(deg => {
        const rad = (deg * Math.PI) / 180
        const x1 = r + Math.cos(rad) * (innerR * 0.35)
        const y1 = r + Math.sin(rad) * (innerR * 0.35)
        const x2 = r + Math.cos(rad) * (innerR * 0.82)
        const y2 = r + Math.sin(rad) * (innerR * 0.82)
        return (
          <line
            key={deg}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={color}
            strokeWidth={innerR * 0.13}
            strokeLinecap="round"
            opacity={0.7}
          />
        )
      })}

      {/* Center hub */}
      <circle cx={r} cy={r} r={innerR * 0.32} fill={color} opacity={0.9} />

      {/* Compound letter */}
      <text
        x={r}
        y={r}
        textAnchor="middle"
        dominantBaseline="central"
        fill={inner}
        fontSize={size * 0.3}
        fontFamily="'Formula1Black', sans-serif"
        fontWeight="900"
      >
        {label}
      </text>
    </svg>
  )
}
