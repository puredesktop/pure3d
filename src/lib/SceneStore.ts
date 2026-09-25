import { emptyScene, applyOperations, parseScene } from './scene'
import type { SceneDocument, TransformMode, Vec3 } from '../types'

export interface WorkspaceState {
  scene: SceneDocument
  selectedId: string | null
  selectedVertex: number | null
  time: number
  playing: boolean
  loop: boolean
  mode: TransformMode
  inspector: boolean
  cameraPreview: boolean
  canUndo: boolean
  canRedo: boolean
}

export interface CameraState {
  position: Vec3
  target: Vec3
  fov?: number
}

type WorkspacePatch = Partial<
  Pick<
    WorkspaceState,
    | 'selectedId'
    | 'selectedVertex'
    | 'time'
    | 'playing'
    | 'loop'
    | 'mode'
    | 'inspector'
    | 'cameraPreview'
  >
>

type WorkspaceAffected = keyof WorkspacePatch
export type SceneAffected = 'scene' | 'history' | 'camera' | WorkspaceAffected

export type SceneChange = {
  domain: 'content' | 'workspace' | 'camera'
  affected: readonly SceneAffected[]
  /** A camera change has settled and should be included in the next save. */
  persisted?: boolean
}

function sameCamera(a: CameraState, b: CameraState) {
  return (a.fov ?? 45) === (b.fov ?? 45) && [...a.position, ...a.target].every(
    (value, index) => value === [...b.position, ...b.target][index],
  )
}

function copyCamera(camera: CameraState): CameraState {
  return { position: [...camera.position] as Vec3, target: [...camera.target] as Vec3, ...(camera.fov !== undefined ? { fov: camera.fov } : {}) }
}

