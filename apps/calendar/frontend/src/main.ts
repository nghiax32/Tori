import "@tori/ui/style.css";
import "./style.css";
import { api, ApiError, getMeta, h, mountHeader, type AuthConfig, type Me } from "@tori/ui";
import { CalendarView } from "./calendar-view";
import { renderLogin } from "./login";

async function boot() {
  const header = document.getElementById("header")!;
  const main = document.getElementById("main")!;

  const meta = await getMeta();
  let me: Me | null = null;
  try {
    me = await api.get<Me>("/api/auth/me");
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 401)) throw e;
  }

  mountHeader(header, {
    hubUrl: meta.hub_url,
    appName: "Calendar",
    user: me,
    onLogout: async () => {
      await api.post("/api/auth/logout");
      location.href = "/";
    },
  });

  if (!me) {
    renderLogin(main, await api.get<AuthConfig>("/api/auth/config"));
    return;
  }
  new CalendarView(main).start();
}

boot().catch((err: Error) => {
  document.getElementById("main")!.replaceChildren(
    h("p", { class: "error-text" }, `Không tải được ứng dụng: ${err.message}`),
  );
});
