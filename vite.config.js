import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import cesium from 'vite-plugin-cesium'

export default defineConfig({
  plugins: [react(), tailwindcss(), cesium()],

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
