export const DEFAULT_SCENE_BACKGROUND = '#e9edf2'

export const VIEWPORT_THEME_BACKGROUNDS = {
  dark: '#0d2a52',
  light: '#bfe9ff',
} as const

export type ViewportTheme = keyof typeof VIEWPORT_THEME_BACKGROUNDS

/**
 * The legacy neutral gray is the document's default-background sentinel.
 * Any other value came from the scene author and must remain part of the scene.
 */
export function resolveViewportBackground(
  background: string,
  theme: ViewportTheme,
) {
  return background.toLowerCase() === DEFAULT_SCENE_BACKGROUND
    ? VIEWPORT_THEME_BACKGROUNDS[theme]
    : background
}

export function platformViewportTheme(): ViewportTheme {
  const root = document.documentElement
  if (
    root.dataset.platformTheme === 'dark' ||
    root.dataset.platformAppearance === 'dark'
  )
    return 'dark'
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}
