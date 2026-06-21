const BASE = 'https://api.openf1.org/v1'

// ── True serial request queue ─────────────────────────────────
// Only one HTTP request in flight at a time, with MIN_DELAY between them.
const MIN_DELAY = 700 // ms between consecutive requests

interface QueueItem { run: () => Promise<void> }
const queue: QueueItem[] = []
let draining = false

async function drain() {
  if (draining) return
  draining = true
  while (queue.length > 0) {
    const item = queue.shift()!
    await item.run()
    if (queue.length > 0) await sleep(MIN_DELAY)
  }
  draining = false
}

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({
      run: async () => {
        try { resolve(await fn()) }
        catch (e) { reject(e) }
      },
    })
    drain()
  })
}

// ── Core fetch ────────────────────────────────────────────────

async function doFetch<T>(
  endpoint: string,
  params: Record<string, string | number> = {},
  rawFilters: string[] = [],
): Promise<T> {
  // Build URL manually so rawFilters (e.g. 'date>2024-01-01') are NOT url-encoded
  const qs = [
    ...Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`),
    ...rawFilters,
  ].join('&')
  const url = `${BASE}/${endpoint}?${qs}`

  const res = await fetch(url)

  if (res.status === 429) {
    const after = res.headers.get('Retry-After')
    const wait  = after ? parseInt(after) * 1000 : 20_000
    await sleep(wait)
    throw new Error(`Rate limited — waited ${Math.round(wait / 1000)}s`)
  }

  // 404 = no data for this query → return empty array silently
  if (res.status === 404) return [] as unknown as T

  if (!res.ok) throw new Error(`OpenF1 ${res.status}: ${endpoint}`)
  return res.json()
}

function get<T>(
  endpoint: string,
  params: Record<string, string | number> = {},
  rawFilters: string[] = [],
): Promise<T> {
  return enqueue(() => doFetch<T>(endpoint, params, rawFilters))
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

// ── Public API ────────────────────────────────────────────────

export const openf1 = {
  getLatestSession: () =>
    get<any[]>('sessions', { session_key: 'latest' }).then(d => d[0]),

  getDrivers:     (key: number) => get<any[]>('drivers',       { session_key: key }),
  getPositions:   (key: number) => get<any[]>('position',      { session_key: key }),
  getLaps:        (key: number) => get<any[]>('laps',          { session_key: key }),
  getStints:      (key: number) => get<any[]>('stints',        { session_key: key }),
  getRaceControl: (key: number) => get<any[]>('race_control',  { session_key: key }),
  getWeather:     (key: number) => get<any[]>('weather',       { session_key: key }),
  getSessions:    (year: number) => get<any[]>('sessions',     { year }),
  getMeetings:    (year: number) => get<any[]>('meetings',     { year }),

  // Location with optional date window + optional single driver filter
  getLocation: (key: number, dateGte: string, dateLte?: string, driverNumber?: number) =>
    get<any[]>(
      'location',
      { session_key: key, ...(driverNumber ? { driver_number: driverNumber } : {}) },
      [
        `date>${dateGte}`,
        ...(dateLte ? [`date<${dateLte}`] : []),
      ],
    ),

  getCarData: (key: number, driverNum: number, dateGte: string, dateLte?: string) =>
    get<any[]>('car_data', { session_key: key, driver_number: driverNum }, [
      `date>${dateGte}`,
      ...(dateLte ? [`date<${dateLte}`] : []),
    ]),
}
