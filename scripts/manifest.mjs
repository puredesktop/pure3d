import { readFile, writeFile } from 'node:fs/promises'
import { z } from 'zod/v4'
import { toolDefinitions } from '../src/lib/schemas.mjs'

const manifest = {
  id: '3d',
  name: 'Pure3D',
  permissions: ['filesystem', 'agents'],
  entrypoint: { kind: 'dev-url', url: 'http://localhost:5220' },
  app: {
    id: 'plugin.3d',
    slug: '3d',
    name: 'Pure3D',
    navigationLabel: '3D',
    productName: 'Pure3D',
    kind: '3d',
    description:
      'Create and edit 3D models, materials and keyframe animations.',
    brand: { letter: '3', label: '3D' },
    openableExtensions: ['pure3d', 'obj', 'stl', 'glb'],
    openableNameSuffixes: ['.pure3d'],
    usePureDesktopAiPanel: true,
    createEntities: [
      {
        id: '3d-scene',
        label: '3D scene',
        description: 'Create an empty 3D scene.',
        appSlug: '3d',
        defaultName: 'Untitled scene',
        kind: 'file',
        extension: 'pure3d',
        fileNameSuffix: '.pure3d',
        template: JSON.stringify({
          format: 'pure3d',
          version: 1,
          id: 'new',
          title: 'Untitled scene',
          objects: [],
          keyframes: [],
          settings: {
            duration: 5,
            fps: 30,
            background: '#e9edf2',
            grid: true,
            camera: { position: [6, 4, 7], target: [0, 0, 0] },
          },
        }),
      },
    ],
    agents: {
      tools: Object.entries(toolDefinitions).map(
        ([name, { schema, ...metadata }]) => ({
          name,
          ...metadata,
          inputSchema: z.toJSONSchema(schema, { unrepresentable: 'any' }),
        }),
      ),
    },
  },
}
const path = new URL('../plugin.json', import.meta.url)
const content = `${JSON.stringify(manifest, null, 2)}\n`
if (process.argv.includes('--check')) {
  if (
    JSON.stringify(JSON.parse(await readFile(path, 'utf8'))) !==
    JSON.stringify(manifest)
  )
    throw new Error(
      'plugin.json differs from tool schemas. Run npm run manifest.',
    )
  console.log('Pure3D manifest and tool schemas match.')
} else await writeFile(path, content)
