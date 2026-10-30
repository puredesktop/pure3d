import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { generatorParams } from './generatorSpecs.mjs'
import { prepare, seeded } from './generators'
import type { SurfaceKind } from './surfaces'

/**
 * Made things from parameters: a building with real siding, trim, windows, roof and porch, and the props around it
 * (boat, dock, fence, lantern, crate, barrel, bench). Each is one geometry in parts (siding, trim, roof, glass, stone,
 * metal…); every part gets its own material, so planks, stone and glass each look like themselves. Colours are vertex
 * colours with a little seeded weathering, so the same parameters always make the same thing.
 */

type Params = Record<string, number | string>
const num = (params: Params, key: string) => Number(params[key])
const str = (params: Params, key: string) => String(params[key])

/** How one part of a made thing is finished. The object's material colour still tints every part. */
export type PartStyle = {
  surface?: SurfaceKind | 'none'
  surfaceScale?: number
  surfaceStrength?: number
  roughness?: number
  metalness?: number
  emissive?: string
  emissiveIntensity?: number
}

const STYLES = {
  siding: { surface: 'wood', surfaceScale: 0.9, surfaceStrength: 0.8, roughness: 0.85 },
  wall: { surface: 'wood', surfaceScale: 1.2, surfaceStrength: 0.6, roughness: 0.9 },
  plaster: { surface: 'plaster', roughness: 0.95 },
  brick: { surface: 'brick', roughness: 0.9 },
  stone: { surface: 'stone', surfaceScale: 1.2, surfaceStrength: 1.3, roughness: 0.95 },
  trim: { surface: 'wood', surfaceScale: 0.6, surfaceStrength: 0.35, roughness: 0.6 },
  roof: { surface: 'wood', surfaceScale: 0.5, surfaceStrength: 1.1, roughness: 0.9 },
  roofMetal: { surface: 'metal', surfaceScale: 0.6, roughness: 0.45, metalness: 0.7 },
  glass: { surface: 'none', roughness: 0.04, metalness: 0.1 },
  deck: { surface: 'planks', surfaceScale: 1.4, surfaceStrength: 0.8, roughness: 0.85 },
  wood: { surface: 'wood', surfaceScale: 0.5, surfaceStrength: 1, roughness: 0.8 },
  metal: { surface: 'metal', surfaceScale: 0.3, roughness: 0.4, metalness: 0.85 },
  paint: { surface: 'wood', surfaceScale: 0.5, surfaceStrength: 0.35, roughness: 0.55 },
  dark: { surface: 'none', roughness: 0.9 },
} satisfies Record<string, PartStyle>
type PartName = keyof typeof STYLES

type Tint = THREE.Color | ((p: THREE.Vector3, n: THREE.Vector3) => THREE.Color)

/** Collects pieces by part and merges them into one geometry with a group (and a material) per part. */
class Parts {
  private readonly pieces = new Map<PartName, THREE.BufferGeometry[]>()
  private readonly styles = new Map<PartName, PartStyle>()
  constructor(readonly random: () => number) {}
  /** A slightly varied copy of a colour, so boards and shingles are not all identical. */
  vary(colour: THREE.Color, amount = 0.08): THREE.Color {
    return colour.clone().multiplyScalar(1 - amount + this.random() * amount * 2)
  }
  /** Overrides how a part is finished (a building's lit windows, say). */
  style(part: PartName, style: PartStyle) {
    this.styles.set(part, { ...this.styles.get(part), ...style })
  }
  add(part: PartName, geometry: THREE.BufferGeometry, tint: Tint, style?: PartStyle) {
    if (!this.pieces.has(part)) this.pieces.set(part, [])
    if (style) this.styles.set(part, style)
    this.pieces.get(part)!.push(prepare(geometry, tint))
  }
  /** A box of size w × h × d centred at (x, y, z), turned by (rx, ry, rz). */
  box(part: PartName, w: number, h: number, d: number, x: number, y: number, z: number, tint: Tint, rotation?: [number, number, number]) {
    const box = new THREE.BoxGeometry(Math.max(w, 1e-3), Math.max(h, 1e-3), Math.max(d, 1e-3))
    if (rotation) box.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation)))
    box.translate(x, y, z)
    this.add(part, box, tint)
  }
  /** A cylinder between two points. */
  rod(part: PartName, from: THREE.Vector3, to: THREE.Vector3, radius: number, tint: Tint, segments = 8, radiusEnd = radius) {
    const length = from.distanceTo(to)
    const rod = new THREE.CylinderGeometry(radiusEnd, radius, length, segments)
    rod.translate(0, length / 2, 0)
    rod.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize()))
    rod.translate(from.x, from.y, from.z)
    this.add(part, rod, tint)
  }
  build(): THREE.BufferGeometry {
    const names = [...this.pieces.keys()]
    const merged = names.map(name => {
      const pieces = this.pieces.get(name)!
      const one = mergeGeometries(pieces, false)
      for (const piece of pieces) piece.dispose()
      if (!one) throw new Error('Could not build that shape')
      return one
    })
    const geometry = mergeGeometries(merged, true)
    for (const one of merged) one.dispose()
    if (!geometry) throw new Error('Could not build that shape')
    geometry.userData.parts = names.map(name => ({ ...STYLES[name], ...this.styles.get(name) }))
    return geometry
  }
}

