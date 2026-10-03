# Pure3D reliability and performance audit

Audited against app main `d9ebf8d97742743d39500fb5aac2063d9e8d618e` on
2026-10-03. Scene format, tool input schemas and bridge contracts are preserved.
Changes belong to the app; no shared SDK or shell implementation changes.

## Fixes

- Clean document opens no longer trigger autosave. Open/create/save actions
  execute in order, failed actions leave the queue usable, and Save As persists
  edits made while its initial copy is being written.
- Saves and the close flush include the live camera before the navigation
  persistence debounce finishes, without adding camera navigation to undo.
- Imports, texture decoding and generated texture results cannot alter a new
  document after a switch, even if object IDs are reused. Concurrent edits
  within the same document remain valid; paid generation is never repeated.
- Texture readiness survives unrelated material-preserving edits. Replacing
  image bytes under an existing asset ID reloads the image. Discarding a pending
  cache entry cancels it and releases a late decoded bitmap. Failed cache loads
  can be requested again.
- Export waits for textures before disposing hidden objects. Viewport capture
  rejects a scene changed during decoding and restores the active playhead pose
  after capturing another time.
- Tool descriptions now reflect the existing inherited group-texture behavior.
  Tests use the current shared texture-asset format and still check image bytes,
  UV transforms, undo, save failures and generation failures.

## Optimisations

The viewport coalesces edits into requested animation frames and stops scheduling
frames when idle. Playback, orbiting, gizmos, resizing and texture readiness
request redraws. Unchanged workspace patches keep their snapshot identity and
do not notify listeners. Texture lookup uses asset IDs rather than keys that
embed full image bytes; initial primitive geometry is created once.

OBJ, STL and GLB loaders/exporters are loaded when used. The initial production
JavaScript bundle decreases from 1,447.33 KB / 402.91 KB gzip to about
1,313 KB / 361 KB gzip. This measures initial transfer, not total optional chunks
or a desktop startup-time benchmark. Three.js still produces a large-chunk
build warning.

## Verification and limits

- `npm test`: 65 tests across 11 files pass, including manifest/permission checks.
- `npm run typecheck` and `npm run build` pass.
- 15 focused checks fail when the original relevant source is temporarily
  restored; the updated source passes. The comparison also includes a passing
  hidden-animation exclusion check to retain existing export behavior.
- Browser preview at 1280×800 and 540×800 renders actual WebGL. Object creation,
  transform changes, keyframes, undo/redo, playback and framing were exercised;
  the scene body fits both widths.

Document lifecycle tests use the shared hook with mocked host services. Texture
and viewport unit tests use mocked image/canvas or renderer backends; GLB/OBJ/STL
round trips use the real format loaders/exporters. No live paid image generation
or user files were used. Installed-desktop filesystem, tab close, drawer and
video-encoding flows were not exercised. `puredesktop:check` is mentioned in the
contribution guide but is not present in this app's package scripts; the existing
platform-contract tests provide manifest and permission validation here.
