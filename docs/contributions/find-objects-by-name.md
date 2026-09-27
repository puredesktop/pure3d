# Find an object by name

**Medium · Open contribution** · `find-objects-by-name`

## What the user gets

Add a name filter to the scene object list while retaining ancestor rows, so nested objects remain understandable without changing scene structure.

## Where to start

- [src/components/Workspace.tsx](../../src/components/Workspace.tsx) — start with the app-owned UI/state at this path. At source revision `a1e5d32b806f`, inspect line 460: `state.scene.objects.find(o => o.id === state.selectedId)?.name ??`.
- [App guide](../app-guide.md) — open the view in which this change belongs.
- [Development guide](../development.md) — prepare the shared dependencies and run this app inside PureDesktop.

The source location is a navigation hint, not a patch prescription. Read the enclosing component and its existing handlers, then follow their state/command calls. If the behavior is already partly implemented, improve the missing visible part rather than adding a duplicate control. Do not edit generated output or move app behavior into the desktop shell.

## Implementation outline

1. Reproduce the current behavior in the surface above using the fixture below. Identify the existing state and the handler that owns the action.
2. Add a name filter to the scene object list while retaining ancestor rows, so nested objects remain understandable without changing scene structure.
3. Keep existing document identities, formats, persistence and undo behavior. Derive displayed counts, labels and previews from the same data used by the action; do not keep a second editable copy of that data.
4. Keep controls labelled and keyboard reachable. Handle empty, long-text and unavailable-data states inline. For asynchronous work, show success only after completion and retain the input on failure.

## Demonstrate it

**Setup:** Create a disposable scene with a cube, a second object, a parent group, a material and two animation keyframes.

**Primary check:** Create nested objects named Chair and Lamp; filter for Lamp, keep its parent visible, then clear the query to restore the tree.

**Expected visible result:** Add a name filter to the scene object list while retaining ancestor rows, so nested objects remain understandable without changing scene structure.

**Regression check:** Repeat with an empty value or selection and in a narrow window. The previous document stays intact, existing controls remain reachable, and the user can undo/cancel where the existing workflow supports it. Verify in light and dark themes. For a display-only change, confirm that opening the view does not write to the document.

## Verification and submission

Follow [development setup](../development.md) first. Run `npm run typecheck`; run a focused existing test or add one for changed state/validation logic. Run `npm run build` for a production compilation check. For UI-only work, include before/after screenshots and the exact manual steps above; do not claim tests you did not run.

Build and test locally before deciding whether to submit through Factory’s existing website review process. Nothing in this brief authorizes automatic publication, sending messages, issuing invoices, uploading files, or merging. All contributed code follows this repository’s license. Choose a public name, nickname or anonymous credit at submission.
