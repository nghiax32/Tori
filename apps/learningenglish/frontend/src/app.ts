import { api, h } from "@tori/ui";
import type { ModeMount } from "./common";
import { mount as daily } from "./daily";
import { mount as fill } from "./fill";
import { mount as listen } from "./listen";
import { mount as match } from "./match";

/** Học Tiếng Anh: số liệu học tập ở trên, các chế độ chơi theo tab. Mọi chế độ (trừ Từ của ngày) dùng chung kho từ
 * và lịch ôn, nên từ sai ở chế độ này sẽ được ôn lại ở chế độ khác. */

interface Stats {
  total: number;
  seen: number;
  learned: number;
  due: number;
  streak: number;
}

const MODES: { id: string; label: string; mount: ModeMount }[] = [
  { id: "match", label: "Ghép cặp", mount: match },
  { id: "listen", label: "Nghe – chép", mount: listen },
  { id: "fill", label: "Điền vào câu", mount: fill },
  { id: "daily", label: "Từ của ngày", mount: daily },
];
const MODE_KEY = "learningenglish.mode";

function loadMode(): string {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v && MODES.some((m) => m.id === v)) return v;
  } catch {
    /* trình duyệt chặn localStorage */
  }
  return MODES[0].id;
}

function saveMode(id: string): void {
  try {
    localStorage.setItem(MODE_KEY, id);
  } catch {
    /* bỏ qua */
  }
}

export function mount(root: HTMLElement): () => void {
  let alive = true;
  let cleanup: (() => void) | null = null;

  const statsEl = h("div", { class: "eng__stats" });
  const tabsEl = h("div", { class: "eng__tabs", role: "tablist", "aria-label": "Chế độ" });
  const stageEl = h("div", { class: "card eng__stage", role: "tabpanel" });
  const sideEl = h("div", { class: "eng__side" });

  root.replaceChildren(
    h(
      "section",
      { class: "eng" },
      h("h1", { class: "eng__title" }, "Học Tiếng Anh"),
      statsEl,
      tabsEl,
      h("div", { class: "eng__body" }, stageEl, sideEl),
    ),
  );

  const stat = (value: string | number, label: string) =>
    h("div", { class: "eng__stat" }, h("strong", {}, String(value)), h("span", { class: "muted" }, label));

  const loadStats = async () => {
    const s = await api.get<Stats>("/api/english/stats").catch(() => null);
    if (!s || !alive) return;
    statsEl.replaceChildren(
      stat(`${s.seen}/${s.total}`, "từ đã học"),
      stat(s.learned, "từ đã thuộc"),
      stat(s.due, "cần ôn hôm nay"),
      stat(s.streak ? `${s.streak} 🔥` : 0, "ngày liên tiếp"),
    );
  };

  const open = (id: string) => {
    cleanup?.();
    saveMode(id);
    tabsEl.replaceChildren(
      ...MODES.map((m) =>
        h(
          "button",
          {
            type: "button",
            role: "tab",
            class: "eng__tab",
            "aria-selected": String(m.id === id),
            onclick: () => m.id !== id && open(m.id),
          },
          m.label,
        ),
      ),
    );
    stageEl.replaceChildren();
    sideEl.replaceChildren();
    cleanup = MODES.find((m) => m.id === id)!.mount({ stage: stageEl, side: sideEl, refreshStats: () => void loadStats() });
  };

  open(loadMode());
  void loadStats();

  return () => {
    alive = false;
    cleanup?.();
  };
}
