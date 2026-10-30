/**
 * Surfaces: fine detail a material lays over any shape (grain, pores, mortar, weave, bark), drawn from a seamless
 * pattern projected from three sides, so it needs no UVs and keeps its real size however the object is scaled.
 * Each surface varies the colour, the roughness and the bumps of the material it is on; the material's colour stays
 * the base colour. scale is how many metres one repeat of the pattern covers.
 *
 * @typedef {{ label: string, description: string, scale: number }} SurfaceSpec
 */

/** @type {Record<string, SurfaceSpec>} */
export const SURFACES = {
  wood: { label: 'Wood', description: 'grain and growth rings', scale: 1 },
  planks: { label: 'Planks', description: 'floorboards or cladding with seams', scale: 1.2 },
  stone: { label: 'Stone', description: 'weathered rock with cracks', scale: 2 },
  concrete: { label: 'Concrete', description: 'cast concrete with pores and stains', scale: 2 },
  plaster: { label: 'Plaster', description: 'soft trowelled wall finish', scale: 3 },
  brick: { label: 'Brick', description: 'brick courses with mortar', scale: 0.65 },
  tiles: { label: 'Tiles', description: 'square tiles with grout', scale: 1.2 },
  metal: { label: 'Brushed metal', description: 'fine brushed streaks', scale: 0.5 },
  fabric: { label: 'Fabric', description: 'woven threads', scale: 0.05 },
  leather: { label: 'Leather', description: 'grained, creased hide', scale: 0.3 },
  marble: { label: 'Marble', description: 'polished stone with veins', scale: 2 },
  bark: { label: 'Bark', description: 'deep vertical ridges', scale: 1.2 },
  ground: { label: 'Ground', description: 'earth with pebbles and clumps', scale: 2.5 },
  sand: { label: 'Sand', description: 'fine grains in wind ripples', scale: 3 },
}

export const SURFACE_KINDS = /** @type {const} */ (['wood', 'planks', 'stone', 'concrete', 'plaster', 'brick', 'tiles', 'metal', 'fabric', 'leather', 'marble', 'bark', 'ground', 'sand'])

/** One line for tool descriptions: every surface with what it is. */
export function surfaceGuide() {
  return Object.entries(SURFACES).map(([kind, spec]) => `${kind} (${spec.description}, ${spec.scale} m)`).join(', ')
}
