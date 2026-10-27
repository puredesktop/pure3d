import { isDeleteObjectKey } from './hotkeys'

export type WorkspaceHotkeyStore = {
  getSnapshot(): { playing: boolean; selectedId: string | null }
  workspace(patch: {
    playing?: boolean
    mode?: 'translate' | 'rotate' | 'scale'
  }): void
  history(direction: 'undo' | 'redo'): void
  edit(operations: Array<{ op: 'delete'; id: string }>): void
}

export function handleWorkspaceHotkey(
  event: KeyboardEvent,
  store: WorkspaceHotkeyStore,
  viewport: { frame(): void } | null,
  run: (action: () => unknown) => void,
) {
  if (event.target instanceof HTMLElement && event.target.closest('[role="dialog"]')) return
  const editing =
    event.target instanceof HTMLElement &&
    (event.target.matches('input, textarea') || event.target.isContentEditable)
  const command = event.ctrlKey || event.metaKey
  if (editing) return
  const current = store.getSnapshot()
  if (command && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    run(() => store.history(event.shiftKey ? 'redo' : 'undo'))
  } else if (event.code === 'Space') {
    if (event.target instanceof Element && event.target.closest(
      'button, input, textarea, select, a[href], summary, [contenteditable="true"], [role="button"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="checkbox"], [role="radio"], [role="switch"], [role="slider"], [role="spinbutton"], [role="combobox"], [role="listbox"], [role="option"], [role="tab"], [role="treeitem"]',
    )) return
    event.preventDefault()
    store.workspace({ playing: !current.playing })
  } else if (!command && event.key.toLowerCase() === 'f') viewport?.frame()
  else if (!command && event.key.toLowerCase() === 'w')
    store.workspace({ mode: 'translate' })
  else if (!command && event.key.toLowerCase() === 'e')
    store.workspace({ mode: 'rotate' })
  else if (!command && event.key.toLowerCase() === 'r')
    store.workspace({ mode: 'scale' })
  else if (isDeleteObjectKey(event) && current.selectedId) {
    event.preventDefault()
    run(() => store.edit([{ op: 'delete', id: current.selectedId! }]))
  }
}
