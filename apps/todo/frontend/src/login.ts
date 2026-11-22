import { api, h, type AuthConfig } from "@tori/ui";

export function renderLogin(root: HTMLElement, cfg: AuthConfig): void {
  const failed = new URLSearchParams(location.search).has("login_error");

  const devEmail = h("input", { type: "email", value: "dev@example.com", required: true }) as HTMLInputElement;
  const devError = h("p", { class: "error-text" });
  const devForm = h(
    "form",
    {
      class: "login-dev",
      onsubmit: async (e: Event) => {
        e.preventDefault();
        try {
          await api.post("/api/auth/dev-login", { email: devEmail.value.trim() });
          location.reload();
        } catch (err) {
          devError.textContent = (err as Error).message;
        }
      },
    },
    h("label", { class: "field" }, h("span", {}, "Chế độ dev: đăng nhập không cần Google"), devEmail),
    h("button", { class: "btn", type: "submit" }, "Đăng nhập dev"),
    devError,
  );

  root.replaceChildren(
    h(
      "div",
      { class: "login-wrap" },
      h(
        "div",
        { class: "card login-card" },
        h("div", { class: "login-icon", "aria-hidden": "true" }, "✅"),
        h("h1", {}, "Việc cần làm"),
        h("p", { class: "muted" }, "Đăng nhập để lưu danh sách việc cần làm của bạn."),
        failed ? h("p", { class: "error-text" }, "Đăng nhập Google không thành công. Bạn thử lại nhé.") : null,
        cfg.google
          ? h(
              "a",
              { class: "btn btn-primary login-google", href: "/api/auth/login?next=/" },
              "Đăng nhập với Google",
            )
          : null,
        cfg.dev ? devForm : null,
        !cfg.google && !cfg.dev
          ? h("p", { class: "error-text" }, "Chưa cấu hình Google OAuth (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET).")
          : null,
      ),
    ),
  );
}
