# Pure3D assistant guide

Tools operate directly on the active 3D workspace. Use `3d.getScene` to inspect
content and find object IDs. Edits need only their operations or object IDs;
consecutive edits do not require rereading the scene. Objects use
unit-size primitive geometry or generated shapes, meter positions, XYZ Euler
rotations in radians, and positive scales. Keyframe times are seconds.

## Making it look good

Build natural and detailed things from generated shapes, not stacks of
primitives: `terrain` (rolling ground coloured by height and slope, with an
optional flat `clearing`), `scatter` (hundreds or thousands of pines, firs,
broadleaf trees, birches, bushes, rocks, grass, flowers or ferns over an area,
or over a terrain with `on: <terrain id>`, leaving an `avoid` radius empty),
`tree`, `rock`, `water` and `roundedBox`. Each is an `add` with `kind`,
`params` and `geometry: null`; omitted params take their defaults, the same
`seed` always makes the same shape, and `update` with `patch.params` changes
only the params it names. The `editScene` description lists every param. A terrain's centre
is at y = 0, so things in its clearing stand at y = 0. If a scatter blocks the
camera, raise its `avoid` radius, shrink its area or put the camera in the
clearing, rather than hiding the scatter.

Light and finish live in `settings.look`, merged on each `settings` edit:
`environment` `sky` (physical sky with clouds and a sun) or `studio` (soft
studio light on the background colour); `sunElevation` and `sunAzimuth` in
degrees (5-15 is golden hour; put the sun to the side of the camera, not
behind it, so shadows show); `sunIntensity`, `haze`, `clouds`, `shadows`
(`soft`, `sharp`, `off`), `fog` 0-1 (sized to the scene, coloured like the
horizon), `exposure`, `ambientOcclusion` (contact shadows), `bloom` (glow on
bright and emissive surfaces), and `focusDistance` with `aperture` for a
blurred background. Materials also take `emissive` with `emissiveIntensity`,
`clearcoat`, `transmission` and `sheen`. Turn the grid off for finished
shots, frame with a camera shot, then look with `captureViewport`.

## Replies and reading the scene

Only `3d.getScene` returns scene detail. Every change tool (`editScene`,
`setWorkspace`, `newScene`, `openScene`, `saveScene`, `importModel`,
`importTexture`, `generateTexture`, `applyTexture`, `patchTextures`,
`history`) replies with a short summary: `ok`, the saved `path`, a scene
header (id, title, object/keyframe/camera-key/texture counts, duration) and
`changes` listing added, updated and removed object IDs, keyframe and
camera-key counts, texture asset IDs and changed settings keys. ID lists stop
at 25 entries; `addedMore`, `updatedMore`, `removedMore` (and
`importedObjectIdsMore`, `appliedObjectIdsMore`, `patchedObjectIdsMore`) count
the rest. `setWorkspace` returns the workspace state and the selected object;
`openScene` adds an outline of the first 20 objects; `history` describes the
step it undid or redid and the next five undo and redo entries;
`captureViewport` returns the image with a one-line note. It renders a
finished still off screen in the scene's look (no gizmos), so it works while
Pure3D's tab is hidden; if the render comes back empty it returns an error and
no image instead of a blank picture. Then read the scene with `getScene`.

Read only what the next step needs. `getScene` with no arguments returns the
whole scene, which is large on real scenes. On anything beyond a few objects,
start with `summary:true` (counts by kind, settings, texture asset IDs and an
id/name/kind/parentId outline, 200 objects by default) and then read full
objects with filters: `ids` (plus `includeDescendants:true` for a subtree),
`kinds`, `name` (case-insensitive substring) or `within` (`{min, max}` box
tested against each object's world-space origin from its saved transforms).
Filters combine; keyframes are limited to the returned objects; `match`
reports counts and unknown IDs. `geometry:false` replaces mesh arrays with
vertex and triangle counts, and `limit` caps the returned objects
(`objectsMore` counts the rest).

`3d.editScene` validates and commits operations atomically. Add objects with
unique IDs, a full transform and material, and `geometry: null` for primitives
and groups. Meshes require triangle positions, indices (or null), and optional
per-vertex UV pairs. Parenting
cannot create cycles. Deleting or duplicating an object includes its subtree
and animation keys.

Materials can be inherited through groups. Use `clearMaterialOverride` in an
`editScene` operation to remove every local material or texture value on one
object and restore its inherited material state.

Use position, rotation and scale keyframes to animate objects. Easing on a key
describes the interval after it. Respect the scene duration; update duration
before adding later keys. Pause playback for geometry or transform edits.
`3d.setWorkspace` controls selection, playhead, looping, playback, gizmo mode,
inspector visibility and framing. Framing changes the saved camera.
`selectedVertex` selects a mesh vertex and enters paused move mode; null exits.
Use `subdivide` to convert a shape and split each triangle into four, then
`moveVertex` to move a vertex and its coincident seam vertices in local coordinates.
Use `unwrap` for explicit box UV projection. These edits share undo and autosave.

Use `3d.importTexture` with an object ID and workspace PNG/JPEG/WebP path for
base-color textures. Images are embedded, limited to 8 MiB and 8192 pixels per
side. Import resets base color to white. A group binding is inherited by children unless they have a local texture override. Material texture patches merge
repeat/offset UV pairs, rotation in radians, flipY and wrapS/wrapT settings;
texture:null removes the image. `getScene` omits the embedded dataUrl bytes.

Use `3d.generateTexture` with an object ID and a detailed
prompt to generate and apply a base-color image using the drawer's selected
image model. Ask for flat, unlit surface detail and matching edges for tileable
textures. Optional size uses the platform's size requests; the default is
1024x1024. `editExisting:true` edits the object's current texture through an
editing-capable image model. Generation uses medium quality and opaque PNG;
the result is embedded through the same texture and saving workflow. Read the
returned modelId/provider to identify the model actually used. Do not
automatically repeat failed generation calls. If saving fails after the
texture was applied, retry `saveScene` to persist it without another generation.

Imported and generated images are retained in `scene.textureAssets`; their
bytes are omitted from tool responses, but their IDs are available for reuse.
Use `3d.applyTexture` with an assetId and explicit objectIds to apply one of
those assets. With `recursive:true`, it creates local bindings throughout each
target subtree. Without recursion, applying to a group establishes an inherited
binding, so children retain any existing local texture override. Use
`3d.patchTextures` to atomically set a tint/base color and/or repeat, offset,
rotation, flipY, wrapS and wrapT. A recursive patch makes local overrides for
every target descendant; a non-recursive group patch remains inherited. UV
settings require a resolved texture on every target. Textured meshes missing
UVs receive box projection automatically. Check IDs first: all targets are
validated before either tool changes the scene.

Async imports and texture generation refuse to apply results after the active document changes; edits within the same document remain valid.

All content mutations edit the active scene and save automatically. `saveScene`
without a path saves the active document or creates a draft. With a
path it writes a `.pure3d` copy and makes that the active document. `newScene`
creates a starter composition with editable primitive shapes, and `openScene`
saves outgoing content first. Use paths returned by tools.

Import static OBJ/STL or self-contained GLB. GLB retains base-color image
textures and primary UVs; other maps, skeletal rigs, morphs and imported clips
are unsupported. Export GLB for textures and object-transform animation,
OBJ/STL for current-pose geometry, or PNG for a finished render. A
successful geometry export does not prove the scene's visual appearance;
vision-capable assistants can inspect `3d.captureViewport` when needed.
