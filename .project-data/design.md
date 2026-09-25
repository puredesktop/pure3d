# Pure3D Product Design

## Adoption and product goal

Adopt the existing Pure3D implementation for continued app-development work.
This is an implemented app, not a request to scaffold or rebuild it. Inspect
the current source and plan only the changes needed for a new request.

Pure3D is the suite workspace for creating and editing 3D models and
object-transform animations. The development project is `pure3d`, stored at
`apps/pure3d`; the platform app ID and assistant tool prefix are `3d`. The
accepted app contract is the existing root `plugin.json` and `agents.md`.

## Current product surface

- A Three.js viewport with orbit navigation, object selection, transform
  gizmos, selection framing, a ground grid and a saved perspective camera.
- An object outline for boxes, spheres, cylinders, cones, toruses, planes,
  groups and editable triangle meshes. Objects have names, parents,
  visibility, transforms and PBR material values. Hierarchy edits cannot
  introduce cycles; duplicating or deleting an object includes its subtree
  and animation keys.
- An inspector for transforms, material color, metalness, roughness, opacity,
  wireframe and mesh vertices/triangle indices. Positions use meters and
  rotations display degrees while the scene stores XYZ Euler radians.
  Shared platform numeric fields, color pickers, sliders, text fields and
  switches provide consistent controls.
- A timeline for position, rotation and scale keyframes, linear/smooth/step
  easing, playback, looping, duration and FPS. Editing an already animated
  transform inserts or updates a key at the current playhead. Content edits
  support undo and redo.
- Portable `.pure3d` JSON scenes, document switching, platform drafts,
  autosave, opening and Save As. Import static OBJ/STL or self-contained GLB;
  export animated GLB, current-pose OBJ/STL or a viewport PNG.

## Ownership and assistant behavior

Scene validation, geometry, animation, imports, exports and transactional
edits belong to `src/lib`. `SceneStore` owns canonical scene content, undo
history and transient workspace state. Selection and playback do not dirty
the document. `useSceneDocument` supplies serialization and uses the shared
platform document lifecycle for drafts, autosave and close handling. Opening
flushes outgoing changes before replacing the scene.

The app is a client of `@purescience/platform-ui/bridge`. Use the existing
bridge helpers and UI hooks; keep product behavior in the app. Generic
reusable controls belong to `packages/ui`. The manifest is generated from
`src/lib/schemas.mjs` by `scripts/manifest.mjs`.

The assistant contract exposes `3d.getScene`, `3d.editScene`,
`3d.setWorkspace`, `3d.newScene`, `3d.openScene`, `3d.saveScene`,
`3d.importModel`, `3d.importTexture`, `3d.generateTexture`, `3d.exportModel`,
`3d.history` and `3d.captureViewport`.
Tools edit the active workspace directly through `SceneStore`, the same source
used by the UI, viewport and document serialization. Object IDs identify shapes;
tools require no document target tokens or version counters. Viewport
capture returns the rendered PNG for a vision-capable assistant.

## Current limits and verification

This version edits object-transform animation and base-color image textures.
GLB import retains primary UVs and base-color textures, and rejects other maps,
skins, morph targets, external resources and existing animation clips.
OBJ material sidecars are unsupported. Standalone
development supports imports and downloads; durable document saving requires
the shell. The app uses the surrounding suite's platform UI, Vite helper,
TypeScript configuration and platform contract tests, including when mounted
as a submodule at the same path.

Keep `.project-data` tracked for built-in app development. Empty task, run and
session artifacts mean no development-service history has been imported; do
not fabricate completed tasks, commit hashes or session IDs. Accepted workflow
stages adopt the existing implementation and skip scaffold preparation.
Establish the app's own Git repository before executing development tasks:
the service stages and commits source changes in the resolved repository.

Focused tests cover scene transactions, animation, geometry/GLB round trips,
assistant tools, document lifecycle integration and platform contracts.
Interactive shell verification remains pending for desktop/narrow layouts,
gizmos, playback, document opening, Save As, tab restoration, immediate close
after editing and real assistant invocations/captures. Accepted workflow
status represents adoption, not a claim that these manual checks passed.
