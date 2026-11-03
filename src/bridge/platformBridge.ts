export {
  readPlatformTextFile,
  readPlatformFileBinary,
  readPlatformFileBinaryDataUrl,
  writePlatformTextFile,
  writePlatformFileBinary,
} from '@purescience/platform-ui/bridge/fs'
export {
  openPlatformFileDialog,
  openPlatformImageDialog,
  savePlatformFolderDialog,
} from '@purescience/platform-ui/bridge/dialog'
export { updateCurrentWorkspaceTab } from '@purescience/platform-ui/bridge/workspace'
import { readPlatformStorageJson, writePlatformStorageJson } from '@purescience/platform-ui/bridge/storage'
import type { LeasePort } from '../lib/writerLease'
export { vision } from '@purescience/platform-ui/bridge/assistants/vision/api'
export type { VisionGenerateRequest } from '@purescience/platform-ui/bridge/assistants/types'

/**
 * Where copies of the app take turns to save a scene. A scene is a file, and the shell's only conditional write for a
 * single file is in its JSON store, so a small file there decides whose turn it is (lib/writerLease.ts).
 */
const SCENE_WRITER = { appSlug: '3d', fileName: '3d-scene-writer.json' as const }
export const sceneWriterLease: LeasePort = {
  read: async () => {
    const current = await readPlatformStorageJson(SCENE_WRITER)
    return { value: current?.value ?? null, version: current?.version ?? null }
  },
  write: async (value, ifMatch) => {
    const result = await writePlatformStorageJson({ ...SCENE_WRITER, value, ifMatch })
    return { ok: result?.ok === true, version: result?.version ?? null }
  },
}

export const isStandaloneDevMode = () =>
  import.meta.env.DEV && window.parent === window
export function download(data: BlobPart, filename: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([data], { type: mimeType }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function bytesToBase64(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data)
  const chunks: string[] = []
  for (let i = 0; i < bytes.length; i += 16384)
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 16384)))
  return btoa(chunks.join(''))
}
export function base64ToBytes(data: string): ArrayBuffer {
  return Uint8Array.from(atob(data), c => c.charCodeAt(0)).buffer
}
