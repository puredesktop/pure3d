// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { handleWorkspaceHotkey, type WorkspaceHotkeyStore } from './workspaceHotkeys'

function setup() {
  const store: WorkspaceHotkeyStore = {
    getSnapshot: () => ({ playing: false, selectedId: null }),
    workspace: vi.fn(),
    history: vi.fn(),
    edit: vi.fn(),
  }
  const viewport = { frame: vi.fn() }
  const run = (action: () => unknown) => {
    action()
  }
  return { store, viewport, run }
}

function key(key: string, modifier?: 'ctrlKey' | 'metaKey') {
  return {
    key,
    code: `Key${key.toUpperCase()}`,
    target: null,
    ctrlKey: modifier === 'ctrlKey',
    metaKey: modifier === 'metaKey',
    shiftKey: false,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent
}

describe('workspace hotkeys', () => {
  it.each(['ctrlKey', 'metaKey'] as const)(
    'ignores handle and framing shortcuts with %s',
    modifier => {
      const { store, viewport, run } = setup()
      for (const shortcut of ['w', 'e', 'r', 'f'])
        handleWorkspaceHotkey(key(shortcut, modifier), store, viewport, run)
      expect(store.workspace).not.toHaveBeenCalled()
      expect(viewport.frame).not.toHaveBeenCalled()
    },
  )

  it.each(['Backspace', 'Delete'])('deletes the selected object with %s and prevents browser navigation', shortcut => {
    const { store, viewport, run } = setup()
    store.getSnapshot = () => ({ playing: false, selectedId: 'cube' })
    const event = key(shortcut)
    handleWorkspaceHotkey(event, store, viewport, run)
    expect(store.edit).toHaveBeenCalledWith([{ op: 'delete', id: 'cube' }])
    expect(event.preventDefault).toHaveBeenCalledOnce()
  })

  it('still handles unmodified handle and framing shortcuts', () => {
    const { store, viewport, run } = setup()
    for (const shortcut of ['w', 'e', 'r', 'f'])
      handleWorkspaceHotkey(key(shortcut), store, viewport, run)
    expect(store.workspace).toHaveBeenNthCalledWith(1, { mode: 'translate' })
    expect(store.workspace).toHaveBeenNthCalledWith(2, { mode: 'rotate' })
    expect(store.workspace).toHaveBeenNthCalledWith(3, { mode: 'scale' })
    expect(viewport.frame).toHaveBeenCalledOnce()
  })
})
