import type { z } from 'zod/v4'
import type {
  sceneSchema,
  objectSchema,
  operationSchema,
  vectorSchema,
  keyframeSchema,
} from './lib/schemas.mjs'
export type SceneDocument = z.infer<typeof sceneSchema>
export type SceneObject = z.infer<typeof objectSchema>
export type Operation = z.infer<typeof operationSchema>
export type Vec3 = z.infer<typeof vectorSchema>
export type Keyframe = z.infer<typeof keyframeSchema>
export type TransformMode = 'translate' | 'rotate' | 'scale'
