import { defineConfig, mergeConfig } from 'vitest/config'
// Extension explicite : le chargeur natif de configuration Vite l'exige.
import viteConfig from './vite.config.ts'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'happy-dom',
    setupFiles: ['./test/support/setup.ts'],
  },
}))
