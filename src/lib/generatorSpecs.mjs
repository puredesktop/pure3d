/**
 * Generated objects: shapes made from a few parameters instead of stored triangles, so they stay small, editable and
 * seeded (the same parameters always make the same shape). Each spec lists its parameters with their ranges and
 * defaults; the schema checks them, the Inspector draws them, and the tool descriptions name them.
 *
 * @typedef {{ key: string, label: string, type: 'number', min: number, max: number, step?: number, default: number, unit?: string, hint?: string }} NumberParam
 * @typedef {{ key: string, label: string, type: 'color', default: string, hint?: string }} ColorParam
 * @typedef {{ key: string, label: string, type: 'select', options: string[], default: string, hint?: string }} SelectParam
 * @typedef {{ key: string, label: string, type: 'object', default: string, hint?: string }} ObjectParam
 * @typedef {NumberParam | ColorParam | SelectParam | ObjectParam} GeneratorParam
 * @typedef {{ label: string, description: string, params: GeneratorParam[] }} GeneratorSpec
 */

import { KIT_NAMES } from './kit.mjs'

const seed = { key: 'seed', label: 'Seed', type: 'number', min: 0, max: 99999, step: 1, default: 1, hint: 'Another number makes another variation' }

export const SCATTER_ITEMS = ['pine', 'fir', 'broadleaf', 'birch', 'bush', 'rock', 'grass', 'flowers', 'fern']
export const TREE_STYLES = ['pine', 'fir', 'broadleaf', 'birch', 'bush']

