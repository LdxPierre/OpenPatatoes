import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["./test/support/global-setup.ts"],
    // Une seule base de test partagée : les fichiers ne tournent pas en parallèle.
    fileParallelism: false,
  },
});
