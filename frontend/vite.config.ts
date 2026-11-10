import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Проксируем API конвертации STEP на демо-сервер (backend/demo_server.py):
    // тот же домен → CORS не нужен (§9 backend/README.md)
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
