import * as THREE from 'three'
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js'
import { SURFACE_KINDS } from './surfaceSpecs.mjs'
import { extendShader } from './shaderHooks'

/**
 * Surface detail for any material: a seamless pattern (height, colour tone, roughness) generated once per surface and
 * projected onto the object from three sides in its own space, in metres. Nothing is downloaded and no UVs are needed,
 * so it works the same on a box, a rock, a terrain or a forest of instanced trunks.
 */

export type SurfaceKind = (typeof SURFACE_KINDS)[number]
export type SurfaceSettings = { surface: SurfaceKind; scale: number; strength: number }

const SIZE = 512
const TAU = Math.PI * 2
const textures = new Map<string, THREE.DataTexture>()

function hash(x: number, y: number, seed = 0) {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
  return s - Math.floor(s)
}
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** Seamless noise: the square wrapped onto a torus in 4D, so both edges meet. fu/fv are whole repeats per tile. */
function tileNoise(seed: number) {
  const noise = new SimplexNoise({ random: mulberry(seed) })
  const one = (u: number, v: number, fu: number, fv: number, o = 0) => {
    const a = u * TAU, b = v * TAU, ru = fu / TAU, rv = fv / TAU
    return noise.noise4d(Math.cos(a) * ru + o, Math.sin(a) * ru - o, Math.cos(b) * rv + o * 0.7, Math.sin(b) * rv)
  }
  const fbm = (u: number, v: number, fu: number, fv: number, octaves = 4, gain = 0.5, o = 0) => {
    let sum = 0, amp = 1, norm = 0
    for (let i = 0; i < octaves; i++) {
      sum += one(u, v, fu, fv, o + i * 3.1) * amp
      norm += amp
      amp *= gain
      fu *= 2
      fv *= 2
    }
    return sum / norm
  }
  return { one, fbm }
}
function mulberry(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Seamless cells (Worley noise) on a cells × cells grid that wraps: f1 is the distance to the nearest cell point, f2 to
 * the second nearest (f2 - f1 is small along the cracks between cells), id names the nearest cell.
 */
function cells(u: number, v: number, count: number, seed: number) {
  const x = u * count, y = v * count, cx = Math.floor(x), cy = Math.floor(y)
  let f1 = 9, f2 = 9, id = 0
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const gx = cx + i, gy = cy + j
      const wx = ((gx % count) + count) % count, wy = ((gy % count) + count) % count
      const px = gx + 0.15 + hash(wx, wy, seed) * 0.7, py = gy + 0.15 + hash(wx, wy, seed + 1) * 0.7
      const d = Math.hypot(px - x, py - y)
      if (d < f1) { f2 = f1; f1 = d; id = wy * count + wx }
      else if (d < f2) f2 = d
    }
  return { f1, f2, id }
}

type Texel = [height: number, tone: number, roughness: number]
type Pattern = (u: number, v: number) => Texel

