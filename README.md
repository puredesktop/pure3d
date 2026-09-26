<p><img src="docs/assets/app-icon.svg" width="88" height="88" alt="pure3d icon"></p>

# pure3d

**Build models, scenes, and animations.** An app for [puredesktop](https://puredesktop.ai).

[Get started](#getting-started) · [App guide](docs/app-guide.md) · [Develop](docs/development.md) · [Developer account](https://puredesktop.ai/developers)

## What it does

A 3D workspace for creating scenes, editing geometry and materials, and animating objects and cameras. Use it to build models, inspect imported assets, and prepare an animation or an exported model.

## Requirements

Use a compatible [puredesktop](https://puredesktop.ai) build for desktop integration, storage, and the app drawer. Developer setup is covered in the [development guide](docs/development.md).

Texture generation needs a configured image-generation service; modeling and imported textures do not.

## Getting started

1. Create or open a model, then select objects in the scene to edit their transforms and materials.
2. Use the animation timeline to add and adjust keyframes.
3. Save the editable project as `.pure3d`; use the app’s import/export controls for interchange formats such as OBJ, STL, and GLB.

## App layout

| Area | What you use it for |
| --- | --- |
| **Scene objects** | Select and organize the objects in your scene. |
| **Viewport** | Navigate the 3D scene and inspect the result of your edits. |
| **Inspector** | Change the selected object’s transform, geometry, and material; inspector visibility can be toggled. |
| **Timeline** | Set keyframes, move the playhead, and control animation playback. |

The app also uses the shared [puredesktop](https://puredesktop.ai) shell and drawer agent. Panels can vary with the current view and selection.

## Working with the agent

Open the app’s drawer in [puredesktop](https://puredesktop.ai) and describe what you want to do. For example:

> Describe the objects in this scene.
>
> Add a camera journey around the selected model.

The app exposes 14 tools, including `getScene`, `captureViewport`. See [agents.md](agents.md) for workflows and [plugin.json](plugin.json) for the complete tool schemas and approval flags. Some actions apply directly, while approval-marked actions ask first. Check the result in the app after a change.

## Files and data

Editable scenes use `.pure3d` JSON, including embedded textures and animation. Import/export controls support OBJ, STL, and GLB; viewport capture produces PNG.

## Develop and customize

We welcome **developers and vibecoders alike**. Fork pure3d, add a feature, or use what you learn to build a new app.

| Develop your way | Workflow |
| --- | --- |
| **Claude Code, Codex, or your editor** | Open the app’s source folder, read `README.md`, `plugin.json`, `package.json`, and `agents.md`, then make changes and run the app’s checks. Test inside [puredesktop](https://puredesktop.ai) with matching shared platform packages. |
| **purefactory** | Choose **Start building** for a new app, or select an available app project to extend it. Use **Open folder** for external tools and **Open app** to test. |
| **App drawer** | Request a local app change where app-development integration is available. Make clear whether you want to change the app itself or its current document. |

Use **Share** in purefactory to create a `.pureapp` package, then **Settings → System → Install an app → Choose package…** to load it in current builds. Source availability and integration vary by host build.

Follow the [development guide](docs/development.md) for Claude Code/Codex commands, app-specific setup and checks, and packaging. A standalone browser preview does not provide every desktop service.

## Documentation and limitations

| Guide | What it covers |
| --- | --- |
| [App guide](docs/app-guide.md) | App overview, source layout, and usage. |
| [Development guide](docs/development.md) | External coding tools, purefactory, checks, and installation. |
| [Agent guide](agents.md) | App-specific agent workflows and constraints. |
| [Agent contribution skill](.agents/skills/contribute-pure3d/SKILL.md) | Clone or fork, implement and check changes, open PRs, create issues, and comment. |
| [Technical reference](docs/technical-reference.md) | Architecture, file formats, detailed controls, and checks. |

Interchange formats cannot preserve every scene feature. See the technical reference for geometry, texture, animation, and export limits.

## Contributing and marketplace

We welcome **developers and vibecoders alike**. Go to [puredesktop.ai](https://puredesktop.ai) and [create a developer account](https://puredesktop.ai/developers) to join the developer community and submit your app for review.

Bring improvements to this app, develop a fork, or build something entirely new. We welcome **open-source and proprietary projects alike** to the [puredesktop](https://puredesktop.ai) marketplace. Support for **paid apps is coming soon**, so you will be able to charge for your apps if you choose. Forks and redistributed dependencies must follow their applicable licenses.

For developer access, app submissions, or marketplace questions, contact [info@puredesktop.ai](mailto:info@puredesktop.ai).

Anyone may use, study, modify, and share this app under its applicable licenses. We welcome pull requests, bug reports, and documentation improvements. See [CONTRIBUTING.md](CONTRIBUTING.md).

### Contribute with a coding agent

Give your agent the [contribution skill](.agents/skills/contribute-pure3d/SKILL.md) and describe the change, issue, or comment you want it to make. Codex can discover it in `.agents/skills/contribute-pure3d/`; with Claude Code or another tool, ask it to read that `SKILL.md` explicitly. For example:

> Read `.agents/skills/contribute-pure3d/SKILL.md`, implement [describe the change], run the relevant checks, and open a pull request to `puredesktop/pure3d` from my fork.

The skill includes app-specific checks and workflows for PRs, issues, and comments. Anyone with a GitHub account can contribute; merging is reserved for `esetera` and `MRdevTagg`.

## Credits and license

Create and edit 3D scenes and animations with [Three.js](https://github.com/mrdoob/three.js).

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