/** A flat slab from a convex outline (top face), thickened downwards along its normal. */
function slab(outline: THREE.Vector3[], thickness: number): THREE.BufferGeometry {
  const normal = new THREE.Vector3().crossVectors(outline[1]!.clone().sub(outline[0]!), outline[2]!.clone().sub(outline[0]!)).normalize()
  if (normal.y < 0) normal.negate()
  const below = outline.map(p => p.clone().addScaledVector(normal, -thickness))
  const positions: number[] = []
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
  const n = outline.length
  // wind the top towards its normal
  const flip = new THREE.Vector3().crossVectors(outline[1]!.clone().sub(outline[0]!), outline[2]!.clone().sub(outline[0]!)).y < 0
  for (let i = 1; i < n - 1; i++) {
    if (flip) { tri(outline[0]!, outline[i + 1]!, outline[i]!); tri(below[0]!, below[i]!, below[i + 1]!) }
    else { tri(outline[0]!, outline[i]!, outline[i + 1]!); tri(below[0]!, below[i + 1]!, below[i]!) }
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    if (flip) { tri(outline[i]!, below[i]!, outline[j]!); tri(outline[j]!, below[i]!, below[j]!) }
    else { tri(outline[i]!, outline[j]!, below[i]!); tri(outline[j]!, below[j]!, below[i]!) }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

/** Intervals of [from, to] left after cutting out the given gaps. */
function around(from: number, to: number, gaps: [number, number][]): [number, number][] {
  let pieces: [number, number][] = [[from, to]]
  for (const [a, b] of gaps)
    pieces = pieces.flatMap(([x0, x1]) => (b <= x0 || a >= x1 ? [[x0, x1] as [number, number]] : ([[x0, a], [b, x1]] as [number, number][]).filter(([p, q]) => q - p > 0.02)))
  return pieces
}

// ─── Building ───────────────────────────────────────────────────────────────

type Opening = { x0: number; x1: number; y0: number; y1: number; door?: boolean }

/** A wall seen from outside: x along it (centred), y up from the floor, outer face towards +z. */
type WallFrame = { length: number; height: number; place: (g: THREE.BufferGeometry) => THREE.BufferGeometry }

export function building(input: Params): THREE.BufferGeometry {
  const params = generatorParams('building', input)
  const random = seeded(num(params, 'seed') * 17 + 3)
  const parts = new Parts(random)
  const W = num(params, 'width'), D = num(params, 'depth')
  const storeys = Math.round(num(params, 'storeys')), storeyHeight = num(params, 'storeyHeight')
  const plinth = num(params, 'foundation')
  const H = storeys * storeyHeight
  const top = plinth + H
  const t = 0.2
  const siding = str(params, 'siding')
  const sidingColour = new THREE.Color(str(params, 'sidingColor')), trim = new THREE.Color(str(params, 'trimColor'))
  const roofColour = new THREE.Color(str(params, 'roofColor')), doorColour = new THREE.Color(str(params, 'doorColor'))
  const stone = new THREE.Color('#8b857b'), glass = new THREE.Color('#2a3238'), metal = new THREE.Color('#5d5f60')
  // weathering: walls darken towards the ground and vary board by board
  const weathered = (base: THREE.Color) => (p: THREE.Vector3) => base.clone().multiplyScalar(0.78 + 0.22 * Math.min(1, Math.max(0, (p.y - plinth) / 1.2)))
  const wallStyle: PartName = siding === 'plaster' ? 'plaster' : siding === 'brick' ? 'brick' : siding === 'stone' ? 'stone' : 'wall'
  const wallPart: PartName = wallStyle

  // walls: front and back run the full width, the sides fit between them
  const walls: { name: 'front' | 'back' | 'left' | 'right'; frame: WallFrame; windows: number }[] = []
  const frame = (length: number, rotate: number, x: number, z: number): WallFrame => ({
    length,
    height: H,
    place: g => g.rotateY(rotate).translate(x, plinth, z),
  })
  walls.push({ name: 'front', frame: frame(W, 0, 0, D / 2 - t / 2), windows: num(params, 'windowsFront') })
  walls.push({ name: 'back', frame: frame(W, Math.PI, 0, -D / 2 + t / 2), windows: num(params, 'windowsBack') })
  walls.push({ name: 'right', frame: frame(D - 2 * t, Math.PI / 2, W / 2 - t / 2, 0), windows: num(params, 'windowsSide') })
  walls.push({ name: 'left', frame: frame(D - 2 * t, -Math.PI / 2, -W / 2 + t / 2, 0), windows: num(params, 'windowsSide') })

  const ww = 0.9, wh = 1.25, sill = 0.85, dw = 0.95, dh = 2.1
  for (const wall of walls) {
    const { length, place } = wall.frame
    const openings: Opening[] = []
    for (let s = 0; s < storeys; s++) {
      const y0 = s * storeyHeight + sill
      const count = Math.round(wall.windows)
      const withDoor = s === 0 && wall.name === 'front'
      const slots = count + (withDoor ? 1 : 0)
      for (let i = 0; i < slots; i++) {
        const cx = -length / 2 + (length * (i + 0.5)) / slots
        const door = withDoor && i === Math.floor(slots / 2)
        if (door) openings.push({ x0: cx - dw / 2, x1: cx + dw / 2, y0: 0, y1: dh, door: true })
        else openings.push({ x0: cx - ww / 2, x1: cx + ww / 2, y0, y1: y0 + wh })
      }
    }
    // the wall itself, as cells around the openings
    const xs = [...new Set([-length / 2, length / 2, ...openings.flatMap(o => [o.x0, o.x1])])].sort((a, b) => a - b)
    const ys = [...new Set([0, H, ...openings.flatMap(o => [o.y0, o.y1])])].sort((a, b) => a - b)
    for (let i = 0; i < xs.length - 1; i++)
      for (let j = 0; j < ys.length - 1; j++) {
        const cx = (xs[i]! + xs[i + 1]!) / 2, cy = (ys[j]! + ys[j + 1]!) / 2
        if (openings.some(o => cx > o.x0 && cx < o.x1 && cy > o.y0 && cy < o.y1)) continue
        const cell = new THREE.BoxGeometry(xs[i + 1]! - xs[i]!, ys[j + 1]! - ys[j]!, t)
        cell.translate(cx, cy, 0)
        parts.add(wallPart, place(cell), weathered(sidingColour))
      }
    // siding with real relief, kept clear of the openings
    const margin = 0.1
    const gapsAt = (y0: number, y1: number) => openings.filter(o => y1 > o.y0 - margin && y0 < o.y1 + margin).map(o => [o.x0 - margin, o.x1 + margin] as [number, number])
    if (siding === 'clapboard' || siding === 'shingle' || siding === 'log') {
      const rowHeight = siding === 'log' ? 0.26 : siding === 'shingle' ? 0.2 : 0.18
      for (let y = 0, row = 0; y < H - 0.02; y += rowHeight, row++) {
        const h = Math.min(rowHeight, H - y)
        for (const [a, b] of around(-length / 2 - (siding === 'log' ? 0.22 : 0), length / 2 + (siding === 'log' ? 0.22 : 0), gapsAt(y, y + h))) {
          if (siding === 'log') {
            const log = new THREE.CylinderGeometry(h * 0.55, h * 0.55, b - a, 10)
            log.rotateZ(Math.PI / 2)
            log.translate((a + b) / 2, y + h / 2, t / 2)
            parts.add('siding', place(log), parts.vary(sidingColour, 0.1))
          } else if (siding === 'shingle') {
            const tab = 0.28
            for (let x = a + (row % 2) * tab * 0.5; x < b - 0.02; x += tab) {
              const w = Math.min(tab - 0.012, b - x)
              const shingle = new THREE.BoxGeometry(w, h + 0.05, 0.022)
              shingle.rotateX(-0.06)
              shingle.translate(x + w / 2, y + h / 2, t / 2 + 0.013)
              parts.add('siding', place(shingle), parts.vary(sidingColour, 0.12))
            }
          } else {
            const board = new THREE.BoxGeometry(b - a, h + 0.035, 0.024)
            // each board laps over the one below: its bottom edge stands proud
            board.rotateX(-0.09)
            board.translate((a + b) / 2, y + h / 2, t / 2 + 0.014)
            parts.add('siding', place(board), parts.vary(sidingColour, 0.05))
          }
        }
      }
    } else if (siding === 'boards') {
      // board and batten: a batten over every joint
      for (let x = -length / 2 + 0.2; x < length / 2 - 0.1; x += 0.42) {
        const blocked = openings.filter(o => x > o.x0 - margin && x < o.x1 + margin).map(o => [o.y0 - margin, o.y1 + margin] as [number, number])
        for (const [a, b] of around(0, H, blocked)) {
          const batten = new THREE.BoxGeometry(0.065, b - a, 0.03)
          batten.translate(x, (a + b) / 2, t / 2 + 0.015)
          parts.add('siding', place(batten), weathered(sidingColour))
        }
      }
    }
    // corner boards on the front and back walls, which cover the corners
    if ((wall.name === 'front' || wall.name === 'back') && siding !== 'brick' && siding !== 'stone' && siding !== 'log')
      for (const side of [-1, 1]) {
        const board = new THREE.BoxGeometry(0.14, H, 0.05)
        board.translate(side * (length / 2 - 0.05), H / 2, t / 2 + 0.03)
        parts.add('trim', place(board), trim)
        const turn = new THREE.BoxGeometry(0.05, H, 0.14)
        turn.translate(side * (length / 2 + 0.025), H / 2, t / 2 - 0.05)
        parts.add('trim', place(turn), trim)
      }
    // windows and doors
    for (const o of openings) {
      const w = o.x1 - o.x0, h = o.y1 - o.y0, cx = (o.x0 + o.x1) / 2, cy = (o.y0 + o.y1) / 2
      const piece = (part: PartName, sx: number, sy: number, sz: number, x: number, y: number, z: number, tint: Tint, rx = 0) => {
        const g = new THREE.BoxGeometry(sx, sy, sz)
        if (rx) g.rotateX(rx)
        g.translate(x, y, z)
        parts.add(part, place(g), tint)
      }
      // reveals line the opening through the wall
      piece('trim', w, 0.02, t, cx, o.y1 - 0.01, 0, trim)
      piece('trim', 0.02, h, t, o.x0 + 0.01, cy, 0, trim)
      piece('trim', 0.02, h, t, o.x1 - 0.01, cy, 0, trim)
      if (!o.door) piece('trim', w, 0.02, t, cx, o.y0 + 0.01, 0, trim)
      // the frame stands proud of the siding
      const f = 0.09, out = t / 2 + 0.04
      piece('trim', w + 2 * f, f, 0.05, cx, o.y1 + f / 2, out, trim)
      piece('trim', f, h + (o.door ? f : 2 * f), 0.05, o.x0 - f / 2, cy + (o.door ? f / 2 : 0), out, trim)
      piece('trim', f, h + (o.door ? f : 2 * f), 0.05, o.x1 + f / 2, cy + (o.door ? f / 2 : 0), out, trim)
      // a drip cap over the head
      piece('trim', w + 2 * f + 0.08, 0.04, 0.09, cx, o.y1 + f + 0.02, out + 0.02, trim)
      if (o.door) {
        // a panelled door, set back in its frame, with a handle and a threshold
        piece('paint', w - 0.04, h - 0.02, 0.05, cx, cy - 0.01, -0.02, doorColour)
        const door = (sx: number, sy: number, x: number, y: number) => piece('paint', sx, sy, 0.02, x, y, 0.015, doorColour.clone().multiplyScalar(1.12))
        door(w * 0.32, h * 0.38, cx - w * 0.2, o.y0 + h * 0.27)
        door(w * 0.32, h * 0.38, cx + w * 0.2, o.y0 + h * 0.27)
        door(w * 0.32, h * 0.3, cx - w * 0.2, o.y0 + h * 0.72)
        door(w * 0.32, h * 0.3, cx + w * 0.2, o.y0 + h * 0.72)
        const knob = new THREE.SphereGeometry(0.035, 10, 8)
        knob.translate(o.x1 - 0.12, o.y0 + 1.0, 0.05)
        parts.add('metal', place(knob), new THREE.Color('#b08d57'))
        piece('stone', w + 0.3, 0.06, 0.35, cx, -0.03, t / 2 + 0.12, stone)
      } else {
        // glass set back in the wall, crossed by mullions, over a sloping sill
        piece('glass', w - 0.04, h - 0.04, 0.012, cx, cy, -0.02, glass)
        const bar = 0.035
        piece('trim', bar, h - 0.04, 0.04, cx, cy, 0, trim)
        piece('trim', w - 0.04, bar, 0.04, cx, cy, 0, trim)
        piece('trim', w + 0.24, 0.05, 0.16, cx, o.y0 - 0.03, out + 0.04, trim, 0.12)
        piece('dark', w - 0.04, h - 0.04, 0.02, cx, cy, -t / 2 + 0.01, new THREE.Color('#1e1a16'))
      }
    }
  }

  // stone plinth
  if (plinth > 0) parts.box('stone', W + 0.12, plinth, D + 0.12, 0, plinth / 2, 0, (p: THREE.Vector3) => stone.clone().multiplyScalar(0.85 + 0.15 * Math.min(1, p.y / Math.max(plinth, 0.01))))

  // roof
  const roof = str(params, 'roof'), roofing = str(params, 'roofing')
  const pitch = THREE.MathUtils.degToRad(num(params, 'roofPitch'))
  const overhang = num(params, 'overhang'), rt = 0.12
  const roofPart: PartName = roofing === 'metal' ? 'roofMetal' : 'roof'
  const roofTint = () => roofColour.clone().multiplyScalar(0.85 + random() * 0.25)
  const eaveDrop = overhang * Math.tan(pitch)
  const ex = W / 2 + overhang, ez = D / 2 + overhang, ey = top - eaveDrop
  const rise = (roof === 'shed' ? D : D / 2) * Math.tan(pitch)
  const eaves: [THREE.Vector3, THREE.Vector3][] = []
  /** A rectangular roof plane from its eave edge (a→b) up the slope to the top edge; adds shingles or seams over it. */
  const plane = (a: THREE.Vector3, b: THREE.Vector3, upA: THREE.Vector3, upB: THREE.Vector3) => {
    parts.add(roofPart, slab([a, b, upB, upA], rt), roofColour.clone().multiplyScalar(0.8))
    eaves.push([a, b])
    const along = b.clone().sub(a), up = upA.clone().sub(a)
    const slope = up.length(), width = along.length()
    const normal = new THREE.Vector3().crossVectors(along, up).normalize()
    if (normal.y < 0) normal.negate()
    const basis = new THREE.Matrix4().makeBasis(along.clone().normalize(), normal, up.clone().normalize())
    if (roofing === 'metal') {
      for (let x = 0.2; x < width - 0.1; x += 0.45) {
        const seam = new THREE.BoxGeometry(0.03, 0.04, slope)
        seam.translate(x, 0.02, slope / 2)
        seam.applyMatrix4(basis).translate(a.x, a.y, a.z)
        parts.add(roofPart, seam, roofColour)
      }
      return
    }
    // shingle courses, each lapping the one above, cut into tabs
    const course = 0.24
    for (let s = 0, row = 0; s < slope - 0.05; s += course, row++) {
      for (let x = (row % 2) * 0.17 - 0.17, tab = 0.34; x < width; x += tab, tab = 0.26 + random() * 0.18) {
        const x0 = Math.max(0, x), x1 = Math.min(width, x + tab - 0.01)
        if (x1 - x0 < 0.03) continue
        const shingle = new THREE.BoxGeometry(x1 - x0, 0.022, course + 0.06)
        shingle.rotateX(0.045)
        shingle.translate((x0 + x1) / 2, 0.02, s + course / 2)
        shingle.applyMatrix4(basis).translate(a.x, a.y, a.z)
        parts.add(roofPart, shingle, roofTint)
      }
    }
  }
  if (roof === 'gable') {
    const ridgeY = top + rise
    plane(new THREE.Vector3(-ex, ey, ez), new THREE.Vector3(ex, ey, ez), new THREE.Vector3(-ex, ridgeY, 0), new THREE.Vector3(ex, ridgeY, 0))
    plane(new THREE.Vector3(ex, ey, -ez), new THREE.Vector3(-ex, ey, -ez), new THREE.Vector3(ex, ridgeY, 0), new THREE.Vector3(-ex, ridgeY, 0))
    parts.box('trim', 2 * ex, 0.1, 0.2, 0, ridgeY + 0.06, 0, roofColour.clone().multiplyScalar(0.7))
    // gable ends filled with siding, and rake boards along the verges
    for (const side of [-1, 1]) {
      const shape = new THREE.Shape([new THREE.Vector2(-D / 2, 0), new THREE.Vector2(D / 2, 0), new THREE.Vector2(0, rise)])
      const gable = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false })
      gable.rotateY(Math.PI / 2).translate(side * W / 2 - (side > 0 ? t : 0), top, 0)
      parts.add(wallPart, gable, sidingColour)
      if (siding === 'clapboard' || siding === 'shingle' || siding === 'log' || siding === 'boards')
        for (let y = 0; y < rise - 0.15; y += 0.18) {
          const half = (D / 2) * (1 - (y + 0.18) / rise)
          if (half < 0.1) break
          const board = new THREE.BoxGeometry(0.024, 0.215, 2 * half)
          board.rotateZ(side * 0.09)
          board.translate(side * (W / 2 + 0.014), top + y + 0.09, 0)
          parts.add('siding', board, parts.vary(sidingColour, 0.05))
        }
      for (const dir of [-1, 1]) {
        const from = new THREE.Vector3(side * (ex + 0.02), ey - 0.06, dir * ez), to = new THREE.Vector3(side * (ex + 0.02), ridgeY - 0.06, 0)
        const len = from.distanceTo(to)
        const rake = new THREE.BoxGeometry(0.05, 0.2, len)
        rake.rotateX(dir * Math.atan2(rise + eaveDrop, ez))
        rake.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2)
        parts.add('trim', rake, trim)
      }
    }
  } else if (roof === 'hip') {
    const inset = Math.max(0, W / 2 - D / 2)
    const ridgeY = top + (D / 2) * Math.tan(pitch)
    const r0 = new THREE.Vector3(-inset, ridgeY, 0), r1 = new THREE.Vector3(inset, ridgeY, 0)
    const c = [new THREE.Vector3(-ex, ey, ez), new THREE.Vector3(ex, ey, ez), new THREE.Vector3(ex, ey, -ez), new THREE.Vector3(-ex, ey, -ez)]
    parts.add(roofPart, slab([c[0]!, c[1]!, r1, r0], rt), roofTint)
    parts.add(roofPart, slab([c[2]!, c[3]!, r0, r1], rt), roofTint)
    parts.add(roofPart, slab([c[1]!, c[2]!, r1], rt), roofTint)
    parts.add(roofPart, slab([c[3]!, c[0]!, r0], rt), roofTint)
    eaves.push([c[0]!, c[1]!], [c[1]!, c[2]!], [c[2]!, c[3]!], [c[3]!, c[0]!])
    for (const [a, b] of [[c[0]!, r0], [c[1]!, r1], [c[2]!, r1], [c[3]!, r0], [r0, r1]] as const) parts.rod('trim', a, b, 0.06, roofColour.clone().multiplyScalar(0.7), 6)
  } else {
    // shed: one plane rising from front to back
    const highY = top + rise
    plane(new THREE.Vector3(-ex, ey, ez), new THREE.Vector3(ex, ey, ez), new THREE.Vector3(-ex, highY + eaveDrop, -ez), new THREE.Vector3(ex, highY + eaveDrop, -ez))
    for (const side of [-1, 1]) {
      // rotated a quarter turn, the shape's +x points to the back, where the roof is high
      const shape = new THREE.Shape([new THREE.Vector2(-D / 2, 0), new THREE.Vector2(D / 2, 0), new THREE.Vector2(D / 2, rise)])
      const fill = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false })
      fill.rotateY(Math.PI / 2).translate(side * W / 2 - (side > 0 ? t : 0), top, 0)
      parts.add(wallPart, fill, sidingColour)
    }
  }
  // fascia boards, gutters and downpipes along the eaves
  const gutters = str(params, 'gutters') === 'yes'
  for (const [a, b] of eaves) {
    if (Math.abs(a.y - b.y) > 0.01) continue
    const along = b.clone().sub(a), len = along.length(), mid = a.clone().add(b).multiplyScalar(0.5)
    const out = new THREE.Vector3(along.z, 0, -along.x).normalize()
    if (out.dot(mid) < 0) out.negate()
    const fascia = new THREE.BoxGeometry(len, 0.2, 0.04)
    fascia.rotateY(Math.atan2(-along.z, along.x))
    fascia.translate(mid.x + out.x * 0.02, mid.y - 0.12, mid.z + out.z * 0.02)
    parts.add('trim', fascia, trim)
    if (!gutters) continue
    const gutter = new THREE.CylinderGeometry(0.07, 0.07, len, 10, 1, true, Math.PI / 2, Math.PI)
    gutter.rotateZ(Math.PI / 2)
    gutter.rotateY(Math.atan2(-along.z, along.x))
    gutter.translate(mid.x + out.x * 0.1, mid.y - 0.16, mid.z + out.z * 0.1)
    parts.add('metal', gutter, metal)
    const end = a.clone().addScaledVector(along, 0.03).addScaledVector(out, 0.1)
    parts.rod('metal', new THREE.Vector3(end.x, mid.y - 0.2, end.z), new THREE.Vector3(end.x, 0.15, end.z), 0.04, metal, 8)
  }

  // chimney on a gable end
  const chimney = str(params, 'chimney')
  if (chimney !== 'none') {
    const side = chimney === 'left' ? -1 : 1
    const cx = side * (W / 2 + 0.32), height = top + rise + 0.9
    parts.box('stone', 0.75, height, 0.95, cx, height / 2, 0, () => parts.vary(stone, 0.1))
    parts.box('stone', 0.9, 0.12, 1.1, cx, height + 0.06, 0, stone.clone().multiplyScalar(0.9))
    parts.rod('dark', new THREE.Vector3(cx, height + 0.12, 0), new THREE.Vector3(cx, height + 0.42, 0), 0.11, new THREE.Color('#5a3f30'), 10)
  }

  // porch with a plank deck, posts, railings, steps and its own roof
  if (str(params, 'porch') === 'front') {
    const pd = num(params, 'porchDepth'), pw = W - 0.4
    const z0 = D / 2, z1 = D / 2 + pd
    const deck = new THREE.Color('#8a6a4a')
    for (let z = z0 + 0.02; z < z1; z += 0.15) parts.box('deck', pw, 0.04, 0.135, 0, plinth - 0.02, z + 0.07, parts.vary(deck, 0.1))
    parts.box('deck', pw, 0.2, 0.05, 0, plinth - 0.14, z1, deck.clone().multiplyScalar(0.8))
    // the porch roof tucks under the main eave and slopes down to a beam on the posts
    const wallY = Math.min(ey, plinth + storeyHeight) - 0.08
    const beamY = wallY - pd * 0.25
    const postHeight = beamY - plinth
    const posts: number[] = []
    const spans = Math.max(1, Math.ceil(pw / 2.6))
    for (let i = 0; i <= spans; i++) posts.push(-pw / 2 + 0.08 + (i * (pw - 0.16)) / spans)
    for (const x of posts) {
      parts.box('trim', 0.13, postHeight, 0.13, x, plinth + postHeight / 2, z1 - 0.1, trim)
      parts.box('stone', 0.32, plinth, 0.32, x, plinth / 2, z1 - 0.1, stone)
    }
    // railings between posts, open in the middle for the steps
    const stepGap: [number, number] = [-0.65, 0.65]
    for (let i = 0; i < posts.length - 1; i++)
      for (const [a, b] of around(posts[i]! + 0.07, posts[i + 1]! - 0.07, [stepGap])) {
        parts.box('trim', b - a, 0.06, 0.08, (a + b) / 2, plinth + 0.92, z1 - 0.1, trim)
        parts.box('trim', b - a, 0.05, 0.06, (a + b) / 2, plinth + 0.12, z1 - 0.1, trim)
        for (let x = a + 0.07; x < b - 0.03; x += 0.13) parts.box('trim', 0.035, 0.78, 0.035, x, plinth + 0.51, z1 - 0.1, trim)
      }
    const steps = Math.max(1, Math.round(plinth / 0.18))
    for (let s = 0; s < steps; s++) parts.box('deck', 1.3, plinth / steps, 0.3, 0, (plinth / steps) * (s + 0.5), z1 + 0.15 + (steps - 1 - s) * 0.28, parts.vary(deck, 0.08))
    parts.box('trim', pw + 0.2, 0.18, 0.14, 0, beamY + 0.09, z1 - 0.1, trim)
    const porchRoof = [new THREE.Vector3(-pw / 2 - 0.2, beamY + 0.2, z1 + 0.25), new THREE.Vector3(pw / 2 + 0.2, beamY + 0.2, z1 + 0.25), new THREE.Vector3(pw / 2 + 0.2, wallY, z0 + 0.1), new THREE.Vector3(-pw / 2 - 0.2, wallY, z0 + 0.1)]
    parts.add(roofPart, slab(porchRoof, 0.08), roofTint)
  }
  const glow = num(params, 'windowGlow')
  if (glow > 0) parts.style('glass', { emissive: '#ffb45a', emissiveIntensity: glow * 1.6 })
  return parts.build()
}

