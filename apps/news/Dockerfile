# Build từ thư mục gốc repo:  docker build -f apps/news/Dockerfile .

# ---------- 1. build frontend ----------
FROM node:22-alpine AS web
WORKDIR /repo
COPY packages/ui packages/ui
COPY apps/news/frontend/package.json apps/news/frontend/package-lock.json apps/news/frontend/
RUN cd apps/news/frontend && npm ci --no-fund --no-audit
COPY apps/news/frontend apps/news/frontend
RUN cd apps/news/frontend && npm run build

# ---------- 2. backend Python ----------
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.13.7 /uv /usr/local/bin/uv
ENV UV_LINK_MODE=copy UV_COMPILE_BYTECODE=1 UV_PYTHON_DOWNLOADS=never
WORKDIR /repo
COPY pyproject.toml uv.lock ./
COPY packages/tori-core packages/tori-core
COPY apps/news/backend apps/news/backend
RUN uv sync --frozen --no-dev --package news
COPY --from=web /repo/apps/news/frontend/dist /srv/static

ENV PATH="/repo/.venv/bin:$PATH" STATIC_DIR=/srv/static DATA_DIR=/data TORI_ENV=prod
VOLUME /data
EXPOSE 8000
CMD ["uvicorn", "news.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
