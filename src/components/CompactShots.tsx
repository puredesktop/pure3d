import { useMemo, useState, useSyncExternalStore } from 'react'
import { useSceneState } from '../hooks/useSceneState'
import type { SceneStore } from '../lib/SceneStore'
import { sceneShots, VIEWS } from '../lib/shotList'
import type { ViewportAPI } from './SceneViewport'

const STATE = ['scene'] as const

/** The strip under a held scene: its shots and the angles any scene has. Choosing one moves only this copy's view. */
export function CompactShots({ store, viewport }: { store: SceneStore; viewport: React.RefObject<ViewportAPI | null> }) {
  const { scene } = useSceneState(store, STATE)
  const live = useSyncExternalStore(store.subscribeCamera, store.getCameraSnapshot)
  const shots = useMemo(() => sceneShots(scene), [scene])
  const [chosen, setChosen] = useState<{ id: string; camera: unknown } | null>(null)
  const current = chosen?.camera === live ? chosen.id : null
  const go = (id: string, camera: Parameters<SceneStore['setCamera']>[0]) => {
    store.setCamera(camera)
    setChosen({ id, camera: store.getCameraSnapshot() })
  }
  return (
    <div className="compact-shots" role="toolbar" aria-label="Shots">
      {shots.map(shot => (
        <button key={shot.id} type="button" aria-pressed={current === shot.id} onClick={() => go(shot.id, shot.camera)}>{shot.label}</button>
      ))}
      <span className="compact-shots-rule" aria-hidden />
      {VIEWS.map(view => (
        <button
          key={view.id}
          type="button"
          aria-pressed={current === view.id}
          onClick={() => {
            const api = viewport.current
            if (!api) return
            const { position, target, fov } = api.shot(view.spec, api.aspect())
            go(view.id, { position, target, fov })
          }}
        >
          {view.label}
        </button>
      ))}
      <span className="compact-shots-hint">Drag to orbit · scroll to zoom</span>
    </div>
  )
}
