import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In development the frontend calls /api/... on its own origin and Vite
// forwards those requests to the backend, so no CORS setup is needed locally.
// Point it at the deployed backend with:
//   API_PROXY_TARGET=https://market-backend-xxxx.a.run.app npm run dev
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
})