/** @type {Record<string, GeneratorSpec>} */
export const GENERATORS = {
  terrain: {
    label: 'Terrain',
    description: 'Rolling ground from noise, coloured by height and slope (grass, soil, rock, snow), with an optional flat clearing in the middle.',
    params: [
      { key: 'width', label: 'Width', type: 'number', min: 1, max: 2000, default: 60, unit: 'm' },
      { key: 'depth', label: 'Depth', type: 'number', min: 1, max: 2000, default: 60, unit: 'm' },
      { key: 'height', label: 'Hill height', type: 'number', min: 0, max: 500, default: 4, unit: 'm' },
      { key: 'feature', label: 'Hill size', type: 'number', min: 0.5, max: 500, default: 18, unit: 'm', hint: 'Distance between hills' },
      { key: 'roughness', label: 'Roughness', type: 'number', min: 0, max: 1, step: 0.05, default: 0.45 },
      { key: 'clearing', label: 'Flat clearing', type: 'number', min: 0, max: 500, default: 0, unit: 'm', hint: 'Radius kept flat at the centre' },
      { key: 'segments', label: 'Detail', type: 'number', min: 16, max: 320, step: 1, default: 160 },
      { key: 'grass', label: 'Grass', type: 'color', default: '#5b7f35' },
      { key: 'soil', label: 'Soil', type: 'color', default: '#7a6247' },
      { key: 'rock', label: 'Rock', type: 'color', default: '#80786d' },
      { key: 'snow', label: 'Snow', type: 'color', default: '#f2f4f7' },
      { key: 'snowLine', label: 'Snow line', type: 'number', min: 0, max: 1, step: 0.05, default: 1, hint: 'Share of the height where snow starts (1 = none)' },
      seed,
    ],
  },
  scatter: {
    label: 'Scatter',
    description: 'Many instances of one item (trees, rocks, grass, flowers) spread over an area or over a terrain, each varied in size, turn and colour.',
    params: [
      { key: 'item', label: 'Item', type: 'select', options: SCATTER_ITEMS, default: 'pine' },
      { key: 'count', label: 'Count', type: 'number', min: 1, max: 6000, step: 1, default: 120 },
      { key: 'width', label: 'Area width', type: 'number', min: 0.1, max: 2000, default: 40, unit: 'm' },
      { key: 'depth', label: 'Area depth', type: 'number', min: 0.1, max: 2000, default: 40, unit: 'm' },
      { key: 'on', label: 'Sits on', type: 'object', default: '', hint: 'A terrain object id; empty sits on the ground plane' },
      { key: 'minScale', label: 'Smallest', type: 'number', min: 0.05, max: 20, default: 0.7 },
      { key: 'maxScale', label: 'Largest', type: 'number', min: 0.05, max: 20, default: 1.4 },
      { key: 'avoid', label: 'Keep clear', type: 'number', min: 0, max: 1000, default: 0, unit: 'm', hint: 'Radius left empty around the centre' },
      { key: 'clumping', label: 'Clumping', type: 'number', min: 0, max: 1, step: 0.05, default: 0.4 },
      { key: 'maxSlope', label: 'Steepest', type: 'number', min: 0, max: 90, default: 35, unit: '°' },
      { key: 'variation', label: 'Colour variation', type: 'number', min: 0, max: 1, step: 0.05, default: 0.35 },
      { key: 'color', label: 'Colour', type: 'color', default: '#ffffff', hint: 'Flowers: petal colour; others: a tint' },
      seed,
    ],
  },
  tree: {
    label: 'Tree',
    description: 'One tree or bush with a tapered trunk and leafy canopy.',
    params: [
      { key: 'style', label: 'Style', type: 'select', options: TREE_STYLES, default: 'broadleaf' },
      { key: 'height', label: 'Height', type: 'number', min: 0.3, max: 80, default: 7, unit: 'm' },
      { key: 'leaves', label: 'Leaves', type: 'color', default: '#4f7a2c' },
      { key: 'bark', label: 'Bark', type: 'color', default: '#5a4330' },
      { key: 'fullness', label: 'Fullness', type: 'number', min: 0.2, max: 2, step: 0.05, default: 1 },
      seed,
    ],
  },
  rock: {
    label: 'Rock',
    description: 'A weathered boulder with moss on its upper faces.',
    params: [
      { key: 'size', label: 'Size', type: 'number', min: 0.05, max: 100, default: 1.2, unit: 'm' },
      { key: 'roughness', label: 'Craggy', type: 'number', min: 0, max: 1, step: 0.05, default: 0.5 },
      { key: 'flatness', label: 'Flatness', type: 'number', min: 0, max: 0.9, step: 0.05, default: 0.35 },
      { key: 'stone', label: 'Stone', type: 'color', default: '#8a8478' },
      { key: 'moss', label: 'Moss', type: 'number', min: 0, max: 1, step: 0.05, default: 0.35 },
      seed,
    ],
  },
  water: {
    label: 'Water',
    description: 'A pond, lake or sea surface with gentle waves that reflects the sky.',
    params: [
      { key: 'width', label: 'Width', type: 'number', min: 0.5, max: 5000, default: 12, unit: 'm' },
      { key: 'depth', label: 'Depth', type: 'number', min: 0.5, max: 5000, default: 12, unit: 'm' },
      { key: 'shape', label: 'Shape', type: 'select', options: ['round', 'square'], default: 'round' },
      { key: 'waves', label: 'Waves', type: 'number', min: 0, max: 2, step: 0.05, default: 0.15, unit: 'm' },
      { key: 'water', label: 'Colour', type: 'color', default: '#1f5566' },
      seed,
    ],
  },
  building: {
    label: 'Building',
    description: 'A house, cabin or boathouse with real detail: lapped clapboard, board-and-batten, log or shingle siding (or plaster, brick, stone), corner boards, framed windows with sills, mullions and glass, a panelled door, a stone plinth, a gable, hip or shed roof of shingles or standing-seam metal with fascia and gutters, a chimney and a porch with railings and steps. Centred on its footprint, front towards +z, standing on y 0.',
    params: [
      { key: 'width', label: 'Width', type: 'number', min: 2, max: 40, default: 7, unit: 'm' },
      { key: 'depth', label: 'Depth', type: 'number', min: 2, max: 40, default: 5, unit: 'm' },
      { key: 'storeys', label: 'Storeys', type: 'number', min: 1, max: 4, step: 1, default: 1 },
      { key: 'storeyHeight', label: 'Storey height', type: 'number', min: 2.2, max: 5, default: 2.7, unit: 'm' },
      { key: 'siding', label: 'Siding', type: 'select', options: ['clapboard', 'boards', 'log', 'shingle', 'plaster', 'brick', 'stone'], default: 'clapboard' },
      { key: 'sidingColor', label: 'Siding colour', type: 'color', default: '#8c5a3c' },
      { key: 'trimColor', label: 'Trim colour', type: 'color', default: '#e8e2d4' },
      { key: 'roof', label: 'Roof', type: 'select', options: ['gable', 'hip', 'shed'], default: 'gable' },
      { key: 'roofing', label: 'Roofing', type: 'select', options: ['shingles', 'metal'], default: 'shingles' },
      { key: 'roofColor', label: 'Roof colour', type: 'color', default: '#4a4541' },
      { key: 'roofPitch', label: 'Roof pitch', type: 'number', min: 5, max: 60, default: 35, unit: '°' },
      { key: 'overhang', label: 'Eaves overhang', type: 'number', min: 0, max: 1.5, default: 0.45, unit: 'm' },
      { key: 'windowsFront', label: 'Front windows', type: 'number', min: 0, max: 8, step: 1, default: 2 },
      { key: 'windowsSide', label: 'Side windows', type: 'number', min: 0, max: 8, step: 1, default: 1 },
      { key: 'windowsBack', label: 'Back windows', type: 'number', min: 0, max: 8, step: 1, default: 2 },
      { key: 'windowGlow', label: 'Lights on', type: 'number', min: 0, max: 3, step: 0.1, default: 0, hint: 'Warm light in the windows' },
      { key: 'doorColor', label: 'Door colour', type: 'color', default: '#5b3a2a' },
      { key: 'foundation', label: 'Plinth height', type: 'number', min: 0, max: 1.5, default: 0.45, unit: 'm' },
      { key: 'porch', label: 'Porch', type: 'select', options: ['none', 'front'], default: 'none' },
      { key: 'porchDepth', label: 'Porch depth', type: 'number', min: 1, max: 4, default: 1.8, unit: 'm' },
      { key: 'chimney', label: 'Chimney', type: 'select', options: ['none', 'left', 'right'], default: 'right' },
      { key: 'gutters', label: 'Gutters', type: 'select', options: ['yes', 'no'], default: 'yes' },
      seed,
    ],
  },
  boat: {
    label: 'Rowing boat',
    description: 'A clinker-built rowing boat with lapped strakes, ribs, thwarts, gunwales and oars. Bow towards +z; its keel sits on y 0, so on water lift it a few centimetres.',
    params: [
      { key: 'length', label: 'Length', type: 'number', min: 1.5, max: 8, default: 3.6, unit: 'm' },
      { key: 'beam', label: 'Beam', type: 'number', min: 0.6, max: 2.5, default: 1.3, unit: 'm' },
      { key: 'hullColor', label: 'Hull colour', type: 'color', default: '#2f4f5f' },
      { key: 'insideColor', label: 'Inside colour', type: 'color', default: '#a07a52' },
      { key: 'oars', label: 'Oars', type: 'select', options: ['yes', 'no'], default: 'yes' },
      seed,
    ],
  },
  dock: {
    label: 'Jetty',
    description: 'A timber jetty: deck planks with gaps on stringers and piles that run 1.4 m below y 0 into the water, a cleat and an optional ladder. Starts at z 0 and runs along +z; height is the deck above y 0.',
    params: [
      { key: 'length', label: 'Length', type: 'number', min: 1, max: 60, default: 6, unit: 'm' },
      { key: 'width', label: 'Width', type: 'number', min: 0.6, max: 6, default: 1.6, unit: 'm' },
      { key: 'height', label: 'Deck height', type: 'number', min: 0.1, max: 3, default: 0.5, unit: 'm' },
      { key: 'wood', label: 'Wood', type: 'color', default: '#7d6248' },
      { key: 'ladder', label: 'Ladder', type: 'select', options: ['yes', 'no'], default: 'yes' },
      seed,
    ],
  },
  fence: {
    label: 'Fence',
    description: 'A run of fence along x, centred: picket, rail or post-and-rail, with posts about every 2 m.',
    params: [
      { key: 'length', label: 'Length', type: 'number', min: 0.5, max: 100, default: 6, unit: 'm' },
      { key: 'height', label: 'Height', type: 'number', min: 0.4, max: 2.5, default: 1.1, unit: 'm' },
      { key: 'style', label: 'Style', type: 'select', options: ['picket', 'rail'], default: 'picket' },
      { key: 'color', label: 'Colour', type: 'color', default: '#e6e1d6' },
      seed,
    ],
  },
  lantern: {
    label: 'Lantern',
    description: 'A hurricane lantern with a metal frame round a glass chimney; glow lights it (pair with look.bloom).',
    params: [
      { key: 'height', label: 'Height', type: 'number', min: 0.1, max: 2, default: 0.35, unit: 'm' },
      { key: 'metal', label: 'Metal', type: 'color', default: '#3a3a38' },
      { key: 'glow', label: 'Glow', type: 'number', min: 0, max: 4, step: 0.1, default: 1.5 },
    ],
  },
  crate: {
    label: 'Crate',
    description: 'A planked wooden crate with corner battens and a diagonal brace.',
    params: [
      { key: 'size', label: 'Size', type: 'number', min: 0.2, max: 3, default: 0.6, unit: 'm' },
      { key: 'wood', label: 'Wood', type: 'color', default: '#a07c55' },
      seed,
    ],
  },
  barrel: {
    label: 'Barrel',
    description: 'A coopered barrel of bulging staves held by iron hoops.',
    params: [
      { key: 'height', label: 'Height', type: 'number', min: 0.2, max: 3, default: 0.9, unit: 'm' },
      { key: 'wood', label: 'Wood', type: 'color', default: '#80583a' },
      seed,
    ],
  },
  bench: {
    label: 'Bench',
    description: 'A garden bench of wooden slats on two metal frames, with a back. Seat faces +z.',
    params: [
      { key: 'length', label: 'Length', type: 'number', min: 0.6, max: 5, default: 1.6, unit: 'm' },
      { key: 'wood', label: 'Wood', type: 'color', default: '#8f6a45' },
      { key: 'frame', label: 'Frame', type: 'color', default: '#2e2f30' },
      seed,
    ],
  },
  model: {
    label: 'Kit model',
    description: 'A ready-made CC0 model from the bundled kit (Poly Haven), placed by name at real size with its own textures; material settings do not apply to it.',
    params: [{ key: 'name', label: 'Model', type: 'select', options: KIT_NAMES, default: 'barrel' }],
  },
  roundedBox: {
    label: 'Rounded box',
    description: 'A unit box with softened edges, for product and architectural shapes; size it with scale.',
    params: [
      { key: 'radius', label: 'Edge radius', type: 'number', min: 0, max: 0.5, step: 0.01, default: 0.08 },
      { key: 'segments', label: 'Edge detail', type: 'number', min: 1, max: 10, step: 1, default: 4 },
    ],
  },
}

