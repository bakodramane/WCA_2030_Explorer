import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/WCA_2030_Adviser/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,wasm}', '**/*.onnx'],
        maximumFileSizeToCacheInBytes: 200 * 1024 * 1024,
      },
      manifest: {
        name: 'WCA 2030 Adviser',
        short_name: 'WCA Guide',
        description: 'Offline Q&A grounded in WCA 2030 official guidelines',
        theme_color: '#1a3a2a',
        background_color: '#f5f0e8',
        display: 'standalone',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
});
