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
    open: true,
    headers: {
      // Required for WASM/SharedArrayBuffer support
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      // Add CORS headers for local development
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    },
    proxy: {
      // Proxy CDN requests to avoid CORS issues
      '/cdn.zama.ai': {
        target: 'https://cdn.zama.ai',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/cdn.zama.ai/, ''),
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // Ensure WASM files are handled correctly
            if (req.url.endsWith('.wasm')) {
              proxyReq.setHeader('Accept', 'application/wasm');
            }
          });
        }
      }
    }
  },
  optimizeDeps: {
    // No exclusions needed since FHE SDK is loaded via CDN
  },
  define: {
    // Environment variables will be available via import.meta.env in Vite
    // No need to define process.env for Vercel deployment
  }
})