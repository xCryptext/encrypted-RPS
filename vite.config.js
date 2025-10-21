import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor libraries
          'vendor-react': ['react', 'react-dom'],
          'vendor-ethers': ['ethers']
        }
      }
    },
    chunkSizeWarningLimit: 1000
  },
  server: {
    port: 3000,
    open: true
  },
  optimizeDeps: {
    // No exclusions needed since FHE SDK is loaded via CDN
  },
  define: {
    // Environment variables will be available via import.meta.env in Vite
    // No need to define process.env for Vercel deployment
  }
})