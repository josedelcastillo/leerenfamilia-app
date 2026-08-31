import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// vite-plugin-pwa (Workbox precache, offline shell, runtime caching for audio and images)
// arrives in phase 5, together with the manifest and the IndexedDB sync queue.
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
