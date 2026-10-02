import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { VitePWA } from 'vite-plugin-pwa';
import { SOURCE_PDF_FILE } from './src/engine/source-pdf';

const SOURCE_PDF = path.join('source', SOURCE_PDF_FILE);

/** D3: ship the official PDF with the app (and in the precache) so "View page in PDF" works offline. */
function sourcePdf(): Plugin {
  return {
    name: 'wca-source-pdf',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: `source/${SOURCE_PDF_FILE}`, source: fs.readFileSync(SOURCE_PDF) });
    },
  };
}

export default defineConfig({
  // GitHub Pages serves the app under /WCA_2030_Explorer/; Netlify builds (NETLIFY=true) serve it from the root.
  base: process.env.NETLIFY === 'true' ? '/' : '/WCA_2030_Explorer/',
  build: { outDir: 'docs' },
  plugins: [
    sourcePdf(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,wasm,woff2,pdf,f32}', '**/*.onnx'],
        // E1: without cross-origin isolation (no COOP/COEP on static hosts) the runtime only ever loads
        // ort-wasm-simd.wasm. The threaded builds are never used; the plain build is a fallback for
        // browsers without SIMD, cached at runtime the first time it is needed.
        globIgnores: ['models/ort-wasm-threaded.wasm', 'models/ort-wasm-simd-threaded.wasm', 'models/ort-wasm.wasm'],
        runtimeCaching: [{
          urlPattern: /\/models\/ort-wasm(?:-simd-threaded|-threaded)?\.wasm$/,
          handler: 'CacheFirst',
          options: { cacheName: 'ort-wasm-fallback', expiration: { maxEntries: 4 } },
        }],
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
