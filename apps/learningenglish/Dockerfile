# Build từ thư mục gốc repo:  docker build -f apps/learningenglish/Dockerfile .

# ---------- 1. build frontend ----------
FROM node:22-alpine AS web
WORKDIR /repo
COPY packages/ui packages/ui
COPY apps/learningenglish/frontend/package.json apps/learningenglish/frontend/package-lock.json apps/learningenglish/frontend/
RUN cd apps/learningenglish/frontend && npm ci --no-fund --no-audit
COPY apps/learningenglish/frontend apps/learningenglish/frontend
RUN cd apps/learningenglish/frontend && npm run build

# ---------- 2. backend Python ----------
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.13.7 /uv /usr/local/bin/uv
ENV UV_LINK_MODE=copy UV_COMPILE_BYTECODE=1 UV_PYTHON_DOWNLOADS=never
WORKDIR /repo
COPY pyproject.toml uv.lock ./
COPY packages/tori-core packages/tori-core
COPY apps/learningenglish/backend apps/learningenglish/backend
RUN uv sync --frozen --no-dev --package learningenglish
COPY --from=web /repo/apps/learningenglish/frontend/dist /srv/static

ENV PATH="/repo/.venv/bin:$PATH" STATIC_DIR=/srv/static DATA_DIR=/data TORI_ENV=prod
VOLUME /data
EXPOSE 8000
CMD ["uvicorn", "learningenglish.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