// ─── Props ──────────────────────────────────────────────────────────────────

const WOOD = new THREE.Color('#8a6646')

/** A clinker-built rowing boat: lapped strakes, thwarts, ribs and a pair of oars. Bow towards +z. */
function boat(params: Params): THREE.BufferGeometry {
  const parts = new Parts(seeded(num(params, 'seed') + 5))
  const L = num(params, 'length'), B = num(params, 'beam'), depth = L * 0.16
  const hull = new THREE.Color(str(params, 'hullColor')), inside = new THREE.Color(str(params, 'insideColor'))
  const stations = 28, strakes = 6
  // half-breadth along the length: pointed bow, broad transom
  const breadth = (t: number) => (B / 2) * Math.pow(Math.sin(Math.PI * (0.18 + 0.82 * t)), 0.7) * (t < 0.1 ? 0.6 + t * 4 : 1)
  const sheer = (t: number) => depth * (1 + 0.35 * Math.pow(t * 2 - 1, 2))
  const point = (t: number, s: number) => {
    // s from 0 (keel) to 1 (gunwale)
    const w = breadth(t) * Math.sin((s * Math.PI) / 2)
    const y = sheer(t) * (1 - Math.cos((s * Math.PI) / 2)) * 1.0
    return new THREE.Vector3(w, y, (t - 0.5) * L)
  }
  for (let k = 0; k < strakes; k++) {
    const s0 = k / strakes, s1 = (k + 1.15) / strakes
    for (const side of [-1, 1]) {
      const positions: number[] = []
      for (let i = 0; i < stations; i++) {
        const t0 = i / stations, t1 = (i + 1) / stations
        const quad = [point(t0, s0), point(t1, s0), point(t1, Math.min(1, s1)), point(t0, Math.min(1, s1))].map(p => new THREE.Vector3(p.x * side, p.y, p.z))
        // lap: each strake stands a little proud of the one below
        for (const p of quad) { p.x += side * 0.012 * (k % 2) }
        const [a, b, c, d] = quad as [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3]
        const tri = side > 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c]
        for (const p of tri) positions.push(p.x, p.y, p.z)
      }
      const strake = new THREE.BufferGeometry()
      strake.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      strake.computeVertexNormals()
      parts.add('paint', strake, parts.vary(hull, 0.06))
      // the same strake seen from inside, in bare wood
      const inner = strake.clone()
      inner.scale(0.97, 0.97, 0.985).translate(0, 0.01, 0)
      const index = inner.getAttribute('position')
      for (let v = 0; v < index.count; v += 3) {
        const x = index.getX(v + 1), y = index.getY(v + 1), z = index.getZ(v + 1)
        index.setXYZ(v + 1, index.getX(v + 2), index.getY(v + 2), index.getZ(v + 2))
        index.setXYZ(v + 2, x, y, z)
      }
      inner.computeVertexNormals()
      parts.add('wood', inner, inside)
    }
  }
  // gunwales, keel, transom, thwarts, ribs and oars
  for (const side of [-1, 1]) {
    const rail: THREE.Vector3[] = []
    for (let i = 0; i <= stations; i++) rail.push(point(i / stations, 1).multiply(new THREE.Vector3(side, 1, 1)).add(new THREE.Vector3(0, 0.02, 0)))
    for (let i = 0; i < stations; i++) parts.rod('wood', rail[i]!, rail[i + 1]!, 0.025, inside, 6)
  }
  parts.rod('wood', new THREE.Vector3(0, -0.02, -L / 2), new THREE.Vector3(0, -0.02, L / 2), 0.035, hull.clone().multiplyScalar(0.7), 6)
  const stern = point(0, 1)
  parts.box('wood', stern.x * 2, sheer(0), 0.04, 0, sheer(0) / 2, -L / 2 + 0.01, inside)
  for (const t of [0.3, 0.55, 0.78]) {
    const p = point(t, 0.78)
    parts.box('wood', p.x * 2, 0.035, 0.22, 0, p.y, p.z, parts.vary(inside, 0.08))
  }
  for (let i = 3; i < stations - 2; i += 3) {
    const t = i / stations
    for (const side of [-1, 1]) {
      let previous = point(t, 0.05)
      for (let s = 0.2; s <= 1.0; s += 0.2) {
        const next = point(t, s)
        parts.rod('wood', new THREE.Vector3(previous.x * side * 0.95, previous.y + 0.01, previous.z), new THREE.Vector3(next.x * side * 0.95, next.y + 0.01, next.z), 0.012, inside.clone().multiplyScalar(0.85), 5)
        previous = next
      }
    }
  }
  if (str(params, 'oars') === 'yes')
    for (const side of [-1, 1]) {
      // shipped oars lie along the thwarts, blades towards the bow
      const from = new THREE.Vector3(side * B * 0.12, depth * 0.86, -L * 0.3), to = new THREE.Vector3(side * B * 0.08, depth * 0.86, L * 0.22)
      parts.rod('wood', from, to, 0.022, WOOD, 6)
      parts.box('wood', 0.12, 0.015, 0.42, to.x, to.y, to.z + 0.2, WOOD)
    }
  return parts.build()
}

