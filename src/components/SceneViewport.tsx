import { memo, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { SceneStore } from '../lib/SceneStore'
import {
  createSceneReconciler,
  disposeScene,
  updatePose,
  nodeTransform,
} from '../lib/threeScene'
import { descendants, transformOperations } from '../lib/scene'
import { VertexHandles } from '../lib/VertexHandles'
import type { ShotSpec, Vec3 } from '../types'
import { setLightMarkers } from '../lib/lights'
import { aspectRatio, blockers, frameShot, type FramedShot, type Shot } from '../lib/shots'
import { demandRenderer } from '../lib/demandRenderer'
import { LookRig, resolveLook } from '../lib/look'
import { cameraPose } from '../lib/cameraTrack'
import {
  platformViewportTheme,
  resolveViewportBackground,
  type ViewportTheme,
} from '../lib/viewportTheme'
import {
  BLANK_CAPTURE_MESSAGE,
  FALLBACK_CAPTURE_SIZE,
  decodeCapturePixels,
  isBlankCapture,
} from '../lib/captureCheck'

/** A still's shape and size (long edge in pixels), and a camera to take it from instead of the current one. */
export type CaptureOptions = { aspect?: string; size?: number; view?: Shot }
export interface ViewportAPI {
  capture: (time?: number, options?: CaptureOptions) => Promise<string>
  /** The camera for a shot spec, framed on its objects (or everything) at the playhead, for a frame of this aspect. */
  shot: (spec: ShotSpec, aspect?: number) => FramedShot
  /** Width over height of the frame the editing camera shows. */
  aspect: () => number
  frame: () => void
}
export const SceneViewport = memo(function SceneViewport({
  store,
  api,
  onError,
}: {
  store: SceneStore
  api: React.MutableRefObject<ViewportAPI | null>
  onError: (error: unknown) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const callbacks = useRef({ onError })
  callbacks.current = { onError }
  useEffect(() => {
    if (!host.current) return
    const element = host.current
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
      })
    } catch (e) {
      setError(
        `3D renderer unavailable: ${
          e instanceof Error ? e.message : String(e)
        }`,
      )
      return
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.setAttribute('aria-label', '3D scene viewport')
    renderer.domElement.setAttribute('tabindex', '0')
    element.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10000)
    const orbit = new OrbitControls(camera, renderer.domElement)
    orbit.enableDamping = false
    const gizmo = new TransformControls(camera, renderer.domElement)
    gizmo.setSize(0.85)
    // Editing helpers are drawn over the finished frame: no shadows, fog or blur on them.
    const overlay = new THREE.Scene()
    overlay.add(gizmo.getHelper())
    const grid = new THREE.GridHelper(30, 30, '#a2aebc', '#c9d1db')
    scene.add(grid)
    const axes = new THREE.AxesHelper(1.5)
    axes.position.y = 0.002
    scene.add(axes)
    const rig = new LookRig(renderer, scene, camera)
    let document = store.getContentSnapshot()
    const built = createSceneReconciler(document)
    scene.add(built.root)
    let box: THREE.BoxHelper | null = null
    let selectedId: string | null = null
    let vertices: VertexHandles | null = null
    let cameraSignature = ''
    let viewportTheme: ViewportTheme = platformViewportTheme()
    let invalidate = () => {}
    type Size = { width: number; height: number }
    let lastSize: Size | null = null
    /** The on-screen size, remembered so a hidden viewport can still be captured. */
    const viewSize = (): Size | null => {
      const width = element.clientWidth, height = element.clientHeight
      if (!width || !height) return null
      lastSize = { width, height }
      return lastSize
    }
    /** The area the frame fills: all of it, or a centred 16:9 shot while previewing the camera. */
    const frameArea = ({ width, height }: Size) => {
      const preview = store.getSnapshot().cameraPreview
      const w = preview ? Math.min(width, height * 16 / 9) : width
      return { w, h: preview ? w * 9 / 16 : height }
    }
    let composerSize = ''
    const sizeComposer = (w: number, h: number, ratio: number) => {
      const key = `${Math.round(w)}x${Math.round(h)}@${ratio}`
      if (key === composerSize) return
      rig.setSize(Math.round(w), Math.round(h), ratio)
      composerSize = key
    }
    const renderView = (size: Size | null = viewSize()) => {
      if (!size) return
      const { width, height } = size
      const { w, h } = frameArea(size)
      camera.aspect = w / h; camera.updateProjectionMatrix()
      renderer.setScissorTest(false); renderer.setViewport(0, 0, width, height); renderer.setClearColor('#151515'); renderer.clear()
      sizeComposer(w, h, renderer.getPixelRatio())
      renderer.setViewport((width - w) / 2, (height - h) / 2, w, h)
      renderer.setScissor((width - w) / 2, (height - h) / 2, w, h); renderer.setScissorTest(true)
      rig.draw(true)
      if (overlay.children.some(helper => helper.visible)) {
        renderer.autoClear = false
        renderer.clearDepth()
        renderer.render(overlay, camera)
        renderer.autoClear = true
      }
      renderer.setScissorTest(false)
    }
    // Stills render off screen, so they work while Pure3D is hidden too. Light markers stay out of them.
    const renderStill = (size: Size, exact = false): string => {
      const { w, h } = exact ? { w: size.width, h: size.height } : frameArea(size)
      const width = Math.max(1, Math.round(w)), height = Math.max(1, Math.round(h))
      camera.aspect = width / height; camera.updateProjectionMatrix()
      setLightMarkers(built.root, false)
      try {
        return rig.still(width, height)
      } finally {
        setLightMarkers(built.root, !store.getSnapshot().cameraPreview)
        composerSize = ''
      }
    }
    /** A still's exact size for an aspect and long edge; null keeps the on-screen frame. */
    const stillSize = (options: CaptureOptions): Size | null => {
      if (!options.aspect && !options.size) return null
      const { w, h } = frameArea(viewSize() ?? lastSize ?? FALLBACK_CAPTURE_SIZE)
      const ratio = options.aspect ? aspectRatio(options.aspect) : w / h
      const long = options.size ?? Math.min(2048, Math.max(1024, Math.round(Math.max(w, h))))
      return ratio >= 1 ? { width: long, height: Math.round(long / ratio) } : { width: Math.round(long * ratio), height: long }
    }
    let lookKey: unknown[] = []
    const applyLook = () => {
      const background = resolveViewportBackground(document.settings.background, viewportTheme)
      if (lookKey[0] === document && lookKey[1] === background) return
      lookKey = [document, background]
      built.root.updateMatrixWorld(true)
      rig.apply(resolveLook(document), background, new THREE.Box3().setFromObject(built.root))
    }
    let disposed = false
    const watchTextures = () => {
      const current = built
      const source = document
      void current.ready.then(() => {
        if (!disposed && source === document) invalidate()
      }).catch(error => {
        if (!disposed && source === document) callbacks.current.onError(error)
      })
    }
    watchTextures()
    let cameraPersistTimeout: number | undefined
    // true while a capture has the camera somewhere else (a preview shot or a view): nothing it does is saved
    let capturing = false
    const updateCamera = () => {
      if (capturing || store.getSnapshot().cameraPreview) return
      const config = {
        position: camera.position.toArray() as Vec3,
        target: orbit.target.toArray() as Vec3,
        fov: camera.fov,
      }
      store.setCamera(config)
    }
    const scheduleCameraPersistence = () => {
      if (cameraPersistTimeout !== undefined)
        window.clearTimeout(cameraPersistTimeout)
      cameraPersistTimeout = window.setTimeout(() => {
        cameraPersistTimeout = undefined
        store.persistCamera()
      }, 250)
    }
    const persistCameraAfterNavigation = () => {
      updateCamera()
      scheduleCameraPersistence()
    }
    const refresh = () => {
      const state = store.getSnapshot()
      if (document !== state.scene) {
        vertices?.dispose()
        vertices = null
        document = state.scene
        built.reconcile(document, state.time)
        watchTextures()
        // Refresh editor helpers, while leaving the reconciled scene nodes intact.
        selectedId = null
      }
      const cameraState = state.cameraPreview ? cameraPose(document, state.time) : store.getCameraSnapshot()
      const signature = JSON.stringify(cameraState)
      if (signature !== cameraSignature) {
        camera.position.fromArray(cameraState.position)
        camera.fov = cameraState.fov ?? 45
        camera.updateProjectionMatrix()
        orbit.target.fromArray(cameraState.target)
        cameraSignature = signature
        orbit.update()
      }
      applyLook()
      setLightMarkers(built.root, !state.cameraPreview)
      orbit.enabled = !state.cameraPreview
      grid.visible = document.settings.grid && !state.cameraPreview
      axes.visible = document.settings.grid && !state.cameraPreview
      gizmo.setMode(state.mode)
      gizmo.enabled = !state.playing && !state.cameraPreview
      if (
        selectedId !== state.selectedId ||
        (vertices?.index ?? null) !== state.selectedVertex ||
        (state.selectedId && !gizmo.object)
      ) {
        selectedId = state.selectedId
        gizmo.detach()
        vertices?.dispose()
        vertices = null
        if (box) {
          overlay.remove(box)
          disposeScene(box)
          box = null
        }
        const node = selectedId ? built.objects.get(selectedId) : null
        if (node && node.visible) {
          const object = document.objects.find(o => o.id === selectedId)!
          if (
            state.selectedVertex !== null &&
            node instanceof THREE.Mesh &&
            object.geometry
          )
            vertices = new VertexHandles(
              node,
              object.geometry,
              state.selectedVertex,
            )
          gizmo.attach(vertices?.pivot ?? node)
          box = new THREE.BoxHelper(node, '#6888b2')
          overlay.add(box)
        }
      }
      gizmo.getHelper().visible = !!gizmo.object && !state.playing && !state.cameraPreview
      if (box) box.visible = !state.cameraPreview
      if (vertices) vertices.points.visible = !state.cameraPreview
      invalidate()
    }
    const unsubscribeContent = store.subscribeContent(refresh)
    const unsubscribeWorkspace = store.subscribeWorkspace(refresh)
    const unsubscribeCamera = store.subscribeCamera(refresh)
    const themeObserver = new MutationObserver(() => {
      const nextTheme = platformViewportTheme()
      if (nextTheme === viewportTheme) return
      viewportTheme = nextTheme
      refresh()
    })
    themeObserver.observe(globalThis.document.documentElement, {
      attributes: true,
      attributeFilter: ['data-platform-theme', 'data-platform-appearance'],
    })
    refresh()
    // A drag that leaves the handle where it started (a click, movement off the
    // active axis, or dragging away and back) must not commit an edit or, on an
    // animated object, insert a keyframe at the playhead.
    const placement = (target: THREE.Object3D) =>
      [...target.position.toArray(), ...target.quaternion.toArray(), ...target.scale.toArray()]
    let dragStart: number[] | null = null
    gizmo.addEventListener('dragging-changed', e => {
      orbit.enabled = !e.value
      if (e.value) {
        dragStart = gizmo.object ? placement(gizmo.object) : null
        store.workspace({ playing: false })
      }
    })
    gizmo.addEventListener('objectChange', () => vertices?.preview())
    gizmo.addEventListener('mouseUp', () => {
      const start = dragStart
      dragStart = null
      if (!gizmo.object || !start) return
      if (placement(gizmo.object).every((value, index) => value === start[index])) return
      const state = store.getSnapshot()
      const id = state.selectedId!
      try {
        if (vertices)
          store.edit([
            {
              op: 'moveVertex',
              id,
              index: vertices.index,
              position: vertices.pivot.position.toArray() as Vec3,
            },
          ])
        else
          store.edit(
            transformOperations(
              state.scene,
              id,
              nodeTransform(gizmo.object),
              state.time,
            ),
          )
      } catch (e) {
        callbacks.current.onError(e)
        vertices?.dispose()
        vertices = null
        refresh()
        updatePose(document, built.objects, state.time)
      }
    })
    orbit.addEventListener('change', () => { updateCamera(); invalidate() })
    gizmo.addEventListener('change', () => invalidate())
    orbit.addEventListener('end', persistCameraAfterNavigation)
    const resize = new ResizeObserver(() => {
      const width = element.clientWidth
      const height = element.clientHeight
      if (!width || !height) return
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
      invalidate()
    })
    resize.observe(element)
    let pointer: { x: number; y: number; gizmo: boolean } | null = null
    const down = (e: PointerEvent) => {
      if (store.getSnapshot().cameraPreview) return
      if (e.button === 0)
        pointer = {
          x: e.clientX,
          y: e.clientY,
          gizmo: gizmo.dragging || gizmo.axis !== null,
        }
    }
    const up = (e: PointerEvent) => {
      if (
        !pointer ||
        pointer.gizmo ||
        Math.hypot(pointer.x - e.clientX, pointer.y - e.clientY) > 4
      ) {
        pointer = null
        return
      }
      pointer = null
      const rect = renderer.domElement.getBoundingClientRect()
      const ray = new THREE.Raycaster()
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          (-(e.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      )
      if (vertices) {
        const distance = camera.position.distanceTo(
          vertices.mesh.getWorldPosition(new THREE.Vector3()),
        )
        ray.params.Points.threshold =
          (distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 14) /
          rect.height
        const vertex = ray.intersectObject(vertices.points, false)[0]
        if (vertex?.index !== undefined)
          store.workspace({ selectedVertex: vertex.index })
        return
      }
      const hit = ray
        .intersectObjects([...built.objects.values()], false)
        .find(h => {
          let n: THREE.Object3D | null = h.object
          while (n) {
            if (!n.visible) return false
            n = n.parent
          }
          return true
        })
      store.workspace({
        selectedId: hit ? String(hit.object.userData.pure3dId) : null,
      })
    }
    renderer.domElement.addEventListener('pointerdown', down)
    renderer.domElement.addEventListener('pointerup', up)
    api.current = {
      capture: async (time = store.getSnapshot().time, options: CaptureOptions = {}) => {
        const capturedDocument = document
        await built.ready
        if (document !== capturedDocument)
          throw new Error('Scene changed while preparing the viewport capture')
        if (disposed || renderer.getContext().isContextLost())
          throw new Error('Viewport renderer unavailable')
        // Render a fresh still at the on-screen size, or, while the tab is hidden,
        // at the last known (or a fixed) size, off screen so it never comes back blank.
        const exact = stillSize(options)
        const size = exact ?? viewSize() ?? lastSize ?? FALLBACK_CAPTURE_SIZE
        let image: string
        try {
          updatePose(document, built.objects, time)
          capturing = true
          if (store.getSnapshot().cameraPreview) {
            const shot = cameraPose(document, time)
            camera.position.fromArray(shot.position); orbit.target.fromArray(shot.target); camera.fov = shot.fov
          }
          if (options.view) {
            camera.position.fromArray(options.view.position); orbit.target.fromArray(options.view.target); camera.fov = options.view.fov
          }
          orbit.update()
          box?.update()
          applyLook()
          image = renderStill(size, !!exact)
        } finally {
          capturing = false
          updatePose(document, built.objects, store.getSnapshot().time)
          cameraSignature = ''; refresh()
        }
        if (await isBlankCapture(size, image, decodeCapturePixels))
          throw new Error(BLANK_CAPTURE_MESSAGE)
        return image
      },
      shot: (spec, aspect = 16 / 9) => {
        const state = store.getSnapshot()
        updatePose(document, built.objects, state.time)
        built.root.updateMatrixWorld(true)
        const subject = new THREE.Box3()
        const nodes = spec.objectIds?.map(id => {
          const node = built.objects.get(id)
          if (!node) throw new Error(`No object with id ${id}`)
          return node
        }) ?? [built.root]
        setLightMarkers(built.root, false)
        try {
          for (const node of nodes) subject.expandByObject(node)
        } finally {
          setLightMarkers(built.root, !state.cameraPreview)
        }
        const sphere = subject.isEmpty() ? new THREE.Sphere(new THREE.Vector3(), 1) : subject.getBoundingSphere(new THREE.Sphere())
        const shot = frameShot(spec, sphere, aspect, camera.fov)
        // what would hide the subject: the whole scene when framing everything, nothing then counts as in the way
        const own = new Set(spec.objectIds ? spec.objectIds.flatMap(id => [...descendants(document, id)]) : document.objects.map(o => o.id))
        const blockedBy = blockers(built.root, shot, spec.position ? 0 : sphere.radius, own)
        return blockedBy.length ? { ...shot, blockedBy } : shot
      },
      aspect: () => {
        const { w, h } = frameArea(viewSize() ?? lastSize ?? FALLBACK_CAPTURE_SIZE)
        return w / h
      },
      frame: () => {
        const state = store.getSnapshot()
        if (state.cameraPreview) return
        updatePose(document, built.objects, state.time)
        built.root.updateMatrixWorld(true)
        const node = state.selectedId
          ? built.objects.get(state.selectedId)
          : built.root
        if (!node) return
        const bounds = new THREE.Box3().setFromObject(node)
        if (bounds.isEmpty()) return
        const center = bounds.getCenter(new THREE.Vector3())
        const size = bounds.getSize(new THREE.Vector3()).length()
        const direction = camera.position.clone().sub(orbit.target).normalize()
        orbit.target.copy(center)
        camera.position
          .copy(center)
          .addScaledVector(direction, Math.max(size * 1.4, 2))
        orbit.update()
        updateCamera()
        scheduleCameraPersistence()
      },
    }
    let previous = performance.now()
    let elapsed = 0
    let playingLastFrame = false
    const rendering = demandRenderer(() => {
      const now = performance.now()
      const playing = store.getSnapshot().playing
      if (playing && playingLastFrame) elapsed += Math.min((now - previous) / 1000, 0.1)
      else elapsed = 0
      playingLastFrame = playing
      previous = now
      if (elapsed >= 1 / 30) {
        store.tick(elapsed)
        elapsed = 0
      }
      const state = store.getSnapshot()
      if (!gizmo.dragging) updatePose(document, built.objects, state.time)
      orbit.update()
      box?.update()
      renderView()
      return store.getSnapshot().playing
    })
    invalidate = rendering.invalidate
    invalidate()
    return () => {
      disposed = true
      api.current = null
      unsubscribeContent()
      unsubscribeWorkspace()
      unsubscribeCamera()
      themeObserver.disconnect()
      if (cameraPersistTimeout !== undefined)
        window.clearTimeout(cameraPersistTimeout)
      store.persistCamera()
      resize.disconnect()
      rendering.dispose()
      renderer.domElement.removeEventListener('pointerdown', down)
      renderer.domElement.removeEventListener('pointerup', up)
      orbit.removeEventListener('end', persistCameraAfterNavigation)
      orbit.dispose()
      gizmo.dispose()
      vertices?.dispose()
      built.dispose()
      rig.dispose()
      disposeScene(grid)
      disposeScene(axes)
      if (box) disposeScene(box)
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [api, store])
  return (
    <div ref={host} className="viewport">
      {error && (
        <div className="viewport-error" role="alert">
          {error}
        </div>
      )}
    </div>
  )
})
