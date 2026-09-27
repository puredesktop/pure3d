# pure3d contribution roadmap

Build something you can see and try in the app. The first five items are **good first contributions**: bounded changes with a concrete demonstration. Choose a feature below, fix a bug, or propose your own improvement.

## Scope

Keep the scene, inspector and animation timeline workflow, the existing scene model and supported interchange formats.

Size describes scope, not a promised completion time: **Small** = one focused interface change; **Medium** = coordinated interface/state work; **Large** = a feature across several flows, storage or export paths. All items are proposals, not claims that existing features are absent. Check the current code and extend what is there. Maintainers review code and tests before merging. Attribution is your choice.

## Good first contributions

1. **Reset one position, rotation, or scale value.** Offer a small reset action beside each transform axis, returning position or rotation to zero and scale to one through the existing undoable scene edit.
   <!-- contribution: {"id": "reset-one-transform-axis", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/reset-one-transform-axis.md"} -->
   [Small · Good first contribution · Implementation brief](docs/contributions/reset-one-transform-axis.md)

2. **Copy an object’s transform.** Add a copy action for the selected object's position, rotation and scale as plain text, including units, for use in notes and bug reports.
   <!-- contribution: {"id": "copy-transform-values", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/copy-transform-values.md"} -->
   [Small · Good first contribution · Implementation brief](docs/contributions/copy-transform-values.md)

3. **Preview what each easing choice does.** Add short descriptions to the existing easing selector so users can distinguish constant speed from a gradual start or finish.
   <!-- contribution: {"id": "explain-easing-choices", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/explain-easing-choices.md"} -->
   [Small · Good first contribution · Implementation brief](docs/contributions/explain-easing-choices.md)

4. **Choose an export format with confidence.** Add concise hints beside existing model export formats explaining which scene features each format can retain.
   <!-- contribution: {"id": "export-format-guidance", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/export-format-guidance.md"} -->
   [Small · Good first contribution · Implementation brief](docs/contributions/export-format-guidance.md)

5. **See the video export size before rendering.** Show duration, frame rate, resolution and estimated frame count together before export; reuse the existing renderer and export workflow.
   <!-- contribution: {"id": "video-export-settings-summary", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/video-export-settings-summary.md"} -->
   [Small · Good first contribution · Implementation brief](docs/contributions/video-export-settings-summary.md)

## More improvements

6. **See the units of every transform.** Label position, rotation and scale fields with their displayed units, and include those units in validation messages so a numeric edit is easier to interpret.
   <!-- contribution: {"id": "transform-unit-hints", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/transform-unit-hints.md"} -->
   [Small · Implementation brief](docs/contributions/transform-unit-hints.md)

7. **Correct an invalid transform without losing it.** Keep an invalid transform draft visible with a nearby explanation instead of silently discarding it; identify non-finite values and non-positive scales before committing.
   <!-- contribution: {"id": "explain-invalid-numeric-edits", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/explain-invalid-numeric-edits.md"} -->
   [Small · Implementation brief](docs/contributions/explain-invalid-numeric-edits.md)

8. **Find an object by name.** Add a name filter to the scene object list while retaining ancestor rows, so nested objects remain understandable without changing scene structure.
   <!-- contribution: {"id": "find-objects-by-name", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/find-objects-by-name.md"} -->
   [Medium · Implementation brief](docs/contributions/find-objects-by-name.md)

9. **Tell same-named objects apart.** Show a short parent path beside identically named objects in the object list and inspector rather than renaming the user's objects automatically.
   <!-- contribution: {"id": "disambiguate-duplicate-names", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/disambiguate-duplicate-names.md"} -->
   [Small · Implementation brief](docs/contributions/disambiguate-duplicate-names.md)

10. **See where a material comes from.** Extend the existing inherited-material labels with a short explanation of which local override will be removed when restoring the parent material.
   <!-- contribution: {"id": "explain-material-inheritance", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/explain-material-inheritance.md"} -->
   [Small · Implementation brief](docs/contributions/explain-material-inheritance.md)

11. **Inspect texture size before importing.** Show the selected texture's dimensions and file size before import, alongside the existing supported-format and size limits.
   <!-- contribution: {"id": "texture-size-feedback", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/texture-size-feedback.md"} -->
   [Small · Implementation brief](docs/contributions/texture-size-feedback.md)

12. **Retry a failed texture import.** On an unsupported or oversized texture, retain the current material and offer a clear retry action that returns to the file picker.
   <!-- contribution: {"id": "texture-import-recovery", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/texture-import-recovery.md"} -->
   [Small · Implementation brief](docs/contributions/texture-import-recovery.md)

13. **See an object’s width, height and depth.** Show the selected object’s bounding width, height and depth beside the existing geometry counts, using the current transform and clearly labelled units.
   <!-- contribution: {"id": "selected-object-dimensions", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/selected-object-dimensions.md"} -->
   [Medium · Implementation brief](docs/contributions/selected-object-dimensions.md)

14. **Preview the cost of subdividing a mesh.** Display the expected triangle count beside the subdivision action, using the existing mesh data to make repeated subdivisions less surprising.
   <!-- contribution: {"id": "subdivision-impact-hint", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/subdivision-impact-hint.md"} -->
   [Medium · Implementation brief](docs/contributions/subdivision-impact-hint.md)

15. **Read precise keyframe times.** Use consistent decimal precision in timeline labels, tooltips and time inputs, while retaining the full stored time value.
   <!-- contribution: {"id": "keyframe-time-precision", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/keyframe-time-precision.md"} -->
   [Small · Implementation brief](docs/contributions/keyframe-time-precision.md)

16. **Navigate keyframes with the keyboard.** Give focused keyframe controls a clear outline and announce their object, property, time and easing to assistive technology.
   <!-- contribution: {"id": "keyframe-keyboard-focus", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/keyframe-keyboard-focus.md"} -->
   [Small · Implementation brief](docs/contributions/keyframe-keyboard-focus.md)

17. **See which keyframes a shorter scene affects.** Before shortening a scene below its last keyframe, name the affected object and time and explain the existing handling of out-of-range keys.
   <!-- contribution: {"id": "duration-change-feedback", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/duration-change-feedback.md"} -->
   [Medium · Implementation brief](docs/contributions/duration-change-feedback.md)

18. **Know which camera shot you are editing.** Include the selected camera keyframe's time and transition description in the shot editor heading to reduce edits to the wrong shot.
   <!-- contribution: {"id": "camera-shot-context", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/camera-shot-context.md"} -->
   [Small · Implementation brief](docs/contributions/camera-shot-context.md)

19. **Keep a sensible selection after Undo.** Preserve or restore a valid object selection after undo and redo, falling back predictably when the previously selected object no longer exists.
   <!-- contribution: {"id": "selection-after-undo", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/selection-after-undo.md"} -->
   [Medium · Implementation brief](docs/contributions/selection-after-undo.md)

20. **Understand why a model import failed.** Report the source filename and a useful reason when OBJ, STL or GLB import fails, while leaving the open scene intact.
   <!-- contribution: {"id": "import-failure-details", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/import-failure-details.md"} -->
   [Medium · Implementation brief](docs/contributions/import-failure-details.md)

21. **Compare saved camera views.** Let users save named camera viewpoints locally in the scene and switch between them with thumbnail previews. This is a view feature, separate from animation keyframes.
   <!-- contribution: {"id": "compare-saved-camera-views", "size": "large", "goodFirstIssue": false, "guide": "docs/contributions/compare-saved-camera-views.md"} -->
   [Large · Implementation brief](docs/contributions/compare-saved-camera-views.md)

## References

- [Contribution brief index](docs/contributions/README.md)
- [App guide](docs/app-guide.md)
- [Development guide](docs/development.md)
- [Contributing](CONTRIBUTING.md)
