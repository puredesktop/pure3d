// @vitest-environment happy-dom
import { act, type ButtonHTMLAttributes } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Timeline } from './Timeline'
import { SceneStore } from '../lib/SceneStore'
import { emptyScene, makeObject } from '../lib/scene'

vi.mock('@purescience/platform-ui/components/common/containers/AppChrome', () => ({
  ToolbarControl: (props: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
  SidebarSectionLabel: () => null,
}))

vi.mock('./Controls', () => ({
  Choice: () => null,
  NumberField: () => null,
  Slider: () => null,
}))

let root: Root
let store: SceneStore
let container: HTMLDivElement

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const scene = emptyScene()
  const object = makeObject()
  scene.objects = [object]
  scene.keyframes = [
    { objectId: object.id, property: 'position', time: 0, value: [0, 0, 0], easing: 'linear' },
    { objectId: object.id, property: 'position', time: 1, value: [30, 0, 0], easing: 'linear' },
  ]
  store = new SceneStore(scene)
  store.workspace({ selectedId: object.id, time: 0.51 })
  container = document.createElement('div')
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
})

it('samples a new keyframe value at its rounded frame time', async () => {
  await act(async () => {
    root.render(<Timeline store={store} run={action => action()} />)
  })
  const button = container.querySelector<HTMLButtonElement>('[aria-label="Add position keyframe"]')!
  await act(async () => button.click())

  const scene = store.getSnapshot().scene
  const keyframe = scene.keyframes.find(key => key.time === 0.5)!
  expect(keyframe.value).toEqual([15, 0, 0])
})

it('selects the new keyframe so its easing and remove controls are enabled', async () => {
  await act(async () => {
    root.render(<Timeline store={store} run={action => action()} />)
  })
  const remove = () =>
    container.querySelector<HTMLButtonElement>('[aria-label="Remove position keyframe"]')!
  expect(remove().disabled).toBe(true)

  const add = container.querySelector<HTMLButtonElement>('[aria-label="Add position keyframe"]')!
  await act(async () => add.click())

  expect(store.getSnapshot().time).toBe(0.5)
  expect(remove().disabled).toBe(false)
  expect(
    container.querySelector('[aria-label="position keyframe at 0.5s"]')!.getAttribute('aria-pressed'),
  ).toBe('true')
})
