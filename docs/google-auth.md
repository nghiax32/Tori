# Xác thực Google trong Tori: đăng nhập và đọc Gmail

Tori dùng Google cho **hai việc khác nhau**, với hai bộ cấu hình tách biệt:

| | A. Đăng nhập Tori | B. App Bản tin đọc Gmail |
|---|---|---|
| Câu hỏi được trả lời | "Người đang mở web là ai?" | "Server Tori có được đọc hộp thư của tôi không?" |
| Google Cloud project | Project đăng nhập | Project riêng `tori-gmail` |
| Trạng thái publish | **Testing** | **In production** |
| Loại OAuth client | Web application | Desktop app |
| Quyền (scope) xin | `openid email profile` (tên, email, ảnh) | `gmail.readonly` (đọc toàn bộ email) |
| Xảy ra khi nào | Mỗi lần ai đó bấm "Đăng nhập" | **Một lần** khi chạy `scripts/gmail_auth.py`; sau đó server tự dùng |
| Giữ lại gì | Không giữ token Google; chỉ một cookie phiên của Tori | **Refresh token** trong `.env` |
| Biến môi trường | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` |

Hai luồng không phụ thuộc nhau. Đăng nhập Tori bằng tài khoản nào cũng không làm server đọc
được Gmail của tài khoản đó; Gmail chỉ đọc được vì bạn đã cấp quyền một lần ở luồng B.

---

## 1. Các khái niệm

**Google Cloud project**: "hồ sơ ứng dụng" của bạn bên Google. Mỗi project có màn hình xin
quyền, danh sách API được bật, và các OAuth client riêng.

**Màn hình xin quyền (Google Auth Platform, tên cũ OAuth consent screen)**: thứ người dùng thấy
khi Google hỏi "App X muốn truy cập ...". Gồm:
- *Branding*: tên app, email hỗ trợ, trang chủ, link chính sách quyền riêng tư.
- *Audience*: ai được dùng app (External = mọi tài khoản Google), danh sách *Test users*, và
  trạng thái publish.
- *Data access*: các scope app được phép xin.

**Trạng thái publish**:
- *Testing*: chỉ email trong *Test users* cấp quyền được. Nếu app xin scope ngoài
  tên/email/hồ sơ (như Gmail) thì **refresh token hết hạn sau 7 ngày**.
- *In production*: mọi tài khoản Google cấp quyền được, refresh token không bị giới hạn 7 ngày.
  Muốn chuyển sang đây Google bắt điền đủ Branding (kể cả link privacy policy). App chưa được
  Google xác minh thì hiện cảnh báo "Google hasn't verified this app" và giới hạn 100 người
  dùng, đủ cho dùng cá nhân.

**Scope**: phạm vi quyền. `openid email profile` chỉ cho biết bạn là ai. `gmail.readonly` cho
đọc toàn bộ email (không gửi, không xoá được). Google xếp các scope Gmail vào nhóm
*restricted* (nhạy cảm nhất), nên mới có cảnh báo "chưa xác minh".

**OAuth client**: "danh tính" của chương trình gọi Google, gồm *client ID* (công khai) và
*client secret*.
- *Web application*: chạy trên server, Google chỉ trả kết quả về các *redirect URI* đã khai báo
  trước (VD `https://calendar.tori.com/api/auth/callback`).
- *Desktop app*: chạy trên máy người dùng. Google cho phép trả kết quả về `http://127.0.0.1:<cổng
  bất kỳ>`, không cần khai báo. Client secret của loại này không thật sự bí mật (nằm trong ứng
  dụng cài trên máy), Google biết và chấp nhận điều đó.

**Các loại mã/token**:

| Tên | Là gì | Sống bao lâu | Ở đâu trong Tori |
|---|---|---|---|
| Authorization code | Mã Google trả về sau khi bạn bấm "Allow", chỉ dùng được một lần để đổi lấy token | Vài phút | Chỉ đi qua URL trong giây lát |
| Access token | "Vé" để gọi API (Gmail) | ~1 giờ | Trong bộ nhớ app lúc quét, không lưu |
| Refresh token | Dùng để xin access token mới mà không cần bạn bấm lại | Đến khi bị thu hồi (xem mục 6) | `GMAIL_REFRESH_TOKEN` trong `.env` |
| ID token | Giấy chứng nhận "đây là ai" (email, tên) | Ngắn | Chỉ dùng lúc đăng nhập để đọc email/tên |

