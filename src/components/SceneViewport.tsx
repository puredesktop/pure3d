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
import { transformOperations } from '../lib/scene'
import { VertexHandles } from '../lib/VertexHandles'
import type { Vec3 } from '../types'
import { cameraPose } from '../lib/cameraTrack'

export interface ViewportAPI {
  capture: (time?: number) => Promise<string>
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
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.25
    renderer.domElement.setAttribute('aria-label', '3D scene viewport')
    renderer.domElement.setAttribute('tabindex', '0')
    element.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10000)
    const orbit = new OrbitControls(camera, renderer.domElement)
    orbit.enableDamping = false
    const gizmo = new TransformControls(camera, renderer.domElement)
    gizmo.setSize(0.85)
    scene.add(gizmo.getHelper())
    const grid = new THREE.GridHelper(30, 30, '#a2aebc', '#c9d1db')
    scene.add(grid)
    const axes = new THREE.AxesHelper(1.5)
    axes.position.y = 0.002
    scene.add(axes)
    scene.add(new THREE.HemisphereLight('#ffffff', '#7a8a9e', 2.5))
    const keyLight = new THREE.DirectionalLight('#ffffff', 3)
    keyLight.position.set(4, 8, 6)
    scene.add(keyLight)
    const fill = new THREE.DirectionalLight('#bcd4ff', 1.2)
    fill.position.set(-5, 3, -4)
    scene.add(fill)
    let document = store.getContentSnapshot()
    const built = createSceneReconciler(document)
    scene.add(built.root)
    let box: THREE.BoxHelper | null = null
    let selectedId: string | null = null
    let vertices: VertexHandles | null = null
    let cameraSignature = ''
    const renderView = () => {
      const width = element.clientWidth, height = element.clientHeight
      if (!width || !height) return
      const preview = store.getSnapshot().cameraPreview
      const w = preview ? Math.min(width, height * 16 / 9) : width
      const h = preview ? w * 9 / 16 : height
      camera.aspect = w / h; camera.updateProjectionMatrix()
      renderer.setScissorTest(false); renderer.setViewport(0, 0, width, height); renderer.setClearColor('#151515'); renderer.clear()
      renderer.setViewport((width - w) / 2, (height - h) / 2, w, h)
      renderer.setScissor((width - w) / 2, (height - h) / 2, w, h); renderer.setScissorTest(true)
      renderer.render(scene, camera)
      renderer.setScissorTest(false)
    }
    let disposed = false
    const watchTextures = () => {
      const current = built
      void current.ready.catch(error => {
        if (!disposed && built === current) callbacks.current.onError(error)
      })
    }
    watchTextures()
    let cameraPersistTimeout: number | undefined
    const updateCamera = () => {
      if (store.getSnapshot().cameraPreview) return
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
      scene.background = new THREE.Color(document.settings.background)
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
          scene.remove(box)
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
          scene.add(box)
        }
      }
      gizmo.getHelper().visible = !!gizmo.object && !state.playing && !state.cameraPreview
      if (box) box.visible = !state.cameraPreview
      if (vertices) vertices.points.visible = !state.cameraPreview
    }
    const unsubscribeContent = store.subscribeContent(refresh)
    const unsubscribeWorkspace = store.subscribeWorkspace(refresh)
    const unsubscribeCamera = store.subscribeCamera(refresh)
    refresh()
    gizmo.addEventListener('dragging-changed', e => {
      orbit.enabled = !e.value
      if (e.value) store.workspace({ playing: false })
    })
    gizmo.addEventListener('objectChange', () => vertices?.preview())
    gizmo.addEventListener('mouseUp', () => {
      if (!gizmo.object) return
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
    orbit.addEventListener('end', persistCameraAfterNavigation)
    const resize = new ResizeObserver(() => {
      const width = element.clientWidth
      const height = element.clientHeight
      if (!width || !height) return
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
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
      capture: async (time = store.getSnapshot().time) => {
        const current = built
        await current.ready
        if (built !== current)
          throw new Error('Scene changed while preparing the viewport capture')
        if (disposed || renderer.getContext().isContextLost())
          throw new Error('Viewport renderer unavailable')
        updatePose(document, built.objects, time)
        if (store.getSnapshot().cameraPreview) {
          const shot = cameraPose(document, time)
          camera.position.fromArray(shot.position); orbit.target.fromArray(shot.target); camera.fov = shot.fov
        }
        orbit.update()
        box?.update()
        renderView()
        const dataUrl = renderer.domElement.toDataURL('image/png')
        cameraSignature = ''; refresh()
        return dataUrl
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
    renderer.setAnimationLoop(() => {
      const now = performance.now()
      elapsed += Math.min((now - previous) / 1000, 0.1)
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
    })
    return () => {
      disposed = true
      api.current = null
      unsubscribeContent()
      unsubscribeWorkspace()
      unsubscribeCamera()
      if (cameraPersistTimeout !== undefined)
        window.clearTimeout(cameraPersistTimeout)
      resize.disconnect()
      renderer.setAnimationLoop(null)
      renderer.domElement.removeEventListener('pointerdown', down)
      renderer.domElement.removeEventListener('pointerup', up)
      orbit.removeEventListener('end', persistCameraAfterNavigation)
      orbit.dispose()
      gizmo.dispose()
      vertices?.dispose()
      built.dispose()
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
