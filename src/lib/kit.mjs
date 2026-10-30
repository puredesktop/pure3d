/**
 * The model kit: CC0 models from Poly Haven bundled with Pure3D (public/kit, credits in public/kit/CREDITS.md). A scene
 * places one by name as a `model` object; the model loads from the app, so scenes stay small. size is width × depth ×
 * height in metres at scale 1.
 *
 * @typedef {{ name: string, label: string, category: string, size: [number, number, number] }} KitModel
 */

/** @type {KitModel[]} */
export const KIT = [
  { name: 'barrel', label: 'Wine barrel', category: 'props', size: [0.74, 0.76, 0.87] },
  { name: 'barrel-stack', label: 'Stack of wooden barrels', category: 'props', size: [4.44, 3.34, 0.96] },
  { name: 'crate-long', label: 'Long wooden crate', category: 'props', size: [0.83, 0.41, 0.35] },
  { name: 'crate-large', label: 'Large wooden crate', category: 'props', size: [1.17, 0.53, 0.46] },
  { name: 'bucket', label: 'Wooden bucket', category: 'props', size: [0.37, 0.34, 0.55] },
  { name: 'lantern-wooden', label: 'Wooden lantern', category: 'lighting', size: [0.22, 0.23, 0.53] },
  { name: 'lantern-brass', label: 'Brass hanging lantern', category: 'lighting', size: [0.12, 0.1, 0.29] },
  { name: 'oil-lamp', label: 'Vintage oil lamp', category: 'lighting', size: [0.22, 0.22, 0.8] },
  { name: 'bench-painted', label: 'Painted wooden bench', category: 'furniture', size: [1.16, 0.5, 0.89] },
  { name: 'picnic-table', label: 'Wooden picnic table with benches', category: 'furniture', size: [2.24, 3.02, 0.75] },
  { name: 'table-and-chairs', label: 'Outdoor table and two chairs', category: 'furniture', size: [0.78, 1.83, 0.86] },
  { name: 'chair', label: 'Painted wooden chair', category: 'furniture', size: [0.43, 0.54, 0.96] },
  { name: 'rocking-chair', label: 'Rocking chair', category: 'furniture', size: [0.71, 0.83, 0.99] },
  { name: 'stool', label: 'Folding wooden stool', category: 'furniture', size: [0.53, 0.55, 0.44] },
  { name: 'axe', label: 'Wood axe', category: 'tools', size: [0.05, 0.21, 0.63] },
  { name: 'spade', label: 'Rusted spade', category: 'tools', size: [0.17, 0.05, 1.1] },
  { name: 'ladder', label: 'Wooden ladder', category: 'tools', size: [0.96, 0.5, 1.33] },
  { name: 'watering-can', label: 'Metal watering can', category: 'tools', size: [0.19, 0.45, 0.2] },
  { name: 'basket', label: 'Wicker basket', category: 'props', size: [0.38, 0.3, 0.12] },
  { name: 'planter-box', label: 'Wooden planter box', category: 'garden', size: [0.91, 0.41, 0.42] },
  { name: 'clay-pot', label: 'Clay plant pot', category: 'garden', size: [0.27, 0.26, 0.22] },
  { name: 'fire-pit', label: 'Stone fire pit', category: 'garden', size: [1.45, 1.43, 0.39] },
  { name: 'lifebuoy', label: 'Lifebuoy ring', category: 'waterside', size: [0.78, 0.16, 0.84] },
  { name: 'buoy', label: 'Ocean marker buoy', category: 'waterside', size: [1.07, 0.95, 2.66] },
  { name: 'tree-stump', label: 'Tree stump with roots', category: 'nature', size: [1.43, 1.59, 0.57] },
  { name: 'fallen-branches', label: 'Pile of dry fallen branches', category: 'nature', size: [1.06, 1.3, 0.34] },
  { name: 'fern-clump', label: 'Fern clump', category: 'nature', size: [1.97, 1.72, 0.43] },
  { name: 'shrub', label: 'Low leafy shrub', category: 'nature', size: [1.37, 0.15, 0.4] },
  { name: 'mossy-rocks', label: 'Set of mossy rocks', category: 'nature', size: [8.28, 3.41, 1.37] },
  { name: 'stone', label: 'Small stone', category: 'nature', size: [0.17, 0.32, 0.14] },
]

export const KIT_NAMES = KIT.map(model => model.name)

/** One line for tool descriptions: every model with its size. */
export function kitGuide() {
  return KIT.map(model => `${model.name} (${model.label.toLowerCase()}, ${model.size.join('×')} m)`).join(', ')
}
