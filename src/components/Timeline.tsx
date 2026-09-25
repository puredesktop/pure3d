import {
  ToolbarControl,
  SidebarSectionLabel,
} from '@purescience/platform-ui/components/common/containers/AppChrome'
import { Camera, Play, Pause, SkipBack, Repeat2, Diamond, Trash2 } from 'lucide-react'
import { Choice, NumberField, Slider } from './Controls'
import { pose } from '../lib/scene'
import type { SceneStore } from '../lib/SceneStore'
import { useSceneState } from '../hooks/useSceneState'
import { CameraTimeline } from './CameraTimeline'

const TIMELINE_STATE = ['scene', 'selectedId', 'time', 'playing', 'loop', 'cameraPreview'] as const

export function Timeline({
  store,
  run,
}: {
  store: SceneStore
  run: (action: () => unknown) => void
}) {
  const state = useSceneState(store, TIMELINE_STATE)
  const object = state.scene.objects.find(o => o.id === state.selectedId)
  const fps = state.scene.settings.fps
  const frame = Math.round(state.time * fps) / fps
  const keys = state.scene.keyframes.filter(
    k => k.objectId === state.selectedId,
  )
  const edit = (ops: unknown[]) => run(() => store.edit(ops))
  return (
    <section className="timeline" aria-label="Animation timeline">
      <div className="timeline-tools">
        <SidebarSectionLabel>Animation</SidebarSectionLabel>
        <div className="timeline-transport">
          <ToolbarControl
            aria-label="Rewind"
            onClick={() => store.workspace({ time: 0, playing: false })}
          >
            <SkipBack size={14} />
          </ToolbarControl>
          <ToolbarControl
            aria-label={state.playing ? 'Pause' : 'Play'}
            onClick={() => store.workspace({ playing: !state.playing })}
          >
            {state.playing ? <Pause size={14} /> : <Play size={14} />}
          </ToolbarControl>
          <ToolbarControl
            aria-label="Follow camera"
            title={state.cameraPreview ? 'Stop following camera' : 'Follow camera'}
            aria-pressed={state.cameraPreview}
            onClick={() => store.workspace({ cameraPreview: !state.cameraPreview })}
          >
            <Camera size={15} />
          </ToolbarControl>
          <ToolbarControl
            aria-label="Loop animation"
            aria-pressed={state.loop}
            onClick={() => store.workspace({ loop: !state.loop })}
          >
            <Repeat2 size={15} />
          </ToolbarControl>
          <NumberField
            label="Time"
            inline
            unit="s"
            value={state.time}
            step={1 / fps}
            min={0}
            max={state.scene.settings.duration}
            onChange={time => store.workspace({ time, playing: false })}
          />
        </div>
        <div className="timeline-settings">
          <NumberField
            label="Duration"
            inline
            unit="s"
            value={state.scene.settings.duration}
            min={0.1}
            max={3600}
            onChange={duration =>
              edit([{ op: 'settings', settings: { duration } }])
            }
          />
          <NumberField
            label="FPS"
            inline
            value={fps}
            min={1}
            max={120}
            step={1}
            onChange={n => edit([{ op: 'settings', settings: { fps: n } }])}
          />
        </div>
      </div>
      <div className="scrubber">
        <span>0s</span>
        <Slider
          label="Playhead"
          min={0}
          max={state.scene.settings.duration}
          step={1 / fps}
          value={state.time}
          onChange={time => store.workspace({ time, playing: false })}
        />
        <span>{state.scene.settings.duration}s</span>
      </div>
      <div className="timeline-lanes">
        <CameraTimeline store={store} run={run} />
        {(['position', 'rotation', 'scale'] as const).map(property => {
          const current = keys.find(
            k =>
              k.property === property &&
              Math.abs(k.time - state.time) < 0.000001,
          )
          return (
            <div key={property} className="timeline-lane">
              <span className="lane-label">{property}</span>
              <ToolbarControl
                aria-label={`Add ${property} keyframe`}
                disabled={!object}
                onClick={() =>
                  object &&
                  edit([
                    {
                      op: 'keyframe',
                      keyframe: {
                        objectId: object.id,
                        property,
                        time: Math.min(frame, state.scene.settings.duration),
                        value: pose(state.scene, object, state.time)[property],
                        easing: 'linear',
                      },
                    },
                  ])
                }
              >
                <Diamond size={12} />
              </ToolbarControl>
              <div
                className="key-track"
                style={
                  {
                    '--playhead': `${
                      (state.time / state.scene.settings.duration) * 100
                    }%`,
                  } as React.CSSProperties
                }
              >
                {keys
                  .filter(k => k.property === property)
                  .map(k => (
                    <button
                      className="keyframe"
                      aria-label={`${property} keyframe at ${k.time}s`}
                      title={`${k.time.toFixed(2)}s · ${k.easing}`}
                      key={k.time}
                      style={{
                        left: `${
                          (k.time / state.scene.settings.duration) * 100
                        }%`,
                      }}
                      aria-pressed={current === k}
                      onClick={() =>
                        store.workspace({ time: k.time, playing: false })
                      }
                    >
                      <Diamond size={12} fill="currentColor" />
                    </button>
                  ))}
              </div>
              <Choice
                disabled={!current}
                label={current?.easing ?? 'linear'}
                options={['linear', 'smooth', 'step'].map(value => ({
                  value,
                  label: value,
                }))}
                onChange={easing =>
                  current &&
                  edit([{ op: 'keyframe', keyframe: { ...current, easing } }])
                }
              />
              <ToolbarControl
                aria-label={`Remove ${property} keyframe`}
                disabled={!current}
                onClick={() =>
                  current &&
                  edit([
                    {
                      op: 'removeKeyframe',
                      objectId: current.objectId,
                      property,
                      time: current.time,
                    },
                  ])
                }
              >
                <Trash2 size={12} />
              </ToolbarControl>
            </div>
          )
        })}
      </div>
      {!object && (
        <p className="timeline-hint">
          Select an object, move the playhead, and add transform keyframes.
        </p>
      )}
    </section>
  )
}
