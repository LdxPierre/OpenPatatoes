import antfu from '@antfu/eslint-config'

export default antfu(
  {
    vue: true,
    // Les règles pnpm réécrivent pnpm-workspace.yaml avec des réglages que pnpm 10.10 ne connaît pas.
    pnpm: false,
    typescript: true,
    ignores: ['apps/server/drizzle/meta/**'],
  },
  {
    // Points d'entrée du serveur et des migrations : le démarrage attend la base.
    files: ['apps/server/src/index.ts', 'apps/server/src/migrate.ts', 'apps/server/test/e2e/server.ts'],
    rules: { 'antfu/no-top-level-await': 'off' },
  },
)
