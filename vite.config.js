import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        // Split large vendor libs into their own chunks so they cache independently
        // and don't all need to be re-downloaded on every app deploy.
        manualChunks: {
          'vendor-react':    ['react', 'react-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-icons':    ['lucide-react'],
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
})
