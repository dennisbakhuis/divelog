# The reference app as a standalone image (SvelteKit, adapter-node).
# Build from the monorepo root: docker build -f apps/reference/Dockerfile -t divelog-reference .

FROM node:22-slim AS builder

WORKDIR /repo

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/kit/package.json packages/kit/
COPY apps/reference/package.json apps/reference/
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY packages/kit packages/kit
COPY apps/reference apps/reference

RUN pnpm --filter @divelog/kit build && pnpm --filter reference build
RUN pnpm --filter reference deploy --prod --legacy /out && cp -r apps/reference/build /out/build

FROM node:22-slim AS runtime

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs sveltekit

COPY --from=builder --chown=sveltekit:nodejs /out/build ./build
COPY --from=builder --chown=sveltekit:nodejs /out/node_modules ./node_modules
COPY --from=builder --chown=sveltekit:nodejs /out/package.json ./package.json

USER sveltekit

EXPOSE 3000

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    BODY_SIZE_LIMIT=50M \
    DIVELOG_BACKEND_URL=http://divelog-server:8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["node", "build"]
