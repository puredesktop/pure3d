import {
  useCallback,
  useEffect,
  memo,
  useRef,
  useState,
} from 'react'
import {
  EditorToolbar,
  ToolbarControl,
  SidebarRow,
  SidebarSectionLabel,
} from '@purescience/platform-ui/components/common/containers/AppChrome'
import { AppFrame } from '@purescience/platform-bridge/components/AppFrame'
import { PureAppWordmark } from '@purescience/platform-ui/components/chrome/PureAppWordmark'
import { useDocumentHotkeys } from '@purescience/platform-ui/bridge/react/useDocumentHotkeys'
import { TextField } from '@purescience/platform-ui/components/common/inputs/TextField'
import {
  DocumentHeaderActions,
  DocumentSwitcher,
} from '@purescience/platform-ui/components/common/documents'
import type { DocumentSwitcherActionRequest } from '@purescience/platform-ui/components/common/documents/DocumentSwitcher'
import {
  duplicatePlatformDocument,
  promotePlatformDocument,
  renamePlatformDocument,
} from '@purescience/platform-ui/bridge/documents'
import { deletePlatformFile } from '@purescience/platform-ui/bridge/fs'
import {
  Box,
  Circle,
  Cylinder,
  Triangle,
  Donut,
  Square,
  Folder,
  Plus,
  Undo2,
  Redo2,
  Move,
  Rotate3D,
  Scaling,
  Scan,
  SlidersHorizontal,
  EyeOff,
  X,
  FilePlus2,
  MousePointer2,
  RefreshCw,
  Waypoints,
} from 'lucide-react'
import { Choice } from './Controls'
import { Inspector } from './Inspector'
import { Timeline } from './Timeline'
import { VideoExport } from './VideoExport'
import { SceneViewport, type ViewportAPI } from './SceneViewport'
import type { SceneStore } from '../lib/SceneStore'
import { useSceneState } from '../hooks/useSceneState'
import { emptyScene, makeObject, parseScene } from '../lib/scene'
import { importModel } from '../lib/importModel'
import {
  importWorkspaceModel,
  exportWorkspaceModel,
  produceExport,
  toggleVertexEditing,
  type ExportFormat,
} from '../lib/workflows'
import {
  isStandaloneDevMode,
  updateCurrentWorkspaceTab,
  openPlatformFileDialog,
  savePlatformFolderDialog,
  download,
} from '../bridge/platformBridge'
import { createToolHandlers, useAppAgentTools } from '../hooks/useAppAgentTools'
import { useSceneDocument } from '../hooks/useSceneDocument'
import type { ResourceOpenEvent } from '@purescience/platform-ui/bridge/types'
import type { SceneObject } from '../types'

const SHAPES = [
  'box',
  'sphere',
  'cylinder',
  'cone',
  'torus',
  'plane',
  'group',
] as const
const SCENE_SUFFIXES = ['.pure3d']
const WORKSPACE_STATE = [
  'scene',
  'history',
  'selectedId',
  'selectedVertex',
  'mode',
  'inspector',
  'cameraPreview',
] as const
const OUTLINE_STATE = ['scene', 'selectedId'] as const
const icons = {
  box: Box,
  sphere: Circle,
  cylinder: Cylinder,
  cone: Triangle,
  torus: Donut,
  plane: Square,
  group: Folder,
  mesh: Triangle,
}
const basename = (title: string) =>
  title
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/[. ]+$/g, '')
    .trim() || 'Scene'

