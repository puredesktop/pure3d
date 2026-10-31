import * as THREE from 'three'
import { Sky } from 'three/addons/objects/Sky.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { CopyShader } from 'three/addons/shaders/CopyShader.js'
import { GradePass, LightShaftsPass } from './finishing'
import type { SceneDocument } from '../types'

/**
 * Ambient occlusion that leaves alpha-cut foliage out of its depth pass: drawn there as whole cards (the pass ignores
 * the leaf cut-outs), it would darken the sky behind every leaf card in squares.
 */
class FoliageAwareGTAOPass extends GTAOPass {
  _overrideVisibility() {
    const self = this as unknown as { _visibilityCache: THREE.Object3D[] }
    ;(GTAOPass.prototype as unknown as { _overrideVisibility: () => void })._overrideVisibility.call(this)
    this.scene.traverse(object => {
      const material = (object as THREE.Mesh).material as THREE.Material | undefined
      if (object.visible && (object as THREE.Mesh).isMesh && material && !Array.isArray(material) && material.alphaTest > 0) {
        object.visible = false
        self._visibilityCache.push(object)
      }
    })
  }
}

/**
 * A night sky: deep blue fading to black overhead, stars, and the moon (with a soft halo) where the sun would be. Drawn
 * on a dome that follows the camera; it also lights the scene's reflections, so night scenes are dim but not black.
 */