/** Each pattern gives height 0–1, a colour tone around 1 and a roughness factor around 1, for u, v in 0–1. */
function pattern(kind: SurfaceKind): Pattern {
  const n = tileNoise(kind.length * 97 + kind.charCodeAt(0))
  switch (kind) {
    case 'wood':
      return (u, v) => {
        const warp = n.fbm(u, v, 2, 3, 3) * 0.6
        const rings = Math.sin((v * 7 + warp) * TAU) * 0.5 + 0.5
        const grain = n.one(u, v, 3, 90) * 0.5 + 0.5
        return [rings * 0.4 + grain * 0.3, 0.78 + rings * 0.22 + grain * 0.1, 0.9 + grain * 0.2]
      }
    case 'planks':
      return (u, v) => {
        const boards = 6, row = Math.floor(v * boards), within = v * boards - row
        const offset = hash(row, 1)
        const along = (u + offset) % 1, piece = Math.floor(along * 2)
        const endSeam = Math.min(Math.abs(along * 2 - piece), Math.abs(along * 2 - piece - 1)) * 2
        const seam = Math.min(smooth(0, 0.05, within), smooth(0, 0.05, 1 - within), smooth(0, 0.012, endSeam))
        const id = row * 7 + piece
        const warp = n.fbm(u, v, 2, 6, 3) * 0.5
        const grain = Math.sin((v * boards * 2.5 + warp + hash(id, 3) * 9) * TAU) * 0.5 + 0.5
        const fibre = n.one(u, v, 4, 120) * 0.5 + 0.5
        const tone = (0.82 + hash(id, 2) * 0.3) * (0.85 + grain * 0.12 + fibre * 0.08)
        return [seam * (0.7 + fibre * 0.3), seam < 1 ? tone * (0.35 + seam * 0.65) : tone, seam < 1 ? 1.3 : 0.85 + fibre * 0.25]
      }
    case 'stone':
      return (u, v) => {
        const wu = u + n.fbm(u, v, 3, 3, 3, 0.5, 2) * 0.05, wv = v + n.fbm(u, v, 3, 3, 3, 0.5, 6) * 0.05
        const c = cells(((wu % 1) + 1) % 1, ((wv % 1) + 1) % 1, 3, 3)
        // only some joints open into cracks, and they fade along their length
        const open = smooth(0.35, 0.75, n.fbm(u, v, 4, 4, 2, 0.5, 13) * 0.5 + 0.5)
        const crack = (1 - smooth(0.0, 0.035, c.f2 - c.f1)) * open
        const body = n.fbm(u, v, 6, 6, 6, 0.55) * 0.5 + 0.5
        const grit = n.one(u, v, 96, 96, 4) * 0.5 + 0.5
        const strata = n.fbm(u, v, 1, 8, 3, 0.5, 21) * 0.5 + 0.5
        const face = hash(c.id, 0, 4)
        return [body * 0.55 + grit * 0.15 + 0.3 - crack * 0.25, (0.86 + face * 0.06 + body * 0.14 + strata * 0.06 + grit * 0.06) * (1 - crack * 0.18), 1.05 + crack * 0.1 - body * 0.1]
      }
    case 'concrete':
      return (u, v) => {
        const fine = n.fbm(u, v, 24, 24, 4) * 0.5 + 0.5
        const stain = n.fbm(u, v, 2, 2, 4, 0.6, 5) * 0.5 + 0.5
        const pore = n.one(u, v, 70, 70, 2) > 0.68 ? 1 : 0
        return [fine * 0.6 + 0.4 - pore * 0.5, (0.86 + stain * 0.22 + fine * 0.06) * (1 - pore * 0.3), 1 + pore * 0.2 - stain * 0.1]
      }
    case 'plaster':
      return (u, v) => {
        const soft = n.fbm(u, v, 3, 3, 4, 0.55) * 0.5 + 0.5
        const trowel = n.fbm(u, v, 6, 2, 3, 0.5, 4) * 0.5 + 0.5
        return [soft * 0.5 + trowel * 0.5, 0.93 + soft * 0.1, 0.95 + trowel * 0.15]
      }
    case 'brick':
      return (u, v) => {
        const courses = 8, row = Math.floor(v * courses), y = v * courses - row
        const across = 3, x = (u * across + (row % 2) * 0.5) % across, col = Math.floor(x), xi = x - col
        const mortar = Math.min(smooth(0, 0.09, y), smooth(0, 0.09, 1 - y), smooth(0, 0.03, xi), smooth(0, 0.03, 1 - xi))
        const id = row * 11 + col
        const face = n.fbm(u, v, 16, 16, 3) * 0.5 + 0.5
        const tone = (0.78 + hash(id, 5) * 0.34) * (0.9 + face * 0.15)
        return [mortar * (0.75 + face * 0.25), mortar < 1 ? 0.7 + face * 0.2 : tone, mortar < 1 ? 1.25 : 0.9 + face * 0.2]
      }
    case 'tiles':
      return (u, v) => {
        const count = 4, x = (u * count) % 1, y = (v * count) % 1
        const grout = Math.min(smooth(0, 0.035, x), smooth(0, 0.035, 1 - x), smooth(0, 0.035, y), smooth(0, 0.035, 1 - y))
        const id = Math.floor(u * count) * 5 + Math.floor(v * count)
        const glaze = n.fbm(u, v, 8, 8, 3) * 0.5 + 0.5
        return [grout * 0.9 + glaze * 0.1 * grout, grout < 1 ? 0.6 + grout * 0.35 : 0.95 + hash(id, 8) * 0.08, grout < 1 ? 1.6 : 0.55 + glaze * 0.15]
      }
    case 'metal':
      return (u, v) => {
        const streak = n.one(u, v, 2, 220) * 0.5 + 0.5
        const smudge = n.fbm(u, v, 3, 3, 3) * 0.5 + 0.5
        return [streak * 0.5, 0.96 + streak * 0.06, 0.75 + streak * 0.35 + smudge * 0.2]
      }
    case 'fabric':
      return (u, v) => {
        const threads = 16
        const warp = Math.sin(u * threads * TAU) * 0.5 + 0.5, weft = Math.sin(v * threads * TAU) * 0.5 + 0.5
        const over = (Math.floor(u * threads * 2) + Math.floor(v * threads * 2)) % 2 ? warp : weft
        const fuzz = n.one(u, v, 40, 40) * 0.5 + 0.5
        return [over * 0.8 + fuzz * 0.2, 0.86 + over * 0.16 + fuzz * 0.04, 1.05 + fuzz * 0.1]
      }
    case 'leather':
      return (u, v) => {
        const c = cells(u, v, 22, 5)
        const groove = 1 - smooth(0, 0.12, c.f2 - c.f1)
        const crease = 1 - smooth(0, 0.05, Math.abs(n.fbm(u, v, 3, 3, 3, 0.5)))
        return [0.75 - groove * 0.35 - crease * 0.3, 0.92 - groove * 0.1 - crease * 0.12 + hash(c.id, 1, 5) * 0.06, 0.95 + groove * 0.2]
      }
    case 'marble':
      return (u, v) => {
        const vein = 1 - smooth(0, 0.035, Math.abs(n.fbm(u, v, 2, 3, 7, 0.58)))
        const faint = 1 - smooth(0, 0.02, Math.abs(n.fbm(u, v, 4, 3, 6, 0.6, 11)))
        const cloud = n.fbm(u, v, 2, 2, 4, 0.5, 3) * 0.5 + 0.5
        return [0.5, (0.93 + cloud * 0.08) * (1 - vein * 0.45 - faint * 0.15), 0.9 + vein * 0.3]
      }
    case 'bark':
      return (u, v) => {
        const ridge = 1 - Math.abs(n.fbm(u, v, 9, 2, 4, 0.5))
        const plates = n.one(u, v, 5, 6, 7) * 0.5 + 0.5
        const height = Math.pow(ridge, 2.2) * (0.7 + plates * 0.3)
        return [height, 0.55 + height * 0.65, 1.1 - height * 0.15]
      }
    case 'ground':
      return (u, v) => {
        const soil = n.fbm(u, v, 5, 5, 5, 0.55) * 0.5 + 0.5
        const c = cells(u, v, 14, 9)
        const pebble = (1 - smooth(0.08, 0.2, c.f1)) * (hash(c.id, 2, 9) > 0.8 ? 1 : 0)
        const clump = smooth(0.2, 0.7, n.fbm(u, v, 3, 3, 3, 0.5, 8))
        const grit = n.one(u, v, 80, 80, 5) * 0.5 + 0.5
        return [soil * 0.55 + grit * 0.2 + pebble * 0.25, (0.8 + soil * 0.26 + grit * 0.08) * (0.9 + clump * 0.14), 1.05 - pebble * 0.1]
      }
    case 'sand':
      return (u, v) => {
        const ripple = Math.sin((v * 9 + n.fbm(u, v, 2, 2, 3) * 0.8) * TAU) * 0.5 + 0.5
        const grain = n.one(u, v, 150, 150) * 0.5 + 0.5
        return [ripple * 0.7 + grain * 0.3, 0.9 + ripple * 0.08 + grain * 0.06, 1]
      }
    default:
      throw new Error(`Unknown surface: ${kind}`)
  }
}

