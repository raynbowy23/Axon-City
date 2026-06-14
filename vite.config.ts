import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split big, stable vendor libraries into their own chunks so they
        // cache independently of app code (an app change no longer busts the
        // whole ~2 MB bundle). Also clears the >500 KB chunk warning.
        // Function form matches by module path, so it handles subpath-only
        // packages like `react-map-gl/maplibre` correctly.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('@deck.gl') || id.includes('@luma.gl') || id.includes('/deck.gl/')) return 'deck'
          if (id.includes('maplibre-gl') || id.includes('react-map-gl')) return 'maplibre'
          if (id.includes('@turf')) return 'turf'
          if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) return 'react-vendor'
        },
      },
    },
  },
})
