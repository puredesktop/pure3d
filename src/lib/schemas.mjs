import { z } from 'zod/v4'

export const vectorSchema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
])
export const shapeSchema = z.enum([
  'box',
  'sphere',
  'cylinder',
  'cone',
  'torus',
  'plane',
  'group',
  'mesh',
])
export const transformSchema = z
  .object({
    position: vectorSchema,
    rotation: vectorSchema,
    scale: vectorSchema.refine(
      v => v.every(n => n > 0),
      'Scale must be positive',
    ),
  })
  .strict()
const vector2Schema = z.tuple([z.number().finite(), z.number().finite()])
const textureTargetSchema = z
  .object({
    objectIds: z.array(z.string().min(1)).min(1).max(1000),
    recursive: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.objectIds).size !== value.objectIds.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Texture target IDs must be unique',
      })
  })
export const textureSchema = z
  .object({
    dataUrl: z
      .string()
      .max(12 * 1024 * 1024)
      .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/),
    repeat: vector2Schema.optional(),
    offset: vector2Schema.optional(),
    rotation: z.number().finite().optional(),
    flipY: z.boolean().optional(),
    wrapS: z.enum(['repeat', 'clamp', 'mirror']).optional(),
    wrapT: z.enum(['repeat', 'clamp', 'mirror']).optional(),
  })
  .strict()
export const textureAssetSchema = z
  .object({
    id: z.string().min(1),
    dataUrl: textureSchema.shape.dataUrl,
  })
  .strict()
export const textureBindingSchema = textureSchema
  .omit({ dataUrl: true })
  .extend({ assetId: z.string().min(1) })
  .strict()
export const materialSchema = z
  .object({
    color: z.string().regex(/^#[\da-f]{6}$/i).optional(),
    metalness: z.number().min(0).max(1).optional(),
    roughness: z.number().min(0).max(1).optional(),
    opacity: z.number().min(0).max(1).optional(),
    wireframe: z.boolean().optional(),
    texture: textureBindingSchema.nullable().optional(),
  })
  .strict()
export const geometrySchema = z
  .object({
    positions: z.array(z.number().finite()).min(9).max(300000),
    indices: z
      .array(z.number().int().nonnegative())
      .min(3)
      .max(600000)
      .nullable(),
    uv: z.array(z.number().finite()).max(200000).optional(),
  })
  .strict()
  .superRefine((g, ctx) => {
    if (
      g.positions.length % 3 ||
      (g.indices ? g.indices.length % 3 : g.positions.length % 9)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Geometry must contain complete triangles',
      })
    if (g.indices?.some(i => i >= g.positions.length / 3))
      ctx.addIssue({ code: 'custom', message: 'Index outside vertex array' })
    if (g.uv && g.uv.length !== (g.positions.length / 3) * 2)
      ctx.addIssue({
        code: 'custom',
        message: 'UV coordinates must match the vertex array',
      })
  })
export const objectSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).max(200),
    kind: shapeSchema,
    parentId: z.string().nullable(),
    visible: z.boolean(),
    transform: transformSchema,
    material: materialSchema,
    geometry: geometrySchema.nullable(),
  })
  .strict()
  .refine(
    o => (o.kind === 'mesh') === (o.geometry !== null),
    'Only mesh objects require geometry',
  )
export const propertySchema = z.enum(['position', 'rotation', 'scale'])
export const keyframeSchema = z
  .object({
    objectId: z.string(),
    property: propertySchema,
    time: z.number().min(0).max(3600),
    value: vectorSchema,
    easing: z.enum(['linear', 'smooth', 'step']),
  })
  .strict()
