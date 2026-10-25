import {
  usePlatformAgentTools,
  type AgentToolHandler,
  type AgentToolHandlerResult,
} from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import type { z } from 'zod/v4'
import type { ResourceOpenEvent } from '@purescience/platform-ui/bridge/types'
import { toolDefinitions } from '../lib/schemas.mjs'
import type { SceneStore } from '../lib/SceneStore'
import type { SceneDocumentActions } from './useSceneDocument'
import type { ViewportAPI } from '../components/SceneViewport'
import {
  importWorkspaceModel,
  exportWorkspaceModel,
  importWorkspaceTexture,
  generateObjectTexture,
  applyTextureReference,
  patchTextureReferences,
} from '../lib/workflows'
import {
  cameraReply,
  cappedIds,
  changesReply,
  diffScenes,
  historyEntries,
  isEmptyQuery,
  queryScene,
  sceneHeader,
  sceneOutline,
  workspaceState,
} from '../lib/toolReplies'
import type { SceneDocument } from '../types'

type ToolName = keyof typeof toolDefinitions
type ToolArgs<N extends ToolName> = z.infer<
  (typeof toolDefinitions)[N]['schema']
>
export const TOOL_NAMES = Object.keys(toolDefinitions)
export function createToolHandlers(
  store: SceneStore,
  document: SceneDocumentActions,
  viewport: React.MutableRefObject<ViewportAPI | null>,
  resource: ResourceOpenEvent | null = null,
): Record<ToolName, AgentToolHandler> {
  // Navigation settles into the document camera without a scene edit, so reads
  // report the camera that saving would write, not the last edited one.
  const readState = () => ({ ...store.getSnapshot(), scene: store.getDocument(true) })
  const context = () => {
    const state = readState()
    return {
      ...state,
      path: document.doc.path,
      units: 'meters',
      rotationUnits: 'XYZ Euler radians',
      timeUnits: 'seconds',
      rendererReady: !!viewport.current,
    }
  }
  const result = (value: unknown): AgentToolHandlerResult => ({
    content: JSON.stringify(value, (key, entry) =>
      key === 'dataUrl' ? undefined : entry,
    ),
  })
  const bind =
    <N extends ToolName>(
      name: N,
      action: (args: ToolArgs<N>) => Promise<AgentToolHandlerResult>,
    ): AgentToolHandler =>
    async invoke => {
      if (resource)
        throw new Error(
          'A scene resource is opening. Try again after it finishes.',
        )
      return action(
        toolDefinitions[name].schema.parse(invoke.arguments) as ToolArgs<N>,
      )
    }
  /** Save, then describe what changed since `before` — never the whole scene. */
  const committed = async (before: SceneDocument, extra: Record<string, unknown> = {}) => {
    const path = await document.save()
    const state = store.getSnapshot()
    const changes = changesReply(diffScenes(before, state.scene))
    return result({
      ok: true,
      path,
      scene: sceneHeader(state.scene),
      ...extra,
      changes,
      ...(Object.keys(changes).length ? {} : { note: 'No scene content changed' }),
      canUndo: state.canUndo,
      canRedo: state.canRedo,
    })
  }
  const opened = (path: string | null) => {
    const { scene } = store.getSnapshot()
    return result({ ok: true, path, scene: sceneHeader(scene), ...sceneOutline(scene) })
  }
  const current = () => store.getSnapshot().scene
  return {
    getScene: bind('getScene', async args => {
      if (isEmptyQuery(args)) return result(context())
      const { scene: _scene, ...extra } = context()
      return result(queryScene(readState(), args, extra))
    }),
    editScene: bind('editScene', async args => {
      const before = current()
      store.edit(args.operations)
      return committed(before, { operations: args.operations.length })
    }),
    setWorkspace: bind('setWorkspace', async args => {
      const { frameSelection, ...patch } = args
      if (frameSelection && !viewport.current)
        throw new Error('Viewport renderer unavailable')
      store.workspace(patch)
      let saved: Record<string, unknown> = {}
      if (frameSelection) {
        viewport.current!.frame()
        const path = await document.save()
        saved = { path, camera: cameraReply(store.getCameraSnapshot()) }
      }
      const state = store.getSnapshot()
      const selected = state.scene.objects.find(o => o.id === state.selectedId)
      return result({
        ok: true,
        workspace: workspaceState(state),
        ...(selected
          ? { selected: { id: selected.id, name: selected.name, kind: selected.kind } }
          : {}),
        ...saved,
      })
    }),
    newScene: bind('newScene', async args => opened(await document.create(args.title))),
    openScene: bind('openScene', async args => opened(await document.open(args.path))),
    saveScene: bind('saveScene', async args => {
      const path = await document.save(args.path)
      return result({ ok: true, path, scene: sceneHeader(current()) })
    }),
    importModel: bind('importModel', async args => {
      const before = current()
      const objectIds = await importWorkspaceModel(store, args.path)
      return committed(before, {
        ...cappedIds('importedObjectIds', objectIds),
        selectedId: store.getSnapshot().selectedId,
      })
    }),
    importTexture: bind('importTexture', async args => {
      const before = current()
      const textureAssetId = await importWorkspaceTexture(store, args.id, args.path)
      return committed(before, { objectId: args.id, textureAssetId })
    }),
    generateTexture: bind('generateTexture', async args => {
      const before = current()
      const generated = await generateObjectTexture(store, args.id, args)
      return committed(before, { objectId: args.id, ...generated })
    }),
    applyTexture: bind('applyTexture', async args => {
      const before = current()
      const appliedObjectIds = applyTextureReference(store, args)
      return committed(before, {
        assetId: args.assetId,
        ...cappedIds('appliedObjectIds', appliedObjectIds),
      })
    }),
    patchTextures: bind('patchTextures', async args => {
      const before = current()
      const patchedObjectIds = patchTextureReferences(store, args)
      return committed(before, cappedIds('patchedObjectIds', patchedObjectIds))
    }),
    exportModel: bind('exportModel', async args => {
      return result({
        ok: true,
        format: args.format,
        ...(await exportWorkspaceModel(
          store,
          args.path,
          args.format,
          viewport.current,
        )),
      })
    }),
    history: bind('history', async args => {
      const before = current()
      store.history(args.direction)
      const { past, future } = store.getHistory()
      return committed(before, {
        direction: args.direction,
        ...historyEntries(current(), past, future),
      })
    }),
    captureViewport: bind('captureViewport', async () => {
      if (!viewport.current) throw new Error('Viewport renderer unavailable')
      const snapshot = store.getSnapshot()
      const image = await viewport.current.capture(snapshot.time)
      return {
        ...result({
          ok: true,
          note: `Rendered viewport PNG of "${snapshot.scene.title}" at ${snapshot.time} s${
            snapshot.cameraPreview ? ' through the camera track' : ''
          }.`,
          time: snapshot.time,
          path: document.doc.path,
        }),
        images: [
          {
            mimeType: 'image/png',
            data: image.split(',')[1],
          },
        ],
      }
    }),
  }
}
export function useAppAgentTools(
  ready: boolean,
  handlers: Record<ToolName, AgentToolHandler>,
) {
  usePlatformAgentTools({
    ready,
    tools: TOOL_NAMES,
    handlers,
    logLabel: 'pure3d',
  })
}
