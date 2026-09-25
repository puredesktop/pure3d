import { useCallback, useSyncExternalStore } from 'react'
import type { SceneAffected, SceneStore, WorkspaceState } from '../lib/SceneStore'

/** Reads canonical state while waking only for keys rendered by the surface. */
export function useSceneState(
  store: SceneStore,
  affected: readonly SceneAffected[],
): WorkspaceState {
  const subscribe = useCallback(
    (notify: () => void) => store.subscribeAffected(affected, notify),
    [store, affected],
  )
  return useSyncExternalStore(subscribe, store.getSnapshot)
}
