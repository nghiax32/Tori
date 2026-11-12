# Đưa Tori lên Internet

Hướng dẫn cho lần deploy đầu tiên. Làm lần lượt từ trên xuống; mỗi bước có cách kiểm tra.

Bức tranh tổng thể:

```
Trình duyệt ──https──> VPS ──> Caddy (cổng 80/443, tự cấp HTTPS)
                                 ├── tori.com          -> container hub
                                 ├── calendar.tori.com -> container calendar (SQLite trong volume)
                                 └── <app>.tori.com    -> container <app>

GitHub push main ──> Actions: test -> build image app thay đổi -> GHCR -> SSH vào VPS -> restart app đó
```

Chi phí dự kiến: domain khoảng 10–15 USD/năm, VPS khoảng 5 USD/tháng.

Trong tài liệu này, `tori.com` là domain ví dụ, `<github-user>` là tên tài khoản GitHub của
bạn viết **chữ thường**, `<IP>` là địa chỉ IP của VPS.

---

## 1. Mua domain

Mua ở Cloudflare Registrar, Porkbun hoặc Namecheap. Chọn nơi cho phép sửa DNS dễ dàng.
Chưa cần cấu hình gì, bước 3 mới trỏ domain.

## 2. Thuê VPS

Gợi ý: Hetzner (gói CX22, 2 vCPU / 4 GB RAM) hoặc DigitalOcean / Vultr gói 1–2 GB RAM.
Mỗi app tốn khoảng 50–80 MB RAM.

Khi tạo VPS:

- Hệ điều hành: **Ubuntu 24.04**
- Thêm **SSH key** của máy bạn (không dùng mật khẩu). Chưa có key thì tạo:

  ```bash
  ssh-keygen -t ed25519 -C "may-ca-nhan"
  cat ~/.ssh/id_ed25519.pub        # dán nội dung này vào ô SSH key của nhà cung cấp
  ```

Kiểm tra: `ssh root@<IP>` vào được.

### Cài đặt ban đầu trên VPS

Chạy trên VPS (đang là `root`):

```bash
# cập nhật hệ thống
apt update && apt upgrade -y

# tạo user deploy (không chạy app bằng root)
adduser --disabled-password --gecos "" deploy
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh

# tường lửa: chỉ mở SSH, HTTP, HTTPS
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable

# cài Docker (kèm docker compose)
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
```

Kiểm tra: từ máy bạn, `ssh deploy@<IP> docker compose version` in ra phiên bản.

## 3. Trỏ domain về VPS

Trong trang quản lý DNS của domain, tạo hai bản ghi:

| Loại | Tên | Giá trị | Ghi chú |
|---|---|---|---|
| A | `@` | `<IP>` | `tori.com` |
| A | `*` | `<IP>` | mọi subdomain: `calendar.tori.com`, app sau này |

Nếu dùng Cloudflare: để **DNS only** (đám mây xám), không bật proxy. Caddy cần nhận trực tiếp
kết nối để xin chứng chỉ HTTPS.

Kiểm tra (có thể mất vài phút tới vài giờ):

```bash
dig +short tori.com
dig +short calendar.tori.com     # cả hai đều ra <IP>
```

## 4. Tạo Google OAuth (đăng nhập Google)

1. Vào <https://console.cloud.google.com/>, tạo project mới, ví dụ `tori`.
2. **APIs & Services → OAuth consent screen**:
   - User type: **External**
   - Điền tên app, email hỗ trợ
   - Scopes: không cần thêm (app chỉ dùng `openid email profile`)
   - **Test users**: thêm email Google của bạn. Khi app ở chế độ *Testing*, chỉ những email
     này đăng nhập được, đủ cho dùng cá nhân. Muốn cho người khác dùng thì bấm *Publish app*.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized redirect URIs**, mỗi app có đăng nhập cần một dòng:

     ```
     https://calendar.tori.com/api/auth/callback
     http://localhost:5174/api/auth/callback
     ```

     Dòng `localhost` để đăng nhập Google thật khi chạy `npm run dev` ở máy. App mới có đăng
     nhập thì thêm `https://<app>.tori.com/api/auth/callback`.
4. Lưu lại **Client ID** và **Client secret** cho bước 5.

Mỗi app có cookie đăng nhập riêng, nên vào app nào lần đầu sẽ đăng nhập app đó (Google nhớ tài
khoản nên chỉ cần một cú bấm).

## 5. Chuẩn bị thư mục trên VPS

```bash
ssh deploy@<IP>
mkdir -p ~/tori/infra && cd ~/tori
python3 -c "import secrets; print(secrets.token_urlsafe(32))"   # chép kết quả làm SECRET_KEY
nano .env
```

Nội dung `~/tori/.env`:

```bash
TORI_ENV=prod
TORI_DOMAIN=tori.com
TORI_SCHEME=https
PUBLIC_PORT=
SECRET_KEY=<chuỗi vừa tạo>
GOOGLE_CLIENT_ID=<Client ID>
GOOGLE_CLIENT_SECRET=<Client secret>
TIMEZONE=Asia/Ho_Chi_Minh
IMAGE_PREFIX=ghcr.io/<github-user>/tori
HTTP_PORT=80
HTTPS_PORT=443
```

```bash
chmod 600 .env       # chỉ user deploy đọc được
```

`compose.yaml` và `infra/Caddyfile` không cần chép tay: CI chép lên mỗi lần deploy.

### Cho VPS tải được image từ GHCR

Image mặc định là **private**. Tạo token để VPS đăng nhập GHCR:

1. GitHub → Settings → Developer settings → Personal access tokens → **Tokens (classic)** →
   Generate new token, chỉ chọn quyền `read:packages`.
2. Trên VPS:

   ```bash
   echo <token> | docker login ghcr.io -u <github-user> --password-stdin
   ```

