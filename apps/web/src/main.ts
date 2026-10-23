import { VueQueryPlugin } from '@tanstack/vue-query'
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { queryClient } from './shared/query-client'
import { applyThemeMode } from './theme'

applyThemeMode() // avant le montage, pour éviter un flash du mauvais thème

createApp(App)
  .use(VueQueryPlugin, { queryClient })
  .use(router)
  .mount('#app')