export const cameraKeySchema = z.object({
  time: z.number().finite().min(0).max(3600),
  position: vectorSchema, target: vectorSchema,
  fov: z.number().finite().min(10).max(120),
  easing: z.enum(['linear', 'smooth', 'step']),
}).strict().refine(k => k.position.some((n, i) => n !== k.target[i]), 'Camera position and target must differ')
export const settingsSchema = z
  .object({
    duration: z.number().min(0.1).max(3600),
    fps: z.number().int().min(1).max(120),
    background: z.string().regex(/^#[\da-f]{6}$/i),
    grid: z.boolean(),
    camera: z.object({ position: vectorSchema, target: vectorSchema, fov: z.number().min(10).max(120).optional() }).strict(),
  })
  .strict()
export const sceneSchema = z
  .object({
    format: z.literal('pure3d'),
    version: z.literal(1),
    id: z.string().min(1),
    title: z.string().min(1).max(200),
    textureAssets: z.array(textureAssetSchema).max(1000),
    objects: z.array(objectSchema).max(1000),
    keyframes: z.array(keyframeSchema).max(30000),
    cameraKeys: z.array(cameraKeySchema).max(1000).optional(),
    settings: settingsSchema,
  })
  .strict()
  .superRefine((s, ctx) => {
    const cameraTimes = new Set()
    for (const k of s.cameraKeys ?? []) {
      if (k.time > s.settings.duration || cameraTimes.has(k.time)) ctx.addIssue({ code: 'custom', message: 'Invalid or duplicate camera keyframe' })
      cameraTimes.add(k.time)
    }
    const textureIds = new Set(s.textureAssets.map(texture => texture.id))
    if (textureIds.size !== s.textureAssets.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate texture asset IDs' })
    const ids = new Set(s.objects.map(o => o.id))
    if (ids.size !== s.objects.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate object IDs' })
    const parents = new Map(s.objects.map(o => [o.id, o.parentId]))
    for (const o of s.objects) {
      if (o.material.texture && !textureIds.has(o.material.texture.assetId))
        ctx.addIssue({ code: 'custom', message: 'Unknown texture asset' })
      const visited = new Set([o.id])
      let p = o.parentId
      while (p !== null) {
        if (!ids.has(p) || visited.has(p)) {
          ctx.addIssue({
            code: 'custom',
            message: 'Missing parent or hierarchy cycle',
          })
          break
        }
        visited.add(p)
        p = parents.get(p) ?? null
      }
    }
    const keys = new Set()
    for (const k of s.keyframes) {
      const id = `${k.objectId}/${k.property}/${k.time}`
      if (
        !ids.has(k.objectId) ||
        k.time > s.settings.duration ||
        keys.has(id) ||
        (k.property === 'scale' && k.value.some(n => n <= 0))
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Invalid or duplicate keyframe',
        })
      keys.add(id)
    }
    if (
      s.settings.camera.position.every(
        (n, i) => n === s.settings.camera.target[i],
      )
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Camera position and target must differ',
      })
  })
export const operationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('cameraKeyframe'), keyframe: cameraKeySchema }).strict(),
  z.object({ op: z.literal('removeCameraKeyframe'), time: z.number().finite() }).strict(),
  z.object({ op: z.literal('addTextureAsset'), asset: textureAssetSchema }).strict(),
  z.object({ op: z.literal('deleteTextureAsset'), id: z.string() }).strict(),
  z.object({ op: z.literal('add'), object: objectSchema }).strict(),
  z
    .object({
      op: z.literal('update'),
      id: z.string(),
      patch: z
        .object({
          name: z.string().min(1).max(200).optional(),
          visible: z.boolean().optional(),
          parentId: z.string().nullable().optional(),
          transform: transformSchema.partial().optional(),
          material: materialSchema
            .partial()
            .extend({
              texture: textureBindingSchema.partial().nullable().optional(),
            })
            .optional(),
        })
        .strict(),
    })
    .strict(),
  z.object({ op: z.literal('clearMaterialOverride'), id: z.string() }).strict(),
  z.object({ op: z.literal('delete'), id: z.string() }).strict(),
  z
    .object({
      op: z.literal('duplicate'),
      id: z.string(),
      newId: z.string().min(1),
    })
    .strict(),
  z
    .object({ op: z.literal('mesh'), id: z.string(), geometry: geometrySchema })
    .strict(),
  z
    .object({
      op: z.literal('moveVertex'),
      id: z.string(),
      index: z.number().int().nonnegative(),
      position: vectorSchema,
    })
    .strict(),
  z.object({ op: z.literal('subdivide'), id: z.string() }).strict(),
  z.object({ op: z.literal('unwrap'), id: z.string() }).strict(),
  z.object({ op: z.literal('keyframe'), keyframe: keyframeSchema }).strict(),
  z
    .object({
      op: z.literal('removeKeyframe'),
      objectId: z.string(),
      property: propertySchema,
      time: z.number().finite(),
    })
    .strict(),
  z
    .object({
      op: z.literal('settings'),
      title: z.string().min(1).max(200).optional(),
      settings: settingsSchema.partial().optional(),
    })
    .strict(),
])
/**
 * @template {import('zod/v4').ZodType} T
 * @param {string} description
 * @param {T} schema
 * @param {'read' | 'write' | 'destructive' | 'external'} [risk]
 * @param {{requiresCapabilities?: ['vision']}} [extra]
 */
