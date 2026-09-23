import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_API_PROXY_TARGET || 'http://localhost:8080'
  return {
    plugins: [vue()],
    server: {
      proxy: {
        '/api/ws': { target, ws: true },
        '/api': { target, changeOrigin: true },
      },
    },
  }
})