/** A timber jetty: deck planks with gaps, stringers and piles that run down into the water. Runs along +z from z = 0. */
function dock(params: Params): THREE.BufferGeometry {
  const parts = new Parts(seeded(num(params, 'seed') + 7))
  const L = num(params, 'length'), W = num(params, 'width'), h = num(params, 'height')
  const wood = new THREE.Color(str(params, 'wood'))
  for (let z = 0.02; z < L; z += 0.16) parts.box('deck', W + (parts.random() - 0.5) * 0.04, 0.045, 0.145, (parts.random() - 0.5) * 0.02, h - 0.022, z + 0.075, parts.vary(wood, 0.12))
  for (const x of [-W / 2 + 0.1, 0, W / 2 - 0.1]) parts.box('wood', 0.08, 0.14, L, x, h - 0.115, L / 2, wood.clone().multiplyScalar(0.7))
  const bays = Math.max(1, Math.round(L / 2))
  for (let i = 0; i <= bays; i++) {
    const z = 0.15 + (i * (L - 0.3)) / bays
    for (const side of [-1, 1]) {
      parts.rod('wood', new THREE.Vector3(side * (W / 2 + 0.05), -1.4, z), new THREE.Vector3(side * (W / 2 + 0.05), h + (i === bays ? 0.35 : 0.05), z), 0.09, (p: THREE.Vector3) => wood.clone().multiplyScalar(p.y < 0.05 ? 0.45 : 0.75), 10)
    }
    parts.box('wood', W + 0.3, 0.12, 0.08, 0, h - 0.25, z, wood.clone().multiplyScalar(0.65))
  }
  // a cleat at the end and a ladder down into the water
  parts.box('metal', 0.25, 0.05, 0.06, W / 2 - 0.25, h + 0.05, L - 0.4, new THREE.Color('#3d3f40'))
  if (str(params, 'ladder') === 'yes') {
    for (const x of [-0.22, 0.22]) parts.rod('metal', new THREE.Vector3(x, -0.8, L + 0.12), new THREE.Vector3(x, h + 0.6, L + 0.04), 0.022, new THREE.Color('#6b6d6e'), 8)
    for (let y = -0.6; y < h; y += 0.28) parts.rod('metal', new THREE.Vector3(-0.22, y, L + 0.1), new THREE.Vector3(0.22, y, L + 0.1), 0.016, new THREE.Color('#6b6d6e'), 6)
  }
  return parts.build()
}

