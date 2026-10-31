import { SidebarSectionLabel } from '@purescience/platform-ui/components/common/containers/AppChrome'
import { Choice, ColorField, NumberField } from './Controls'
import { DEFAULT_LOOK, resolveLook } from '../lib/look'
import { GENERATORS, generatorParams } from '../lib/generatorSpecs.mjs'
import type { Operation, SceneDocument, SceneObject } from '../types'

type Look = NonNullable<SceneDocument['settings']['look']>
const ENVIRONMENTS = { sky: 'Sky and sun', studio: 'Studio', night: 'Night sky' } as const
const title = (text: string) => text[0]!.toUpperCase() + text.slice(1)

/** The scene's light and finish: sky or studio, the sun and its shadows, fog, and the camera's finishing passes. */
export function LookInspector({ scene, edit }: { scene: SceneDocument; edit: (ops: Operation[]) => void }) {
  const look = resolveLook(scene)
  const night = look.environment === 'night'
  const set = (patch: Look) => edit([{ op: 'settings', settings: { look: patch } }])
  const number = (key: keyof Look, label: string, min: number, max: number, step: number, unit?: string) => (
    <NumberField
      key={key}
      label={label}
      value={Number(look[key as keyof typeof look] ?? DEFAULT_LOOK[key as keyof typeof DEFAULT_LOOK])}
      min={min}
      max={max}
      step={step}
      unit={unit}
      onChange={value => set({ [key]: value })}
    />
  )
  return (
    <>
      <SidebarSectionLabel>Light and finish</SidebarSectionLabel>
      <Choice
        label={`Light: ${ENVIRONMENTS[look.environment]}`}
        options={Object.entries(ENVIRONMENTS).map(([value, label]) => ({ value, label }))}
        onChange={environment => set({ environment: environment as Look['environment'] })}
      />
      {number('sunElevation', night ? 'Moon height' : 'Sun height', -12, 90, 1, '°')}
      {number('sunAzimuth', night ? 'Moon direction' : 'Sun direction', 0, 360, 5, '°')}
      {number('sunIntensity', night ? 'Moonlight' : 'Sun strength', 0, 20, 0.1)}
      {night && number('stars', 'Stars', 0, 1, 0.05)}
      <Choice
        label={`Shadows: ${title(look.shadows)}`}
        options={['soft', 'sharp', 'off'].map(value => ({ value, label: title(value) }))}
        onChange={shadows => set({ shadows: shadows as Look['shadows'] })}
      />
      {look.environment === 'sky' && number('haze', 'Haze', 0, 1, 0.05)}
      {look.environment === 'sky' && number('clouds', 'Clouds', 0, 1, 0.05)}
      {number('environmentIntensity', 'Ambient light', 0, 5, 0.05)}
      {number('fog', 'Fog', 0, 1, 0.05)}
      {number('ambientOcclusion', 'Contact shadows', 0, 2, 0.05)}
      {number('bloom', 'Glow', 0, 3, 0.05)}
      {look.environment === 'sky' && number('lightShafts', 'Sunbeams', 0, 1, 0.05)}
      {number('exposure', 'Exposure', 0.05, 5, 0.05)}
      {number('focusDistance', 'Focus distance (0 = all sharp)', 0, 5000, 0.5, 'm')}
      {look.focusDistance > 0 && number('aperture', 'Background blur', 0, 1, 0.05)}
      <SidebarSectionLabel>Grade</SidebarSectionLabel>
      {number('saturation', 'Saturation', 0, 2, 0.05)}
      {number('contrast', 'Contrast', 0.5, 1.5, 0.05)}
      {number('warmth', 'Warmth', -1, 1, 0.05)}
      {number('vignette', 'Vignette', 0, 1, 0.05)}
    </>
  )
}

/** A generated object's parameters, from its spec: numbers, colours, choices and the terrain it sits on. */
export function GeneratorInspector({ object, scene, edit }: { object: SceneObject; scene: SceneDocument; edit: (ops: Operation[]) => void }) {
  const spec = GENERATORS[object.kind]
  if (!spec) return null
  const params = generatorParams(object.kind, object.params)
  const set = (key: string, value: number | string) => edit([{ op: 'update', id: object.id, patch: { params: { [key]: value } } }])
  const terrains = scene.objects.filter(item => item.kind === 'terrain' && item.id !== object.id)
  return (
    <>
      <SidebarSectionLabel>{spec.label}</SidebarSectionLabel>
      {spec.params.map(param => {
        const value = params[param.key]!
        if (param.show && !Object.entries(param.show).every(([key, values]) => values.includes(String(params[key])))) return null
        if (param.type === 'number')
          return <NumberField key={param.key} label={param.label} value={Number(value)} min={param.min} max={param.max} step={param.step ?? (param.max - param.min > 20 ? 1 : 0.05)} unit={param.unit} onChange={next => set(param.key, next)} />
        if (param.type === 'color')
          return <ColorField key={param.key} label={param.label} value={String(value)} onChange={next => set(param.key, next)} />
        if (param.type === 'select')
          return <Choice key={param.key} label={`${param.label}: ${title(String(value))}`} options={param.options.map(option => ({ value: option, label: title(option) }))} onChange={next => set(param.key, next)} />
        const on = terrains.find(item => item.id === value)
        return (
          <Choice
            key={param.key}
            label={`${param.label}: ${on ? on.name : 'Ground plane'}`}
            options={[{ value: '', label: 'Ground plane' }, ...terrains.map(item => ({ value: item.id, label: item.name }))]}
            onChange={next => set(param.key, next)}
          />
        )
      })}
    </>
  )
}
