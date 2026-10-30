import * as THREE from 'three'

/**
 * The leaf atlas generated foliage samples: a sprig of broad leaves, a branch of needles, and a solid white patch for
 * trunks and other solid parts. Drawn once on a canvas (nothing is downloaded), in light greys so vertex colours give
 * each tree its colour. U ranges and the solid patch are in UV units.
 */
export const ATLAS = {
  leaves: [0.01, 0.45] as const,
  needles: [0.5, 0.89] as const,
  solid: [0.955, 0.94] as const,
}

let atlas: THREE.CanvasTexture | null | undefined

function seededRandom(seed: number) {
  let a = seed
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0
    return a / 4294967296
  }
}

function drawLeaves(g: CanvasRenderingContext2D, x0: number, w: number, h: number) {
  const random = seededRandom(7)
  // twigs first, leaves over them
  g.strokeStyle = 'rgb(120,120,120)'
  g.lineWidth = 3
  for (let i = 0; i < 5; i++) {
    g.beginPath()
    g.moveTo(x0 + w * 0.5, h * 0.98)
    g.quadraticCurveTo(x0 + w * (0.2 + random() * 0.6), h * 0.55, x0 + w * (0.1 + random() * 0.8), h * (0.08 + random() * 0.3))
    g.stroke()
  }
  for (let i = 0; i < 95; i++) {
    const cx = x0 + w * (0.1 + random() * 0.8), cy = h * (0.06 + random() * 0.84)
    const dx = cx - (x0 + w / 2), dy = cy - h / 2
    if ((dx * dx) / (w * w * 0.2) + (dy * dy) / (h * h * 0.2) > 1) continue
    const length = h * (0.07 + random() * 0.05), angle = random() * Math.PI * 2
    const shade = 130 + Math.floor(random() * 90)
    g.save()
    g.translate(cx, cy)
    g.rotate(angle)
    g.fillStyle = `rgb(${shade},${shade},${shade})`
    g.beginPath()
    g.moveTo(0, -length)
    g.quadraticCurveTo(length * 0.55, -length * 0.2, 0, length)
    g.quadraticCurveTo(-length * 0.55, -length * 0.2, 0, -length)
    g.fill()
    g.strokeStyle = `rgba(90,90,90,0.55)`
    g.lineWidth = 1.2
    g.beginPath()
    g.moveTo(0, -length * 0.9)
    g.lineTo(0, length * 0.9)
    g.stroke()
    g.restore()
  }
}

function drawNeedles(g: CanvasRenderingContext2D, x0: number, w: number, h: number) {
  const random = seededRandom(11)
  // a branch from the left edge (the trunk) to the right (the tip), needles along it and its side shoots
  const branch = (fx: number, fy: number, tx: number, ty: number, spread: number, width: number) => {
    g.strokeStyle = 'rgb(105,105,105)'
    g.lineWidth = width
    g.beginPath(); g.moveTo(fx, fy); g.lineTo(tx, ty); g.stroke()
    const steps = Math.round(Math.hypot(tx - fx, ty - fy) / 2.2)
    for (let i = 0; i < steps; i++) {
      const t = i / steps
      const x = fx + (tx - fx) * t, y = fy + (ty - fy) * t
      const length = spread * (1 - t * 0.6) * (0.7 + random() * 0.5)
      for (const side of [-1, 1]) {
        const shade = 150 + Math.floor(random() * 105)
        g.strokeStyle = `rgb(${shade},${shade},${shade})`
        g.lineWidth = 1.6
        g.beginPath(); g.moveTo(x, y)
        g.lineTo(x + length * 0.55, y + side * length)
        g.stroke()
      }
    }
  }
  branch(x0 + 2, h / 2, x0 + w - 4, h / 2, h * 0.2, 3)
  for (let i = 0; i < 6; i++) {
    const t = 0.15 + i * 0.13
    const side = i % 2 ? 1 : -1
    branch(x0 + w * t, h / 2, x0 + w * (t + 0.22), h / 2 + side * h * (0.22 + random() * 0.1), h * 0.12, 2)
  }
}

/** The shared atlas texture, or null where there is no canvas (tests). */
export function leafAtlas(): THREE.CanvasTexture | null {
  if (atlas !== undefined) return atlas
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null
  const g = canvas?.getContext('2d')
  if (!canvas || !g) return (atlas = null)
  canvas.width = 1024
  canvas.height = 256
  g.clearRect(0, 0, canvas.width, canvas.height)
  drawLeaves(g, ATLAS.leaves[0] * canvas.width, (ATLAS.leaves[1] - ATLAS.leaves[0]) * canvas.width, canvas.height)
  drawNeedles(g, ATLAS.needles[0] * canvas.width, (ATLAS.needles[1] - ATLAS.needles[0]) * canvas.width, canvas.height)
  g.fillStyle = '#ffffff'
  g.fillRect(0.92 * canvas.width, 0, 0.08 * canvas.width, 0.2 * canvas.height)
  atlas = new THREE.CanvasTexture(canvas)
  atlas.colorSpace = THREE.SRGBColorSpace
  atlas.anisotropy = 8
  atlas.generateMipmaps = true
  atlas.minFilter = THREE.LinearMipmapLinearFilter
  // shared by every foliage material: material disposal must not drop it for the others
  atlas.userData.shared = true
  return atlas
}