## 6. Bật CI deploy trên GitHub

### Tạo SSH key riêng cho GitHub Actions

Trên máy bạn (không dùng lại key cá nhân):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/tori_deploy -N "" -C "github-actions"
ssh-copy-id -i ~/.ssh/tori_deploy.pub deploy@<IP>
ssh-keyscan -H <IP>            # chép toàn bộ kết quả làm DEPLOY_KNOWN_HOSTS
```

### Khai báo trên repo GitHub

**Settings → Secrets and variables → Actions**:

| Tab | Tên | Giá trị |
|---|---|---|
| Secrets | `DEPLOY_HOST` | `<IP>` |
| Secrets | `DEPLOY_USER` | `deploy` |
| Secrets | `DEPLOY_SSH_KEY` | nội dung file `~/.ssh/tori_deploy` (key **private**, cả dòng BEGIN/END) |
| Secrets | `DEPLOY_KNOWN_HOSTS` | kết quả `ssh-keyscan` ở trên |
| Variables | `DEPLOY_ENABLED` | `true` |

Chưa đặt `DEPLOY_ENABLED=true` thì CI chỉ chạy test, không build và không deploy.

## 7. Deploy lần đầu

GitHub → tab **Actions** → **CI / Deploy** → **Run workflow** (nhánh `main`). Chạy tay sẽ
build và deploy **tất cả** app.

Theo dõi các job `test` → `detect` → `build` (mỗi app một job) → `release`.

Kiểm tra:

```bash
curl https://tori.com/api/health              # {"status":"ok","app":"hub"}
curl https://calendar.tori.com/api/health     # {"status":"ok","app":"calendar"}
```

Mở <https://tori.com> trên trình duyệt, bấm vào Calendar, đăng nhập Google.

Lần đầu Caddy cần khoảng vài chục giây để xin chứng chỉ. Trong lúc đó trình duyệt có thể báo
lỗi HTTPS.

## 8. Từ giờ trở đi

Chỉ cần push lên `main`:

| Bạn sửa | CI deploy lại |
|---|---|
| `apps/calendar/**` | chỉ `calendar` |
| `apps/<app>/app.toml` | `<app>` và `hub` (để hub cập nhật danh sách) |
| `packages/**`, `pyproject.toml`, `uv.lock` | mọi app |
| `compose.yaml`, `infra/**` | không build app; chép lại cấu hình và reload Caddy |
| `docs/`, `scripts/`, `templates/`, `README.md` | không deploy gì |

Pull request chỉ chạy test, không deploy.

---

## Vận hành

Các lệnh dưới đây chạy trên VPS trong `~/tori`.

```bash
docker compose ps                          # trạng thái các container
docker compose logs -f --tail=100 calendar # log của một app
docker compose restart calendar            # khởi động lại một app
docker compose logs caddy | grep -i error  # lỗi HTTPS / proxy
```

### Quay lại phiên bản cũ

Mỗi image có hai tag: `latest` và mã commit. Để chạy lại bản của commit `abc1234...`
(lấy mã đầy đủ ở tab Actions hoặc `git log`):

```bash
TAG=<mã-commit-đầy-đủ> docker compose pull calendar
TAG=<mã-commit-đầy-đủ> docker compose up -d --no-build calendar
```

Lần deploy tiếp theo của CI sẽ đưa app về `latest`.

### Sao lưu dữ liệu

Dữ liệu mỗi app là một file SQLite trong volume Docker (ví dụ volume `tori_calendar_data`).
Sao lưu an toàn khi app đang chạy:

```bash
docker compose exec -T calendar python -c \
  "import sqlite3; sqlite3.connect('/data/calendar.db').backup(sqlite3.connect('/data/backup.db'))"
docker compose cp calendar:/data/backup.db ./calendar-$(date +%F).db
```

Sau đó tải file về máy: `scp deploy@<IP>:~/tori/calendar-*.db .`

Nên làm định kỳ, ví dụ bằng cron trên VPS, và giữ bản sao ở ngoài VPS.

---

## Gặp lỗi

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Trình duyệt báo lỗi chứng chỉ HTTPS | DNS chưa trỏ đúng, cổng 80/443 bị chặn, hoặc bật proxy Cloudflare | Kiểm tra `dig`, `ufw status`, chuyển Cloudflare sang *DNS only*, xem `docker compose logs caddy` |
| `502 Bad Gateway` | Container app không chạy | `docker compose ps`, `docker compose logs <app>` |
| App khởi động rồi tắt ngay, log có `SECRET_KEY vẫn là giá trị mặc định` | `.env` trên VPS thiếu `SECRET_KEY` | Đặt `SECRET_KEY` như bước 5 |
| Google báo `redirect_uri_mismatch` | Chưa thêm đúng redirect URI | Thêm `https://<app>.tori.com/api/auth/callback` ở bước 4 (đúng `https`, không có `/` cuối) |
| Google báo `access_denied` / app chưa được xác minh | Email chưa nằm trong *Test users* | Thêm email ở OAuth consent screen |
| Job `release` lỗi `Permission denied (publickey)` | Sai `DEPLOY_SSH_KEY` hoặc chưa `ssh-copy-id` | Làm lại bước 6 |
| Job `release` lỗi `Host key verification failed` | Sai `DEPLOY_KNOWN_HOSTS` | Chạy lại `ssh-keyscan -H <IP>` và cập nhật secret |
| `docker compose pull` lỗi `denied` / `unauthorized` | VPS chưa đăng nhập GHCR | Làm lại phần GHCR ở bước 5 |
| Trang hub không hiện app mới | Hub chưa được deploy lại | Kiểm tra app mới có `app.toml` với `listed = true`; chạy tay workflow |
