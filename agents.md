# Pure3D assistant guide

Tools operate directly on the active 3D workspace. Use `3d.getScene` to inspect
content and find object IDs. Edits need only their operations or object IDs;
consecutive edits do not require rereading the scene. Objects use
unit-size primitive geometry, meter positions, XYZ Euler rotations in radians,
and positive scales. Keyframe times are seconds.

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
side. Import resets base color to white. Material texture patches merge
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

All content mutations edit the active scene and save automatically. `saveScene`
without a path saves the active document or creates a draft. With a
path it writes a `.pure3d` copy and makes that the active document. `newScene`
and `openScene` save outgoing content first. Use paths returned by tools.

Import static OBJ/STL or self-contained GLB. GLB retains base-color image
textures and primary UVs; other maps, skeletal rigs, morphs and imported clips
are unsupported. Export GLB for textures and object-transform animation,
OBJ/STL for current-pose geometry, or PNG for the rendered viewport. A
successful geometry export does not prove the scene's visual appearance;
vision-capable assistants can inspect `3d.captureViewport` when needed.
