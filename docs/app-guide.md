# pure3d app guide

A 3D workspace for creating scenes, editing geometry and materials, and animating objects and cameras. Use it to build models, inspect imported assets, and prepare an animation or an exported model.

## Workspace layout

| Area | What you use it for |
| --- | --- |
| **Scene objects** | Select and organize the objects in your scene. |
| **Viewport** | Navigate the 3D scene and inspect the result of your edits. |
| **Inspector** | Change the selected object’s transform, geometry, and material; inspector visibility can be toggled. |
| **Timeline** | Set keyframes, move the playhead, and control animation playback. |

## Working with pure3d

1. Create or open a model, then select objects in the scene to edit their transforms and materials.
2. Use the animation timeline to add and adjust keyframes.
3. Save the editable project as `.pure3d`; use the app’s import/export controls for interchange formats such as OBJ, STL, and GLB.

## Development and loading

We welcome **developers and vibecoders alike**. [Create a developer account on puredesktop.ai](https://puredesktop.ai/developers), then use Claude Code, Codex, your own editor, or purefactory to develop this app or create a new one.

The [development guide](development.md) covers preparing this repository's shared dependencies, starting a coding agent, adding features in purefactory, and checking the result in the desktop. It includes the commands available in this repository.

Use **Open folder** in purefactory to edit a project externally, and **Open app** to test it. Use **Share** to create a `.pureapp` package, then **Settings → System → Install an app → Choose package…** in current builds to install it. Older versions may provide **File → Install App…**. A development server URL alone does not install an app.

To extend this app in purefactory, select its editable project when available. Source development builds can expose the suite's own apps; packaged installations do not expose every built-in app's source. See [create or extend an app](development.md#create-or-extend-an-app-with-purefactory) for that distinction and the app drawer workflow.

## Source layout

| Path | Purpose |
| --- | --- |
| [plugin.json](../plugin.json) | App identity, entry point, permissions, supported documents, and agent-tool declarations. |
| [package.json](../package.json) | Dependencies and development, build, and validation scripts. |
| [src/App.tsx](../src/App.tsx) | App entry and workspace composition. |
| [src/components](../src/components) | Workspace views, panels, and controls. |
| [src/hooks](../src/hooks) | Boot, state, and interaction hooks. |
| [src/lib](../src/lib) | App data models, document handling, and domain logic. |
| [src/bridge](../src/bridge) | Integration with the desktop’s services. |
| [agents.md](../agents.md) | Instructions and capabilities for the app’s agent. |
| [docs](../docs) | Usage and technical documentation. |

## Developer accounts and the marketplace

We welcome **developers and vibecoders alike**. Go to [puredesktop.ai](https://puredesktop.ai) and [create a developer account](https://puredesktop.ai/developers) to join the developer community and submit your app for review.

Bring improvements to this app, develop a fork, or build something entirely new. We welcome **open-source and proprietary projects alike** to the [puredesktop](https://puredesktop.ai) marketplace. Support for **paid apps is coming soon**, so you will be able to charge for your apps if you choose. Forks and redistributed dependencies must follow their applicable licenses.

For developer access, app submissions, or marketplace questions, contact [info@puredesktop.ai](mailto:info@puredesktop.ai).

## Contributing

We welcome pull requests, bug reports, new features, and documentation improvements. You may modify and distribute this app under its applicable licenses. See [CONTRIBUTING.md](../CONTRIBUTING.md), [LICENSE](../LICENSE), and [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
