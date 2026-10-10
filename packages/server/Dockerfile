# Backend image (FastAPI + uvicorn). `dev` target mounts the source and
# reloads; `runtime` is the immutable production image.

FROM python:3.13-slim AS base

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends git openssh-client \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir uv

COPY pyproject.toml uv.lock ./

# ── Dev: full dependency set, source volume-mounted by docker-compose ──
FROM base AS dev
ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONPATH=/app
RUN uv sync --frozen --no-install-project
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

# ── Runtime: production dependencies only, non-root ──
FROM base AS runtime
ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONPATH=/app \
    PYTHONUNBUFFERED=1
RUN uv sync --frozen --no-dev --no-install-project
COPY . .
RUN addgroup --system --gid 1001 app && adduser --system --uid 1001 --ingroup app app \
    && mkdir -p /data/media /data/repo /data/state && chown -R app:app /data \
    && git config --system safe.directory /data/repo
USER app
ARG APP_VERSION=0.0.0-dev
ENV APP_VERSION=${APP_VERSION}
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--workers", "1"]
