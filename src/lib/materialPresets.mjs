/**
 * Material presets: real materials by name (gold, glass, velvet…), so a few words give a believable finish. A preset
 * sets every property it names; the object's own values set alongside it win, and setting a preset in an update clears
 * the older values it replaces.
 *
 * @typedef {{ color: string, metalness: number, roughness: number, clearcoat: number, transmission: number, sheen: number, surface: string, label: string }} MaterialPreset
 */

const base = { clearcoat: 0, transmission: 0, sheen: 0, surface: 'none' }
/** @type {Record<string, MaterialPreset>} */
export const MATERIAL_PRESETS = {
  gold: { ...base, label: 'Gold', color: '#e6b84f', metalness: 1, roughness: 0.22 },
  silver: { ...base, label: 'Silver', color: '#dcdcda', metalness: 1, roughness: 0.16 },
  chrome: { ...base, label: 'Chrome', color: '#f4f5f7', metalness: 1, roughness: 0.04 },
  copper: { ...base, label: 'Copper', color: '#c8724c', metalness: 1, roughness: 0.28 },
  brass: { ...base, label: 'Brass', color: '#c9a24a', metalness: 1, roughness: 0.32 },
  steel: { ...base, label: 'Brushed steel', color: '#a3a8ac', metalness: 1, roughness: 0.36, surface: 'metal' },
  aluminium: { ...base, label: 'Aluminium', color: '#c9cdd1', metalness: 1, roughness: 0.3 },
  iron: { ...base, label: 'Cast iron', color: '#3d3c3b', metalness: 0.85, roughness: 0.62 },
  glass: { ...base, label: 'Clear glass', color: '#ffffff', metalness: 0, roughness: 0.02, transmission: 1 },
  'frosted-glass': { ...base, label: 'Frosted glass', color: '#f3f6f8', metalness: 0, roughness: 0.38, transmission: 1 },
  ceramic: { ...base, label: 'Glazed ceramic', color: '#efebe4', metalness: 0, roughness: 0.28, clearcoat: 0.6 },
  porcelain: { ...base, label: 'Porcelain', color: '#fbfaf7', metalness: 0, roughness: 0.12, clearcoat: 1 },
  plastic: { ...base, label: 'Matte plastic', color: '#d24a3c', metalness: 0, roughness: 0.45 },
  'glossy-plastic': { ...base, label: 'Glossy plastic', color: '#2f6fd0', metalness: 0, roughness: 0.18, clearcoat: 0.8 },
  rubber: { ...base, label: 'Rubber', color: '#232325', metalness: 0, roughness: 0.92 },
  velvet: { ...base, label: 'Velvet', color: '#6b1f3a', metalness: 0, roughness: 0.85, sheen: 1 },
  satin: { ...base, label: 'Satin', color: '#c9b8d6', metalness: 0, roughness: 0.35, sheen: 0.6 },
  fabric: { ...base, label: 'Woven fabric', color: '#7d8a99', metalness: 0, roughness: 0.95, sheen: 0.4, surface: 'fabric' },
  leather: { ...base, label: 'Leather', color: '#5a3622', metalness: 0, roughness: 0.6, clearcoat: 0.15, surface: 'leather' },
  'car-paint': { ...base, label: 'Car paint', color: '#b3161f', metalness: 0.45, roughness: 0.35, clearcoat: 1 },
  'varnished-wood': { ...base, label: 'Varnished wood', color: '#8a5a35', metalness: 0, roughness: 0.4, clearcoat: 0.7, surface: 'wood' },
  marble: { ...base, label: 'Polished marble', color: '#ece9e4', metalness: 0, roughness: 0.18, clearcoat: 0.5, surface: 'marble' },
  concrete: { ...base, label: 'Concrete', color: '#9d9b96', metalness: 0, roughness: 0.95, surface: 'concrete' },
  plaster: { ...base, label: 'Painted plaster', color: '#ece6dc', metalness: 0, roughness: 0.92, surface: 'plaster' },
}

export const MATERIAL_PRESET_NAMES = /** @type {[string, ...string[]]} */ (Object.keys(MATERIAL_PRESETS))

/** The material properties a preset sets (without its label). */
export function presetProperties(/** @type {string} */ name) {
  const preset = MATERIAL_PRESETS[name]
  if (!preset) return {}
  const { label: _label, ...properties } = preset
  return properties
}

/** One line for tool descriptions: every preset by name. */
export function presetGuide() {
  return MATERIAL_PRESET_NAMES.join(', ')
}