**state** và **PKCE (code_verifier / code_challenge)**: hai chuỗi ngẫu nhiên chống giả mạo.
`state` đảm bảo kết quả trả về đúng là của lần đăng nhập mình vừa mở; PKCE đảm bảo chỉ chương
trình đã mở luồng mới đổi được authorization code thành token.

---

## 2. Luồng A: đăng nhập Tori

```
Trình duyệt                    Tori (VD calendar.tori.com)              Google
    │  bấm "Đăng nhập"                │                                    │
    │ ───────────────────────────────>│ /api/auth/login                    │
    │ <─ chuyển hướng sang Google ────│ (kèm client_id, scope, state,      │
    │                                 │  redirect_uri=.../api/auth/callback)
    │ ─────────────────────────────────────────────────────────────────── >│ chọn tài khoản,
    │                                 │                                    │ Google kiểm tra
    │ <── chuyển về redirect_uri?code=...&state=... ───────────────────────│ email có trong
    │ ───────────────────────────────>│ /api/auth/callback                 │ Test users
    │                                 │ ── đổi code + client_secret ──────>│
    │                                 │ <─ ID token (email, tên, ảnh) ─────│
    │                                 │ kiểm tra email đã xác minh,        │
    │ <── Set-Cookie: tori_session ───│ ghi vào cookie phiên (đã ký)       │
```

- Tori không giữ token Google nào. Sau khi đọc được email/tên, Tori chỉ giữ **cookie phiên của
  chính nó** (`tori_session`), được ký bằng `SECRET_KEY` nên không sửa tay được.
- Cookie gắn với domain gốc (`tori.com`) nên hub và mọi app dùng chung: đăng nhập một nơi là
  đăng nhập tất cả, đăng xuất cũng vậy. (Chạy local qua `localhost` thì trình duyệt không chia
  cookie sang `*.localhost`, nên mỗi subdomain đăng nhập riêng; dùng `TORI_DOMAIN=tori.test`
  để local giống server, xem README.)
- Project đăng nhập để ở **Testing**: chỉ email trong *Test users* đăng nhập được. Đây chính là
  "danh sách người được vào Tori". Scope chỉ có tên/email/hồ sơ nên không bị giới hạn 7 ngày.
- Mỗi app có trang callback riêng (`https://<app>.tori.com/api/auth/callback`), nên phải khai
  báo đủ trong *Authorized redirect URIs* của client đăng nhập; thiếu thì Google báo
  `redirect_uri_mismatch`.
- `TORI_ENV=dev` và chưa có `GOOGLE_CLIENT_ID`: không qua Google, gõ email bất kỳ để đăng nhập
  dev. Ở prod nút này bị tắt.

Code: `packages/tori-core/src/tori_core/auth.py`, `app.py` (cookie).

---

## 3. Luồng B: app Bản tin đọc Gmail

### 3.1. Cấp quyền một lần (`scripts/gmail_auth.py`, chạy trên máy bạn)

```
Script trên máy bạn                       Trình duyệt                  Google
  │ đọc ~/.config/tori/gmail-client.json      │                          │
  │ (client ID/secret loại Desktop app)       │                          │
  │ mở cổng tạm 127.0.0.1:<cổng ngẫu nhiên>   │                          │
  │ tạo state + PKCE                          │                          │
  │ ── mở link xin quyền gmail.readonly ─────>│ ────────────────────────>│
  │    (access_type=offline: xin refresh token│  đăng nhập, cảnh báo     │
  │     prompt=consent: luôn cấp token mới)   │  "chưa xác minh",        │
  │                                           │  bấm Allow               │
  │ <── 127.0.0.1:<cổng>/?code=...&state=... ─│ <────────────────────────│
  │ ── đổi code + client_secret + code_verifier ────────────────────────>│
  │ <── access token + REFRESH TOKEN ────────────────────────────────────│
  │ in ra 3 dòng GMAIL_* để bạn chép vào .env                             │
```

Sau bước này Google ghi nhận: "client `tori-gmail-desktop` được đọc Gmail của tài khoản X".
Refresh token là bằng chứng của việc đó.

### 3.2. Mỗi lần quét (server, 06:50, 08:15 và 18:30 hoặc nút "Quét ngay")

