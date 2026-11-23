/**
 * Exposed Pure3D operations (must stay in sync 1:1 with `plugin.json` → `app.agents.tools[].name`).
 *
 * 3-tier exposure (built on `@purescience/platform-ui/bridge/appFunctions`):
 *   1. 5 composite `function` workflows (`fn_*`) — replace 3–10 atomic round-trips each
 *   2. 4 core atomic tools (~29% of 14) — indispensable direct read/workspace/capture/history verbs
 *   3. 3 universal escape-hatch meta-tools (`discoverAppTools`, `callExtendedReadTool`, `callExtendedTool`)
 *      providing full on-demand access to the remaining 10 specialist atomic tools (including raw `editScene`,
 *      document I/O, model import/export, and low-level texture operations).
 */
export const PURE3D_FUNCTION_NAMES = [
  'fn_inspectSceneHealth',
  'fn_composeScene',
  'fn_setupLightingAndLook',
  'fn_styleMaterialsAndTextures',
  'fn_directCameraAndShots',
] as const

export const PURE3D_CORE_TOOL_NAMES = [
  'getScene',
  'setWorkspace',
  'captureViewport',
  'history',
] as const

export const PURE3D_META_TOOL_NAMES = [
  'discoverAppTools',
  'callExtendedReadTool',
  'callExtendedTool',
] as const

export const EXPOSED_TOOL_NAMES = [
  ...PURE3D_FUNCTION_NAMES,
  ...PURE3D_CORE_TOOL_NAMES,
  ...PURE3D_META_TOOL_NAMES,
] as const

/** Keep in sync with `plugin.json` → `app.agents.tools[].name`. */
export const PURE3D_AGENT_TOOL_NAMES = EXPOSED_TOOL_NAMES

export type Pure3DAgentToolName = (typeof PURE3D_AGENT_TOOL_NAMES)[number]

export const PURE3D_EXTENDED_TOOL_NAMES = [
  'editScene',
  'newScene',
  'openScene',
  'saveScene',
  'importModel',
  'importTexture',
  'generateTexture',
  'applyTexture',
  'patchTextures',
  'exportModel',
] as const

export const PURE3D_ALL_ATOMIC_TOOL_NAMES = [
  ...PURE3D_CORE_TOOL_NAMES,
  ...PURE3D_EXTENDED_TOOL_NAMES,
] as const

export const PURE3D_AGENT_LOG_LABEL = 'pure3d'
