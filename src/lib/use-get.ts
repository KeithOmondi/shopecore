import { useCallback, useEffect, useState } from 'react'

import { get } from './api'

/** Loads one thing from the server (again every `everyMs`, if given). `reload` fetches it now; a failed refresh keeps the last good copy. */
export function useGet<T>(path: string | null, everyMs?: number) {
  const [data, setData] = useState<T | null>(null)
  const [failed, setFailed] = useState(false)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!path) return
    let live = true
    const run = () => void get<T>(path).then((d) => { if (live) { setData(d); setFailed(false) } }, () => { if (live) setFailed(true) })
    run()
    const t = everyMs ? setInterval(run, everyMs) : undefined
    return () => { live = false; if (t) clearInterval(t) }
  }, [path, tick, everyMs])
  return { data, failed, loading: !!path && !data && !failed, reload: useCallback(() => setTick((n) => n + 1), []) }
}
