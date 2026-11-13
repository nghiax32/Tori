# Tori

Website cá nhân gồm nhiều mini app dưới một domain:

- `tori.com`: **hub**, trang chủ liệt kê các app
- `calendar.tori.com`: **Calendar**, ghi sự kiện và mốc thời gian (sinh nhật, ngày giỗ âm lịch, đi du lịch...)
- `news.tori.com`: **Bản tin**, bản tin quốc tế sáng và tối do Claude tổng hợp, lấy tự động từ Gmail
- `<app>.tori.com`: các app thêm sau

Mỗi app là một container riêng (FastAPI phục vụ cả API lẫn frontend đã build). Caddy chia
subdomain về đúng container và tự lo HTTPS. Sửa app nào thì CI chỉ build và deploy lại app đó.

## Cấu trúc

```
apps/
  hub/                    # tori.com
  calendar/               # calendar.tori.com
    app.toml              # metadata: tên, subdomain, mô tả, icon, cổng dev
    backend/              # FastAPI (module Python: calendar_app)
    frontend/             # Vite + TypeScript
    Dockerfile
    docs/ideas.md         # ý tưởng chưa làm
  news/                   # news.tori.com: bản tin lấy từ Gmail (module Python: news)
packages/
  tori-core/              # Python dùng chung: cấu hình, tạo app, đăng nhập Google, SQLite
  ui/                     # Frontend dùng chung: màu/font (tokens.css), header, dialog, gọi API
templates/app/            # template cho app mới
scripts/
  new_app.py              # tạo app mới từ template
  gmail_auth.py           # lấy refresh token Gmail cho app Bản tin
  changed_apps.py         # CI: xác định app nào cần deploy
infra/Caddyfile           # subdomain -> container
compose.yaml              # toàn bộ hệ thống
.github/workflows/ci.yml  # test, build image, deploy
docs/deploy.md            # hướng dẫn đưa lên VPS
```

## Cài đặt

Cần có: [uv](https://docs.astral.sh/uv/), Node.js 22, Docker (chỉ cần khi chạy toàn bộ hệ thống).

```bash
cp .env.example .env
uv sync --all-packages                       # cài Python cho mọi app vào .venv
for d in apps/*/frontend; do (cd "$d" && npm install); done
```

## Chạy local

### Cách 1: phát triển một app (tự reload khi sửa code)

Mở hai terminal ở thư mục gốc repo:

```bash
# terminal 1: backend
uv run uvicorn calendar_app.main:app --reload --port 8001

# terminal 2: frontend
cd apps/calendar/frontend && npm run dev     # mở http://localhost:5174
```

Vite chuyển các request `/api/*` sang backend. Cổng của từng app ghi trong `app.toml`
(`dev_backend_port`, `dev_frontend_port`). Hub dùng 8000/5173.

Khi `TORI_ENV=dev` và chưa cấu hình Google, trang đăng nhập có nút **Đăng nhập dev** (nhập
email bất kỳ). Dữ liệu SQLite nằm ở `data/<app>.db`.

### Cách 2: chạy toàn bộ như trên server

```bash
docker compose up -d --build
```

- Hub: <http://localhost>
- Calendar: <http://calendar.localhost>
- Bản tin: <http://news.localhost> (cần cấu hình Gmail, xem [docs/deploy.md](docs/deploy.md) mục 4b)

Chrome và Firefox tự hiểu `*.localhost` là máy mình. Nếu cổng 80 đã bị chiếm, đặt
`HTTP_PORT=8080` và `PUBLIC_PORT=8080` trong `.env` rồi mở <http://localhost:8080>.

```bash
docker compose logs -f calendar     # xem log
docker compose down                 # dừng (dữ liệu giữ trong volume)
```

Sửa `.env` thì chạy lại `docker compose up -d` (container chỉ đọc `.env` lúc được tạo,
`docker compose restart` không đọc lại). Sửa `infra/Caddyfile` (VD sau khi thêm app) thì nạp
lại Caddy: `docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile`; nếu không,
subdomain mới chỉ hiện trang trắng.

## Test

```bash
uv run pytest                                                   # toàn bộ test Python
for d in apps/*/frontend; do (cd "$d" && npm run build); done   # kiểm tra kiểu TypeScript + build
```

## Thêm app mới

```bash
uv run scripts/new_app.py pet --title "Pet" --description "Nuôi thú ảo"
```

Script sẽ:

1. chép `templates/app` sang `apps/pet` (backend FastAPI có sẵn `/api/hello`, frontend có header chung)
2. chọn cổng dev chưa dùng, thêm service vào `compose.yaml` và site vào `infra/Caddyfile`
3. chạy `uv lock`, `uv sync` và `npm install`

Hub tự hiện app mới (đọc `apps/*/app.toml`). Lên server, `pet.tori.com` chạy được ngay nếu
DNS đã có bản ghi wildcard `*` (xem [docs/deploy.md](docs/deploy.md)).

Tên app chỉ gồm chữ thường, số và dấu `-`. Nếu tên trùng module có sẵn của Python
(`calendar`, `email`, `json`...), script tự đặt module backend là `<tên>_app` (VD `calendar_app`).

## Phần dùng chung

**Backend (`tori_core`)**

```python
from tori_core import build_auth_router, create_app, get_identity, mount_frontend

app = create_app("pet", title="Pet")       # cookie phiên (dùng chung mọi app), /api/health, /api/meta, docs ở /api/docs
app.include_router(build_auth_router())    # /api/auth/login, /callback, /me, /logout, /dev-login
# ... route của app; dùng Depends(get_identity) cho API cần đăng nhập
mount_frontend(app)                        # luôn để cuối
```

Cấu hình đọc từ biến môi trường hoặc `.env`, xem `.env.example`.

**Frontend (`@tori/ui`)**

```ts
import "@tori/ui/style.css";               // màu, font, nút, ô nhập, dialog (tự hỗ trợ dark mode)
// mountHeader: thanh trên cùng ghim khi cuộn, có đồng hồ giờ VN, người đăng nhập / nút Đăng nhập
import { api, createDialog, h, mountHeader } from "@tori/ui";
```

Màu sắc và khoảng cách lấy từ biến CSS trong `packages/ui/src/tokens.css`. Đổi ở đó thì mọi
app đổi theo.

## Deploy

Xem [docs/deploy.md](docs/deploy.md): thuê VPS, trỏ domain, tạo Google OAuth, bật CI.

Tóm tắt: push lên `main` thì GitHub Actions chạy test và chỉ build lại image của app có thay
đổi (sửa `packages/` thì build lại mọi app), đẩy lên GHCR, rồi SSH vào VPS khởi động lại đúng
các container đó.
