import { useCallback, useEffect, useRef } from 'react'
import { useDocumentLifecycle } from '@purescience/platform-ui/bridge/react/useDocumentLifecycle'
import type { DocumentLifecycleDoc } from '@purescience/platform-ui/bridge/react/useDocumentLifecycle'
import {
  readPlatformTextFile,
  writePlatformTextFile,
} from '../bridge/platformBridge'
import type { SceneStore } from '../lib/SceneStore'
import { emptyScene, parseScene } from '../lib/scene'

export interface SceneDocumentActions {
  doc: DocumentLifecycleDoc
  save: (path?: string) => Promise<string>
  open: (path: string) => Promise<string>
  create: (title?: string) => Promise<string>
}

function assertScenePath(path: string) {
  if (!path.toLowerCase().endsWith('.pure3d'))
    throw new Error('Scene files must end in .pure3d')
}

export function useSceneDocument(store: SceneStore, ready: boolean) {
  const loading = useRef(false)
  const actions = useRef(Promise.resolve())
  const enqueue = useCallback(function enqueue<T>(action: () => Promise<T>): Promise<T> {
    const next = actions.current.then(action)
    actions.current = next.then(() => {}, () => {})
    return next
  }, [])
  const lifecycle = useDocumentLifecycle({
    appSlug: '3d',
    suffix: '.pure3d',
    kind: 'file',
    suggestedTitle: store.getSnapshot().scene.title,
    serialize: () => [
      {
        name: null,
        content: JSON.stringify(store.getDocument(true), null, 2),
      },
    ],
  })
  const { markDirty, flush, adopt, reset, ensureDraft } = lifecycle

  // Workspace updates stay transient. A settled camera is serialized once, without
  // becoming an undoable scene transaction.
  useEffect(
    () =>
      store.subscribe(change => {
        if (ready && !loading.current && (change.domain === 'content' || change.persisted)) markDirty()
      }),
    [store, ready, markDirty],
  )

  const save = useCallback(
    async (path?: string): Promise<string> => {
      if (!ready) throw new Error('Saving documents requires the shell bridge')
      store.persistCamera()
      if (path) {
        assertScenePath(path)
        await flush({ throwOnError: true })
        const source = store.getContentSnapshot()
        const camera = store.getCameraSnapshot()
        const current = store.getDocument(true)
        await writePlatformTextFile(
          path,
          JSON.stringify(current, null, 2),
        )
        adopt(path, { title: current.title })
        if (store.getContentSnapshot() !== source || store.getCameraSnapshot() !== camera) {
          store.persistCamera()
          markDirty()
          await flush({ throwOnError: true })
        }
        return path
      }
      const draft = await ensureDraft()
      if (!draft) throw new Error('Could not create the scene draft')
      await flush({ throwOnError: true })
      return draft
    },
    [ready, store, flush, adopt, ensureDraft, markDirty],
  )

  const open = useCallback(
    async (path: string): Promise<string> => {
      assertScenePath(path)
      const value = JSON.parse(
        (await readPlatformTextFile(path)).replace(/^\uFEFF/, ''),
      )
      const scene = parseScene(value)
      store.persistCamera()
      await flush({ throwOnError: true })
      adopt(path, { title: scene.title })
      loading.current = true
      try { store.replace(scene) } finally { loading.current = false }
      if (value.id === 'new') markDirty()
      return path
    },
    [store, flush, adopt, markDirty],
  )

  const create = useCallback(
    async (title?: string): Promise<string> => {
      if (!ready)
        throw new Error('Creating documents requires the shell bridge')
      store.persistCamera()
      await flush({ throwOnError: true })
      reset()
      store.replace(emptyScene(title))
      // Deliberately creating a new document also gives its tab a durable binding.
      return save()
    },
    [ready, store, flush, reset, save],
  )

  const queuedSave = useCallback((path?: string) => enqueue(() => save(path)), [enqueue, save])
  const queuedOpen = useCallback((path: string) => enqueue(() => open(path)), [enqueue, open])
  const queuedCreate = useCallback((title?: string) => enqueue(() => create(title)), [enqueue, create])
  return { lifecycle, doc: lifecycle.doc, save: queuedSave, open: queuedOpen, create: queuedCreate }
}
