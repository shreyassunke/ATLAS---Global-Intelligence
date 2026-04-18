import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import cesium from 'vite-plugin-cesium'

export default defineConfig({
  plugins: [react(), tailwindcss(), cesium()],

  // Proxy `/api/*` to a locally running `vercel dev` so the client code path
  // is identical to production. Start the API with `npm run dev:api`.
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_ATLAS_API_BASE || 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },

  // Pre-bundle heavy deps for faster dev server cold start
  optimizeDeps: {
    include: ['three', 'react', 'react-dom', 'framer-motion', 'zustand'],
  },

  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Split large dependencies into separate chunks for better caching
        // (cesium is handled externally by vite-plugin-cesium)
        manualChunks: {
          three: ['three'],
          vendor: ['react', 'react-dom', 'framer-motion', 'zustand'],
        },
      },
    },
  },
})