export class SceneStore {
  private state: WorkspaceState
  private camera: CameraState
  private savedCamera: CameraState
  private listeners = new Set<(change: SceneChange) => void>()
  private contentListeners = new Set<() => void>()
  private workspaceListeners = new Set<() => void>()
  private cameraListeners = new Set<() => void>()
  private past: SceneDocument[] = []
  private future: SceneDocument[] = []
  constructor(scene: SceneDocument = emptyScene()) {
    this.state = {
      scene: parseScene(scene),
      selectedId: null,
      selectedVertex: null,
      time: 0,
      playing: false,
      loop: true,
      mode: 'translate',
      inspector: true,
      cameraPreview: false,
      canUndo: false,
      canRedo: false,
    }
    this.camera = copyCamera(this.state.scene.settings.camera)
    this.savedCamera = copyCamera(this.camera)
  }
  getSnapshot = () => this.state
  getContentSnapshot = () => this.state.scene
  getWorkspaceSnapshot = () => this.state
  getCameraSnapshot = () => this.camera
  /** Returns the durable scene shape without making camera navigation an undo entry. */
  getDocument = () => {
    if (sameCamera(this.state.scene.settings.camera, this.savedCamera)) return this.state.scene
    return {
      ...this.state.scene,
      settings: { ...this.state.scene.settings, camera: copyCamera(this.savedCamera) },
    }
  }
  subscribe = (fn: (change: SceneChange) => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }
  subscribeContent = (fn: () => void) => {
    this.contentListeners.add(fn)
    return () => this.contentListeners.delete(fn)
  }
  subscribeWorkspace = (fn: () => void) => {
    this.workspaceListeners.add(fn)
    return () => this.workspaceListeners.delete(fn)
  }
  subscribeCamera = (fn: () => void) => {
    this.cameraListeners.add(fn)
    return () => this.cameraListeners.delete(fn)
  }
  /** Subscribe a React surface only to the publications that can change it. */
  subscribeAffected = (affected: readonly SceneAffected[], fn: () => void) =>
    this.subscribe(change => {
      if (change.affected.some(key => affected.includes(key))) fn()
    })
  private publish(patch: Partial<WorkspaceState>, change: SceneChange) {
    // Camera publications carry their own snapshot. Do not manufacture a new
    // aggregate workspace snapshot for them, or generic consumers will treat
    // a navigation update as a complete workspace replacement.
    if (Object.keys(patch).length) this.state = { ...this.state, ...patch }
    this.listeners.forEach(fn => fn(change))
    if (change.domain === 'content') this.contentListeners.forEach(fn => fn())
    if (change.domain === 'workspace') this.workspaceListeners.forEach(fn => fn())
    // Persistence changes the durable document boundary, not the already
    // delivered live camera slice. Avoid waking renderer/UI camera consumers
    // a second time once navigation has settled.
    if (change.affected.includes('camera') && !change.persisted)
      this.cameraListeners.forEach(fn => fn())
  }
  edit(operations: unknown[]) {
    const next = applyOperations(this.state.scene, operations)
    this.past.push(this.state.scene)
    if (this.past.length > 40) this.past.shift()
    this.future = []
    this.commit(next)
  }
  private commit(scene: SceneDocument) {
    const cameraChanged = !sameCamera(
      this.state.scene.settings.camera,
      scene.settings.camera,
    )
    if (cameraChanged) {
      this.camera = copyCamera(scene.settings.camera)
      this.savedCamera = copyCamera(this.camera)
    }
    const selected = scene.objects.find(o => o.id === this.state.selectedId)
    const vertex = this.state.selectedVertex
    this.publish(
      {
        scene,
        canUndo: !!this.past.length,
        canRedo: !!this.future.length,
        playing: false,
        time: Math.min(this.state.time, scene.settings.duration),
        selectedId: scene.objects.some(o => o.id === this.state.selectedId)
          ? this.state.selectedId
          : null,
        selectedVertex:
          vertex !== null &&
          selected?.geometry &&
          vertex < selected.geometry.positions.length / 3
            ? vertex
            : null,
      },
      {
        domain: 'content',
        affected: cameraChanged ? ['scene', 'history', 'camera'] : ['scene', 'history'],
      },
    )
  }
  history(direction: 'undo' | 'redo') {
    const source = direction === 'undo' ? this.past : this.future
    const destination = direction === 'undo' ? this.future : this.past
    const next = source.pop()
    if (!next) throw new Error(`Nothing to ${direction}`)
    destination.push(this.state.scene)
    this.commit(next)
  }
  replace(scene: SceneDocument) {
    const next = parseScene(scene)
    this.past = []
    this.future = []
    this.camera = copyCamera(next.settings.camera)
    this.savedCamera = copyCamera(this.camera)
    this.publish({
      scene: next,
      cameraPreview: false,
      selectedId: null,
      selectedVertex: null,
      time: 0,
      playing: false,
      canUndo: false,
      canRedo: false,
    }, { domain: 'content', affected: ['scene', 'history', 'camera'] })
  }
  workspace(patch: WorkspacePatch) {
    if (
      patch.selectedId &&
      !this.state.scene.objects.some(o => o.id === patch.selectedId)
    )
      throw new Error('Unknown selected object')
    if (
      patch.selectedId !== undefined &&
      patch.selectedId !== this.state.selectedId
    )
      patch.selectedVertex ??= null
    if (patch.selectedVertex !== undefined && patch.selectedVertex !== null) {
      const object = this.state.scene.objects.find(
        o =>
          o.id ===
          (patch.selectedId === undefined
            ? this.state.selectedId
            : patch.selectedId),
      )
      if (
        !object?.geometry ||
        !Number.isInteger(patch.selectedVertex) ||
        patch.selectedVertex < 0 ||
        patch.selectedVertex >= object.geometry.positions.length / 3
      )
        throw new Error('Unknown selected mesh vertex')
      patch.mode = 'translate'
      patch.playing = false
    }
    if ((patch.mode && patch.mode !== 'translate') || patch.playing)
      patch.selectedVertex = null
    if (patch.time !== undefined)
      patch.time = Math.min(
        Math.max(0, patch.time),
        this.state.scene.settings.duration,
      )
    if (patch.playing && this.state.time >= this.state.scene.settings.duration)
      patch.time = 0
    this.publish(patch, {
      domain: 'workspace',
      affected: Object.keys(patch) as WorkspaceAffected[],
    })
  }
  tick(delta: number) {
    if (!this.state.playing) return
    let time = this.state.time + delta
    let playing = true
    if (time >= this.state.scene.settings.duration) {
      if (this.state.loop) time %= this.state.scene.settings.duration
      else {
        time = this.state.scene.settings.duration
        playing = false
      }
    }
    this.publish({ time, playing }, { domain: 'workspace', affected: ['time', 'playing'] })
  }
  setCamera(camera: CameraState) {
    const next = copyCamera(camera)
    if (sameCamera(this.camera, next)) return
    this.camera = next
    this.publish({}, { domain: 'camera', affected: ['camera'] })
  }
  persistCamera() {
    if (sameCamera(this.savedCamera, this.camera)) return
    this.savedCamera = copyCamera(this.camera)
    this.publish({}, { domain: 'camera', affected: ['camera'], persisted: true })
  }
}
