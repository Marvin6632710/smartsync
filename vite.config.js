import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // The interface's strings live in i18next; the tests render the English
    // ones, so the instance is initialised before any component is.
    setupFiles: ['./tests/setup.js'],
  },
  build: {
    rollupOptions: {
      output: {
        // Split the two heavy third-party dependencies out of the app bundle.
        // They change far less often than our own code, so a browser that has
        // visited before keeps them cached across deploys instead of
        // re-downloading everything for a one-line fix.
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
    // Firebase is split separately and reused across releases.
    chunkSizeWarningLimit: 700,
  },
})
