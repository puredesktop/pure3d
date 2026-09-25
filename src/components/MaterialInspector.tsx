import { useRef, useState } from 'react'
import {
  ToolbarControl,
  SidebarSectionLabel,
} from '@purescience/platform-ui/components/common/containers/AppChrome'
import { ToggleSwitch } from '@purescience/platform-ui/components/common/inputs/ToggleSwitch'
import { ImagePlus, Layers, Trash2 } from 'lucide-react'
import { Choice, ColorField, NumberField } from './Controls'
import { applyImageTexture, importWorkspaceTexture } from '../lib/workflows'
import {
  isStandaloneDevMode,
  openPlatformImageDialog,
  bytesToBase64,
} from '../bridge/platformBridge'
import type { SceneStore } from '../lib/SceneStore'
import type { SceneObject, Operation } from '../types'
import { resolveMaterial } from '../lib/scene'

const wrapOptions = [
  { value: 'repeat', label: 'Repeat' },
  { value: 'clamp', label: 'Clamp' },
  { value: 'mirror', label: 'Mirror' },
]

function inheritedSource(
  scene: ReturnType<SceneStore['getSnapshot']>['scene'],
  object: SceneObject,
  property: keyof SceneObject['material'],
) {
  let current = object.parentId
    ? scene.objects.find(candidate => candidate.id === object.parentId)
    : undefined
  while (current) {
    if (current.material[property] !== undefined) return current
    current = current.parentId
      ? scene.objects.find(candidate => candidate.id === current!.parentId)
      : undefined
  }
  return undefined
}

