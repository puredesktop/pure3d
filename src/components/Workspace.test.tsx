// @vitest-environment happy-dom
import { act, type PropsWithChildren } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('@purescience/platform-bridge/components/AppFrame', () => ({
  AppFrame: ({ children }: PropsWithChildren) => <>{children}</>,
}))
vi.mock('@purescience/platform-ui/components/common/containers/AppChrome', () => ({
  EditorToolbar: ({ children }: PropsWithChildren) => <div>{children}</div>,
  ToolbarControl: (props: React.ComponentProps<'button'>) => <button {...props} />,
  SidebarRow: ({ children }: PropsWithChildren) => <div>{children}</div>,
  SidebarSectionLabel: ({ children }: PropsWithChildren) => <span>{children}</span>,
}))
vi.mock('@purescience/platform-ui/components/chrome/PureAppWordmark', () => ({ PureAppWordmark: () => null }))
vi.mock('@purescience/platform-ui/components/common/inputs/TextField', () => ({ TextField: () => null }))
vi.mock('@purescience/platform-ui/components/common/documents', () => ({
  DocumentHeaderActions: () => null,
  DocumentSwitcher: () => null,
}))
vi.mock('@purescience/platform-ui/bridge/react/useDocumentHotkeys', () => ({ useDocumentHotkeys: () => undefined }))
vi.mock('../bridge/platformBridge', () => ({ isStandaloneDevMode: () => true }))
vi.mock('../hooks/useSceneDocument', () => ({
  useSceneDocument: () => ({ doc: {}, lifecycle: {} }),
}))
vi.mock('../hooks/useAppAgentTools', () => ({
  useAppAgentTools: () => undefined,
  createToolHandlers: () => ({}),
}))
vi.mock('./Controls', () => ({ Choice: () => null }))
vi.mock('./Inspector', () => ({ Inspector: () => null }))
vi.mock('./Timeline', () => ({ Timeline: () => null }))
vi.mock('./VideoExport', () => ({ VideoExport: () => null }))
vi.mock('./SceneViewport', () => ({ SceneViewport: () => <canvas tabIndex={0} /> }))

import { Workspace } from './Workspace'
import { SceneStore } from '../lib/SceneStore'

let root: Root
let host: HTMLDivElement
let store: SceneStore

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  store = new SceneStore()
  await act(async () => root.render(
    <Workspace store={store} ready={false} resource={null} clearResource={() => undefined} />,
  ))
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

async function pressSpace(target: HTMLElement) {
  target.focus()
  expect(document.activeElement).toBe(target)
  const event = new KeyboardEvent('keydown', {
    key: ' ', code: 'Space', bubbles: true, cancelable: true,
  })
  await act(async () => target.dispatchEvent(event))
  return event
}

it.each([false, true])('leaves Space to a focused toolbar button while playing=%s', async playing => {
  await act(async () => store.workspace({ playing }))
  const button = host.querySelector<HTMLButtonElement>('[aria-label="Toggle inspector"]')!
  const event = await pressSpace(button)
  expect(store.getSnapshot().playing).toBe(playing)
  // Let the browser perform the button's normal keyboard activation.
  expect(event.defaultPrevented).toBe(false)
})

it.each(['<select><option>One</option></select>', '<div role="button" tabindex="0"><span tabindex="0">Action</span></div>'])('leaves Space to other controls: %s', async html => {
  const wrapper = document.createElement('div')
  wrapper.innerHTML = html
  host.append(wrapper)
  const target = wrapper.querySelector<HTMLElement>('span, select')!
  const event = await pressSpace(target)
  expect(store.getSnapshot().playing).toBe(false)
  expect(event.defaultPrevented).toBe(false)
})

it.each([
  'checkbox', 'radio', 'switch', 'slider', 'spinbutton', 'menuitem',
  'menuitemcheckbox', 'menuitemradio', 'combobox', 'listbox', 'option', 'tab', 'treeitem',
])('leaves Space to a focused ARIA %s', async role => {
  const control = document.createElement('div')
  control.setAttribute('role', role)
  control.tabIndex = 0
  host.append(control)
  const event = await pressSpace(control)
  expect(store.getSnapshot().playing).toBe(false)
  expect(event.defaultPrevented).toBe(false)
})

it('still toggles playback with Space from the viewport', async () => {
  const viewport = host.querySelector('canvas')!
  expect((await pressSpace(viewport)).defaultPrevented).toBe(true)
  expect(store.getSnapshot().playing).toBe(true)
  await pressSpace(viewport)
  expect(store.getSnapshot().playing).toBe(false)
})
