import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      crypto: false,
      util: false,
      fs: false,
      path: false,
      stream: false,
      buffer: false,
    }
  },
  optimizeDeps: {
    exclude: ['@solace/client-sdk'],
    include: ['react', 'react-dom']
  },
  build: {
    rollupOptions: {
      external: ['crypto', 'util', 'fs', 'path', 'stream', 'buffer']
    }
  },
  server: {
    fs: {
      allow: ['..']
    }
  }
})