/**
 * A surface's pattern texture, shared by every material that uses it: R height, G colour tone (0.5 = unchanged),
 * B roughness factor (0.5 = unchanged).
 */
export function surfaceTexture(kind: SurfaceKind): THREE.DataTexture {
  const existing = textures.get(kind)
  if (existing) return existing
  const data = new Uint8Array(SIZE * SIZE * 4)
  const draw = pattern(kind)
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const [height, tone, roughness] = draw(x / SIZE, y / SIZE)
      const i = (y * SIZE + x) * 4
      data[i] = Math.round(clamp01(height) * 255)
      data[i + 1] = Math.round(clamp01(tone / 2) * 255)
      data[i + 2] = Math.round(clamp01(roughness / 2) * 255)
      data[i + 3] = 255
    }
  const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = 8
  texture.colorSpace = THREE.NoColorSpace
  texture.needsUpdate = true
  // shared by every material on this surface: material disposal must not drop it
  texture.userData.shared = true
  textures.set(kind, texture)
  return texture
}

/** How deep each surface's bumps are, as a share of one repeat. */
const DEPTH: Record<SurfaceKind, number> = {
  wood: 0.0015, planks: 0.004, stone: 0.012, concrete: 0.002, plaster: 0.003, brick: 0.012, tiles: 0.006, metal: 0.0006,
  fabric: 0.02, leather: 0.006, marble: 0, bark: 0.03, ground: 0.012, sand: 0.004,
}

