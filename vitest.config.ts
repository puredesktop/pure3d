import { defineConfig } from 'vitest/config'
export default defineConfig({
  resolve: { dedupe: ['react', 'react-dom', 'styled-components'] },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
  },
})
