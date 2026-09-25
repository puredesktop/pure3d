import { useSyncExternalStore } from 'react'
import { Camera, Diamond, Trash2, Pencil } from 'lucide-react'
import { ToolbarControl } from '@purescience/platform-ui/components/common/containers/AppChrome'
import { Choice, NumberField } from './Controls'
import { useSceneState } from '../hooks/useSceneState'
import type { SceneStore } from '../lib/SceneStore'
import { cameraPose } from '../lib/cameraTrack'

export function CameraTimeline({ store, run }: { store: SceneStore; run: (fn: () => unknown) => void }) {
  const state = useSceneState(store, ['scene', 'time', 'cameraPreview', 'camera'])
  const time = Math.min(state.scene.settings.duration, Math.round(state.time * state.scene.settings.fps) / state.scene.settings.fps)
  const keys = state.scene.cameraKeys ?? [], current = keys.find(k => Math.abs(k.time - time) < 1e-6)
  const camera = useSyncExternalStore(store.subscribeCamera, store.getCameraSnapshot)
  return <div className="camera-track">
    <div className="timeline-tools">
      <ToolbarControl title="Camera preview" aria-label="Camera preview" aria-pressed={state.cameraPreview} onClick={() => store.workspace({ cameraPreview: !state.cameraPreview })}><Camera size={15} /></ToolbarControl>
      <span className="field-label">Camera</span>
      <ToolbarControl title="Keyframe current view" aria-label="Keyframe current view" disabled={state.cameraPreview} onClick={() => run(() => store.edit([{ op: 'cameraKeyframe', keyframe: { ...camera, fov: camera.fov ?? 45, time, easing: current?.easing ?? 'smooth' } }]))}><Diamond size={14} /></ToolbarControl>
      <ToolbarControl title="Edit shot at playhead" aria-label="Edit shot at playhead" disabled={!keys.length} onClick={() => {
        const shot = cameraPose(state.scene, state.time)
        store.workspace({ cameraPreview: false, playing: false })
        store.setCamera(shot)
      }}><Pencil size={14} /></ToolbarControl>
      <NumberField label="FOV" inline unit="°" disabled={state.cameraPreview} min={10} max={120} value={state.cameraPreview ? cameraPose(state.scene, state.time).fov : camera.fov ?? 45} onChange={fov => {
        if (!state.cameraPreview) { store.setCamera({ ...camera, fov }); store.persistCamera() }
      }} />
      <Choice label={current?.easing ?? 'smooth'} disabled={!current} options={['linear', 'smooth', 'step'].map(value => ({ value, label: value }))} onChange={easing => current && run(() => store.edit([{ op: 'cameraKeyframe', keyframe: { ...current, easing } }]))} />
      <ToolbarControl title="Remove camera keyframe" aria-label="Remove camera keyframe" disabled={!current} onClick={() => run(() => store.edit([{ op: 'removeCameraKeyframe', time }]))}><Trash2 size={14} /></ToolbarControl>
    </div>
    <div className="timeline-lane"><span className="lane-label">Shot</span><div className="key-track" style={{ '--playhead': `${state.time / state.scene.settings.duration * 100}%` } as React.CSSProperties}>
      {keys.map(k => <button key={k.time} className="keyframe" aria-label={`Camera keyframe at ${k.time}s`} aria-pressed={current === k} title={`${k.time}s · ${k.easing}`} style={{ left: `${k.time / state.scene.settings.duration * 100}%` }} onClick={() => store.workspace({ time: k.time, playing: false, cameraPreview: true })}><Diamond size={12} fill="currentColor" /></button>)}
    </div></div>
  </div>
}
