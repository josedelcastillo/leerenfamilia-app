import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // amazon-cognito-identity-js still reaches for Node's `global`, which does not exist in a
  // browser. Without this the manager surface throws "global is not defined" at load — in the
  // production build too, not only in dev.
  define: {
    global: 'globalThis',
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Nacidos para Leer Perú',
        short_name: 'Nacidos para Leer',
        description:
          'Acompañamiento de 8 semanas para leer, cantar, jugar y conversar con tu bebé.',
        lang: 'es-PE',
        dir: 'ltr',
        start_url: '/app',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#fffbf7',
        theme_color: '#fffbf7',
        categories: ['education', 'parenting'],
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Maskable icons keep the mark inside the inner 80%, so no launcher shape crops it.
          { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The shell is precached, so the app opens with no connection at all.
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // Written at deploy time from the stack outputs, so it must never be precached stale.
        globIgnores: ['**/config.json'],
        navigateFallback: '/index.html',
        // Never let the service worker answer an API call from cache: a stale reading log or a
        // stale feedback thread would be worse than an error the UI can handle.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Audio and images of the weekly content never change once published.
            urlPattern: /\/assets\/.*\.(?:mp3|m4a|ogg|png|jpg|jpeg|webp|svg)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'nplp-media',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Content is the one API response worth serving stale: eight weeks of activities are
            // more useful offline than an error screen.
            urlPattern: /\/api\/contenido$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'nplp-contenido',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
