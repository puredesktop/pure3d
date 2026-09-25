import { useState } from 'react'
import {
  ToolbarControl,
  SidebarSectionLabel,
} from '@purescience/platform-ui/components/common/containers/AppChrome'
import { TextAreaField } from '@purescience/platform-ui/components/common/inputs/TextAreaField'
import { MousePointer2, Waypoints, Grid2X2 } from 'lucide-react'
import { NumberField } from './Controls'
import { toggleVertexEditing } from '../lib/workflows'
import type { SceneStore, WorkspaceState } from '../lib/SceneStore'
import type { SceneObject, Vec3 } from '../types'

export function MeshInspector({
  object,
  store,
  state,
  run,
}: {
  object: SceneObject
  store: SceneStore
  state: WorkspaceState
  run: (action: () => unknown) => void
}) {
  const [topology, setTopology] = useState('')
  const geometry = object.geometry
  const vertex = state.selectedVertex
  return (
    <>
      <SidebarSectionLabel>Modeling</SidebarSectionLabel>
      <div className="row modeling-actions">
        <ToolbarControl
          aria-pressed={vertex !== null}
          onClick={() => run(() => toggleVertexEditing(store))}
        >
          {vertex === null ? (
            <Waypoints size={14} />
          ) : (
            <MousePointer2 size={14} />
          )}
          {vertex === null ? 'Edit vertices' : 'Object mode'}
        </ToolbarControl>
        <ToolbarControl
          title="Add vertices while preserving the shape"
          onClick={() =>
            run(() => store.edit([{ op: 'subdivide', id: object.id }]))
          }
        >
          <Grid2X2 size={14} /> Subdivide
        </ToolbarControl>
      </div>
      {geometry && (
        <p className="muted">
          {geometry.positions.length / 3} vertices ·{' '}
          {(geometry.indices?.length ?? geometry.positions.length / 3) / 3}{' '}
          triangles
        </p>
      )}
      {geometry && vertex !== null && (
        <>
          <p className="muted">
            Click a vertex in the viewport, then drag its arrows. Matching seam
            vertices move together.
          </p>
          <NumberField
            label="Vertex"
            value={vertex}
            min={0}
            max={geometry.positions.length / 3 - 1}
            step={1}
            onChange={n => store.workspace({ selectedVertex: Math.floor(n) })}
          />
          <div className="vector-fields">
            {['X', 'Y', 'Z'].map((axis, i) => (
              <NumberField
                key={axis}
                label={`Vertex ${axis}`}
                displayLabel={axis}
                inline
                value={geometry.positions[vertex * 3 + i]}
                onChange={n =>
                  run(() => {
                    const position = geometry.positions.slice(
                      vertex * 3,
                      vertex * 3 + 3,
                    ) as Vec3
                    position[i] = n
                    store.edit([
                      {
                        op: 'moveVertex',
                        id: object.id,
                        index: vertex,
                        position,
                      },
                    ])
                  })
                }
              />
            ))}
          </div>
          <details>
            <summary>Triangle indices</summary>
            <p className="muted">
              Triples of vertex indices. Empty uses vertices in triangle order.
            </p>
            <TextAreaField
              className="topology-input"
              aria-label="Triangle indices"
              placeholder={
                geometry.indices?.join(', ') ?? 'Unindexed triangles'
              }
              value={topology}
              onChange={e => setTopology(e.target.value)}
            />
            <ToolbarControl
              onClick={() =>
                run(() =>
                  store.edit([
                    {
                      op: 'mesh',
                      id: object.id,
                      geometry: {
                        ...geometry,
                        indices: topology.trim()
                          ? topology
                              .trim()
                              .split(/[\s,]+/)
                              .map(Number)
                          : null,
                      },
                    },
                  ]),
                )
              }
            >
              Apply topology
            </ToolbarControl>
          </details>
        </>
      )}
    </>
  )
}
