# divelog-server image (FastAPI + uvicorn). `dev` mounts the source and is driven by
# docker compose; `runtime` is the immutable production image.
#
# The dependency pins come from the workspace uv.lock, exported next to this file:
#   uv export --package divelog-server --frozen --no-dev --no-emit-workspace --no-header \
#     -o packages/server/requirements.lock
#   uv export --package divelog-server --frozen --no-emit-workspace --no-header \
#     -o packages/server/requirements-dev.lock

FROM python:3.13-slim AS base

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends git openssh-client \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir uv \
    && uv venv /opt/venv

ENV VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1

# ── Dev: full dependency set, source volume-mounted by docker compose ──
FROM base AS dev
COPY requirements-dev.lock ./
RUN uv pip install --no-cache --require-hashes -r requirements-dev.lock
COPY . .
RUN uv pip install --no-cache --no-deps -e .
EXPOSE 8000
CMD ["divelog-server"]

# ── Runtime: production dependencies only, non-root ──
FROM base AS runtime
COPY requirements.lock ./
RUN uv pip install --no-cache --require-hashes -r requirements.lock
COPY pyproject.toml ./
COPY divelog_server ./divelog_server
RUN uv pip install --no-cache --no-deps . \
    && rm -rf /app/divelog_server /app/pyproject.toml
RUN addgroup --system --gid 1001 app && adduser --system --uid 1001 --ingroup app app \
    && mkdir -p /data/media /data/repo /data/commons /data/state && chown -R app:app /data \
    && git config --system --add safe.directory /data/repo \
    && git config --system --add safe.directory /data/commons
WORKDIR /data
USER app
ARG APP_VERSION=0.0.0-dev
ENV APP_VERSION=${APP_VERSION} \
    DATA_ROOT=/data/repo \
    STATE_DIR=/data/state \
    MEDIA_ROOT=/data/media \
    HOST=0.0.0.0 \
    PORT=8000
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://localhost:{os.environ.get(\"PORT\", \"8000\")}/health')"
CMD ["divelog-server"]
