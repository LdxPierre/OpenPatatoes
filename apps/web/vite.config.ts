import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Même origine que l'API : pas de CORS, et le cookie de session passe tel quel.
    // `API_URL` sert aux tests de bout en bout, qui lancent leur propre serveur.
    proxy: { '/api': process.env.API_URL ?? 'http://localhost:3000' },
  },
})