```
App news                                                  Google
  │ ── POST oauth2.googleapis.com/token ───────────────────>│
  │    (client_id, client_secret, refresh_token)            │
  │ <── access token (~1 giờ) ──────────────────────────────│
  │ ── GET gmail/v1/users/me/messages?q=                   >│
  │      from:no-reply-claude@mail.anthropic.com            │
  │      subject:"Bản tin" after:<bản tin đầu tiên>         │
  │ <── danh sách id email ─────────────────────────────────│
  │ ── GET messages/<id>?format=raw (email chưa có trong DB)>│
  │ <── nội dung email ─────────────────────────────────────│
  │ tách markdown, lưu SQLite                               │
```

- Server không cần trình duyệt, không cần bạn bấm gì: refresh token đủ để xin access token mới.
- Access token không được lưu; mỗi lần quét xin cái mới.
- Nếu Google từ chối refresh token (`invalid_grant`), trang Bản tin báo "Mất quyền đọc Gmail".

Code: `apps/news/backend/src/news/gmail.py` (gọi Google), `sync.py` (lịch quét, lưu DB),
`parser.py` (tách nội dung email).

### 3.3. Ai xem được bản tin

Bản tin nằm trong DB của app, không phải trong Gmail. Ai đăng nhập Tori (luồng A) **và** có email
trong `NEWS_OWNER_EMAILS` thì xem được. Người đó không cần, và cũng không được, đụng tới Gmail.

---

## 4. Vì sao phải dùng hai project

Một project chỉ có một trạng thái publish, mà hai luồng cần hai trạng thái ngược nhau:

- Luồng B cần **In production**, nếu không refresh token Gmail chết sau 7 ngày.
- Luồng A cần **Testing**, vì *Test users* đang là danh sách người được vào Tori. Chuyển project
  đăng nhập sang production thì mọi tài khoản Google đều đăng nhập được.

Tách hai project thì mỗi bên giữ trạng thái mình cần.

## 5. Những thứ bạn đã điền và để làm gì

| Bước | Để làm gì |
|---|---|
| Bật Gmail API | Project phải bật API thì mới gọi được Gmail |
| Branding (tên, email, trang chủ, privacy policy, authorized domains) | Google bắt buộc có trước khi cho publish; tên app hiện trên màn hình xin quyền |
| Audience: External + Test users + Publish | Cho tài khoản Gmail của bạn cấp quyền, và để refresh token không hết hạn sau 7 ngày |
| Data access: `gmail.readonly` | Khai báo trước scope app sẽ xin; chỉ đọc |
| Client loại Desktop app, tải JSON | Danh tính cho script `gmail_auth.py`; không cần khai redirect URI |
| Chạy `gmail_auth.py`, bấm Advanced → Allow | Bước cấp quyền thật sự, sinh ra refresh token |
| 3 dòng `GMAIL_*` trong `.env` | Để server tự xin access token khi quét |
| `NEWS_OWNER_EMAILS` | Giới hạn ai đọc được bản tin trên web |

## 6. Bí mật và rủi ro

| Thứ | Ở đâu | Lộ ra thì sao |
|---|---|---|
| `GMAIL_REFRESH_TOKEN` (cùng client ID/secret) | `.env` ở máy và VPS | **Người có nó đọc được toàn bộ Gmail của bạn** cho đến khi bạn thu hồi. Quan trọng nhất |
| File JSON của client Gmail | `~/.config/tori/gmail-client.json` | Ít nguy hiểm (không có quyền gì nếu không có refresh token), nhưng không commit |
| `GOOGLE_CLIENT_SECRET` (đăng nhập) | `.env` | Người khác giả danh được app đăng nhập của bạn; không đọc được dữ liệu của bạn |
| `SECRET_KEY` | `.env` | Người khác làm giả được cookie phiên, đăng nhập Tori với email bất kỳ |

`.env` nằm trong `.gitignore`. Đừng dán refresh token vào chat, issue hay commit.

**Thu hồi quyền đọc Gmail**: <https://myaccount.google.com/permissions> → chọn app Gmail của
Tori → *Remove access*. Refresh token chết ngay.

**Refresh token mất hiệu lực khi**: bạn thu hồi quyền như trên; đổi mật khẩu Google (với scope
Gmail); 6 tháng không dùng (không xảy ra vì ngày nào cũng quét); cùng một client cấp quá 100
refresh token cho một tài khoản (cái cũ nhất bị huỷ, nên đừng chạy `gmail_auth.py` liên tục).
Khi đó: chạy lại `uv run scripts/gmail_auth.py`, thay `GMAIL_REFRESH_TOKEN` trong `.env`, rồi
`docker compose up -d news`.
