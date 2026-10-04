import { useEffect, useState } from 'react'
import { SceneStore } from '../lib/SceneStore'
import { starterScene } from '../lib/scene'

export function useAppBoot(ready: boolean) {
  const [store, setStore] = useState<SceneStore | null>(null)
  const [error, setError] = useState<Error | null>(null)
  useEffect(() => {
    if (!ready) return
    try {
      setStore(new SceneStore(starterScene()))
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    }
  }, [ready])
  return { store, error }
}
