import "@tori/ui/style.css";
import "./style.css";
import { api, ApiError, getMeta, h, mountHeader, type AuthConfig, type Me } from "@tori/ui";

type Edition = "morning" | "evening";

interface BulletinSummary {
  id: number;
  edition: Edition;
  bulletin_date: string;
  title: string;
}

interface Bulletin extends BulletinSummary {
  html: string;
  received_at: string;
}

interface Status {
  configured: boolean;
  last_run_at: string | null;
  last_ok: boolean | null;
  last_error: string | null;
  last_added: number;
  next_run_at: string | null;
}

const EDITION: Record<Edition, string> = { morning: "☀️ Sáng", evening: "🌙 Tối" };
const WEEKDAYS = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];

/** "2026-11-13" -> "Thứ sáu, 13/11/2026" */
function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

/** Giờ Việt Nam, VD "08:00 13/11" */
function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

class NewsView {
  private items: BulletinSummary[] = [];
  private selectedId: number | null = null;
  private query = "";
  private loadSeq = 0;
  private readonly list = h("nav", { class: "news-list card", "aria-label": "Các bản tin" });
  private readonly reader = h("article", { class: "news-reader card" });
  private readonly status = h("div", { class: "news-status" });
  private readonly syncBtn = h("button", { class: "btn btn-sm", type: "button" }, "Quét ngay") as HTMLButtonElement;

  constructor(private readonly root: HTMLElement) {
    // Bản tin đang đọc và ô tìm kiếm nằm trên URL (?id=12&tim=nvidia) để F5 vẫn giữ nguyên
    const params = new URLSearchParams(location.search);
    this.selectedId = Number(params.get("id")) || null;
    this.query = params.get("tim")?.trim() ?? "";
  }

