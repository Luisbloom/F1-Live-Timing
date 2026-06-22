const TEAM_LOGOS: Record<string, string> = {
  'Red Bull Racing':    '/teams/red-bull-racing.svg',
  'Ferrari':            '/teams/ferrari.svg',
  'Mercedes':           '/teams/mercedes.svg',
  'McLaren':            '/teams/mclaren.svg',
  'Aston Martin':       '/teams/aston-martin.svg',
  'Alpine':             '/teams/alpine.svg',
  'Williams':           '/teams/williams.svg',
  'Racing Bulls':       '/teams/racing-bulls.svg',
  'Visa Cash App RB':   '/teams/racing-bulls.svg',
  'RB':                 '/teams/racing-bulls.svg',
  'Haas F1 Team':       '/teams/haas-f1-team.svg',
  'Haas':               '/teams/haas-f1-team.svg',
  'Cadillac':           '/teams/cadillac.svg',
  'Audi':               '/teams/audi.svg',
  'Kick Sauber':        '/teams/audi.svg',
  'Sauber':             '/teams/audi.svg',
}

export function getTeamLogo(teamName: string): string | null {
  if (!teamName) return null
  if (TEAM_LOGOS[teamName]) return TEAM_LOGOS[teamName]
  const key = Object.keys(TEAM_LOGOS).find(k =>
    teamName.toLowerCase().includes(k.toLowerCase()) ||
    k.toLowerCase().includes(teamName.toLowerCase())
  )
  return key ? TEAM_LOGOS[key] : null
}

const TEAM_COLORS: Record<string, string> = {
  'Red Bull Racing':  '#3671C6',
  'Ferrari':          '#E8002D',
  'Mercedes':         '#27F4D2',
  'McLaren':          '#FF8000',
  'Aston Martin':     '#229971',
  'Alpine':           '#FF87BC',
  'Williams':         '#64C4FF',
  // Racing Bulls (ex Alpha Tauri / VCARB) — deep blue
  'RB':               '#5F8FFF',
  'Visa Cash App RB': '#5F8FFF',
  'Racing Bulls':     '#5F8FFF',
  // Haas — silver/gray
  'Haas F1 Team':     '#B6BABD',
  'Haas':             '#B6BABD',
  // Audi (ex Kick Sauber) — brand red
  'Audi':             '#BB0A1E',
  'Kick Sauber':      '#52E252',
  'Sauber':           '#52E252',
  // Cadillac (new 2026) — American racing gold
  'Cadillac':         '#C9A227',
}

export function getTeamColor(teamName: string): string | null {
  if (!teamName) return null
  if (TEAM_COLORS[teamName]) return TEAM_COLORS[teamName]
  const key = Object.keys(TEAM_COLORS).find(k =>
    teamName.toLowerCase().includes(k.toLowerCase()) ||
    k.toLowerCase().includes(teamName.toLowerCase())
  )
  return key ? TEAM_COLORS[key] : null
}

export function hexToRgba(hex: string, alpha: number, fallback = 'rgba(255,255,255,0)'): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  if (isNaN(r) || isNaN(g) || isNaN(b)) return fallback
  return `rgba(${r},${g},${b},${alpha})`
}
