import { useState, useEffect, useRef } from 'react'

// Generic polling hook — fetches data every `interval` ms
export function usePolling<T>(
  fetcher: () => Promise<T>,
  interval = 3000,
  enabled = true
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!enabled) return

    const fetch = async () => {
      try {
        const result = await fetcher()
        setData(result)
        setError(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error fetching data')
      } finally {
        setLoading(false)
      }
    }

    fetch()
    timerRef.current = setInterval(fetch, interval)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [interval, enabled])

  return { data, loading, error }
}
