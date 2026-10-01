import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { VitePWA } from 'vite-plugin-pwa';

const SOURCE_PDF = path.join('source', 'Census-2030_EN-DTP-9.pdf');

/** D3: ship the official PDF with the app (and in the precache) so "View page in PDF" works offline. */
function sourcePdf(): Plugin {
  return {
    name: 'wca-source-pdf',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'source/Census-2030_EN-DTP-9.pdf', source: fs.readFileSync(SOURCE_PDF) });
    },
  };
}

export default defineConfig({
  base: '/WCA_2030_Explorer/',
  build: { outDir: 'docs' },
  plugins: [
    sourcePdf(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,wasm,woff2,pdf}', '**/*.onnx'],
        maximumFileSizeToCacheInBytes: 200 * 1024 * 1024,
      },
      manifest: {
        name: 'WCA 2030 Explorer',
        short_name: 'WCA Explorer',
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
