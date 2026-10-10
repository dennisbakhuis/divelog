import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

// Component tests mount Svelte in jsdom, which needs the browser build of
// the runtime rather than the server one Vitest resolves by default.
export default defineConfig({
  plugins: [sveltekit()],
  resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{js,ts}'],
    passWithNoTests: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // Coverage is measured on the logic modules; Svelte components are
      // exercised in the browser and by the reference app's E2E smoke.
      include: ['src/lib/**/*.ts'],
      exclude: [
        'src/**/*.{test,spec}.{ts,js}',
        'src/**/*.d.ts',
        'src/lib/**/index.ts',
        'src/lib/components/anim/**',
        'src/lib/og/font-data.ts',
      ],
      thresholds: {
        'src/lib/**': {
          lines: 70,
          functions: 70,
          branches: 70,
          statements: 70,
        },
      },
    },
  },
});
