import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Logs every non-API request so we can see exactly what the preview proxy
// forwards (host header, path) when the user's browser loads the page.
function requestLogger() {
  return {
    name: 'request-logger',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url.startsWith('/api')) {
          console.log(`[req] ${req.method} ${req.url} host=${req.headers.host}`)
        }
        next()
      })
    },
  }
}

// The dev server proxies /api to the FastAPI backend. The preview proxy host
// is unknown ahead of time, so we allow all hosts.
export default defineConfig({
  plugins: [react(), requestLogger()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
