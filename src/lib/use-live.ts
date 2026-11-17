import { useCallback, useEffect, useState } from 'react'

import { get } from './api'

/**
 * Like useGet, but the answer arrives the moment something changes instead of on a timer.
 * Each request carries the version of what we already have and waits on the server (up to 8 seconds) for news.
 * The next request goes out straight away, so the screen is always one reply behind real life at most.
 * If the server cannot be reached it tries again every few seconds.
 */
export function useLive<T extends { version?: string }>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [failed, setFailed] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    setData(null)
    setFailed(false)
  }, [path])

  useEffect(() => {
    if (!path) return
    let live = true
    let version: string | undefined
    const sep = path.includes('?') ? '&' : '?'
    const loop = async () => {
      while (live) {
        try {
          const d = await get<T>(version ? `${path}${sep}v=${encodeURIComponent(version)}&wait=8` : path)
          if (!live) return
          version = d.version
          setData(d)
          setFailed(false)
        } catch {
          if (!live) return
          setFailed(true)
          await new Promise((r) => setTimeout(r, 3000))
        }
      }
    }
    void loop()
    return () => { live = false }
  }, [path, tick])

  return { data, failed, loading: !!path && !data && !failed, reload: useCallback(() => setTick((n) => n + 1), []) }
}
