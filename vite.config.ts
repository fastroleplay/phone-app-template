import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath, URL } from 'node:url';

/**
 * Drops the `crossorigin` attribute Vite puts on its own `<script type="module">` and
 * `<link rel="stylesheet">` tags.
 *
 * Inside the phone the app runs in a sandboxed frame with an opaque origin, so every request it
 * makes carries `Origin: null`. A `crossorigin` fetch of the app's own files then needs the server
 * to answer with `Access-Control-Allow-Origin` — the edge does send `*` now, but a bundle without
 * the attribute loads on any server that ever served it, which keeps old and self-hosted builds
 * working too.
 */
function stripCrossorigin(): Plugin {
  return {
    name: 'fastapp:strip-crossorigin',
    enforce: 'post',
    transformIndexHtml(html) {
      return html.replace(
        /<(script type="module"|link rel="stylesheet")([^>]*?) crossorigin([^>]*)>/g,
        '<$1$2$3>',
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), stripCrossorigin()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    /*
     * The preview harness frames your app the way the phone does: sandboxed without
     * `allow-same-origin`. That gives the frame an opaque origin, so every request it makes
     * carries `Origin: null` — and Vite refuses those by default, which fails every module script
     * with a CORS error before your app runs a line.
     *
     * Dev server only. The built package is served from its own origin and needs none of this.
     */
    port: 5024,
    cors: { origin: '*' },
  },
  // Relative, not absolute. The package is served from your app's own origin at whatever path the
  // phone asks for, so '/assets/...' would break the moment it is not served from the root.
  base: './',
  build: {
    outDir: 'dist',
    // Your package is served with `script-src 'self'`, so nothing loads from a CDN anyway.
    assetsInlineLimit: 4096,
  },
});
