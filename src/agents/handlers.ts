import type { AgentToolHandlerResult, AgentToolInvokeContext } from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import type { z } from 'zod/v4'
import { toolDefinitions } from '../lib/schemas.mjs'
import { aspectRatio } from '../lib/shots'
import {
  cameraReply,
  cappedIds,
  historyEntries,
  isEmptyQuery,
  queryScene,
  sceneHeader,
  workspaceState,
} from '../lib/toolReplies'
import {
  applyTextureReference,
  exportWorkspaceModel,
  generateObjectTexture,
  importWorkspaceModel,
  importWorkspaceTexture,
  patchTextureReferences,
} from '../lib/workflows'
import {
  assertNoPendingResource,
  buildSceneContext,
  commitAndSummarize,
  openedSceneReply,
  readLiveState,
  serializeToolResult,
  type Pure3DAgentContext,
} from './context'

export type AtomicToolName = keyof typeof toolDefinitions
type ToolArgs<N extends AtomicToolName> = z.infer<
  (typeof toolDefinitions)[N]['schema']
>

export type AtomicRunner = (
  ctx: Pure3DAgentContext,
  invoke: AgentToolInvokeContext,
) => Promise<AgentToolHandlerResult>

function bind<N extends AtomicToolName>(
  name: N,
  action: (
    ctx: Pure3DAgentContext,
    args: ToolArgs<N>,
  ) => Promise<AgentToolHandlerResult>,
): AtomicRunner {
  return async (ctx, invoke) => {
    assertNoPendingResource(ctx)
    return action(
      ctx,
      toolDefinitions[name].schema.parse(invoke.arguments) as ToolArgs<N>,
    )
  }
}

export const getSceneHandler = bind('getScene', async (ctx, args) => {
  if (isEmptyQuery(args)) return serializeToolResult(buildSceneContext(ctx))
  const { scene: _scene, ...extra } = buildSceneContext(ctx)
  return serializeToolResult(queryScene(readLiveState(ctx), args, extra))
})

export const editSceneHandler = bind('editScene', async (ctx, args) => {
  const before = ctx.store.getSnapshot().scene
  ctx.store.edit(args.operations)
  return serializeToolResult(
    await commitAndSummarize(ctx, before, {
      operations: args.operations.length,
    }),
  )
})

export const setWorkspaceHandler = bind('setWorkspace', async (ctx, args) => {
  const { frameSelection, shot, shotAt, ...patch } = args
  if ((frameSelection || shot) && !ctx.viewport.current) {
    throw new Error('Viewport renderer unavailable')
  }
  ctx.store.workspace(patch)
  let saved: Record<string, unknown> = {}
  if (frameSelection) {
    ctx.viewport.current!.frame()
    const path = await ctx.document.save()
    saved = { path, camera: cameraReply(ctx.store.getCameraSnapshot()) }
  }
  if (shot) {
    const { blockedBy, ...camera } = ctx.viewport.current!.shot(
      shot,
      shotAt === undefined ? ctx.viewport.current!.aspect() : 16 / 9,
    )
    if (shotAt === undefined) {
      ctx.store.setCamera(camera)
      ctx.store.persistCamera()
    } else {
      ctx.store.edit([
        {
          op: 'cameraKeyframe',
          keyframe: { time: shotAt, ...camera, easing: 'smooth' },
        },
      ])
    }
    const path = await ctx.document.save()
    saved = {
      path,
      camera: cameraReply(camera),
      ...(shotAt === undefined ? {} : { cameraKeyAt: shotAt }),
      ...(blockedBy ? { blockedBy } : {}),
    }
  }
  const state = ctx.store.getSnapshot()
  const selected = state.scene.objects.find(o => o.id === state.selectedId)
  return serializeToolResult({
    ok: true,
    workspace: workspaceState(state),
    ...(selected
      ? {
          selected: {
            id: selected.id,
            name: selected.name,
            kind: selected.kind,
          },
        }
      : {}),
    ...saved,
  })
})

export const newSceneHandler = bind('newScene', async (ctx, args) =>
  openedSceneReply(ctx, await ctx.document.create(args.title)),
)

export const openSceneHandler = bind('openScene', async (ctx, args) =>
  openedSceneReply(ctx, await ctx.document.open(args.path)),
)

export const saveSceneHandler = bind('saveScene', async (ctx, args) => {
  const path = await ctx.document.save(args.path)
  return serializeToolResult({
    ok: true,
    path,
    scene: sceneHeader(ctx.store.getSnapshot().scene),
  })
})

