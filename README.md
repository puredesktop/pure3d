<p><img src="docs/assets/app-icon.svg" width="88" height="88" alt="pure3d icon"></p>

# pure3d

## What pure3d does

A 3D workspace for creating scenes, editing geometry and materials, and animating objects and cameras. Use it to build models, inspect imported assets, and prepare an animation or an exported model.

## App layout

| Area | What you use it for |
| --- | --- |
| **Scene objects** | Select and organize the objects in your scene. |
| **Viewport** | Navigate the 3D scene and inspect the result of your edits. |
| **Inspector** | Change the selected object’s transform, geometry, and material; inspector visibility can be toggled. |
| **Timeline** | Set keyframes, move the playhead, and control animation playback. |

The app also uses the shared [puredesktop](https://puredesktop.ai) shell and drawer agent. Panels can vary with the current view and selection.

## Getting started

1. Create or open a model, then select objects in the scene to edit their transforms and materials.
2. Use the animation timeline to add and adjust keyframes.
3. Save the editable project as `.pure3d`; use the app’s import/export controls for interchange formats such as OBJ, STL, and GLB.

Read the [app guide](docs/app-guide.md) for development, loading, and source-layout details.

## Develop and customize

You can develop this app outside [puredesktop](https://puredesktop.ai), using your preferred editor, terminal, and coding tools, then load the module into [puredesktop](https://puredesktop.ai) to use and test it. You can also change your local version from **purefactory** or through **the app’s drawer agent**.

### Use your own development tools

1. Fork or clone this repository and work on a local copy in your editor.
2. Set up the app’s dependencies and run its development server or build. See the [app guide](docs/app-guide.md#development-and-loading) for this repository’s requirements and scripts.
3. Load the module into [puredesktop](https://puredesktop.ai). For a local web development server, the platform guide describes **File → Register App…**: register its URL, app name, and required permissions, then open it from **Browse Apps**. Keep the development server running while using that entry point.
4. Make changes in your editor, reload the app as needed, and test its file, account, and agent integrations inside the desktop. A distributable `.pureapp` package can be loaded through **File → Install App…**.

See the [app development and integration guide](https://puredesktop.ai/docs/apps/) for registration, the app manifest, the bridge, and packaging. Editing outside the desktop does not remove this module’s shared-dependency requirements.

### Use purefactory or the app’s drawer agent

Open your local app project in **purefactory** to develop it there, or open the app’s **drawer agent** and describe the change you want to make to your local version. Specify whether you want to change the app itself or work on the document or data currently open. Review the resulting source changes, run the relevant checks, and reload your local app to try them. You can keep the changes for yourself, develop a fork, or contribute them back with a pull request.

## Developer accounts and the marketplace

[Create a developer account on puredesktop.ai](https://puredesktop.ai/developers) to take part in the developer community and submit apps for review. We welcome contributions to this app, forks that take it in a different direction, and entirely new apps to offer on [puredesktop](https://puredesktop.ai).

We welcome **open-source and proprietary projects alike** to the [puredesktop](https://puredesktop.ai) marketplace. A marketplace with support for **paid apps is coming soon**, so developers will be able to charge for their apps if they choose. When distributing a fork, follow the licenses of the code and dependencies you use.

For more information about developer accounts, app submissions, or the upcoming marketplace, contact [info@puredesktop.ai](mailto:info@puredesktop.ai).

## Open source and contributions

Create and edit 3D scenes and animations with [Three.js](https://github.com/mrdoob/three.js).

Anyone may use, study, modify, and share this software under the applicable licenses.
We welcome pull requests, bug reports, documentation improvements, and new ideas.
See [CONTRIBUTING.md](CONTRIBUTING.md) for how to contribute.

### License

Original code by pure.science inc is licensed under the [MIT License](LICENSE).
Copyright (c) 2026 pure.science inc. Third-party code, dependencies, and assets retain their own licenses and copyright notices.

### Major open-source projects

| Project / source | Homepage or documentation | Support the maintainers |
| --- | --- | --- |
| [mrdoob/three.js](https://github.com/mrdoob/three.js) | [Homepage / docs](https://threejs.org/) | [GitHub Sponsors](https://github.com/sponsors/mrdoob) · [GitHub Sponsors](https://github.com/sponsors/HumanInteractive) · [GitHub Sponsors](https://github.com/sponsors/donmccurdy) · [GitHub Sponsors](https://github.com/sponsors/WestLangley) |
| [react/react](https://github.com/react/react) | [Homepage / docs](https://react.dev) | — |
| [styled-components/styled-components](https://github.com/styled-components/styled-components) | [Homepage / docs](https://styled-components.com) | [GitHub Sponsors](https://github.com/sponsors/quantizor) · [Open Collective](https://opencollective.com/styled-components) |

Thank you to these projects and their contributors. Additional direct dependencies,
upstream links, and asset notices are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).


Built-in Three.js app for creating and editing models and object-transform
animations. This folder can become a submodule at the same `apps/pure3d` path:
app discovery and suite builds scan its manifest; no shell routes are added.

## Editing

Create boxes, spheres, cylinders, cones, toruses, planes and groups. Edit their
hierarchy, visibility, transforms and PBR material values in the inspector.
Use **Edit vertices** in the toolbar or inspector to convert a primitive into
an editable mesh. Click vertex points and drag the move gizmo, or edit their
local coordinates in the inspector. Coincident seam vertices move together.
**Subdivide** splits every triangle into four without smoothing the shape.
Triangle indices remain available under the modeling section.

Add PNG, JPEG or WebP base-color textures in the material inspector. Images
are embedded in `.pure3d` documents (8 MiB per uploaded image, 8192 pixels per
side), so moving the scene keeps its textures. Adding an image resets the
base color to white; adjust it afterward to tint the image. Tile U/V changes
repetition. Primitives retain their UVs when converted; meshes without UVs
receive box projection. **Box UV mapping** replaces existing UVs explicitly.

Drag the viewport to orbit, click a model to select, and use the transform gizmo
to move (`W`), rotate (`E`) or scale (`R`). `F` frames the selection. Space toggles
playback; Ctrl/Cmd-Z and Ctrl/Cmd-Shift-Z undo and redo.

Inspector and timeline controls use shared platform numeric fields, sliders,
color pickers, text fields and switches. Numeric fields commit typed values on
blur or Enter; Escape cancels buffered typing. Use arrow keys or steppers to
adjust values, or drag an axis/field label. Shift increases the step and Alt
makes it finer. Color pickers offer presets and exact hex entry.

The timeline edits position, rotation and scale keys with linear, smooth or
step easing. Changes to an already animated property insert/update a key at
the current playhead. Positions use meters, rotations use XYZ Euler radians
internally (degrees in the inspector), and time uses seconds.

## Documents and bridge

A `.pure3d` file contains the complete validated scene and animation as JSON.
`SceneStore` owns content, undo history and transient workspace controls.
`useSceneDocument` supplies serialization and calls the existing shared
`useDocumentLifecycle` for durable drafts, autosave, flushes, recents and close
handling. Content commits mark the lifecycle dirty; playback and selection do
not. Opening flushes outgoing content before adopting the loaded document.
Save As writes a copy through the shared filesystem helper and adopts it.

`usePlatformViewportResource` receives boot and later resource opens.
Successful document bindings use `updateCurrentWorkspaceTab` for tab
restoration. The shared document switcher supplies library navigation and file
actions. Bridge calls require the manifest's `filesystem` and `agents`
permissions. Standalone Vite development supports file import and downloads;
document autosave requires the shell.

## Assistant tools

The manifest and registered handlers expose `3d.getScene`, `3d.editScene`,
`3d.setWorkspace`, `3d.newScene`, `3d.openScene`, `3d.saveScene`,
`3d.importModel`, `3d.importTexture`, `3d.generateTexture`, `3d.exportModel`, `3d.history` and
`3d.captureViewport`.
Tools operate directly on the active `SceneStore`, the same source used by
the UI, viewport and document serialization. Edits validate an entire
transaction before committing and need no version or document target tokens.
Viewport capture returns an actual rendered PNG through the platform's
tool-image contract and requires a vision-capable assistant.
`editScene` supports `moveVertex`, `subdivide` and `unwrap`, as well as texture
settings in material updates. `setWorkspace.selectedVertex` operates the
same vertex selection as the UI. `getScene` omits embedded image bytes;
`importTexture` reads and embeds a workspace image through the shared bridge.
`generateTexture` calls the same shared `vision.generate` API as the Design
app. The host selects the drawer session's image model, falling back to the
app default. It creates an opaque base-color image, or edits the current one
with `editExisting:true`, then validates and applies it through the existing
texture workflow. The tool returns the model/provider used and saved scene
path. It makes one generation request; other edits do not invalidate it. A save
failure leaves the applied texture in the store for `saveScene` to retry.
`applyTexture` reuses a retained texture-library asset on explicit targets or
their recursive subtrees, while `patchTextures` atomically bulk-patches tint
and UV/wrap settings. Non-recursive group changes are inherited by children;
recursive changes create child-local bindings. Both return normal scene
context with image bytes omitted.

Runtime schemas in `src/lib/schemas.mjs` generate `plugin.json` via
`scripts/manifest.mjs`; regenerate it after changing tools.

## Formats and current limits

Import OBJ, STL and self-contained static GLB geometry, including GLB hierarchy
and base PBR values, primary UVs and base-color image textures. OBJ material
sidecars are unsupported. GLB import rejects external resources, other texture
maps, skins, morph targets and existing animation clips. This version creates
object-transform animations; skeletal rigs, extrusion and sculpting remain
future modeling workflows.

Export animated GLB (baked at scene FPS), OBJ/STL of the current pose, or a PNG
of the viewport. Geometry exports exclude hidden objects and editor helpers.
PNG captures the rendered canvas, including visible gizmos and grid.
GLB embeds texture images; OBJ/STL exports carry geometry only. GLB export
and viewport capture wait for image decoding.

## App development

`.project-data` adopts this existing app into the app-development service.
Intake, design, app contract, workspace and tasks are accepted; tasks, runs
and sessions start empty. The root `plugin.json` and `agents.md` remain the
app contract. Keep these metadata files tracked, as with the other built-ins.

Create the app's own Git repository and register it as a submodule before
executing development tasks. Until then, Git resolves `apps/pure3d` to the
suite repository, and the task executor stages and commits source changes.
The accepted workspace stage skips scaffold preparation of this existing app.

Pure3D develops inside the suite at `apps/pure3d`, including as a submodule.
It depends on the suite's platform UI, Vite helper and TypeScript base config.
The new shared numeric, color and slider controls must also be committed in
the suite repository for a fresh checkout to build the app.

## Verification

From the suite root:

```sh
npm run typecheck -w @purescience/pure3d
npm test -w @purescience/pure3d
npm run build -w @purescience/pure3d
npm run puredesktop:check -w @purescience/pure3d
node scripts/build-suite.mjs --list pure3d
```

Focused tests cover scene transactions, stale targets, history, animation
sampling, real Three.js geometry exports/imports, GLB animation playback,
assistant handlers, the shared lifecycle integration and the current shell
manifest/permission contracts.
The texture GLB check uses a mocked image/canvas backend to verify embedded
image bytes, UVs and texture settings; it does not verify rendered pixels.

Interactive shell verification remains pending: check desktop and narrow
layouts, gizmo edits, playback, opening, Save As, tab restoration, immediate
close after editing, vertex picking/dragging, texture appearance and a real
assistant invocation/capture.

## Camera journeys

The Camera row in the animation timeline captures position, look-at target
and field of view together. Navigate to a starting view and use **Keyframe
current view**, move the playhead, navigate again and capture another key.
Each key controls the easing of the interval after it (smooth, linear or step).
Camera keys are saved in the scene and support the normal undo/redo history.

**Camera preview** shows the shot in a 16:9 frame without editing helpers.
Leaving preview restores the editing camera. **Edit shot at playhead** copies
the shot into the editing camera; use the keyframe button again to retain edits.
Changing the editing camera never changes a recorded shot automatically.

**Export camera video** downloads a silent 1280x720 WebM of the scene snapshot,
without grids, selection boxes or gizmos. Recording runs in real time, uses up
to 60 FPS, supports scenes up to 120 seconds and can be cancelled. Keep the app
visible while recording. This is a video export, not a camera-animation GLB
export; existing model export behavior is unchanged.
