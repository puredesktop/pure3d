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
  const context = () => {
    const state = store.getSnapshot()
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
  return {
    getScene: bind('getScene', async () => result(context())),
    editScene: bind('editScene', async args => {
      store.edit(args.operations)
      const path = await document.save()
      return result({ ...context(), path })
    }),
    setWorkspace: bind('setWorkspace', async args => {
      const { frameSelection, ...patch } = args
      if (frameSelection && !viewport.current)
        throw new Error('Viewport renderer unavailable')
      store.workspace(patch)
      if (frameSelection) {
        viewport.current!.frame()
        const path = await document.save()
        return result({ ...context(), path })
      }
      return result(context())
    }),
    newScene: bind('newScene', async args => {
      const path = await document.create(args.title)
      return result({ ...context(), path })
    }),
    openScene: bind('openScene', async args => {
      const path = await document.open(args.path)
      return result({ ...context(), path })
    }),
    saveScene: bind('saveScene', async args => {
      const path = await document.save(args.path)
      return result({ ...context(), path })
    }),
    importModel: bind('importModel', async args => {
      const objectIds = await importWorkspaceModel(store, args.path)
      const path = await document.save()
      return result({ ...context(), path, importedObjectIds: objectIds })
    }),
    importTexture: bind('importTexture', async args => {
      const textureAssetId = await importWorkspaceTexture(store, args.id, args.path)
      const path = await document.save()
      return result({ ...context(), path, textureAssetId })
    }),
    generateTexture: bind('generateTexture', async args => {
      const generated = await generateObjectTexture(store, args.id, args)
      const path = await document.save()
      return result({ ...context(), path, ...generated })
    }),
    applyTexture: bind('applyTexture', async args => {
      const appliedObjectIds = applyTextureReference(store, args)
      const path = await document.save()
      return result({ ...context(), path, appliedObjectIds })
    }),
    patchTextures: bind('patchTextures', async args => {
      const patchedObjectIds = patchTextureReferences(store, args)
      const path = await document.save()
      return result({ ...context(), path, patchedObjectIds })
    }),
    exportModel: bind('exportModel', async args => {
      return result(
        await exportWorkspaceModel(
          store,
          args.path,
          args.format,
          viewport.current,
        ),
      )
    }),
    history: bind('history', async args => {
      store.history(args.direction)
      const path = await document.save()
      return result({ ...context(), path })
    }),
    captureViewport: bind('captureViewport', async () => {
      if (!viewport.current) throw new Error('Viewport renderer unavailable')
      const snapshot = store.getSnapshot()
      const image = await viewport.current.capture(snapshot.time)
      return {
        ...result({ ...context(), time: snapshot.time }),
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
