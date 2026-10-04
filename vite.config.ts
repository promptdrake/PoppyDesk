import { defineConfig, loadEnv } from 'vite'
import veauryVitePlugins from 'veaury/vite/index.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_API_PROXY_TARGET || 'http://localhost:8080'
  return {
    plugins: [
      veauryVitePlugins({
        type: 'vue'
      })
    ],
    server: {
      hmr: {
        clientPort: 443,
      },
      proxy: {
        '/api/ws': { target, ws: true },
        '/api': { target, changeOrigin: true },
      },
    },
  }
})
