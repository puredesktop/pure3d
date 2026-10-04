import { expect, it } from 'vitest'
import {
  DEFAULT_SCENE_BACKGROUND,
  resolveViewportBackground,
  VIEWPORT_THEME_BACKGROUNDS,
} from './viewportTheme'

it('uses the theme colors only for the default scene background', () => {
  expect(resolveViewportBackground(DEFAULT_SCENE_BACKGROUND, 'dark')).toBe(
    VIEWPORT_THEME_BACKGROUNDS.dark,
  )
  expect(resolveViewportBackground(DEFAULT_SCENE_BACKGROUND, 'light')).toBe(
    VIEWPORT_THEME_BACKGROUNDS.light,
  )
  expect(resolveViewportBackground('#ffcc00', 'dark')).toBe('#ffcc00')
})