/** A run of fence along x, centred: pickets, rails or post-and-rail. */
function fence(params: Params): THREE.BufferGeometry {
  const parts = new Parts(seeded(num(params, 'seed') + 11))
  const L = num(params, 'length'), h = num(params, 'height'), style = str(params, 'style')
  const paint = new THREE.Color(str(params, 'color'))
  const spans = Math.max(1, Math.round(L / 2.2))
  for (let i = 0; i <= spans; i++) {
    const x = -L / 2 + (i * L) / spans
    parts.box('paint', 0.1, h + 0.12, 0.1, x, (h + 0.12) / 2, 0, parts.vary(paint, 0.06))
    parts.box('paint', 0.13, 0.04, 0.13, x, h + 0.14, 0, paint)
  }
  const rails = style === 'rail' ? [0.3, 0.65, 0.95] : [0.25, h - 0.2]
  for (const y of rails) parts.box('paint', L, 0.08, 0.04, 0, y * (style === 'rail' ? h : 1), style === 'rail' ? 0 : -0.06, paint.clone().multiplyScalar(0.92))
  if (style === 'picket')
    for (let x = -L / 2 + 0.08; x < L / 2 - 0.05; x += 0.13) {
      const height = h - 0.05 + (parts.random() - 0.5) * 0.02
      parts.box('paint', 0.075, height - 0.08, 0.02, x, (height - 0.08) / 2 + 0.05, 0.0, parts.vary(paint, 0.07))
      const tip = new THREE.ConeGeometry(0.053, 0.1, 4, 1)
      tip.rotateY(Math.PI / 4).scale(1, 1, 0.28)
      tip.translate(x, height + 0.0, 0)
      parts.add('paint', tip, paint)
    }
  return parts.build()
}

