// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAdjacentApp } from '@purescience/platform-ui/bridge/react/useAdjacentApp'
import { useCompactInRoom } from './useCompactInRoom'

vi.mock('@purescience/platform-ui/bridge/react/useAdjacentApp', () => ({ useAdjacentApp: vi.fn() }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root, seen: boolean | undefined
function Probe() { seen = useCompactInRoom(); return null }

beforeEach(() => {
  seen = undefined
  root = createRoot(document.createElement('div'))
})
afterEach(async () => { await act(async () => root.unmount()) })

it('is true while held in a page, false beside an app in split view, and turns off when the room lets go', async () => {
  vi.mocked(useAdjacentApp).mockReturnValue({ tabId: 'tab', name: 'the room', heldInRoom: true } as never)
  await act(async () => root.render(<Probe />))
  expect(seen).toBe(true)
  vi.mocked(useAdjacentApp).mockReturnValue({ tabId: 'tab', name: 'PureMail' } as never)
  await act(async () => root.render(<Probe />))
  expect(seen).toBe(false)
  vi.mocked(useAdjacentApp).mockReturnValue(null)
  await act(async () => root.render(<Probe />))
  expect(seen).toBe(false)
})

it('has no style that can apply with compact off: every selector starts from the compact frame', () => {
  const rules = readFileSync(join(process.cwd(), 'src/compact-in-room.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const selectors = [...rules.matchAll(/([^{}]+)\{/g)].flatMap(m => m[1]!.split(',')).map(s => s.trim())
  expect(selectors.length).toBeGreaterThan(10)
  for (const selector of selectors) expect(selector).toMatch(/^(\[data-compact-room\]|html\[data-held-in-room\]:has\(\[data-compact-room\]\))/)
})
