import {
  createAppOperationsRegistry,
  defineAppTool,
  type AppAtomicToolDefinition,
  type BuildHandlersOptions,
} from '@purescience/platform-ui/bridge/appFunctions'
import type { AgentToolHandler } from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import { PURE3D_ATOMIC_TOOL_SCHEMAS } from './atomicToolSchemas'
import {
  assertNoPendingResource,
  SceneToolError,
  type Pure3DAgentContext,
} from './context'
import { PURE3D_FUNCTIONS } from './functions'
import { ATOMIC_RUNNERS, type AtomicToolName } from './handlers'

const atomicTools: AppAtomicToolDefinition<Pure3DAgentContext>[] =
  PURE3D_ATOMIC_TOOL_SCHEMAS.map(schema =>
    defineAppTool<Pure3DAgentContext>({
      ...schema,
      run: async (ctx, args, invoke) => {
        const runner = ATOMIC_RUNNERS[schema.name as AtomicToolName]
        if (!runner) {
          throw new SceneToolError(
            `Missing atomic tool handler for "${schema.name}".`,
          )
        }
        return runner(ctx, { ...invoke, arguments: args })
      },
    }),
  )

/**
 * Pure3D's unified Operations Registry built on `@purescience/platform-ui/bridge/appFunctions`:
 *   - 5 composite `function` workflows (`fn_*`, always exposed)
 *   - 4 core atomic tools (~29% of 14, always exposed)
 *   - 3 universal escape-hatch meta-tools (always exposed)
 *   - 10 extended specialist atomic tools (hidden by default — including raw 57 KB `editScene`,
 *     document I/O, model import/export, and low-level texture operations — 100% reachable on demand)
 */
export const PURE3D_OPERATIONS_REGISTRY =
  createAppOperationsRegistry<Pure3DAgentContext>({
    appSlug: '3d',
    appName: 'Pure3D',
    functions: PURE3D_FUNCTIONS,
    tools: atomicTools,
  })

export function buildPure3DHandlers(
  getCtx: () => Pure3DAgentContext,
  options: BuildHandlersOptions<Pure3DAgentContext> = {},
): Record<string, AgentToolHandler> {
  return PURE3D_OPERATIONS_REGISTRY.buildHandlers(getCtx, {
    createError: message => new SceneToolError(message),
    beforeInvoke: async guard => {
      assertNoPendingResource(guard.ctx)
      await options.beforeInvoke?.(guard)
    },
    recordOperation: options.recordOperation,
  })
}
