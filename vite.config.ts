/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// `BASE_PATH` is set by the GitHub Pages deploy workflow to
// `/workout-tracker/` (the repo's GH Pages URL). Locally and in
// preview it stays `/` so dev and gh-pages builds share one config.
//
// Read via globalThis to avoid pulling in @types/node just for the
// process global (we're a frontend project, not Node).
const base =
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Workout Tracker',
        short_name: 'Workouts',
        description: 'Personal two-profile workout tracker',
        theme_color: '#0c0a08',
        background_color: '#0c0a08',
        display: 'standalone',
        orientation: 'portrait',
        scope: base,
        start_url: base,
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Default Workbox precaching covers HTML/JS/CSS/images.
        // Bump the maximum to fit the Recharts-bearing bundle
        // (~800 KB raw) without splitting — see DECISIONS milestone 8.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // SPA fallback so deep links work offline.
        navigateFallback: `${base}index.html`,
      },
    }),
  ],
  test: {
    environment: 'node',
    globals: true,
    include: ['src/domain/**/*.{test,spec}.ts'],
  },
});
