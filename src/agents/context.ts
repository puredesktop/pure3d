import type { MutableRefObject } from 'react'
import type { AgentToolHandlerResult } from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import type { ResourceOpenEvent } from '@purescience/platform-ui/bridge/types'
import type { ViewportAPI } from '../components/SceneViewport'
import type { SceneDocumentActions } from '../hooks/useSceneDocument'
import type { SceneStore } from '../lib/SceneStore'
import {
  changesReply,
  diffScenes,
  sceneHeader,
  sceneOutline,
} from '../lib/toolReplies'
import type { SceneDocument } from '../types'

export class SceneToolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SceneToolError'
  }
}

export interface Pure3DAgentContext {
  store: SceneStore
  document: SceneDocumentActions
  viewport: MutableRefObject<ViewportAPI | null>
  resource: ResourceOpenEvent | null
}

/**
 * Navigation settles into the document camera without a scene edit, so reads
 * report the camera that saving would write, not the last edited one.
 */
export function readLiveState(ctx: Pure3DAgentContext) {
  return {
    ...ctx.store.getSnapshot(),
    scene: ctx.store.getDocument(true),
  }
}

export function buildSceneContext(ctx: Pure3DAgentContext) {
  const state = readLiveState(ctx)
  return {
    ...state,
    path: ctx.document.doc.path,
    units: 'meters',
    rotationUnits: 'XYZ Euler radians',
    timeUnits: 'seconds',
    rendererReady: !!ctx.viewport.current,
  }
}

export function serializeToolResult(value: unknown): AgentToolHandlerResult {
  return {
    content: JSON.stringify(value, (key, entry) =>
      key === 'dataUrl' ? undefined : entry,
    ),
  }
}

export function assertNoPendingResource(ctx: Pure3DAgentContext): void {
  if (ctx.resource) {
    throw new SceneToolError(
      'A scene resource is opening. Try again after it finishes.',
    )
  }
}

/** Save, then describe what changed since `before` — never the whole scene. */
export async function commitAndSummarize(
  ctx: Pure3DAgentContext,
  before: SceneDocument,
  extra: Record<string, unknown> = {},
) {
  const path = await ctx.document.save()
  const state = ctx.store.getSnapshot()
  const changes = changesReply(diffScenes(before, state.scene))
  return {
    ok: true as const,
    path,
    scene: sceneHeader(state.scene),
    ...extra,
    changes,
    ...(Object.keys(changes).length ? {} : { note: 'No scene content changed' }),
    canUndo: state.canUndo,
    canRedo: state.canRedo,
  }
}

export function openedSceneReply(
  ctx: Pure3DAgentContext,
  path: string | null,
): AgentToolHandlerResult {
  const { scene } = ctx.store.getSnapshot()
  return serializeToolResult({
    ok: true,
    path,
    scene: sceneHeader(scene),
    ...sceneOutline(scene),
  })
}
