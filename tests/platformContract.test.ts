import { describe, expect, it } from 'vitest'
import { AppManifestSchema } from '../../../packages/shell/src/modules/apps/app/manifest'
import { assertBridgePermission } from '../../../packages/shell/src/renderer/hostBridge/permissions'
import { PLATFORM_BRIDGE_METHODS as M } from '@purescience/platform-ui/bridge/methods'
import manifest from '../plugin.json'

describe('Current platform contract', () => {
  it('accepts the built-in manifest and its file creation template', () => {
    const parsed = AppManifestSchema.parse(manifest)
    expect(parsed.id).toBe('3d')
    expect(parsed.app.createEntities?.[0].kind).toBe('file')
  })
  it('covers the app and shared header bridge calls with declared permissions', () => {
    const permissions = AppManifestSchema.parse(manifest).permissions ?? []
    for (const method of [
      M.FS_READ,
      M.FS_READ_BINARY,
      M.FS_WRITE,
      M.FS_WRITE_BINARY,
      M.DIALOG_OPEN_FILE,
      M.DIALOG_OPEN_IMAGE,
      M.DIALOG_SAVE_FOLDER,
      M.DOCUMENTS_CREATE_DRAFT,
      M.DOCUMENTS_AUTOSAVE,
      M.DOCUMENTS_PROMOTE,
      M.DOCUMENTS_RENAME,
      M.DOCUMENTS_DUPLICATE,
      M.DOCUMENTS_LIST,
      M.DOCUMENTS_RECENTS_LIST,
      M.DOCUMENTS_RECENTS_TOUCH,
      M.DOCUMENTS_SUGGEST_LOCATION,
      M.DIALOG_OPEN_FOLDER,
      M.FS_DELETE,
      M.OS_REVEAL,
      M.CATALOG_OPEN,
      M.WORKSPACE_UPDATE_CURRENT_TAB,
      M.WORKSPACE_CLOSE_READY,
      M.AGENTS_TOOLS_REGISTER,
      M.AGENTS_TOOLS_COMPLETE,
      M.ASSISTANTS_VISION_GENERATE,
      M.CATALOG_MANIFEST,
      M.CATALOG_CONSUME_PENDING_OPEN,
      M.AGENTS_LLM_MENU_OPTIONS,
    ])
      expect(() => assertBridgePermission(method, permissions)).not.toThrow()
  })
})
