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
export { vision } from '@purescience/platform-ui/bridge/assistants/vision/api'
export type { VisionGenerateRequest } from '@purescience/platform-ui/bridge/assistants/types'

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