/** A hurricane lantern: a metal frame round a glass chimney, glowing when lit. */
function lantern(params: Params): THREE.BufferGeometry {
  const parts = new Parts(seeded(1))
  const h = num(params, 'height')
  const metal = new THREE.Color(str(params, 'metal'))
  const r = h * 0.28
  const base = new THREE.CylinderGeometry(r * 1.1, r * 1.2, h * 0.18, 16)
  base.translate(0, h * 0.09, 0)
  parts.add('metal', base, metal)
  const chimney = new THREE.SphereGeometry(r * 0.95, 16, 12)
  chimney.scale(1, 1.35, 1).translate(0, h * 0.48, 0)
  parts.add('glass', chimney, new THREE.Color('#e8d9b8'), { surface: 'none', roughness: 0.05, emissive: '#ffb050', emissiveIntensity: num(params, 'glow') * 2.5 })
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    parts.rod('metal', new THREE.Vector3(Math.cos(a) * r * 1.05, h * 0.16, Math.sin(a) * r * 1.05), new THREE.Vector3(Math.cos(a) * r * 0.7, h * 0.82, Math.sin(a) * r * 0.7), h * 0.012, metal, 5)
  }
  const cap = new THREE.ConeGeometry(r * 0.9, h * 0.2, 16)
  cap.translate(0, h * 0.88, 0)
  parts.add('metal', cap, metal)
  const ring = new THREE.TorusGeometry(r * 0.55, h * 0.012, 6, 20, Math.PI)
  ring.translate(0, h * 0.98, 0)
  parts.add('metal', ring, metal)
  return parts.build()
}