export const importModelHandler = bind('importModel', async (ctx, args) => {
  const before = ctx.store.getSnapshot().scene
  const objectIds = await importWorkspaceModel(ctx.store, args.path)
  return serializeToolResult(
    await commitAndSummarize(ctx, before, {
      ...cappedIds('importedObjectIds', objectIds),
      ...(objectIds.droppedMaps.length
        ? { droppedMaps: objectIds.droppedMaps }
        : {}),
      selectedId: ctx.store.getSnapshot().selectedId,
    }),
  )
})

export const importTextureHandler = bind('importTexture', async (ctx, args) => {
  const before = ctx.store.getSnapshot().scene
  const textureAssetId = await importWorkspaceTexture(
    ctx.store,
    args.id,
    args.path,
  )
  return serializeToolResult(
    await commitAndSummarize(ctx, before, {
      objectId: args.id,
      textureAssetId,
    }),
  )
})

export const generateTextureHandler = bind(
  'generateTexture',
  async (ctx, args) => {
    const before = ctx.store.getSnapshot().scene
    const generated = await generateObjectTexture(ctx.store, args.id, args)
    return serializeToolResult(
      await commitAndSummarize(ctx, before, {
        objectId: args.id,
        ...generated,
      }),
    )
  },
)

export const applyTextureHandler = bind('applyTexture', async (ctx, args) => {
  const before = ctx.store.getSnapshot().scene
  const appliedObjectIds = applyTextureReference(ctx.store, args)
  return serializeToolResult(
    await commitAndSummarize(ctx, before, {
      assetId: args.assetId,
      ...cappedIds('appliedObjectIds', appliedObjectIds),
    }),
  )
})

export const patchTexturesHandler = bind('patchTextures', async (ctx, args) => {
  const before = ctx.store.getSnapshot().scene
  const patchedObjectIds = patchTextureReferences(ctx.store, args)
  return serializeToolResult(
    await commitAndSummarize(
      ctx,
      before,
      cappedIds('patchedObjectIds', patchedObjectIds),
    ),
  )
})

export const exportModelHandler = bind('exportModel', async (ctx, args) =>
  serializeToolResult({
    ok: true,
    format: args.format,
    ...(await exportWorkspaceModel(
      ctx.store,
      args.path,
      args.format,
      ctx.viewport.current,
    )),
  }),
)

export const historyHandler = bind('history', async (ctx, args) => {
  const before = ctx.store.getSnapshot().scene
  ctx.store.history(args.direction)
  const { past, future } = ctx.store.getHistory()
  return serializeToolResult(
    await commitAndSummarize(ctx, before, {
      direction: args.direction,
      ...historyEntries(ctx.store.getSnapshot().scene, past, future),
    }),
  )
})

export const captureViewportHandler = bind(
  'captureViewport',
  async (ctx, args) => {
    if (!ctx.viewport.current) throw new Error('Viewport renderer unavailable')
    const snapshot = ctx.store.getSnapshot()
    const options = { aspect: args.aspect, size: args.size }
    const ratio = args.aspect
      ? aspectRatio(args.aspect)
      : ctx.viewport.current.aspect()
    // each view is framed and rendered in turn; the saved camera is never touched
    const views = args.views?.map(spec =>
      ctx.viewport.current!.shot(spec, ratio),
    ) ?? [undefined]
    const images: string[] = []
    for (const view of views) {
      const camera = view && {
        position: view.position,
        target: view.target,
        fov: view.fov,
      }
      images.push(
        await ctx.viewport.current.capture(snapshot.time, {
          ...options,
          view: camera,
        }),
      )
    }
    return {
      ...serializeToolResult({
        ok: true,
        note: `Rendered ${images.length > 1 ? `${images.length} viewport PNGs` : 'viewport PNG'} of "${snapshot.scene.title}" at ${snapshot.time} s${
          snapshot.cameraPreview && !args.views
            ? ' through the camera track'
            : ''
        }.`,
        time: snapshot.time,
        path: ctx.document.doc.path,
        ...(args.views
          ? {
              views: views.map(view => ({
                ...cameraReply(view!),
                ...(view!.blockedBy ? { blockedBy: view!.blockedBy } : {}),
              })),
            }
          : {}),
      }),
      images: images.map(image => ({
        mimeType: 'image/png',
        data: image.split(',')[1],
      })),
    }
  },
)

export const ATOMIC_RUNNERS: Record<AtomicToolName, AtomicRunner> = {
  getScene: getSceneHandler,
  editScene: editSceneHandler,
  setWorkspace: setWorkspaceHandler,
  newScene: newSceneHandler,
  openScene: openSceneHandler,
  saveScene: saveSceneHandler,
  importModel: importModelHandler,
  importTexture: importTextureHandler,
  generateTexture: generateTextureHandler,
  applyTexture: applyTextureHandler,
  patchTextures: patchTexturesHandler,
  exportModel: exportModelHandler,
  history: historyHandler,
  captureViewport: captureViewportHandler,
}
