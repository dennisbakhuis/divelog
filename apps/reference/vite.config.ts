import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// `/api/v1` and `/media` reach the divelog server through the app itself
// (src/lib/proxy.server.ts), in dev, preview and the built image alike.
export default defineConfig({
  plugins: [sveltekit()],
  server: { port: 5374, strictPort: true },
  preview: { port: 4374, strictPort: true },
});