/** A planked crate with corner battens. */
function crate(params: Params): THREE.BufferGeometry {
  const parts = new Parts(seeded(num(params, 'seed') + 13))
  const s = num(params, 'size'), wood = new THREE.Color(str(params, 'wood'))
  const planks = 4, gap = 0.008, plank = (s - gap * (planks - 1)) / planks
  parts.box('wood', s * 0.94, s * 0.94, s * 0.94, 0, s / 2, 0, wood.clone().multiplyScalar(0.45))
  for (let i = 0; i < planks; i++) {
    const y = plank / 2 + i * (plank + gap)
    const tint = () => parts.vary(wood, 0.12)
    parts.box('wood', s, plank, 0.02, 0, y, s / 2, tint())
    parts.box('wood', s, plank, 0.02, 0, y, -s / 2, tint())
    parts.box('wood', 0.02, plank, s, s / 2, y, 0, tint())
    parts.box('wood', 0.02, plank, s, -s / 2, y, 0, tint())
    parts.box('wood', s, 0.02, plank, 0, s, -s / 2 + plank / 2 + i * (plank + gap), tint())
  }
  for (const x of [-1, 1]) for (const z of [-1, 1]) parts.box('wood', 0.06, s + 0.01, 0.06, x * (s / 2 - 0.01), s / 2, z * (s / 2 - 0.01), wood.clone().multiplyScalar(0.8))
  for (const z of [-1, 1]) parts.box('wood', s * 1.36, 0.06, 0.025, 0, s / 2, z * (s / 2 + 0.02), wood.clone().multiplyScalar(0.85), [0, 0, Math.PI / 4])
  return parts.build()
}