export function Workspace({
  store,
  ready,
  resource,
  clearResource,
}: {
  store: SceneStore
  ready: boolean
  resource: ResourceOpenEvent | null
  clearResource: () => void
}) {
  const state = useSceneState(store, WORKSPACE_STATE)
  const viewport = useRef<ViewportAPI | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const standalone = isStandaloneDevMode()
  const document = useSceneDocument(store, ready)
  const {
    doc,
    open: openScene,
    create: createScene,
    save: saveScene,
    lifecycle,
  } = document
  useAppAgentTools(
    ready,
    createToolHandlers(store, document, viewport, resource),
  )
  const onError = useCallback(
    (e: unknown) => setMessage(e instanceof Error ? e.message : String(e)),
    [],
  )
  const run = useCallback(
    (action: () => unknown) => {
      setMessage('')
      try {
        Promise.resolve(action()).catch(onError)
      } catch (e) {
        onError(e)
      }
    },
    [onError],
  )
  const add = (kind: SceneObject['kind']) =>
    run(() => {
      const object = makeObject(kind)
      object.name = kind[0].toUpperCase() + kind.slice(1)
      store.edit([{ op: 'add', object }])
      store.workspace({ selectedId: object.id })
    })
  const openPath = useCallback(
    async (path: string) => {
      if (path.toLowerCase().endsWith('.pure3d')) await openScene(path)
      else await importWorkspaceModel(store, path)
    },
    [openScene, store],
  )
  const open = () =>
    run(async () => {
      if (standalone) fileInput.current?.click()
      else {
        const path = await openPlatformFileDialog()
        if (path) await openPath(path)
      }
    })
  const saveAs = () =>
    run(async () => {
      const current = store.getSnapshot()
      if (standalone) {
        download(
          JSON.stringify(current.scene, null, 2),
          `${basename(current.scene.title)}.pure3d`,
          'application/json',
        )
      } else {
        const folder = await savePlatformFolderDialog()
        if (folder) {
          await saveScene(`${folder}/${basename(current.scene.title)}.pure3d`)
        }
      }
    })
  const exportFile = (format: ExportFormat) =>
    run(async () => {
      const current = store.getSnapshot()
      const name = `${basename(current.scene.title)}.${format}`
      let folder: string | null = null
      if (!standalone) {
        folder = await savePlatformFolderDialog()
        if (!folder) return
      }
      if (folder)
        await exportWorkspaceModel(
          store,
          `${folder}/${name}`,
          format,
          viewport.current,
        )
      else {
        const result = await produceExport(current, format, viewport.current)
        download(result.data, name, result.mimeType)
      }
    })
  useEffect(() => {
    if (window.innerWidth < 1000) store.workspace({ inspector: false })
  }, [store])
  useEffect(() => {
    if (!ready || !doc.path) return
    let cancelled = false
    void updateCurrentWorkspaceTab({
      title: state.scene.title,
      resource: { path: doc.path },
    })
      .then(result => {
        if (!result.updated)
          throw new Error('The workspace tab could not be bound to this scene')
      })
      .catch(error => {
        if (!cancelled) onError(error)
      })
    return () => {
      cancelled = true
    }
  }, [ready, doc.path, state.scene.title, onError])
  useEffect(() => {
    if (resource) {
      void openPath(resource.path).catch(onError).finally(clearResource)
    }
  }, [resource, clearResource, openPath, onError])
  useEffect(() => {
    const hotkey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('[role="dialog"]')) return
      const editing =
        event.target instanceof HTMLElement &&
        (event.target.matches('input, textarea') ||
          event.target.isContentEditable)
      const command = event.ctrlKey || event.metaKey
      if (editing) return
      const current = store.getSnapshot()
      if (command && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        run(() => store.history(event.shiftKey ? 'redo' : 'undo'))
      } else if (event.code === 'Space') {
        event.preventDefault()
        store.workspace({ playing: !current.playing })
      } else if (event.key.toLowerCase() === 'f') viewport.current?.frame()
      else if (event.key.toLowerCase() === 'w')
        store.workspace({ mode: 'translate' })
      else if (event.key.toLowerCase() === 'e')
        store.workspace({ mode: 'rotate' })
      else if (event.key.toLowerCase() === 'r')
        store.workspace({ mode: 'scale' })
      else if (event.key === 'Delete' && current.selectedId)
        run(() => store.edit([{ op: 'delete', id: current.selectedId }]))
    }
    window.addEventListener('keydown', hotkey)
    return () => window.removeEventListener('keydown', hotkey)
  }, [run, store])
  const newScene = () =>
    run(async () => {
      setSwitcherOpen(false)
      if (standalone) {
        lifecycle.reset()
        store.replace(emptyScene())
      } else await createScene()
    })
  useDocumentHotkeys({
    onSave: () => (standalone ? saveAs() : run(() => saveScene())),
    onNew: newScene,
    onOpen: () => (standalone ? open() : setSwitcherOpen(true)),
  })
  const documentAction = async (request: DocumentSwitcherActionRequest) => {
    const { action, item, title, targetDir, suffix } = request
    const bound = item.path === doc.path
    if (bound) await lifecycle.flush({ throwOnError: true })
    if (action === 'duplicate') {
      await duplicatePlatformDocument({ path: item.path, suffix })
    } else if (action === 'rename') {
      if (bound) await lifecycle.rename(title!)
      else
        await renamePlatformDocument({
          path: item.path,
          title: title!,
          suffix,
          appSlug: '3d',
        })
    } else if (action === 'move') {
      if (bound) await lifecycle.promote(doc.title, targetDir)
      else
        await promotePlatformDocument({
          path: item.path,
          title: item.name,
          targetDir,
          suffix,
          appSlug: '3d',
        })
    } else {
      // Detach before deleting so autosave cannot recreate the deleted file.
      if (bound) lifecycle.reset()
      try {
        await deletePlatformFile(item.path)
        if (bound) store.replace(emptyScene())
      } catch (error) {
        if (bound) lifecycle.adopt(item.path)
        throw error
      }
    }
  }
  const fileActions = (
    <Choice
      label="File"
      options={[
        { value: 'new', label: 'New scene' },
        ...(!standalone ? [{ value: 'browse', label: 'Browse scenes…' }] : []),
        { value: 'open', label: 'Choose file / import model…' },
        { value: 'saveAs', label: 'Save scene as…' },
        { value: 'glb', label: 'Export animated GLB…' },
        { value: 'obj', label: 'Export OBJ of current pose…' },
        { value: 'stl', label: 'Export STL of current pose…' },
        { value: 'png', label: 'Export viewport PNG…' },
      ]}
      onChange={action => {
        if (action === 'new') newScene()
        else if (action === 'browse') setSwitcherOpen(true)
        else if (action === 'open') open()
        else if (action === 'saveAs') saveAs()
        else exportFile(action as 'glb' | 'obj' | 'stl' | 'png')
      }}
    />
  )
  return (
    <AppFrame
      identityAppSlug="3d"
      headerDocumentName={state.scene.title.trim() || doc.path?.replace(/\\/g, '/').split('/').pop()}
      headerActions={
        <>
          <DocumentHeaderActions onOpenSwitcher={() => setSwitcherOpen(true)} />
          {fileActions}
        </>
      }
    >
      {standalone && (
        <div className="standalone-header">
          <PureAppWordmark appName="3D" size="sm" accentName />
          {fileActions}
          <span className="spacer" />
          <span className="muted">Standalone preview</span>
        </div>
      )}
      <div className="scene-titlebar">
        <TextField
          variant="compact"
          className="scene-title"
          aria-label="Scene title"
          key={state.scene.title}
          defaultValue={state.scene.title}
          onBlur={e => {
            const title = e.target.value.trim()
            if (title && title !== state.scene.title)
              run(() => store.edit([{ op: 'settings', title }]))
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
        <span className="save-status" role="status">
          {standalone
            ? 'Download to save'
            : doc.error
            ? 'Save failed'
            : doc.saving
            ? 'Saving…'
            : doc.savedAt || doc.path
            ? 'Saved'
            : 'Autosave on edit'}
        </span>
      </div>
      <EditorToolbar className="scene-toolbar">
        <Choice
          label="Add object"
          options={SHAPES.map(value => ({
            value,
            label: value[0].toUpperCase() + value.slice(1),
          }))}
          onChange={kind => add(kind as SceneObject['kind'])}
        />
        <ToolbarControl
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          disabled={!state.canUndo}
          onClick={() => run(() => store.history('undo'))}
        >
          <Undo2 size={15} />
        </ToolbarControl>
        <ToolbarControl
          aria-label="Redo"
          title="Redo (Ctrl+Shift+Z)"
          disabled={!state.canRedo}
          onClick={() => run(() => store.history('redo'))}
        >
          <Redo2 size={15} />
        </ToolbarControl>
        <span className="toolbar-separator" />
        <ToolbarControl
          aria-label="Edit vertices"
          title="Edit vertices"
          aria-pressed={state.selectedVertex !== null}
          disabled={
            !state.selectedId ||
            state.scene.objects.find(o => o.id === state.selectedId)?.kind ===
              'group'
          }
          onClick={() => run(() => toggleVertexEditing(store))}
        >
          <Waypoints size={15} />
        </ToolbarControl>
        {(
          [
            { mode: 'translate', icon: Move, label: 'Move (W)' },
            { mode: 'rotate', icon: Rotate3D, label: 'Rotate (E)' },
            { mode: 'scale', icon: Scaling, label: 'Scale (R)' },
          ] as const
        ).map(({ mode, icon: Icon, label }) => (
          <ToolbarControl
            key={mode}
            title={label}
            aria-label={label}
            aria-pressed={state.mode === mode}
            onClick={() => store.workspace({ mode })}
          >
            <Icon size={15} />
          </ToolbarControl>
        ))}
        <ToolbarControl
          aria-label="Frame selection"
          title="Frame selection (F)"
          onClick={() => viewport.current?.frame()}
        >
          <Scan size={15} />
        </ToolbarControl>
        <span className="spacer" />
        <div className="compact-selection">
          <Choice
            label={
              state.scene.objects.find(o => o.id === state.selectedId)?.name ??
              'Select object'
            }
            options={state.scene.objects.map(o => ({
              value: o.id,
              label: o.name,
            }))}
            onChange={selectedId => store.workspace({ selectedId })}
          />
        </div>
        <VideoExport store={store} />
        <ToolbarControl
          aria-label="Toggle inspector"
          aria-pressed={state.inspector}
          onClick={() => store.workspace({ inspector: !state.inspector })}
        >
          <SlidersHorizontal size={15} />
        </ToolbarControl>
      </EditorToolbar>
      {(doc.error || message) && (
        <div className="error-banner" role="alert">
          <span>{doc.error || message}</span>
          <ToolbarControl
            aria-label={doc.error ? 'Retry save' : 'Dismiss error'}
            onClick={() =>
              doc.error ? run(() => saveScene()) : setMessage('')
            }
          >
            {doc.error ? <RefreshCw size={14} /> : <X size={14} />}
          </ToolbarControl>
        </div>
      )}
      <div className="scene-body">
        <aside className="outline">
          <div className="panel-heading">
            <SidebarSectionLabel>Scene objects</SidebarSectionLabel>
            <span className="muted">{state.scene.objects.length}</span>
          </div>
          {state.scene.objects.length ? (
            <div className="object-list">
              <OutlineRows store={store} />
            </div>
          ) : (
            <div className="outline-empty">
              <Box size={22} />
              <p>No objects yet</p>
              <span>Add a shape to begin.</span>
            </div>
          )}
          <div className="outline-footer">
            <MousePointer2 size={12} />
            <span>Click to select · drag to orbit</span>
          </div>
        </aside>
        <div className="viewport-slot">
          <SceneViewport store={store} api={viewport} onError={onError} />
          {!state.scene.objects.length && (
            <div className="empty-scene">
              <div className="empty-mark">
                <Box size={32} strokeWidth={1} />
              </div>
              <h2>Your scene starts here</h2>
              <p>
                Build a model from shapes.
                <br />
                Bring it to life with keyframes.
              </p>
              <ToolbarControl onClick={() => add('box')}>
                <Plus size={14} />
                Add your first object
              </ToolbarControl>
              <ToolbarControl onClick={open}>
                <FilePlus2 size={13} />
                Import a model
              </ToolbarControl>
            </div>
          )}
          <div className="viewport-caption">
            <span>
              {state.cameraPreview ? 'Following camera' :
                state.scene.objects.find(o => o.id === state.selectedId)?.name ?? 'Perspective'}
            </span>
            <span>
              {state.selectedVertex !== null
                ? `Vertex ${state.selectedVertex} · click to select · drag arrows to move`
                : 'W move · E rotate · R scale · F frame'}
            </span>
          </div>
        </div>
        {state.inspector && <Inspector store={store} run={run} />}
      </div>
      <Timeline store={store} run={run} />
      <input
        ref={fileInput}
        hidden
        type="file"
        accept=".pure3d,.obj,.stl,.glb"
        aria-label="Import local file"
        onChange={e => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          run(async () => {
            const extension = file.name.split('.').pop()!.toLowerCase()
            if (extension === 'pure3d') {
              const scene = parseScene(JSON.parse(await file.text()))
              await lifecycle.flush({ throwOnError: true })
              lifecycle.reset()
              store.replace(scene)
              if (ready) lifecycle.markDirty()
            } else {
              const objects = await importModel(
                extension === 'obj'
                  ? await file.text()
                  : await file.arrayBuffer(),
                extension,
                file.name,
              )
              store.edit([
                ...objects.textureAssets.map(asset => ({
                  op: 'addTextureAsset' as const,
                  asset,
                })),
                ...objects.map(object => ({ op: 'add' as const, object })),
              ])
              store.workspace({ selectedId: objects[0].id })
            }
          })
        }}
      />
      {!standalone && (
        <DocumentSwitcher
          appSlug="3d"
          suffixes={SCENE_SUFFIXES}
          open={switcherOpen}
          variant="modal"
          itemNoun="scene"
          newLabel="New scene"
          previewStyle="none"
          onClose={() => setSwitcherOpen(false)}
          onOpenDocument={async path => {
            await openScene(path)
            setSwitcherOpen(false)
          }}
          onCreateNew={newScene}
          onImportFile={open}
          performAction={documentAction}
        />
      )}
    </AppFrame>
  )
}

const OutlineRows = memo(function OutlineRows({ store }: { store: SceneStore }) {
  const state = useSceneState(store, OUTLINE_STATE)
  const renderObjects = (parentId: string | null, depth = 0): React.ReactNode =>
    state.scene.objects
      .filter(object => object.parentId === parentId)
      .map(object => {
        const Icon = icons[object.kind]
        return (
          <div key={object.id}>
            <SidebarRow
              className="object-row"
              aria-current={state.selectedId === object.id ? 'true' : undefined}
              style={{ paddingLeft: 12 + depth * 14 }}
              onClick={() => store.workspace({ selectedId: object.id })}
            >
              <Icon size={14} />
              <span>{object.name}</span>
              {!object.visible && <EyeOff size={12} />}
            </SidebarRow>
            {renderObjects(object.id, depth + 1)}
          </div>
        )
      })
  return <>{renderObjects(null)}</>
})
