import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
    // Leaflet and Firebase are genuinely large; the default 500 kB warning
    // fires on chunks we have already decided are the right shape.
    chunkSizeWarningLimit: 700,
  },
})