export const GENERATOR_KINDS = /** @type {const} */ (['terrain', 'scatter', 'tree', 'rock', 'water', 'roundedBox', 'building', 'boat', 'dock', 'fence', 'lantern', 'crate', 'barrel', 'bench', 'model'])

/**
 * A generator's parameters with every default filled in. Unknown keys are dropped.
 * @param {string} kind
 * @param {Record<string, unknown> | undefined} params
 * @returns {Record<string, number | string>}
 */
export function generatorParams(kind, params = {}) {
  const spec = GENERATORS[kind]
  if (!spec) return {}
  /** @type {Record<string, number | string>} */
  const out = {}
  for (const param of spec.params) {
    const value = params?.[param.key]
    out[param.key] = value === undefined ? param.default : /** @type {number | string} */ (value)
  }
  return out
}

/**
 * Why a generator's parameters are wrong, or null when they are right.
 * @param {string} kind
 * @param {Record<string, unknown>} params
 * @returns {string | null}
 */
export function generatorParamProblem(kind, params) {
  const spec = GENERATORS[kind]
  if (!spec) return `${kind} has no parameters`
  for (const [key, value] of Object.entries(params)) {
    const param = spec.params.find(item => item.key === key)
    if (!param) return `${spec.label} has no parameter "${key}" (it has ${spec.params.map(item => item.key).join(', ')})`
    if (param.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value) || value < param.min || value > param.max))
      return `${spec.label} ${key} must be a number from ${param.min} to ${param.max}`
    if (param.type === 'color' && (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)))
      return `${spec.label} ${key} must be a #rrggbb colour`
    if (param.type === 'select' && (typeof value !== 'string' || !param.options.includes(value)))
      return `${spec.label} ${key} must be one of ${param.options.join(', ')}`
    if (param.type === 'object' && typeof value !== 'string')
      return `${spec.label} ${key} must be an object id`
  }
  return null
}

/** One line per generator for tool descriptions: kind, what it is, and its parameters with defaults. */
export function generatorGuide() {
  return Object.entries(GENERATORS).map(([kind, spec]) => `${kind}: ${spec.description} params ${spec.params.map(param => `${param.key}${param.type === 'select' ? `(${param.options.join('|')})` : ''}=${JSON.stringify(param.default)}`).join(', ')}`).join('. ')
}
