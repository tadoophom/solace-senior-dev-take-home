import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@solace/client-sdk': path.resolve(__dirname, '../dist/esm/index.js')
    }
  },
  server: {
    port: 5173
  }
}); 