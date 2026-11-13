// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'

const prefer = vi.hoisted(() => vi.fn(async () => true))
vi.mock('../bridge/platformBridge', () => ({ preferModelRole: prefer }))
import { useThreeDModel } from './useThreeDModel'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Probe({ ready, standalone }: { ready: boolean; standalone: boolean }) {
  useThreeDModel(ready, standalone)
  return null
}

it('asks the host for the 3D model once the bridge is ready, and never in standalone development', async () => {
  const host = document.createElement('div')
  const root = createRoot(host)
  await act(async () => root.render(<Probe ready={false} standalone={false} />))
  expect(prefer).not.toHaveBeenCalled()
  await act(async () => root.render(<Probe ready standalone />))
  expect(prefer).not.toHaveBeenCalled()
  await act(async () => root.render(<Probe ready standalone={false} />))
  expect(prefer).toHaveBeenCalledWith('3d', '3d')
  await act(async () => root.unmount())
})