  start(): void {
    let timer: number | undefined;
    const search = h("input", {
      class: "input",
      type: "search",
      placeholder: "Tìm trong bản tin, VD: nvidia, lãi suất",
      "aria-label": "Tìm trong bản tin",
      value: this.query,
    }) as HTMLInputElement;
    search.addEventListener("input", () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        this.query = search.value.trim();
        this.syncUrl();
        void this.loadList();
      }, 200);
    });

    this.syncBtn.addEventListener("click", async () => {
      this.syncBtn.disabled = true;
      this.syncBtn.textContent = "Đang quét…";
      try {
        this.renderStatus(await api.post<Status>("/api/sync"));
        await this.loadList();
      } finally {
        this.syncBtn.disabled = false;
        this.syncBtn.textContent = "Quét ngay";
      }
    });

    this.root.replaceChildren(
      h(
        "div",
        { class: "news" },
        h("div", { class: "news-toolbar" }, h("div", { class: "news-search" }, search), this.status, this.syncBtn),
        h("div", { class: "news-layout" }, this.list, this.reader),
      ),
    );
    void api.get<Status>("/api/status").then((s) => this.renderStatus(s));
    void this.loadList();
  }

  private syncUrl(): void {
    const url = new URL(location.href);
    if (this.selectedId) url.searchParams.set("id", String(this.selectedId));
    else url.searchParams.delete("id");
    if (this.query) url.searchParams.set("tim", this.query);
    else url.searchParams.delete("tim");
    history.replaceState(history.state, "", url);
  }

  private renderStatus(s: Status): void {
    const parts: (Node | string)[] = [];
    if (!s.configured) {
      parts.push(h("span", { class: "error-text" }, "Chưa cấu hình Gmail. Xem docs/deploy.md, mục Gmail."));
    } else if (s.last_ok === false && s.last_error) {
      parts.push(h("span", { class: "error-text" }, s.last_error));
    } else if (s.last_run_at) {
      parts.push(`Quét lúc ${timeLabel(s.last_run_at)}` + (s.last_added ? `, thêm ${s.last_added} bản tin` : ""));
    }
    if (s.next_run_at) parts.push(h("span", { class: "muted" }, `Lần tới: ${timeLabel(s.next_run_at)}`));
    this.status.replaceChildren(...parts.flatMap((p, i) => (i ? [" · ", p] : [p])));
  }

  private async loadList(): Promise<void> {
    const seq = ++this.loadSeq;
    const items = await api.get<BulletinSummary[]>("/api/bulletins", { q: this.query });
    if (seq !== this.loadSeq) return;
    this.items = items;
    if (!items.some((b) => b.id === this.selectedId)) this.selectedId = items[0]?.id ?? null;
    this.renderList();
    await this.loadBulletin();
  }

  private renderList(): void {
    if (!this.items.length) {
      this.list.replaceChildren(
        h("p", { class: "muted news-empty" }, this.query ? "Không có bản tin nào khớp." : "Chưa có bản tin nào."),
      );
      return;
    }
    // Gom theo ngày: mỗi ngày một dòng, nút Sáng / Tối
    const days = new Map<string, BulletinSummary[]>();
    for (const b of this.items) days.set(b.bulletin_date, [...(days.get(b.bulletin_date) ?? []), b]);
    this.list.replaceChildren(
      h(
        "ul",
        { class: "news-days" },
        ...[...days].map(([day, bulletins]) =>
          h(
            "li",
            { class: "news-day" },
            h("span", { class: "news-day__date" }, dayLabel(day)),
            h(
              "span",
              { class: "news-day__editions" },
              ...(["morning", "evening"] as Edition[]).map((edition) => {
                const b = bulletins.find((x) => x.edition === edition);
                if (!b) return h("span", { class: "news-edition news-edition--none" }, EDITION[edition]);
                return h(
                  "button",
                  {
                    type: "button",
                    class: `news-edition${b.id === this.selectedId ? " is-active" : ""}`,
                    "aria-pressed": b.id === this.selectedId ? "true" : "false",
                    title: b.title,
                    onclick: () => {
                      this.selectedId = b.id;
                      this.renderList();
                      void this.loadBulletin(true);
                    },
                  },
                  EDITION[edition],
                );
              }),
            ),
          ),
        ),
      ),
    );
  }

  private async loadBulletin(scroll = false): Promise<void> {
    this.syncUrl();
    if (!this.selectedId) {
      this.reader.replaceChildren(h("p", { class: "muted" }, "Chọn một bản tin để đọc."));
      return;
    }
    const id = this.selectedId;
    const b = await api.get<Bulletin>(`/api/bulletins/${id}`);
    if (id !== this.selectedId) return;
    const body = h("div", { class: "news-body" });
    body.innerHTML = b.html; // HTML do backend dựng từ markdown: đã escape HTML trong bài, chặn link javascript:
    this.reader.replaceChildren(
      h("h1", { class: "news-title" }, b.title),
      h("p", { class: "muted news-meta" }, `${EDITION[b.edition]} · nhận lúc ${timeLabel(b.received_at)}`),
      body,
    );
    if (scroll) this.reader.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

/** Google nếu đã cấu hình; không thì đăng nhập dev (chỉ có ở TORI_ENV=dev) */
async function login(auth: AuthConfig): Promise<void> {
  if (auth.google) {
    location.href = `/api/auth/login?next=${encodeURIComponent(location.pathname + location.search)}`;
    return;
  }
  const email = prompt("Chế độ dev: đăng nhập không cần Google. Email:", "dev@example.com")?.trim();
  if (!email) return;
  await api.post("/api/auth/dev-login", { email });
  location.reload();
}

async function boot() {
  const main = document.getElementById("main")!;
  const [meta, auth, me] = await Promise.all([
    getMeta(),
    api.get<AuthConfig>("/api/auth/config"),
    api.get<Me>("/api/auth/me").catch((e) => {
      if (e instanceof ApiError && e.status === 401) return null;
      throw e;
    }),
  ]);
  mountHeader(document.getElementById("header")!, {
    hubUrl: meta.hub_url,
    appName: "Bản tin",
    user: me,
    onLogout: async () => {
      await api.post("/api/auth/logout");
      location.reload();
    },
    onLogin: auth.google || auth.dev ? () => void login(auth) : undefined,
  });

  if (!me) {
    main.replaceChildren(h("p", { class: "muted news-gate" }, "Đăng nhập để xem bản tin."));
    return;
  }
  try {
    await api.get<Status>("/api/status");
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) {
      main.replaceChildren(h("p", { class: "muted news-gate" }, e.message));
      return;
    }
    throw e;
  }
  new NewsView(main).start();
}

boot().catch((err: Error) => {
  document.getElementById("main")!.replaceChildren(h("p", { class: "error-text" }, `Không tải được: ${err.message}`));
});
