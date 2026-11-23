/**
 * Registering Pure3D's exposed operations with the platform:
 *   - 5 composite `fn_*` functions (always exposed)
 *   - 4 core atomic tools (~29% of 14, always exposed)
 *   - 3 universal escape-hatch meta-tools (`discoverAppTools`,
 *     `callExtendedReadTool`, `callExtendedTool`) giving full on-demand access
 *     to all 10 specialist atomic tools (including raw `editScene`, document I/O,
 *     model import/export, and low-level texture operations).
 */
import { useMemo, useRef, type MutableRefObject } from 'react'
import {
  usePlatformAgentTools,
  type AgentToolHandler,
} from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import type { ResourceOpenEvent } from '@purescience/platform-ui/bridge/types'
import {
  EXPOSED_TOOL_NAMES,
  PURE3D_AGENT_LOG_LABEL,
  type Pure3DAgentToolName,
} from '../agents/catalog'
import { SceneToolError, type Pure3DAgentContext } from '../agents/context'
import { ATOMIC_RUNNERS, type AtomicToolName } from '../agents/handlers'
import { buildPure3DHandlers } from '../agents/operationsRegistry'
import type { ViewportAPI } from '../components/SceneViewport'
import type { SceneStore } from '../lib/SceneStore'
import type { SceneDocumentActions } from './useSceneDocument'

export const TOOL_NAMES = EXPOSED_TOOL_NAMES

export function createToolHandlers(
  store: SceneStore,
  document: SceneDocumentActions,
  viewport: MutableRefObject<ViewportAPI | null>,
  resource: ResourceOpenEvent | null = null,
): Record<Pure3DAgentToolName, AgentToolHandler> {
  const ctx: Pure3DAgentContext = { store, document, viewport, resource }
  return buildPure3DHandlers(() => ctx) as Record<
    Pure3DAgentToolName,
    AgentToolHandler
  >
}

export function createAtomicToolHandlers(
  store: SceneStore,
  document: SceneDocumentActions,
  viewport: MutableRefObject<ViewportAPI | null>,
  resource: ResourceOpenEvent | null = null,
): Record<AtomicToolName, AgentToolHandler> {
  const ctx: Pure3DAgentContext = { store, document, viewport, resource }
  return Object.fromEntries(
    (Object.keys(ATOMIC_RUNNERS) as AtomicToolName[]).map(name => [
      name,
      async invoke => ATOMIC_RUNNERS[name](ctx, invoke),
    ]),
  ) as Record<AtomicToolName, AgentToolHandler>
}

export function useAppAgentTools(
  ready: boolean,
  registryHandlers: Record<string, AgentToolHandler>,
) {
  const handlersRef = useRef(registryHandlers)
  handlersRef.current = registryHandlers

  // Statically key-preserving registration so `scripts/check-manifests.mjs`
  // can verify every manifest tool has a live registered handler at build time.
  const handlers = useMemo(
    () =>
      Object.fromEntries(
        EXPOSED_TOOL_NAMES.map(name => [
          name,
          async (invoke: Parameters<AgentToolHandler>[0]) =>
            handlersRef.current[name]!(invoke),
        ]),
      ),
    [],
  )

  usePlatformAgentTools({
    ready,
    tools: EXPOSED_TOOL_NAMES,
    handlers,
    logLabel: PURE3D_AGENT_LOG_LABEL,
    errorType: SceneToolError,
  })
}
