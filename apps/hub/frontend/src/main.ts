import "@tori/ui/style.css";
import "./style.css";
import { api, ApiError, getMeta, h, mountHeader, type AuthConfig, type Me } from "@tori/ui";

interface AppInfo {
  name: string;
  title: string;
  description: string;
  icon: string;
  url: string;
}

/** Google nếu đã cấu hình; không thì đăng nhập dev (chỉ có ở TORI_ENV=dev) */
async function login(auth: AuthConfig): Promise<void> {
  if (auth.google) {
    location.href = "/api/auth/login?next=/";
    return;
  }
  const email = prompt("Chế độ dev: đăng nhập không cần Google. Email:", "dev@example.com")?.trim();
  if (!email) return;
  await api.post("/api/auth/dev-login", { email });
  location.reload();
}

async function boot() {
  const main = document.getElementById("main")!;
  const [meta, apps, auth, me] = await Promise.all([
    getMeta(),
    api.get<AppInfo[]>("/api/apps"),
    api.get<AuthConfig>("/api/auth/config"),
    // Phiên đăng nhập dùng chung với các app: đã đăng nhập ở app nào thì hub cũng thấy
    api.get<Me>("/api/auth/me").catch((e) => {
      if (e instanceof ApiError && e.status === 401) return null;
      throw e;
    }),
  ]);
  mountHeader(document.getElementById("header")!, {
    hubUrl: meta.hub_url,
    user: me,
    onLogout: async () => {
      await api.post("/api/auth/logout");
      location.reload();
    },
    onLogin: auth.google || auth.dev ? () => void login(auth) : undefined,
  });

  main.replaceChildren(
    h(
      "section",
      { class: "hub" },
      h("h1", { class: "hub__title" }, "Tiện ích"),
      apps.length
        ? h(
            "div",
            { class: "hub__grid" },
            ...apps.map((a) =>
              h(
                "a",
                { class: "card hub__card", href: a.url },
                h("div", { class: "hub__icon", "aria-hidden": "true" }, a.icon || "◻️"),
                h("h2", {}, a.title),
                h("p", { class: "muted" }, a.description),
              ),
            ),
          )
        : h("p", { class: "muted" }, "Chưa có ứng dụng nào."),
    ),
  );
}

boot().catch((err: Error) => {
  document.getElementById("main")!.replaceChildren(h("p", { class: "error-text" }, `Không tải được: ${err.message}`));
});
