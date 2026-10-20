/**
 * Tags for the shell's agent activity layer (AgentActivityLayer, mounted by AppFrame). An element whose
 * `data-agent-ref` holds a ref a tool call names (an argument value, plain or as `key:value`, or an id in a read's
 * answer) is marked while the agent reads or writes it. Markup only: nothing here changes behaviour.
 */
export type AgentRefProps = { 'data-agent-ref': string; 'data-agent-label'?: string }

/** Refs for one item: each string value plain, and every value as `key:value` for each key the tools use for it. */
export function agentRefs(values: Record<string, string | number | undefined | null>, label?: string): AgentRefProps {
  const refs = new Set<string>()
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === '') continue
    if (typeof value === 'string') refs.add(value)
    refs.add(`${key}:${value}`)
  }
  const props: AgentRefProps = { 'data-agent-ref': [...refs].join(' ') }
  if (label) props['data-agent-label'] = label
  return props
}

/**
 * A scene object. editScene ops name it `id` (update, delete, duplicate, mesh, moveVertex…) or `objectId`
 * (removeKeyframe); getScene takes `ids`; applyTexture/patchTextures take `objectIds`; setWorkspace `selectedId`.
 */
export const objectRefs = (id: string, name: string): AgentRefProps =>
  agentRefs({ id, ids: id, objectId: id, objectIds: id, selectedId: id }, name)

/** A texture asset: `assetId` (applyTexture), `id` (deleteTextureAsset), `textureAssetId` in import replies. */
export const textureRefs = (id: string): AgentRefProps =>
  agentRefs({ assetId: id, id, textureAssetId: id }, `Texture ${id.slice(0, 8)}`)