export function MaterialInspector({
  object,
  store,
  run,
}: {
  object: SceneObject
  store: SceneStore
  run: (action: () => unknown) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const scene = store.getSnapshot().scene
  const material = resolveMaterial(scene, object)
  const texture = material.texture
  const asset = texture
    ? scene.textureAssets.find(item => item.id === texture.assetId)
    : undefined
  const hasLocalMaterial = Object.keys(object.material).length > 0
  const hasLocalTexture = object.material.texture !== undefined
  const materialInheritedFrom = inheritedSource(scene, object, 'color')
  const textureInheritedFrom = inheritedSource(scene, object, 'texture')
  const update = (
    material: NonNullable<
      Extract<Operation, { op: 'update' }>['patch']['material']
    >,
  ) =>
    run(() =>
      store.edit([{ op: 'update', id: object.id, patch: { material } }]),
    )
  const pick = () =>
    run(async () => {
      if (isStandaloneDevMode()) input.current?.click()
      else {
        const path = await openPlatformImageDialog()
        if (path) {
          await importWorkspaceTexture(store, object.id, path)
        }
      }
    })
  const createOverride = () =>
    update({
      color: material.color,
      metalness: material.metalness,
      roughness: material.roughness,
      opacity: material.opacity,
      wireframe: material.wireframe,
      ...(texture ? { texture } : {}),
    })
  const setTexture = (assetId: string) => {
    update({ texture: { assetId } })
    setLibraryOpen(false)
  }
  const updateTexture = (
    binding: NonNullable<SceneObject['material']['texture']>,
  ) => update({ texture: binding })
  return (
    <>
      <SidebarSectionLabel>Material</SidebarSectionLabel>
      <div className="material-state" aria-live="polite">
        <Layers size={13} />
        <span>
          {hasLocalMaterial
            ? 'Local material override'
            : materialInheritedFrom
            ? `Inherited from ${materialInheritedFrom.name}`
            : 'Default material'}
        </span>
        <span className="spacer" />
        {hasLocalMaterial ? (
          <ToolbarControl
            title="Clear all local material and texture values"
            onClick={() =>
              run(() =>
                store.edit([{ op: 'clearMaterialOverride', id: object.id }]),
              )
            }
          >
            Clear override
          </ToolbarControl>
        ) : (
          <ToolbarControl title="Copy the resolved material into this object" onClick={createOverride}>
            Create override
          </ToolbarControl>
        )}
      </div>
      <ColorField
        label={texture ? 'Texture tint' : 'Base color'}
        value={material.color}
        onChange={color => update({ color })}
      />
      <div className="material-fields">
        {(['metalness', 'roughness', 'opacity'] as const).map(property => (
          <NumberField
            key={property}
            label={property}
            value={material[property]}
            min={0}
            max={1}
            step={0.05}
            onChange={n => update({ [property]: n })}
          />
        ))}
      </div>
      <ToggleSwitch
        className="toggle-setting"
        label="Wireframe"
        aria-label="Wireframe"
        checked={material.wireframe}
        onChange={wireframe => update({ wireframe })}
      />
      <div className="row texture-controls">
        {texture && (
          <img
            className="texture-preview"
            src={asset?.dataUrl}
            alt="Base-color texture"
          />
        )}
        <ToolbarControl
          aria-expanded={libraryOpen}
          onClick={() => setLibraryOpen(open => !open)}
        >
          <Layers size={14} />
          {texture ? 'Choose texture' : 'Texture library'}
        </ToolbarControl>
        <ToolbarControl onClick={pick}>
          <ImagePlus size={14} />
          Import new
        </ToolbarControl>
        {texture && (
          <ToolbarControl
            aria-label="Remove texture"
            onClick={() => update({ texture: null })}
          >
            <Trash2 size={14} />
          </ToolbarControl>
        )}
      </div>
      {libraryOpen && (
        <div className="texture-library" aria-label="Texture library">
          {scene.textureAssets.length ? (
            scene.textureAssets.map(libraryAsset => (
              <button
                key={libraryAsset.id}
                type="button"
                className="texture-library-item"
                aria-pressed={texture?.assetId === libraryAsset.id}
                title={`Use texture ${libraryAsset.id}`}
                onClick={() => setTexture(libraryAsset.id)}
              >
                <img src={libraryAsset.dataUrl} alt="" />
                <span>{libraryAsset.id.slice(0, 8)}</span>
              </button>
            ))
          ) : (
            <p className="muted">Import an image to start the texture library.</p>
          )}
        </div>
      )}
      <p className="texture-state">
        {hasLocalTexture
          ? texture
            ? 'Local texture binding'
            : 'Local texture cleared'
          : textureInheritedFrom
          ? `Texture inherited from ${textureInheritedFrom.name}`
          : 'No texture assigned'}
      </p>
      {texture && (
        <>
          <div className="texture-fields">
            {['U', 'V'].map((axis, i) => (
              <NumberField
                key={axis}
                label={`Tile ${axis}`}
                value={(texture.repeat ?? [1, 1])[i]}
                step={0.25}
                onChange={n => {
                  const repeat: [number, number] = [
                    ...(texture.repeat ?? [1, 1]),
                  ]
                  repeat[i] = n
                  updateTexture({ ...texture, repeat })
                }}
              />
            ))}
            {['U', 'V'].map((axis, i) => (
              <NumberField
                key={`offset-${axis}`}
                label={`Offset ${axis}`}
                value={(texture.offset ?? [0, 0])[i]}
                step={0.05}
                onChange={n => {
                  const offset: [number, number] = [
                    ...(texture.offset ?? [0, 0]),
                  ]
                  offset[i] = n
                  updateTexture({ ...texture, offset })
                }}
              />
            ))}
            <NumberField
              label="Rotation °"
              value={((texture.rotation ?? 0) * 180) / Math.PI}
              step={5}
              onChange={rotation =>
                updateTexture({ ...texture, rotation: (rotation * Math.PI) / 180 })
              }
            />
          </div>
          <div className="texture-wrap-controls">
            <Choice
              label={`Wrap U: ${(texture.wrapS ?? 'repeat').replace(/^./, letter => letter.toUpperCase())}`}
              options={wrapOptions}
              onChange={wrapS => updateTexture({ ...texture, wrapS: wrapS as 'repeat' | 'clamp' | 'mirror' })}
            />
            <Choice
              label={`Wrap V: ${(texture.wrapT ?? 'repeat').replace(/^./, letter => letter.toUpperCase())}`}
              options={wrapOptions}
              onChange={wrapT => updateTexture({ ...texture, wrapT: wrapT as 'repeat' | 'clamp' | 'mirror' })}
            />
          </div>
          <ToggleSwitch
            className="toggle-setting"
            label="Flip image vertically"
            aria-label="Flip image vertically"
            checked={texture.flipY ?? true}
            onChange={flipY => updateTexture({ ...texture, flipY })}
          />
          {object.kind !== 'group' && (
            <ToolbarControl
              title="Replace UVs with a box projection"
              onClick={() =>
                run(() => store.edit([{ op: 'unwrap', id: object.id }]))
              }
            >
              Box UV mapping
            </ToolbarControl>
          )}
        </>
      )}
      <input
        ref={input}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label="Import local texture"
        onChange={event => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file)
            run(async () => {
              if (file.size > 8 * 1024 * 1024)
                throw new Error('Texture images must be at most 8 MiB')
              const bytes = await file.arrayBuffer()
              await applyImageTexture(
                store,
                object.id,
                `data:${file.type};base64,${bytesToBase64(bytes)}`,
              )
            })
        }}
      />
    </>
  )
}
