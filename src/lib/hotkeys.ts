// The Mac delete key reports Backspace; only fn+delete reports Delete.
export const isDeleteObjectKey = (event: Pick<KeyboardEvent, 'key'>) =>
  event.key === 'Delete' || event.key === 'Backspace'
