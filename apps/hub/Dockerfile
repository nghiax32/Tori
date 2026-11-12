# Build từ thư mục gốc repo:  docker build -f apps/hub/Dockerfile .

# ---------- 1. build frontend ----------
FROM node:22-alpine AS web
WORKDIR /repo
COPY packages/ui packages/ui
COPY apps/hub/frontend/package.json apps/hub/frontend/package-lock.json apps/hub/frontend/
RUN cd apps/hub/frontend && npm ci --no-fund --no-audit
COPY apps/hub/frontend apps/hub/frontend
RUN cd apps/hub/frontend && npm run build

# ---------- 2. backend Python ----------
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.13.7 /uv /usr/local/bin/uv
ENV UV_LINK_MODE=copy UV_COMPILE_BYTECODE=1 UV_PYTHON_DOWNLOADS=never
WORKDIR /repo
COPY pyproject.toml uv.lock ./
COPY packages/tori-core packages/tori-core
COPY apps/hub/backend apps/hub/backend
RUN uv sync --frozen --no-dev --package hub
# Hub đọc apps/*/app.toml để liệt kê app. Chỉ chép các file này (xem .dockerignore).
COPY apps /tmp/apps
RUN mkdir -p /srv/apps && cd /tmp/apps && find . -name app.toml -exec cp --parents {} /srv/apps/ \; && rm -rf /tmp/apps
COPY --from=web /repo/apps/hub/frontend/dist /srv/static

ENV PATH="/repo/.venv/bin:$PATH" STATIC_DIR=/srv/static APPS_DIR=/srv/apps TORI_ENV=prod
EXPOSE 8000
CMD ["uvicorn", "hub.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