const VERTEX_HEAD = /* glsl */ `
varying vec3 p3dPosition;
varying vec3 p3dNormal;
#ifdef P3D_SURFACE_MASK
attribute float surfaceMask;
varying float p3dMask;
#endif
`
const VERTEX_BODY = /* glsl */ `
vec3 p3dScale = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
p3dPosition = transformed * p3dScale;
p3dNormal = normalize(objectNormal / max(p3dScale, vec3(1e-4)));
#ifdef P3D_SURFACE_MASK
p3dMask = surfaceMask;
#endif
`
const FRAGMENT_HEAD = /* glsl */ `
uniform sampler2D p3dSurface;
uniform float p3dSurfaceScale;
uniform float p3dSurfaceStrength;
uniform float p3dSurfaceDepth;
varying vec3 p3dPosition;
varying vec3 p3dNormal;
#ifdef P3D_SURFACE_MASK
varying float p3dMask;
#endif
vec3 p3dWeights() {
  vec3 w = pow(abs(normalize(p3dNormal)), vec3(4.0));
  return w / (w.x + w.y + w.z);
}
vec4 p3dSample(vec3 p, vec3 w) {
  return texture2D(p3dSurface, p.zy) * w.x + texture2D(p3dSurface, p.xz) * w.y + texture2D(p3dSurface, p.xy) * w.z;
}
vec3 p3dPerturb(vec3 position, vec3 normal, vec2 dHdxy, float faceDirection) {
  vec3 vSigmaX = normalize(dFdx(position.xyz));
  vec3 vSigmaY = normalize(dFdy(position.xyz));
  vec3 vN = normal;
  vec3 R1 = cross(vSigmaY, vN);
  vec3 R2 = cross(vN, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * vN - vGrad);
}
`

/**
 * Lays a surface over a material: its colour tone, roughness and bumps. hasMask: the geometry carries a surfaceMask
 * attribute (generated trees: 1 on bark, 0 on leaves) that limits the surface to part of the shape.
 */
export function applySurface(material: THREE.MeshStandardMaterial, settings: SurfaceSettings, hasMask = false) {
  const texture = surfaceTexture(settings.surface)
  const uniforms = {
    p3dSurface: { value: texture },
    p3dSurfaceScale: { value: 1 / Math.max(settings.scale, 1e-3) },
    p3dSurfaceStrength: { value: settings.strength },
    // bump depth in metres: a share of one repeat, scaled by strength
    p3dSurfaceDepth: { value: DEPTH[settings.surface] * settings.scale * settings.strength },
  }
  material.userData.surface = settings
  if (hasMask) material.defines = { ...(material.defines ?? {}), P3D_SURFACE_MASK: '' }
  extendShader(material, `surface${hasMask ? '-mask' : ''}`, shader => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_BODY}`)
    const mask = hasMask ? ' * p3dMask' : ''
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_HEAD}`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec3 p3dW = p3dWeights();
        vec3 p3dP = p3dPosition * p3dSurfaceScale;
        vec4 p3dS = p3dSample(p3dP, p3dW);
        float p3dAmount = p3dSurfaceStrength${mask};
        diffuseColor.rgb *= mix(1.0, p3dS.g * 2.0, clamp(p3dAmount, 0.0, 2.0));`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * mix(1.0, p3dS.b * 2.0, clamp(p3dAmount, 0.0, 1.0)), 0.02, 1.0);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        if (p3dSurfaceDepth > 0.0) {
          float p3dH = p3dS.r;
          float p3dHx = p3dSample(p3dP + dFdx(p3dP), p3dW).r;
          float p3dHy = p3dSample(p3dP + dFdy(p3dP), p3dW).r;
          vec2 p3dDH = vec2(p3dHx - p3dH, p3dHy - p3dH) * p3dSurfaceDepth${mask};
          normal = p3dPerturb(-vViewPosition, normal, p3dDH, faceDirection);
        }`,
      )
  })
}
