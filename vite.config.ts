import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // Served from a subpath on GitHub Pages in production; root in dev.
  base: command === 'build' ? '/gym-tracker/' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Gym Tracker',
        short_name: 'Gym',
        description: 'Inconsistency-friendly strength, cardio and body-weight tracking.',
        theme_color: '#0e1116',
        background_color: '#0e1116',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
    }),
  ],
}))
