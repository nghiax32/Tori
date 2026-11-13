"""Đọc Gmail qua REST API (quyền gmail.readonly), dùng refresh token lấy bằng scripts/gmail_auth.py."""

import base64

import httpx

TOKEN_URL = "https://oauth2.googleapis.com/token"
API = "https://gmail.googleapis.com/gmail/v1/users/me"


class GmailAuthError(Exception):
    """Refresh token hết hạn hoặc bị thu hồi: phải chạy lại scripts/gmail_auth.py."""


class GmailClient:
    def __init__(self, client_id: str, client_secret: str, refresh_token: str, http: httpx.Client | None = None):
        self._creds = {"client_id": client_id, "client_secret": client_secret, "refresh_token": refresh_token}
        self._http = http or httpx.Client(timeout=30)
        self._token: str | None = None

    def _access_token(self) -> str:
        if self._token is None:
            r = self._http.post(TOKEN_URL, data={**self._creds, "grant_type": "refresh_token"})
            if r.status_code in (400, 401) and r.json().get("error") in ("invalid_grant", "unauthorized_client"):
                raise GmailAuthError(
                    "Mất quyền đọc Gmail (refresh token hết hạn hoặc bị thu hồi). "
                    "Chạy lại scripts/gmail_auth.py rồi cập nhật GMAIL_REFRESH_TOKEN."
                )
            r.raise_for_status()
            self._token = r.json()["access_token"]
        return self._token

    def _get(self, path: str, **params) -> dict:
        r = self._http.get(f"{API}{path}", params=params, headers={"Authorization": f"Bearer {self._access_token()}"})
        r.raise_for_status()
        return r.json()

    def search(self, query: str, limit: int = 20) -> list[str]:
        """Id các email khớp bộ lọc (mới nhất trước)."""
        return [m["id"] for m in self._get("/messages", q=query, maxResults=limit).get("messages", [])]

    def raw(self, message_id: str) -> bytes:
        """Toàn bộ email dạng RFC 822."""
        data = self._get(f"/messages/{message_id}", format="raw")["raw"]
        return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))
