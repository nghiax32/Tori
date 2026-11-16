import "@tori/ui/style.css";
import "./style.css";
import { api, ApiError, getMeta, h, mountHeader, type AuthConfig, type Me } from "@tori/ui";
import { GAMES } from "./games/registry";
import { renderLobby } from "./lobby";
import { renderLogin } from "./login";

/** Định tuyến bằng hash (#/sudoku): server chỉ cần phục vụ index.html ở "/". */
function startRouter(main: HTMLElement): void {
  let cleanup: (() => void) | null = null;
  let seq = 0;
  const route = async () => {
    const run = ++seq;
    cleanup?.();
    cleanup = null;
    const id = location.hash.replace(/^#\/?/, "");
    const game = GAMES.find((g) => g.id === id);
    if (!game) {
      renderLobby(main);
      document.title = "Trò chơi";
      return;
    }
    main.replaceChildren(h("p", { class: "muted" }, "Đang tải…"));
    const mod = await game.load();
    if (run !== seq) return; // đã chuyển trang khác trong lúc tải
    document.title = `${game.name} · Trò chơi`;
    cleanup = mod.mount(main);
  };
  window.addEventListener("hashchange", () => void route().catch(showError));
  void route().catch(showError);
}

function showError(err: Error): void {
  document.getElementById("main")!.replaceChildren(
    h("p", { class: "error-text" }, `Không tải được ứng dụng: ${err.message}`),
  );
}

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
    appName: "Trò chơi",
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
  startRouter(main);
}

boot().catch(showError);
