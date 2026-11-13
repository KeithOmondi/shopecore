import { useCallback, useEffect, useRef, useState } from 'react'

import { setNavGuard } from './router'

/** Has this value changed since the form first opened? */
export function useDirty(value: unknown): boolean {
  const [initial] = useState(() => JSON.stringify(value))
  return JSON.stringify(value) !== initial
}

/**
 * Warns before someone leaves a form with unsaved changes, whether they click a link, close the tab or refresh.
 * Call the returned function right before you navigate away on purpose (after a successful save).
 */
export function useUnsavedGuard(dirty: boolean): () => void {
  const flags = useRef({ dirty, saved: false })
  useEffect(() => {
    flags.current.dirty = dirty
  })
  useEffect(() => {
    const check = () => flags.current.dirty && !flags.current.saved
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (check()) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    setNavGuard(check)
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      setNavGuard(null)
    }
  }, [])
  return useCallback(() => {
    flags.current.saved = true
  }, [])
}
