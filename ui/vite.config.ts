import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8088',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('lucide-react')) {
              return 'vendor-icons'
            }
            if (id.includes('react/') || id.includes('react-dom/')) {
              return 'vendor-react'
            }
            if (id.includes('@reduxjs') || id.includes('react-redux')) {
              return 'vendor-redux'
            }
            return 'vendor'
          }
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './vitest.setup.ts',
    css: false, // Desativa processamento de CSS nos testes (ganho expressivo de performance)
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache', 'tests/*'],
    // fileParallelism: false,
    // maxWorkers: 1,
    pool: 'vmThreads', // Reutiliza a instância do jsdom mantendo o isolamento seguro entre arquivos
    testTimeout: 25000,
    hookTimeout: 25000,
    teardownTimeout: 25000,
  },
})