/** A coopered barrel: bulging staves held by iron hoops. */
function barrel(params: Params): THREE.BufferGeometry {
  const parts = new Parts(seeded(num(params, 'seed') + 17))
  const h = num(params, 'height'), r = h * 0.33, wood = new THREE.Color(str(params, 'wood'))
  const staves = 18
  const profile = (y: number) => r * (0.86 + 0.14 * Math.sin((y / h) * Math.PI))
  for (let i = 0; i < staves; i++) {
    const a0 = (i / staves) * Math.PI * 2 + 0.004, a1 = ((i + 1) / staves) * Math.PI * 2 - 0.004
    const points: THREE.Vector2[] = []
    for (let k = 0; k <= 8; k++) points.push(new THREE.Vector2(profile((k / 8) * h), (k / 8) * h))
    const stave = new THREE.LatheGeometry(points, 2, a0, a1 - a0)
    parts.add('wood', stave, parts.vary(wood, 0.14))
  }
  const lid = new THREE.CylinderGeometry(profile(h) * 0.97, profile(h) * 0.97, 0.02, 20)
  lid.translate(0, h - 0.04, 0)
  parts.add('wood', lid, wood.clone().multiplyScalar(0.8))
  for (const y of [0.08, 0.3, 0.7, 0.92]) {
    const hoop = new THREE.CylinderGeometry(profile(y * h) + 0.008, profile(y * h) + 0.008, h * 0.045, 24, 1, true)
    hoop.translate(0, y * h, 0)
    parts.add('metal', hoop, new THREE.Color('#3b3836'), { surface: 'metal', roughness: 0.55, metalness: 0.75 })
  }
  return parts.build()
}

/** A garden bench of slats on two frames, with a back. Seat faces +z. */
function bench(params: Params): THREE.BufferGeometry {
  const parts = new Parts(seeded(num(params, 'seed') + 19))
  const L = num(params, 'length'), wood = new THREE.Color(str(params, 'wood')), frame = new THREE.Color(str(params, 'frame'))
  for (let i = 0; i < 4; i++) parts.box('wood', L, 0.035, 0.09, 0, 0.45, -0.18 + i * 0.105, parts.vary(wood, 0.08))
  for (let i = 0; i < 3; i++) parts.box('wood', L, 0.08, 0.03, 0, 0.62 + i * 0.12, -0.26 - i * 0.025, parts.vary(wood, 0.08), [-0.2, 0, 0])
  for (const x of [-L / 2 + 0.12, L / 2 - 0.12]) {
    parts.box('metal', 0.05, 0.45, 0.05, x, 0.225, 0.2, frame)
    parts.box('metal', 0.05, 0.92, 0.05, x, 0.46, -0.24, frame, [-0.12, 0, 0])
    parts.box('metal', 0.05, 0.05, 0.5, x, 0.42, -0.02, frame)
    parts.box('metal', 0.05, 0.04, 0.55, x, 0.68, 0.0, frame)
  }
  return parts.build()
}

/** A made thing's geometry by kind. */
export function structureGeometry(kind: string, params: Params): THREE.BufferGeometry {
  const full = generatorParams(kind, params)
  switch (kind) {
    case 'building': return building(full)
    case 'boat': return boat(full)
    case 'dock': return dock(full)
    case 'fence': return fence(full)
    case 'lantern': return lantern(full)
    case 'crate': return crate(full)
    case 'barrel': return barrel(full)
    case 'bench': return bench(full)
    default: throw new Error(`${kind} is not a made thing`)
  }
}

export const STRUCTURE_KINDS = ['building', 'boat', 'dock', 'fence', 'lantern', 'crate', 'barrel', 'bench'] as const
