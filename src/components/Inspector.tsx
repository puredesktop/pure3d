import {
  ToolbarControl,
  SidebarSectionLabel,
} from '@purescience/platform-ui/components/common/containers/AppChrome'
import { Copy, Trash2, X, Diamond, Eye, EyeOff } from 'lucide-react'
import { Choice, NumberField, ColorField } from './Controls'
import { TextField } from '@purescience/platform-ui/components/common/inputs/TextField'
import { ToggleSwitch } from '@purescience/platform-ui/components/common/inputs/ToggleSwitch'
import { useSyncExternalStore } from 'react'
import { descendants, pose, transformOperations } from '../lib/scene'
import { MeshInspector } from './MeshInspector'
import { MaterialInspector } from './MaterialInspector'
import type { SceneStore, WorkspaceState } from '../lib/SceneStore'
import type { SceneObject, Vec3, Operation } from '../types'
import { useSceneState } from '../hooks/useSceneState'

const INSPECTOR_STATE = ['scene', 'selectedId', 'selectedVertex', 'time'] as const

export function Inspector({
  store,
  run,
}: {
  store: SceneStore
  run: (action: () => unknown) => void
}) {
  const state = useSceneState(store, INSPECTOR_STATE)
  const object = state.scene.objects.find(o => o.id === state.selectedId)
  const camera = useSyncExternalStore(
    store.subscribeCamera,
    store.getCameraSnapshot,
  )
  const edit = (ops: Operation[]) => run(() => store.edit(ops))
  return (
    <aside className="inspector">
      <div className="panel-heading">
        <SidebarSectionLabel>{object ? 'Object' : 'Scene'}</SidebarSectionLabel>
        <ToolbarControl
          aria-label="Close inspector"
          onClick={() => store.workspace({ inspector: false })}
        >
          <X size={14} />
        </ToolbarControl>
      </div>
      {object ? (
        <ObjectInspector
          key={object.id}
          object={object}
          state={state}
          store={store}
          edit={edit}
          run={run}
        />
      ) : (
        <>
          <p className="muted">
            Select an object to edit its geometry and material.
          </p>
          <ColorField
            label="Background"
            value={state.scene.settings.background}
            onChange={background =>
              edit([{ op: 'settings', settings: { background } }])
            }
          />
          <ToggleSwitch
            className="toggle-setting"
            label="Ground grid"
            aria-label="Ground grid"
            checked={state.scene.settings.grid}
            onChange={grid => edit([{ op: 'settings', settings: { grid } }])}
          />
          <SidebarSectionLabel>Camera</SidebarSectionLabel>
          {(['position', 'target'] as const).map(property => (
            <div key={property}>
              <p className="field-label">{property}</p>
              <div className="vector-fields">
                {['X', 'Y', 'Z'].map((axis, i) => (
                  <NumberField
                    key={axis}
                    label={`Camera ${property} ${axis}`}
                    displayLabel={axis}
                    inline
                    value={camera[property][i]}
                    onChange={n => {
                      const vector = [...camera[property]] as Vec3
                      vector[i] = n
                      store.setCamera({ ...camera, [property]: vector })
                      store.persistCamera()
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </aside>
  )
}
function ObjectInspector({
  object,
  state,
  store,
  edit,
  run,
}: {
  object: SceneObject
  state: WorkspaceState
  store: SceneStore
  edit: (ops: Operation[]) => void
  run: (action: () => unknown) => void
}) {
  const transform = pose(state.scene, object, state.time)
  const excluded = descendants(state.scene, object.id)
  const update = (patch: Extract<Operation, { op: 'update' }>['patch']) =>
    edit([{ op: 'update', id: object.id, patch }])
  return (
    <>
      <TextField
        variant="compact"
        className="object-name"
        aria-label="Object name"
        key={object.name}
        defaultValue={object.name}
        onBlur={e => {
          if (e.target.value.trim() && e.target.value !== object.name)
            update({ name: e.target.value.trim() })
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
      <div className="row">
        <span className="muted">{object.kind}</span>
        <span className="spacer" />
        <ToolbarControl
          title="Duplicate object"
          aria-label="Duplicate object"
          onClick={() =>
            edit([
              { op: 'duplicate', id: object.id, newId: crypto.randomUUID() },
            ])
          }
        >
          <Copy size={14} />
        </ToolbarControl>
        <ToolbarControl
          aria-label={object.visible ? 'Hide object' : 'Show object'}
          onClick={() => update({ visible: !object.visible })}
        >
          {object.visible ? <Eye size={14} /> : <EyeOff size={14} />}
        </ToolbarControl>
        <ToolbarControl
          aria-label="Delete object"
          onClick={() => edit([{ op: 'delete', id: object.id }])}
        >
          <Trash2 size={14} />
        </ToolbarControl>
      </div>
      <Choice
        label={`Parent: ${
          state.scene.objects.find(o => o.id === object.parentId)?.name ??
          'Scene'
        }`}
        options={[
          { value: '', label: 'Scene root' },
          ...state.scene.objects
            .filter(o => !excluded.has(o.id))
            .map(o => ({ value: o.id, label: o.name })),
        ]}
        onChange={id => update({ parentId: id || null })}
      />
      <SidebarSectionLabel>Transform</SidebarSectionLabel>
      {(['position', 'rotation', 'scale'] as const).map(property => (
        <div key={property} className="transform-group">
          <div className="row">
            <span className="field-label">{property}</span>
            <span className="transform-unit">
              {property === 'position'
                ? 'm'
                : property === 'rotation'
                ? '°'
                : '×'}
            </span>
            <span className="spacer" />
            <ToolbarControl
              aria-label={`Key ${property}`}
              title={`Key ${property} at ${state.time.toFixed(2)}s`}
              onClick={() =>
                edit([
                  {
                    op: 'keyframe',
                    keyframe: {
                      objectId: object.id,
                      property,
                      time: Math.min(
                        Math.round(state.time * state.scene.settings.fps) /
                          state.scene.settings.fps,
                        state.scene.settings.duration,
                      ),
                      value: transform[property],
                      easing: 'linear',
                    },
                  },
                ])
              }
            >
              <Diamond size={12} />
            </ToolbarControl>
          </div>
          <div className="vector-fields">
            {['X', 'Y', 'Z'].map((axis, i) => (
              <NumberField
                key={axis}
                label={`${property} ${axis}`}
                displayLabel={axis}
                inline
                value={
                  property === 'rotation'
                    ? (transform[property][i] * 180) / Math.PI
                    : transform[property][i]
                }
                step={property === 'rotation' ? 5 : 0.1}
                min={property === 'scale' ? 0.0001 : undefined}
                onChange={n => {
                  const value = [...transform[property]] as Vec3
                  value[i] = property === 'rotation' ? (n * Math.PI) / 180 : n
                  edit(
                    transformOperations(
                      state.scene,
                      object.id,
                      { [property]: value },
                      state.time,
                    ),
                  )
                }}
              />
            ))}
          </div>
        </div>
      ))}
      {object.kind !== 'group' && (
        <>
          <MeshInspector
            object={object}
            store={store}
            state={state}
            run={run}
          />
        </>
      )}
      <MaterialInspector object={object} store={store} run={run} />
    </>
  )
}
