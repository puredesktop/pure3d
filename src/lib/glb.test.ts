// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { AnimationMixer, Vector3, ImageLoader } from 'three'
import { emptyScene, makeObject } from './scene'
import { exportScene, disposeScene } from './threeScene'
import { importModel } from './importModel'

describe('GLB round trip', () => {
  it('exports materials and playable transform animation into an actual GLB', async () => {
    const scene = emptyScene()
    const object = makeObject('box')
    scene.objects.push(object)
    object.material.color = '#cc5533'
    scene.settings.duration = 2
    scene.keyframes = [
      {
        objectId: object.id,
        property: 'position',
        time: 0,
        value: [0, 0, 0],
        easing: 'linear',
      },
      {
        objectId: object.id,
        property: 'position',
        time: 2,
        value: [4, 0, 0],
        easing: 'linear',
      },
    ]
    const exported = await exportScene(scene, 'glb', 0)
    const data = exported.data as ArrayBuffer
    expect(new DataView(data).getUint32(0, true)).toBe(0x46546c67)
    const loaded = await new GLTFLoader().parseAsync(data, '')
    expect(loaded.animations).toHaveLength(1)
    const mixer = new AnimationMixer(loaded.scene)
    mixer.clipAction(loaded.animations[0]).play()
    mixer.setTime(1)
    loaded.scene.updateMatrixWorld(true)
    const mesh = loaded.scene.getObjectByProperty('type', 'Mesh')!
    expect(mesh.getWorldPosition(new Vector3()).x).toBeCloseTo(2)
    disposeScene(loaded.scene)
    await expect(importModel(data, 'glb')).rejects.toThrow('existing animation')
  })
  it('imports a static exported GLB as editable meshes with PBR values', async () => {
    const scene = emptyScene()
    const object = makeObject('cone')
    scene.objects.push(object)
    object.material.metalness = 0.8
    const exported = await exportScene(scene, 'glb', 0)
    const imported = await importModel(exported.data, 'glb')
    const mesh = imported.find(o => o.kind === 'mesh')!
    expect(mesh.geometry!.positions.length).toBeGreaterThan(9)
    expect(mesh.geometry!.uv).toHaveLength(
      (mesh.geometry!.positions.length / 3) * 2,
    )
    expect(mesh.material.color).toBe(object.material.color)
    expect(mesh.material.metalness).toBe(0.8)
  })
  it('embeds base-color images and round-trips texture settings and UVs (mocked image/canvas backend)', async () => {
    const dataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg=='
    const image = document.createElement('img')
    image.width = image.height = 1
    vi.stubGlobal('createImageBitmap', undefined)
    const loader = vi
      .spyOn(ImageLoader.prototype, 'load')
      .mockImplementation((_url, onLoad) => {
        queueMicrotask(() => onLoad?.(image))
        return image
      })
    const context = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({
        drawImage: vi.fn(),
        translate: vi.fn(),
        scale: vi.fn(),
      } as unknown as CanvasRenderingContext2D)
    const blob = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation(callback =>
        callback(
          new Blob(
            [
              Uint8Array.from(atob(dataUrl.split(',')[1]), c =>
                c.charCodeAt(0),
              ),
            ],
            { type: 'image/png' },
          ),
        ),
      )
    const encoded = vi
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue(dataUrl)
    try {
      const scene = emptyScene()
      const object = makeObject('plane')
      object.material.texture = {
        dataUrl,
        repeat: [3, 2],
        offset: [0.1, 0.2],
        rotation: 0.3,
        flipY: false,
        wrapS: 'mirror',
        wrapT: 'clamp',
      } as never
      scene.objects.push(object)
      const exported = await exportScene(scene, 'glb', 0)
      const data = exported.data as ArrayBuffer
      const json = JSON.parse(
        new TextDecoder().decode(
          new Uint8Array(data, 20, new DataView(data).getUint32(12, true)),
        ),
      )
      expect(json.images[0]).toMatchObject({
        mimeType: 'image/png',
        bufferView: expect.any(Number),
      })
      expect(
        json.materials[0].pbrMetallicRoughness.baseColorTexture.index,
      ).toBe(0)
      const imported = (await importModel(data, 'glb')).find(
        o => o.kind === 'mesh',
      )!
      expect(imported.material.texture).toEqual(object.material.texture)
      expect(imported.geometry!.uv).toHaveLength(
        (imported.geometry!.positions.length / 3) * 2,
      )
      loader.mockImplementation((_url, _onLoad, _onProgress, onError) => {
        queueMicrotask(() => onError?.(new Error('Invalid image')))
        return image
      })
      const warning = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        await expect(importModel(data, 'glb')).rejects.toThrow(
          'could not be decoded',
        )
      } finally {
        warning.mockRestore()
      }
    } finally {
      loader.mockRestore()
      context.mockRestore()
      blob.mockRestore()
      encoded.mockRestore()
      vi.unstubAllGlobals()
    }
  })
})
