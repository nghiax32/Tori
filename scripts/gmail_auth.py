"""Lấy refresh token Gmail (chỉ đọc) cho app Bản tin. Chạy trên máy có trình duyệt:

    uv run scripts/gmail_auth.py [đường-dẫn-client.json]

Mặc định đọc ~/.config/tori/gmail-client.json: file JSON tải về khi tạo OAuth client loại
"Desktop app" (xem docs/deploy.md, mục Gmail). Script mở trình duyệt để bạn cấp quyền, rồi in
3 dòng GMAIL_* để chép vào .env. Refresh token là bí mật: chỉ để trong .env, không commit.
"""

import base64
import hashlib
import http.server
import json
import secrets
import sys
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path

SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
DEFAULT_CLIENT = Path.home() / ".config" / "tori" / "gmail-client.json"


def main() -> None:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CLIENT
    if not path.is_file():
        sys.exit(f"Không thấy {path}. Tải JSON của OAuth client (Desktop app) về đường dẫn này.")
    client = json.loads(path.read_text())
    if "installed" not in client:
        sys.exit("File JSON không phải OAuth client loại Desktop app.")
    client_id, client_secret = client["installed"]["client_id"], client["installed"]["client_secret"]

    # Google nhận kết quả cấp quyền về một cổng tạm trên máy này (cho phép sẵn với client Desktop app)
    result: dict[str, str] = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            query = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(self.path).query))
            if "code" not in query and "error" not in query:
                self.send_response(404)
                self.end_headers()
                return
            result.update(query)
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write("Xong, quay lại terminal. Có thể đóng tab này.".encode())

        def log_message(self, *_):
            pass

    server = http.server.HTTPServer(("127.0.0.1", 0), Handler)
    redirect_uri = f"http://127.0.0.1:{server.server_port}/"
    state = secrets.token_urlsafe(16)
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    url = AUTH_URL + "?" + urllib.parse.urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": SCOPE,
            "access_type": "offline",  # để nhận refresh token
            "prompt": "consent",  # luôn cấp refresh token mới, kể cả khi đã cấp quyền trước đó
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
    )
    print("Mở trình duyệt để cấp quyền đọc Gmail. Nếu trình duyệt không tự mở, vào link này:\n")
    print(url, "\n")
    print('Gặp "Google hasn\'t verified this app": bấm Advanced -> Go to ... (unsafe) -> Allow.\n')
    webbrowser.open(url)
    while not result:
        server.handle_request()
    server.server_close()

    if result.get("state") != state:
        sys.exit("Sai state, huỷ.")
    if "error" in result:
        sys.exit(f"Google trả lỗi: {result['error']}")

    body = urllib.parse.urlencode(
        {
            "code": result["code"],
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
            "code_verifier": verifier,
        }
    ).encode()
    with urllib.request.urlopen(urllib.request.Request(TOKEN_URL, data=body)) as resp:
        token = json.load(resp)
    if "refresh_token" not in token:
        sys.exit("Google không trả refresh token. Thu hồi quyền ở myaccount.google.com/permissions rồi chạy lại.")

    print("Thêm (hoặc thay) 3 dòng sau trong .env, ở máy và trên VPS:\n")
    print(f"GMAIL_CLIENT_ID={client_id}")
    print(f"GMAIL_CLIENT_SECRET={client_secret}")
    print(f"GMAIL_REFRESH_TOKEN={token['refresh_token']}")


if __name__ == "__main__":
    main()
