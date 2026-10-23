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
    // Point d'entrée du serveur : le démarrage attend la base puis l'écoute.
    files: ['apps/server/src/index.ts'],
    rules: { 'antfu/no-top-level-await': 'off' },
  },
)
