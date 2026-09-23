import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { loadSession } from './session'
import './style.css'

await loadSession()
createApp(App).use(router).mount('#app')
