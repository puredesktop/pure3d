import * as THREE from 'three'
import type { SceneDocument } from '../types'
import { cameraPose } from './cameraTrack'
import { createSceneReconciler, updatePose } from './threeScene'

/** Record an isolated scene snapshot so export never moves the editing camera. */
export async function exportCameraVideo(document: SceneDocument, signal: AbortSignal, progress: (value: number) => void, options: { height: 720 | 1080; fps: number } = { height: 720, fps: Math.min(60, document.settings.fps) }): Promise<Blob> {
  if (![720, 1080].includes(options.height) || !Number.isFinite(options.fps) || options.fps < 1 || options.fps > 60) throw Error('Invalid video export settings.')
  const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(type => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type))
  if (!mimeType) throw Error('WebM recording is unavailable in this browser.')
  if (document.settings.duration > 120) throw Error('Camera video export currently supports scenes up to 120 seconds.')
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(options.height * 16 / 9, options.height); renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25
  const built = createSceneReconciler(document), scene = new THREE.Scene()
  scene.background = new THREE.Color(document.settings.background); scene.add(built.root)
  scene.add(new THREE.HemisphereLight('#ffffff', '#7a8a9e', 2.5))
  const key = new THREE.DirectionalLight('#ffffff', 3); key.position.set(4, 8, 6); scene.add(key)
  const fill = new THREE.DirectionalLight('#bcd4ff', 1.2); fill.position.set(-5, 3, -4); scene.add(fill)
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, .01, 10000)
  let stream: MediaStream | undefined
  try {
    await built.ready
    signal.throwIfAborted()
    const render = (time: number) => {
      const shot = cameraPose(document, time)
      camera.position.fromArray(shot.position); camera.lookAt(...shot.target); camera.fov = shot.fov; camera.updateProjectionMatrix()
      updatePose(document, built.objects, time); renderer.render(scene, camera)
    }
    render(0)
    stream = renderer.domElement.captureStream(options.fps)
    return await new Promise<Blob>((resolve, reject) => {
      const recorder = new MediaRecorder(stream!, { mimeType, videoBitsPerSecond: 8_000_000 })
      const chunks: BlobPart[] = []
      let timer = 0, started = performance.now(), failure: unknown
      const stop = () => { window.clearTimeout(timer); if (recorder.state !== 'inactive') recorder.stop() }
      const cancel = () => { failure = new Error('Video export cancelled.'); stop() }
      const visibility = () => { if (documentHidden()) { failure = new Error('Keep Pure3D visible during video recording. Export stopped.'); stop() } }
      const documentHidden = () => window.document.hidden
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
      recorder.onerror = () => { failure = new Error('Video recording failed.'); stop() }
      recorder.onstop = () => {
        window.clearTimeout(timer); signal.removeEventListener('abort', cancel); window.document.removeEventListener('visibilitychange', visibility)
        if (failure) reject(failure); else resolve(new Blob(chunks, { type: mimeType }))
      }
      recorder.start(1000); started = performance.now()
      signal.addEventListener('abort', cancel, { once: true }); window.document.addEventListener('visibilitychange', visibility)
      const tick = () => {
        try {
          const time = Math.min(document.settings.duration, (performance.now() - started) / 1000)
          render(time); progress(time / document.settings.duration)
          if (time >= document.settings.duration) stop()
          else timer = window.setTimeout(tick, 1000 / options.fps)
        } catch (error) { failure = error; stop() }
      }
      tick()
    })
  } finally {
    stream?.getTracks().forEach(track => track.stop()); built.dispose(); renderer.dispose(); renderer.forceContextLoss()
  }
}
