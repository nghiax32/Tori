# Build từ thư mục gốc repo:  docker build -f apps/__APP_NAME__/Dockerfile .

# ---------- 1. build frontend ----------
FROM node:22-alpine AS web
WORKDIR /repo
COPY packages/ui packages/ui
COPY apps/__APP_NAME__/frontend/package.json apps/__APP_NAME__/frontend/package-lock.json apps/__APP_NAME__/frontend/
RUN cd apps/__APP_NAME__/frontend && npm ci --no-fund --no-audit
COPY apps/__APP_NAME__/frontend apps/__APP_NAME__/frontend
RUN cd apps/__APP_NAME__/frontend && npm run build

# ---------- 2. backend Python ----------
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.13.7 /uv /usr/local/bin/uv
ENV UV_LINK_MODE=copy UV_COMPILE_BYTECODE=1 UV_PYTHON_DOWNLOADS=never
WORKDIR /repo
COPY pyproject.toml uv.lock ./
COPY packages/tori-core packages/tori-core
COPY apps/__APP_NAME__/backend apps/__APP_NAME__/backend
RUN uv sync --frozen --no-dev --package __APP_NAME__
COPY --from=web /repo/apps/__APP_NAME__/frontend/dist /srv/static

ENV PATH="/repo/.venv/bin:$PATH" STATIC_DIR=/srv/static DATA_DIR=/data TORI_ENV=prod
VOLUME /data
EXPOSE 8000
CMD ["uvicorn", "__APP_MODULE__.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
