import * as THREE from 'three'
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js'

/**
 * Sunbeams: what blocks the sky is drawn black on white at half size, then smeared towards the sun and added to the
 * frame in the sun's colour, so light streams between trunks and through gaps in leaves when the sun is in front.
 */
export class LightShaftsPass extends Pass {
  strength = 0
  readonly sunColor = new THREE.Color('#ffffff')
  /** The direction to the sun (unit vector, world space). */
  readonly sun = new THREE.Vector3(0, 1, 0)
  private readonly mask = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })
  private readonly black = new THREE.MeshBasicMaterial({ color: '#000000' })
  private readonly cutouts = new Map<THREE.Texture, THREE.MeshBasicMaterial>()
  private readonly quad: FullScreenQuad
  private readonly material: THREE.ShaderMaterial

  constructor(private readonly scene: THREE.Scene, private readonly camera: THREE.PerspectiveCamera) {
    super()
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tMask: { value: this.mask.texture },
        sunUv: { value: new THREE.Vector2() },
        aspect: { value: 1 },
        strength: { value: 0 },
        colour: { value: new THREE.Color() },
      },
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform sampler2D tMask;
        uniform vec2 sunUv;
        uniform float aspect;
        uniform float strength;
        uniform vec3 colour;
        varying vec2 vUv;
        void main() {
          vec4 base = texture2D(tDiffuse, vUv);
          vec2 step = (vUv - sunUv) / 72.0;
          vec2 uv = vUv;
          float light = 0.0, weight = 1.0;
          // a little jitter per pixel hides the steps
          uv -= step * fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
          for (int i = 0; i < 72; i++) {
            uv -= step;
            vec2 d = (uv - sunUv) * vec2(aspect, 1.0);
            // light comes from the sky near the sun, not from the whole sky
            light += texture2D(tMask, uv).r * exp(-dot(d, d) * 14.0) * weight;
            weight *= 0.972;
          }
          gl_FragColor = vec4(base.rgb + colour * light * strength / 72.0, base.a);
        }`,
      depthTest: false,
      depthWrite: false,
    })
    this.quad = new FullScreenQuad(this.material)
  }

  setSize(width: number, height: number) {
    this.mask.setSize(Math.max(1, Math.round(width / 2)), Math.max(1, Math.round(height / 2)))
  }

  /** Whether the sun is in front of the camera (beams need it there, or near the edge of the view). */
  sunInView(): boolean {
    return this.camera.getWorldDirection(new THREE.Vector3()).dot(this.sun) > 0.05
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    const facing = this.camera.getWorldDirection(new THREE.Vector3()).dot(this.sun)
    const sunPoint = this.camera.position.clone().addScaledVector(this.sun, this.camera.far * 0.5).project(this.camera)
    // the occluders, black on white
    const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = []
    const hidden: THREE.Object3D[] = []
    const background = this.scene.background, fog = this.scene.fog
    this.scene.traverseVisible(node => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      const material = mesh.material as THREE.MeshStandardMaterial
      // the sky is the light; water lies flat and blocks nothing
      if (mesh.geometry.userData.water || (material as unknown as THREE.ShaderMaterial).isShaderMaterial) {
        hidden.push(mesh)
        return
      }
      swapped.push([mesh, mesh.material])
      mesh.material = material.alphaTest > 0 && material.map ? this.cutout(material.map, material.alphaTest) : this.black
    })
    for (const node of hidden) node.visible = false
    this.scene.background = new THREE.Color('#ffffff')
    this.scene.fog = null
    const clearColour = renderer.getClearColor(new THREE.Color()), clearAlpha = renderer.getClearAlpha()
    renderer.setRenderTarget(this.mask)
    renderer.setClearColor('#ffffff', 1)
    renderer.clear()
    renderer.render(this.scene, this.camera)
    renderer.setClearColor(clearColour, clearAlpha)
    for (const [mesh, material] of swapped) mesh.material = material
    for (const node of hidden) node.visible = true
    this.scene.background = background
    this.scene.fog = fog
    // smear towards the sun and add
    const uniforms = this.material.uniforms
    uniforms.tDiffuse.value = readBuffer.texture
    uniforms.sunUv.value.set(sunPoint.x * 0.5 + 0.5, sunPoint.y * 0.5 + 0.5)
    uniforms.aspect.value = this.camera.aspect
    uniforms.strength.value = this.strength * 1.8 * THREE.MathUtils.smoothstep(facing, 0.05, 0.35)
    uniforms.colour.value.copy(this.sunColor)
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer)
    this.quad.render(renderer)
  }

  private cutout(map: THREE.Texture, alphaTest: number) {
    let material = this.cutouts.get(map)
    if (!material) {
      material = new THREE.MeshBasicMaterial({ color: '#000000', map, alphaTest, side: THREE.DoubleSide })
      this.cutouts.set(map, material)
    }
    return material
  }

  dispose() {
    this.mask.dispose()
    this.black.dispose()
    for (const material of this.cutouts.values()) material.dispose()
    this.material.dispose()
    this.quad.dispose()
  }
}

/**
 * A finishing grade on the toned image: saturation, contrast, warmth and a vignette, the way a photographer finishes
 * a picture. Runs after tone mapping, on display colours.
 */
export class GradePass extends Pass {
  private readonly quad: FullScreenQuad
  readonly material: THREE.ShaderMaterial

  constructor() {
    super()
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        saturation: { value: 1 },
        contrast: { value: 1 },
        warmth: { value: 0 },
        vignette: { value: 0 },
        aspect: { value: 1 },
      },
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform float saturation;
        uniform float contrast;
        uniform float warmth;
        uniform float vignette;
        uniform float aspect;
        varying vec2 vUv;
        void main() {
          vec4 base = texture2D(tDiffuse, vUv);
          vec3 c = base.rgb;
          float grey = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(grey), c, saturation);
          c = (c - 0.5) * contrast + 0.5;
          c *= vec3(1.0 + warmth * 0.08, 1.0 + warmth * 0.02, 1.0 - warmth * 0.1);
          vec2 d = (vUv - 0.5) * vec2(aspect, 1.0);
          c *= 1.0 - vignette * 0.7 * smoothstep(0.3, 1.1, length(d) * 1.2);
          gl_FragColor = vec4(clamp(c, 0.0, 1.0), base.a);
        }`,
      depthTest: false,
      depthWrite: false,
    })
    this.quad = new FullScreenQuad(this.material)
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    this.material.uniforms.tDiffuse.value = readBuffer.texture
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer)
    this.quad.render(renderer)
  }

  dispose() {
    this.material.dispose()
    this.quad.dispose()
  }
}
