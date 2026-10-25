import { describe, expect, it } from 'vitest'
import { isDeleteObjectKey } from './hotkeys'

describe('isDeleteObjectKey', () => {
  it('accepts the Mac delete key, which reports Backspace', () => {
    expect(isDeleteObjectKey({ key: 'Backspace' })).toBe(true)
  })

  it('accepts forward Delete', () => {
    expect(isDeleteObjectKey({ key: 'Delete' })).toBe(true)
  })

  it('ignores other keys', () => {
    expect(isDeleteObjectKey({ key: 'd' })).toBe(false)
    expect(isDeleteObjectKey({ key: 'Escape' })).toBe(false)
  })
})
