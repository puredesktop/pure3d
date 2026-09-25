import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vite'
import { appDevServerFromManifest } from '../../scripts/vite/app-server.mjs'

export default defineConfig({
  base: './',
  plugins: [react()],
  server: appDevServerFromManifest(import.meta.url),
})