export class NightSky extends THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
  constructor() {
    super(
      new THREE.SphereGeometry(1, 48, 24),
      new THREE.ShaderMaterial({
        name: 'Pure3DNightSky',
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { moonDirection: { value: new THREE.Vector3(0, 1, 0) }, moon: { value: 1 }, stars: { value: 0.6 }, haze: { value: 0.25 } },
        vertexShader: `
          varying vec3 vWorldPosition;
          void main() {
            vec4 world = modelMatrix * vec4(position, 1.0);
            vWorldPosition = world.xyz;
            gl_Position = projectionMatrix * viewMatrix * world;
            gl_Position.z = gl_Position.w;
          }`,
        fragmentShader: `
          uniform vec3 moonDirection;
          uniform float moon;
          uniform float stars;
          uniform float haze;
          varying vec3 vWorldPosition;
          float hash(vec3 p) {
            p = fract(p * 0.3183099 + 0.1);
            p *= 17.0;
            return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
          }
          void main() {
            vec3 d = normalize(vWorldPosition - cameraPosition);
            float h = d.y;
            vec3 zenith = vec3(0.003, 0.006, 0.016);
            vec3 horizon = mix(vec3(0.03, 0.045, 0.08), vec3(0.06, 0.065, 0.08), haze);
            vec3 colour = h >= 0.0 ? mix(horizon, zenith, smoothstep(0.0, 0.55, h)) : mix(horizon, vec3(0.008, 0.01, 0.016), smoothstep(0.0, -0.25, h));
            // stars: one in a few hundred cells of a fine grid over the sphere, of varied brightness, fading near the horizon
            vec3 g = d * 360.0;
            vec3 cell = floor(g);
            if (h > 0.0 && hash(cell) > 1.0 - 0.02 * stars) {
              vec3 centre = cell + 0.5 + 0.6 * (vec3(hash(cell + 1.3), hash(cell + 2.7), hash(cell + 4.1)) - 0.5);
              float brightness = 0.35 + 3.0 * pow(hash(cell + 7.9), 8.0);
              float twinkle = smoothstep(0.55, 0.0, length(g - centre));
              vec3 tint = mix(vec3(1.0, 0.86, 0.72), vec3(0.78, 0.86, 1.0), hash(cell + 3.3));
              colour += tint * twinkle * brightness * smoothstep(0.0, 0.2, h) * (1.0 - haze * 0.7);
            }
            // the moon: a bright disc with a little shading, a halo and a wide glow
            float m = dot(d, moonDirection);
            float disc = smoothstep(0.99986, 0.99990, m);
            float shade = 0.85 + 0.15 * hash(floor(d * 2400.0));
            colour += moon * (vec3(1.0, 0.98, 0.92) * 2.6 * disc * shade
              + vec3(0.25, 0.3, 0.42) * pow(max(m, 0.0), 900.0) * 0.8
              + vec3(0.04, 0.055, 0.09) * pow(max(m, 0.0), 14.0) * (0.4 + haze));
            gl_FragColor = vec4(colour, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    )
    this.name = 'Pure3D night sky'
    this.frustumCulled = false
  }
  set(direction: THREE.Vector3, stars: number, haze: number) {
    const uniforms = this.material.uniforms
    uniforms.moonDirection.value.copy(direction)
    uniforms.moon.value = THREE.MathUtils.smoothstep(direction.y, -0.03, 0.02)
    uniforms.stars.value = stars
    uniforms.haze.value = haze
  }
  dispose() {
    this.geometry.dispose()
    this.material.dispose()
  }
}

function disposeSkyScene(scene: THREE.Scene) {
  for (const child of scene.children) {
    const sky = child as Sky
    sky.geometry.dispose()
    sky.material.dispose()
  }
}

/**
 * How a scene is lit and finished. A scene's settings.look names what it wants; everything it leaves out comes from
 * these defaults, so a scene with no look still has soft studio light, a sun with soft shadows and ambient occlusion.
 */
export type Look = Required<Omit<NonNullable<SceneDocument['settings']['look']>, 'sunColor' | 'fogColor' | 'focusDistance'>> & {
  sunColor: string | null
  fogColor: string | null
  focusDistance: number
}
export const DEFAULT_LOOK: Look = {
  environment: 'studio',
  sunElevation: 48,
  sunAzimuth: 120,
  sunIntensity: 3.2,
  sunColor: null,
  environmentIntensity: 1,
  haze: 0.25,
  clouds: 0.25,
  shadows: 'soft',
  fog: 0,
  fogColor: null,
  exposure: 1,
  ambientOcclusion: 1,
  bloom: 0,
  focusDistance: 0,
  aperture: 0.3,
  lightShafts: 0,
  saturation: 1,
  contrast: 1,
  warmth: 0,
  vignette: 0,
  stars: 0.6,
}

export function resolveLook(document: SceneDocument): Look {
  const look = document.settings.look ?? {}
  const defined = Object.fromEntries(Object.entries(look).filter(([, value]) => value !== undefined))
  return { ...DEFAULT_LOOK, ...defined }
}

/** The direction to the sun (unit vector) for an elevation and azimuth in degrees. Azimuth 0 is +Z, 90 is +X. */
export function sunDirection(elevation: number, azimuth: number): THREE.Vector3 {
  return new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elevation), THREE.MathUtils.degToRad(azimuth))
}

/** Sunlight's colour by its height: white at noon, gold near the horizon, deep orange at sunset. */
export function sunlightColor(elevation: number): THREE.Color {
  const t = THREE.MathUtils.smoothstep(elevation, -2, 35)
  return new THREE.Color('#ff7a38').lerp(new THREE.Color('#ffd6a0'), Math.min(1, t * 1.6)).lerp(new THREE.Color('#fff8ef'), Math.max(0, t * 1.6 - 0.6))
}

/** The sky's colour at the horizon, for fog that blends into it. */
export function horizonColor(look: Look, background: string): THREE.Color {
  if (look.environment === 'night') return new THREE.Color('#1a2438').lerp(new THREE.Color('#2a2e38'), look.haze * 0.6)
  if (look.environment !== 'sky') return new THREE.Color(background)
  const t = THREE.MathUtils.smoothstep(look.sunElevation, -4, 30)
  return new THREE.Color('#e7a77c').lerp(new THREE.Color('#c3d3e2'), t).lerp(new THREE.Color('#d7d9dc'), look.haze * 0.5)
}

/**
 * The lights, sky, environment reflections, fog and finishing passes for one viewport. apply() takes a scene's look,
 * its background colour and the scene's bounds (shadows and fog are sized to them); render() draws a frame.
 */
export class LookRig {
  readonly composer: EffectComposer
  private readonly sun = new THREE.DirectionalLight('#ffffff', 3)
  private readonly fill = new THREE.HemisphereLight('#ffffff', '#6b6153', 0.35)
  private readonly sky = new Sky()
  private readonly night = new NightSky()
  private readonly pmrem: THREE.PMREMGenerator
  private environment: THREE.WebGLRenderTarget | null = null
  private environmentKey = ''
  private readonly room = new RoomEnvironment()
  private readonly render: RenderPass
  private readonly ao: GTAOPass
  private readonly bloom: UnrealBloomPass
  private readonly focus: BokehPass
  private readonly output = new OutputPass()
  private readonly shafts: LightShaftsPass
  private readonly grade = new GradePass()
  private readonly copy = new ShaderPass(CopyShader)
  private look: Look = DEFAULT_LOOK
  private radius = 10
  private centre = new THREE.Vector3()
  private direction = new THREE.Vector3(0, 1, 0)

  constructor(private readonly renderer: THREE.WebGLRenderer, private readonly scene: THREE.Scene, private readonly camera: THREE.PerspectiveCamera) {
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    // Neutral keeps colours true (AgX greys greens, ACES pushes them)
    renderer.toneMapping = THREE.NeutralToneMapping
    this.pmrem = new THREE.PMREMGenerator(renderer)
    this.sun.name = 'Pure3D sun'
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.02
    scene.add(this.sun, this.sun.target, this.fill)
    this.sky.name = 'Pure3D sky'
    this.sky.scale.setScalar(4500)
    this.sky.frustumCulled = false
    this.sky.material.uniforms.mieDirectionalG.value = 0.8
    scene.add(this.sky)
    this.night.scale.setScalar(4000)
    scene.add(this.night)
    const size = renderer.getDrawingBufferSize(new THREE.Vector2())
    const target = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: THREE.HalfFloatType, samples: 4 })
    this.composer = new EffectComposer(renderer, target)
    this.render = new RenderPass(scene, camera)
    this.ao = new FoliageAwareGTAOPass(scene, camera, Math.max(1, size.x), Math.max(1, size.y))
    this.ao.output = GTAOPass.OUTPUT.Default
    this.bloom = new UnrealBloomPass(new THREE.Vector2(Math.max(1, size.x), Math.max(1, size.y)), 0.4, 0.5, 0.85)
    // glow from lamps and highlights, not a white-out: the sky beside the sun is far brighter than anything else
    const highPass = (this.bloom as unknown as { materialHighPassFilter: THREE.ShaderMaterial }).materialHighPassFilter
    highPass.fragmentShader = highPass.fragmentShader.replace('vec4 texel = texture2D( tDiffuse, vUv );', 'vec4 texel = min( texture2D( tDiffuse, vUv ), vec4( 2.5 ) );')
    highPass.needsUpdate = true
    this.focus = new BokehPass(scene, camera, { focus: 10, aperture: 0.0001, maxblur: 0.01 })
    this.shafts = new LightShaftsPass(scene, camera)
    for (const pass of [this.render, this.ao, this.shafts, this.focus, this.bloom, this.output, this.grade]) this.composer.addPass(pass)
  }

  /** Light the scene for a look, a background colour and the bounds of what is in it. */
  apply(look: Look, background: string, bounds: THREE.Box3) {
    this.look = look
    const centre = bounds.isEmpty() ? new THREE.Vector3() : bounds.getCenter(new THREE.Vector3())
    this.radius = bounds.isEmpty() ? 6 : Math.max(2, bounds.getBoundingSphere(new THREE.Sphere()).radius)
    const direction = sunDirection(look.sunElevation, look.sunAzimuth)
    const sky = look.environment === 'sky'
    const night = look.environment === 'night'
    // The sun, or at night the moon: cool, dim light that fades as the moon sets
    const daylight = THREE.MathUtils.smoothstep(look.sunElevation, -6, 8)
    this.sun.color.set(look.sunColor ?? (night ? '#9fb6e8' : sunlightColor(look.sunElevation)))
    this.sun.intensity = look.sunIntensity * (night ? 0.12 * THREE.MathUtils.smoothstep(look.sunElevation, -2, 6) : sky ? daylight : 1)
    this.centre.copy(centre)
    this.direction.copy(direction)
    this.sun.castShadow = look.shadows !== 'off'
    this.focusShadows()
    this.sun.shadow.radius = look.shadows === 'soft' ? 3 : 1
    this.sun.shadow.blurSamples = look.shadows === 'soft' ? 16 : 8
    this.sun.shadow.needsUpdate = true
    // The sky, or a plain studio background
    this.sky.visible = sky
    this.night.visible = night
    this.night.set(direction, look.stars, look.haze)
    const uniforms = this.sky.material.uniforms
    uniforms.sunPosition.value.copy(direction)
    uniforms.turbidity.value = 1.5 + look.haze * 9
    uniforms.rayleigh.value = 0.6 + look.haze * 1.6 + (1 - THREE.MathUtils.smoothstep(look.sunElevation, 0, 25)) * 1.2
    uniforms.mieCoefficient.value = 0.003 + look.haze * 0.012
    if (uniforms.cloudCoverage) uniforms.cloudCoverage.value = look.clouds
    if (uniforms.cloudDensity) uniforms.cloudDensity.value = 0.3 + look.clouds * 0.5
    this.scene.background = sky || night ? null : new THREE.Color(background)
    // A soft fill that keeps shadows from going black (the environment does most of this)
    this.fill.color.copy(horizonColor(look, background)).lerp(new THREE.Color('#ffffff'), 0.5)
    this.fill.intensity = 0.25 * look.environmentIntensity * (night ? 0.25 : 1)
    // Reflections and ambient light from the sky or a studio
    const key = sky ? JSON.stringify([look.sunElevation, look.sunAzimuth, look.haze, look.clouds]) : night ? JSON.stringify(['night', look.sunElevation, look.sunAzimuth, look.haze]) : 'studio'
    if (key !== this.environmentKey) {
      this.environment?.dispose()
      if (night) {
        const nightScene = new THREE.Scene()
        const copy = new NightSky()
        copy.scale.setScalar(1000)
        copy.set(direction, 0, look.haze)
        nightScene.add(copy)
        this.environment = this.pmrem.fromScene(nightScene, 0.02, 0.1, 2000)
        copy.dispose()
      } else if (sky) {
        const skyScene = this.skyScene()
        this.environment = this.pmrem.fromScene(skyScene, 0, 0.1, 2000)
        disposeSkyScene(skyScene)
      } else this.environment = this.pmrem.fromScene(this.room, 0.04)
      this.environmentKey = key
    }
    this.scene.environment = this.environment!.texture
    this.scene.environmentIntensity = look.environmentIntensity * (night ? 1.5 : sky ? 0.25 + daylight * 0.3 : 0.75)
    // Fog sized to the scene and coloured like the horizon
    this.scene.fog = look.fog > 0 ? new THREE.FogExp2(new THREE.Color(look.fogColor ?? horizonColor(look, background)), (look.fog * look.fog * 3.2) / this.radius) : null
    this.renderer.toneMappingExposure = look.exposure
    // Finishing passes
    this.ao.enabled = look.ambientOcclusion > 0
    this.ao.blendIntensity = look.ambientOcclusion
    this.ao.updateGtaoMaterial({ radius: THREE.MathUtils.clamp(this.radius * 0.035, 0.15, 3), distanceFallOff: 1, thickness: 1 })
    this.bloom.enabled = look.bloom > 0
    this.bloom.strength = look.bloom * 0.6
    this.bloom.threshold = 0.97
    this.bloom.radius = 0.55
    this.focus.enabled = look.focusDistance > 0
    const uniformsFocus = (this.focus as unknown as { uniforms: Record<string, THREE.IUniform> }).uniforms
    uniformsFocus.focus.value = look.focusDistance
    uniformsFocus.aperture.value = look.aperture * 0.0004
    uniformsFocus.maxblur.value = 0.012
    this.shafts.strength = sky ? look.lightShafts * daylight : 0
    this.shafts.sun.copy(direction)
    this.shafts.sunColor.copy(this.sun.color).multiplyScalar(0.6 + look.sunIntensity * 0.12)
    const grade = this.grade.material.uniforms
    grade.saturation.value = look.saturation
    grade.contrast.value = look.contrast
    grade.warmth.value = look.warmth
    grade.vignette.value = look.vignette
    this.grade.enabled = look.saturation !== 1 || look.contrast !== 1 || look.warmth !== 0 || look.vignette > 0
  }

  /** A scene holding a copy of the sky as it is now, without the sun's disc (the sun light makes the highlight). */
  private skyScene(): THREE.Scene {
    const skyScene = new THREE.Scene()
    const copy = new Sky()
    copy.scale.setScalar(1000)
    for (const [name, uniform] of Object.entries(this.sky.material.uniforms)) if (copy.material.uniforms[name]) copy.material.uniforms[name].value = (uniform as THREE.IUniform).value?.clone?.() ?? (uniform as THREE.IUniform).value
    if (copy.material.uniforms.showSunDisc) copy.material.uniforms.showSunDisc.value = 0
    skyScene.add(copy)
    return skyScene
  }

  /** Grid, gizmos and other helpers are drawn after the finished frame, so they take no shadows or blur. */
  setSize(width: number, height: number, pixelRatio: number) {
    this.composer.setPixelRatio(pixelRatio)
    this.composer.setSize(width, height)
  }

  /** Higher-quality shadows while capturing a still. */
  setShadowDetail(size: number) {
    if (this.sun.shadow.mapSize.x === size) return
    this.sun.shadow.mapSize.set(size, size)
    this.sun.shadow.map?.dispose()
    this.sun.shadow.map = null
  }

  /**
   * Fit the sun's shadow to what the camera looks at: the whole scene when it is small or seen from afar, the part in
   * front of the camera when it is large, so shadows stay crisp in a forest as well as on a table.
   */
  private focusShadows() {
    const forward = this.camera.getWorldDirection(new THREE.Vector3())
    const distance = this.camera.position.distanceTo(this.centre)
    const reach = THREE.MathUtils.clamp(distance, 2, this.radius)
    const area = Math.min(this.radius * 1.05, Math.max(4, reach * 1.25))
    const focus = area >= this.radius ? this.centre.clone() : this.camera.position.clone().addScaledVector(forward, reach * 0.9)
    this.sun.position.copy(focus).addScaledVector(this.direction, this.radius * 2.2)
    this.sun.target.position.copy(focus)
    this.sun.target.updateMatrixWorld()
    const shadow = this.sun.shadow.camera
    shadow.left = shadow.bottom = -area
    shadow.right = shadow.top = area
    shadow.near = 0.05
    shadow.far = this.radius * 3.6
    shadow.updateProjectionMatrix()
    // bias by the size of one shadow texel, so neither acne nor floating shadows at any scale
    const texel = (area * 2) / this.sun.shadow.mapSize.x
    this.sun.shadow.normalBias = texel * 1.6
    this.sun.shadow.bias = -0.00005
  }

  draw(toScreen = true) {
    if (this.sun.castShadow) this.focusShadows()
    // beams only when the sun is ahead of the camera; the grade needs the frame's shape for its vignette
    this.shafts.enabled = this.shafts.strength > 0 && this.shafts.sunInView()
    this.grade.material.uniforms.aspect.value = this.camera.aspect
    this.composer.renderToScreen = toScreen
    this.composer.render()
  }

  /**
   * A finished still as a PNG data URL: rendered off screen at twice the size with finer shadows, then scaled down.
   * The caller has set the camera's aspect. Leaves the composer at the still's size; size it again before drawing.
   */
  still(width: number, height: number): string {
    const scale = Math.max(1, Math.min(2, 4096 / Math.max(width, height)))
    const big = { width: Math.round(width * scale), height: Math.round(height * scale) }
    this.setShadowDetail(4096)
    this.setSize(big.width, big.height, 1)
    try {
      this.draw(false)
      return this.toPng(this.composer.readBuffer, big.width, big.height, width, height)
    } finally {
      this.setShadowDetail(2048)
    }
  }

  /** A finished picture in a render target as a PNG data URL, scaled to width × height. */
  private toPng(source: THREE.WebGLRenderTarget, sourceWidth: number, sourceHeight: number, width: number, height: number): string {
    const target = new THREE.WebGLRenderTarget(sourceWidth, sourceHeight)
    try {
      this.copy.render(this.renderer, target, source, 0, false)
      const pixels = new Uint8Array(sourceWidth * sourceHeight * 4)
      this.renderer.readRenderTargetPixels(target, 0, 0, sourceWidth, sourceHeight, pixels)
      const full = document.createElement('canvas')
      full.width = sourceWidth
      full.height = sourceHeight
      const image = new ImageData(sourceWidth, sourceHeight)
      const row = sourceWidth * 4
      // WebGL rows run bottom to top
      for (let y = 0; y < sourceHeight; y++) image.data.set(pixels.subarray((sourceHeight - 1 - y) * row, (sourceHeight - y) * row), y * row)
      full.getContext('2d')!.putImageData(image, 0, 0)
      if (sourceWidth === width && sourceHeight === height) return full.toDataURL('image/png')
      const out = document.createElement('canvas')
      out.width = width
      out.height = height
      const g = out.getContext('2d')!
      g.imageSmoothingEnabled = true
      g.imageSmoothingQuality = 'high'
      g.drawImage(full, 0, 0, width, height)
      return out.toDataURL('image/png')
    } finally {
      target.dispose()
    }
  }

  dispose() {
    this.copy.dispose()
    this.environment?.dispose()
    this.pmrem.dispose()
    this.composer.dispose()
    this.ao.dispose()
    this.bloom.dispose()
    this.shafts.dispose()
    this.grade.dispose()
    this.sky.geometry.dispose()
    this.sky.material.dispose()
    this.night.dispose()
    this.sun.shadow.dispose()
    this.room.traverse(node => {
      if (node instanceof THREE.Mesh) { node.geometry.dispose(); (node.material as THREE.Material).dispose() }
    })
  }
}
