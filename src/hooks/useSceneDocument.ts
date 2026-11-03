import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useDocumentLifecycle } from '@purescience/platform-ui/bridge/react/useDocumentLifecycle'
import type { DocumentLifecycleDoc } from '@purescience/platform-ui/bridge/react/useDocumentLifecycle'
import {
  readPlatformTextFile,
  sceneWriterLease,
  writePlatformTextFile,
} from '../bridge/platformBridge'
import type { SceneStore } from '../lib/SceneStore'
import { starterScene, parseScene } from '../lib/scene'
import { mergeScene, sameScene } from '../lib/sceneMerge'
import { createWriterLease } from '../lib/writerLease'
import type { SceneDocument } from '../types'

const AUTOSAVE_MS = 1500

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

export interface SceneDocumentOptions {
  /** This copy is held in a page: its view is its own, and looking around saves nothing. */
  held?: () => boolean
}

/**
 * One scene file, shared with any other live copy of the app. Each save takes the writer's turn, reads the file, merges what
 * another copy saved into this one (lib/sceneMerge.ts) and only then writes. A copy also takes in another's save as it
 * happens, over the documents bus. So the lifecycle here owns the draft and the binding, and its own dirty timer stays unused.
 */
export function useSceneDocument(store: SceneStore, ready: boolean, options: SceneDocumentOptions = {}) {
  const heldRef = useRef(options.held)
  heldRef.current = options.held
  const isHeld = useCallback(() => heldRef.current?.() === true, [])
  /** The file as this copy last read or wrote it: what a merge measures both sides against. */
  const agreed = useRef<{ text: string; scene: SceneDocument } | null>(null)
  const boundPath = useRef<string | null>(null)
  const unsaved = useRef(false)
  const saveTimer = useRef<number | null>(null)
  const withWriter = useMemo(() => createWriterLease(sceneWriterLease), [])
  const takeOtherIn = useRef<() => void>(() => undefined)
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
    // Read at draft time: a new scene replaces the store before any re-render.
    suggestedTitle: () => store.getSnapshot().scene.title,
    serialize: () => [
      {
        name: null,
        content: JSON.stringify(store.getDocument(!isHeld()), null, 2),
      },
    ],
    onSaved: files => {
      const text = files[0]?.content
      if (typeof text === 'string') agreed.current = { text, scene: JSON.parse(text) as SceneDocument }
    },
    onExternalChange: () => takeOtherIn.current(),
  })
  const { flush: lifecycleFlush, adopt: lifecycleAdopt, reset: lifecycleReset, ensureDraft } = lifecycle
  boundPath.current = lifecycle.doc.path ?? boundPath.current

  /** The file as it is now, merged into this copy. Quiet when nothing changed; a file part-way through being written waits for the next look. */
  const takeIn = useCallback(async (): Promise<void> => {
    const path = boundPath.current
    if (!path) return
    let text: unknown
    try { text = await readPlatformTextFile(path) } catch { return }
    // Bound without being read (an agreed copy comes with every open and save): nothing to measure a merge against.
    if (typeof text !== 'string' || !agreed.current || text === agreed.current.text) return
    let theirs: SceneDocument
    try { theirs = parseScene(JSON.parse(text.replace(/^\uFEFF/, ''))) } catch { return }
    const merged = mergeScene(agreed.current.scene, store.getDocument(), theirs)
    agreed.current = { text, scene: theirs }
    if (sameScene(merged, store.getDocument())) return
    loading.current = true
    try { store.takeIn(merged) } finally { loading.current = false }
    if (!sameScene(merged, theirs)) unsaved.current = true
  }, [store])

  /** A save with the writer's turn held. Nothing to save, or a held copy that has changed nothing, writes nothing. */
  const flush = useCallback(async (flushOptions?: { throwOnError?: boolean }): Promise<void> => {
    if (saveTimer.current !== null) { window.clearTimeout(saveTimer.current); saveTimer.current = null }
    if (!boundPath.current) { await lifecycleFlush(flushOptions); return }
    await withWriter(async () => {
      await takeIn()
      const content = store.getContentSnapshot()
      await lifecycleFlush(flushOptions)
      if (store.getContentSnapshot() === content) unsaved.current = false
    })
  }, [store, withWriter, takeIn, lifecycleFlush])

  const scheduleSave = useCallback(() => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null
      void enqueue(() => flush()).catch(() => { if (unsaved.current) scheduleSave() })
    }, AUTOSAVE_MS)
  }, [enqueue, flush])

  /** Note a change: creates the draft when there is none and saves it after a pause. */
  const markDirty = useCallback(() => {
    unsaved.current = true
    void ensureDraft().then(path => { if (path) { boundPath.current = path; scheduleSave() } })
  }, [ensureDraft, scheduleSave])

  const adopt = useCallback<typeof lifecycleAdopt>((path, adoptOptions) => {
    boundPath.current = path
    lifecycleAdopt(path, adoptOptions)
  }, [lifecycleAdopt])
  const reset = useCallback(() => {
    boundPath.current = null
    agreed.current = null
    unsaved.current = false
    if (saveTimer.current !== null) { window.clearTimeout(saveTimer.current); saveTimer.current = null }
    lifecycleReset()
  }, [lifecycleReset])

  takeOtherIn.current = () => {
    void enqueue(takeIn).then(() => { if (unsaved.current) scheduleSave() }).catch(() => undefined)
  }

  // The last chance when the tab hides or unloads, for what the pause has not yet saved.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden' && unsaved.current) void flush().catch(() => undefined)
    }
    window.addEventListener('beforeunload', onHidden)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      window.removeEventListener('beforeunload', onHidden)
      document.removeEventListener('visibilitychange', onHidden)
    }
  }, [flush])

  // Workspace updates stay transient. A settled camera is serialized once, without
  // becoming an undoable scene transaction.
  useEffect(
    () => {
      const unsubscribe = store.subscribe(change => {
        if (ready && !loading.current && (change.domain === 'content' || (change.persisted && !isHeld()))) markDirty()
      })
      return () => {
        // Parent cleanup runs before the viewport's: publish while dirty
        // tracking is still subscribed, then save without waiting for a timer.
        const cameraChanged = !isHeld() && store.persistCamera()
        if ((cameraChanged || unsaved.current) && ready && !loading.current) {
          // markDirty may still be creating a draft. Let it finish scheduling
          // its autosave before flush clears that timer, including on unmount.
          void ensureDraft().then(path => { boundPath.current = path; return flush() }).catch(() => undefined)
        }
        unsubscribe()
      }
    },
    [store, ready, markDirty, flush, ensureDraft, isHeld],
  )

  const save = useCallback(
    async (path?: string): Promise<string> => {
      if (!ready) throw new Error('Saving documents requires the shell bridge')
      if (!isHeld()) store.persistCamera()
      if (path) {
        assertScenePath(path)
        await flush({ throwOnError: true })
        const source = store.getContentSnapshot()
        const camera = store.getCameraSnapshot()
        const current = store.getDocument(!isHeld())
        const text = JSON.stringify(current, null, 2)
        await writePlatformTextFile(path, text)
        adopt(path, { title: current.title })
        agreed.current = { text, scene: current }
        unsaved.current = false
        if (store.getContentSnapshot() !== source || store.getCameraSnapshot() !== camera) {
          if (!isHeld()) store.persistCamera()
          markDirty()
          await flush({ throwOnError: true })
        }
        return path
      }
      const draft = await ensureDraft()
      if (!draft) throw new Error('Could not create the scene draft')
      boundPath.current = draft
      if (!isHeld() || unsaved.current) await flush({ throwOnError: true })
      return draft
    },
    [ready, store, flush, adopt, ensureDraft, markDirty, isHeld],
  )

  const open = useCallback(
    async (path: string): Promise<string> => {
      assertScenePath(path)
      const text = await readPlatformTextFile(path)
      const value = JSON.parse(text.replace(/^\uFEFF/, ''))
      const scene = parseScene(value)
      if (!isHeld()) store.persistCamera()
      if (!isHeld() || unsaved.current) await flush({ throwOnError: true })
      adopt(path, { title: scene.title })
      agreed.current = { text, scene }
      unsaved.current = false
      loading.current = true
      try { store.replace(scene) } finally { loading.current = false }
      if (value.id === 'new') markDirty()
      return path
    },
    [store, flush, adopt, markDirty, isHeld],
  )

  const create = useCallback(
    async (title?: string): Promise<string> => {
      if (!ready)
        throw new Error('Creating documents requires the shell bridge')
      if (!isHeld()) store.persistCamera()
      if (!isHeld() || unsaved.current) await flush({ throwOnError: true })
      reset()
      store.replace(starterScene(title))
      // Deliberately creating a new document also gives its tab a durable binding.
      return save()
    },
    [ready, store, flush, reset, save, isHeld],
  )

  const queuedSave = useCallback((path?: string) => enqueue(() => save(path)), [enqueue, save])
  const queuedOpen = useCallback((path: string) => enqueue(() => open(path)), [enqueue, open])
  const queuedCreate = useCallback((title?: string) => enqueue(() => create(title)), [enqueue, create])
  const clear = useCallback(() => {
    reset()
    // Replacing a deleted document is a clean load, not an edit needing a draft.
    loading.current = true
    try { store.replace(starterScene()) } finally { loading.current = false }
  }, [store, reset])
  return { lifecycle: { ...lifecycle, markDirty, flush, adopt, reset }, doc: lifecycle.doc, save: queuedSave, open: queuedOpen, create: queuedCreate, clear }
}
