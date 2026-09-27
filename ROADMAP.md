# pure3d roadmap

## Scope

Keep the scene, inspector and animation timeline workflow, the existing scene model and supported interchange formats.

These are proposed, incremental improvements, not a release schedule or a list of missing core features. Keep each change small and preserve existing file formats, user data and app workflows.

## Improvements

1. **Transform unit hints.** Label position, rotation and scale fields with their displayed units, and include those units in validation messages so a numeric edit is easier to interpret.

2. **Reset one transform axis.** Offer a small reset action beside each transform axis, returning position or rotation to zero and scale to one through the existing undoable scene edit.

3. **Explain invalid numeric edits.** Keep an invalid transform draft visible with a nearby explanation instead of silently discarding it; identify non-finite values and non-positive scales before committing.

4. **Copy transform values.** Add a copy action for the selected object's position, rotation and scale as plain text, including units, for use in notes and bug reports.

5. **Find objects by name.** Add a name filter to the scene object list while retaining ancestor rows, so nested objects remain understandable without changing scene structure.

6. **Disambiguate duplicate names.** Show a short parent path beside identically named objects in the object list and inspector rather than renaming the user's objects automatically.

7. **Explain material inheritance.** Extend the existing inherited-material labels with a short explanation of which local override will be removed when restoring the parent material.

8. **Texture size feedback.** Show the selected texture's dimensions and file size before import, alongside the existing supported-format and size limits.

9. **Texture import recovery.** On an unsupported or oversized texture, retain the current material and offer a clear retry action that returns to the file picker.

10. **Selected object dimensions.** Show the selected object’s bounding width, height and depth beside the existing geometry counts, using the current transform and clearly labelled units.

11. **Subdivision impact hint.** Display the expected triangle count beside the subdivision action, using the existing mesh data to make repeated subdivisions less surprising.

12. **Keyframe time precision.** Use consistent decimal precision in timeline labels, tooltips and time inputs, while retaining the full stored time value.

13. **Keyframe keyboard focus.** Give focused keyframe controls a clear outline and announce their object, property, time and easing to assistive technology.

14. **Explain easing choices.** Add short descriptions to the existing easing selector so users can distinguish constant speed from a gradual start or finish.

15. **Duration change feedback.** Before shortening a scene below its last keyframe, name the affected object and time and explain the existing handling of out-of-range keys.

16. **Camera shot context.** Include the selected camera keyframe's time and transition description in the shot editor heading to reduce edits to the wrong shot.

17. **Selection after undo.** Preserve or restore a valid object selection after undo and redo, falling back predictably when the previously selected object no longer exists.

18. **Import failure details.** Report the source filename and a useful reason when OBJ, STL or GLB import fails, while leaving the open scene intact.

19. **Export format guidance.** Add concise hints beside existing model export formats explaining which scene features each format can retain.

20. **Video export settings summary.** Show duration, frame rate, resolution and estimated frame count together before export; reuse the existing renderer and export workflow.

## References

- [App guide](docs/app-guide.md)
- [Development guide](docs/development.md)
- [Current implementation](src/components/Inspector.tsx)