const tool = (description, schema, risk = 'write', extra = {}) => ({
  description,
  schema,
  risk,
  requiresApproval: risk === 'destructive',
  ...extra,
})
export const toolDefinitions = {
  getScene: tool(
    'Read the active scene, file path, selection and playback. Embedded texture dataUrl bytes are omitted; texture settings remain visible. Rotations are XYZ Euler radians, time is seconds, positions use meters. Objects are box/sphere/cylinder/cone/torus/plane/group/mesh; primitives have unit size.',
    z.object({}).strict(),
    'read',
  ),
  editScene: tool(
    'Atomically apply operations to the active scene. cameraKeyframe upserts a camera shot with time, position, target (look-at), fov (10-120 degrees), easing (linear/smooth/step). removeCameraKeyframe removes a shot by time. Camera shots live in scene.cameraKeys, independently of object animation; do not move the scene as a camera workaround. setWorkspace cameraPreview:true previews the journey. add requires a full object; use unique IDs. update merges transform/material/texture fields; texture:null removes the image. clearMaterialOverride restores inherited material. Texture repeat/offset use UV units, rotation uses radians. delete/duplicate include subtree and keys. mesh replaces triangle geometry with optional UVs. moveVertex moves a vertex and coincident seams in local coordinates. subdivide splits triangles while preserving UVs. unwrap applies box-projected UVs. keyframe upserts an object/property/time key; easing describes the interval AFTER that key. settings edits scene settings. Preserve unrelated objects, object keyframes and textures when editing camera shots.',
    z
      .object({
        operations: z.array(operationSchema).min(1).max(200),
      })
      .strict(),
  ),
  setWorkspace: tool(
    'Operate selection, transform mode, playback, playhead, looping, inspector visibility, cameraPreview or frame selection. cameraPreview:true uses the animated camera track at the playhead, with clean 16:9 framing; false restores the editing camera. Combine cameraPreview:true, time:0, playing:true to play a camera journey. Preview does not rewrite the saved shots or object animation. selectedVertex selects a mesh vertex and pauses playback; null returns to object mode. Changing objects, rotating/scaling or playing exits vertex mode. Framing saves the editing camera; selection, preview and scrubbing are transient.',
    z
      .object({
        selectedId: z.string().nullable().optional(),
        selectedVertex: z.number().int().nonnegative().nullable().optional(),
        mode: z.enum(['translate', 'rotate', 'scale']).optional(),
        playing: z.boolean().optional(),
        time: z.number().finite().min(0).optional(),
        loop: z.boolean().optional(),
        inspector: z.boolean().optional(),
        cameraPreview: z.boolean().optional(),
        frameSelection: z.boolean().optional(),
      })
      .strict(),
  ),
  newScene: tool(
    'Save the current scene before creating a blank scene. Optional title. Returns the new scene and saved path. No seeded objects.',
    z.object({ title: z.string().min(1).max(200).optional() }).strict(),
  ),
  openScene: tool(
    'Save the current scene, then open a .pure3d document from a workspace path. Parse failures leave the current scene untouched.',
    z.object({ path: z.string().min(1) }).strict(),
  ),
  saveScene: tool(
    'Save the active scene. Optional path writes a .pure3d copy there and makes it the active document; otherwise saves to its current path or creates a draft. Returns its saved path.',
    z.object({ path: z.string().min(1).optional() }).strict(),
  ),
  importModel: tool(
    'Add static geometry from an OBJ, STL or self-contained GLB workspace file. OBJ material sidecars are unsupported. GLB supports base-color image textures and UVs; other texture maps, skins, morph targets and existing animation clips are refused. Imported meshes retain hierarchy and base color/PBR values.',
    z.object({ path: z.string().min(1) }).strict(),
  ),
  importTexture: tool(
    'Apply a workspace PNG, JPEG or WebP image (up to 8 MiB) as an object base-color texture, embedded in the scene. Resets base color to white and supplies box UVs for meshes without UVs. Adjust tint and tiling with editScene material fields. Groups cannot have textures.',
    z.object({ id: z.string(), path: z.string().min(1) }).strict(),
  ),
  generateTexture: tool(
    'Generate and apply an object base-color texture in the active scene using the drawer image model (or app default). Describe flat, unlit surface color/detail; request seamless edges for tiling. Defaults to square 1024x1024, medium quality, opaque PNG. editExisting=true sends the current texture as an image-editing source; requires an editing-capable image model. Embeds the result with undo and saving, resets base color to white, preserves tiling, and supplies missing mesh UVs. Groups cannot have textures. Makes one generation request; never automatically repeat a failed paid call. If saving fails after application, use saveScene to retry saving.',
    z
      .object({
        id: z.string(),
        prompt: z.string().trim().min(1),
        size: z
          .enum(['auto', '1024x1024', '1536x1024', '1024x1536'])
          .optional(),
        editExisting: z.boolean().optional(),
      })
      .strict(),
    'external',
  ),
  applyTexture: tool(
    'Apply a retained texture-library asset by assetId to explicit object IDs. Set recursive:true to create a local binding on every object in each target subtree; otherwise a group binding is inherited by children unless a child already has its own texture override. All asset and target IDs are validated before the scene changes. Referenced texture bindings preserve each target\'s existing UV settings and textured meshes without UVs receive box-projected UVs. Returns scene context without embedded texture bytes.',
    textureTargetSchema
      .extend({ assetId: z.string().min(1) })
      .strict(),
  ),
  patchTextures: tool(
    'Atomically patch tint/base color and/or texture repeat, offset, rotation, flipY, wrapS and wrapT on explicit object IDs. Set recursive:true to give every object in each target subtree a local patched material; otherwise a group patch is inherited and child overrides remain intact. UV texture settings require a resolved texture on every target. Textured meshes without UVs receive box-projected UVs. Returns scene context without embedded texture bytes.',
    textureTargetSchema
      .extend({
        patch: z
          .object({
            color: z.string().regex(/^#[\da-f]{6}$/i).optional(),
            repeat: vector2Schema.optional(),
            offset: vector2Schema.optional(),
            rotation: z.number().finite().optional(),
            flipY: z.boolean().optional(),
            wrapS: z.enum(['repeat', 'clamp', 'mirror']).optional(),
            wrapT: z.enum(['repeat', 'clamp', 'mirror']).optional(),
          })
          .strict()
          .refine(value => Object.keys(value).length > 0, 'Texture patch is required'),
      })
      .strict(),
  ),
  exportModel: tool(
    'Export GLB with baked transform animation, OBJ/STL geometry of the current pose, or the actual viewport PNG, to an explicit workspace path. Extension must match format. Geometry exports exclude hidden objects, helpers and gizmos. PNG includes visible viewport controls.',
    z
      .object({
        path: z.string().min(1),
        format: z.enum(['glb', 'obj', 'stl', 'png']),
      })
      .strict(),
  ),
  history: tool(
    'Undo or redo one edit in the active scene. Returns the complete scene context.',
    z.object({ direction: z.enum(['undo', 'redo']) }).strict(),
  ),
  captureViewport: tool(
    'Read an actual rendered viewport PNG of the active scene at the current playhead. Refuses if the renderer is unavailable.',
    z.object({}).strict(),
    'read',
    { requiresCapabilities: ['vision'] },
  ),
}
