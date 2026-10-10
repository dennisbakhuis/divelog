# @divelog/kit

SvelteKit components, page routes and server helpers for a divelog server
(`packages/server` in this monorepo). See
[docs/KIT.md](../../docs/KIT.md) for how to mount it in a SvelteKit site.

| Import                      | What                                                     |
| --------------------------- | -------------------------------------------------------- |
| `@divelog/kit`              | Components (dive, map, admin), provider, toasts, motion  |
| `@divelog/kit/core`         | Pure logic: config and URLs, API types, views, map maths |
| `@divelog/kit/routes`       | Page components and the two page switches                |
| `@divelog/kit/server`       | `createDivelog`, catch-all loaders, `handleDivelog`, SEO |
| `@divelog/kit/og`           | Open Graph cards (needs `@resvg/resvg-js`)               |
| `@divelog/kit/widgets`      | `DiveTile` and `loadDiveSummary` for a home page         |
| `@divelog/kit/testing`      | Vitest doubles: `fakeDivelog`, `fakeEvent`, `thrown`     |
| `@divelog/kit/styles/*.css` | `tokens.css`, `divelog.css`, `maplibre.css`              |

Scripts: `pnpm test`, `pnpm check`, `pnpm lint`, `pnpm build` (svelte-package + publint),
`pnpm types` (regenerate `api.d.ts` from a running server), `pnpm og-fonts`.
