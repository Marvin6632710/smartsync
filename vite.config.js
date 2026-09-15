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
          // Named explicitly, not because the split changes — Rollup already
          // shared it between the four map routes — but because it otherwise
          // takes its name from whichever of our own modules happens to land
          // in it, and a 154 kB chunk called `region` reads like our 30-line
          // region module has somehow ballooned.
          leaflet: ['leaflet', 'react-leaflet'],
        },
      },
    },
    // Leaflet and Firebase are genuinely large; the default 500 kB warning
    // fires on chunks we have already decided are the right shape.
    chunkSizeWarningLimit: 700,
  },
})
