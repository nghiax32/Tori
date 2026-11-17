import { h } from "@tori/ui";

/** Phần dùng chung giữa các game: thanh tiêu đề, nút chọn mức, lưu lựa chọn. */

export type Level = "easy" | "medium" | "hard";
export const LEVELS: [Level, string][] = [
  ["easy", "Dễ"],
  ["medium", "Vừa"],
  ["hard", "Khó"],
];
export const levelName = (level: Level) => LEVELS.find(([v]) => v === level)![1];

const BACK_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>';

/** Thanh trên cùng: nút quay lại danh sách trò chơi bên trái, tên game giữa trang */
export function gameTop(title: string): HTMLElement {
  const back = h("a", {
    class: "btn btn-icon game-top__back",
    href: "#/",
    "aria-label": "Về danh sách trò chơi",
    title: "Về danh sách trò chơi",
  });
  back.innerHTML = BACK_ICON; // chuỗi SVG tĩnh
  return h("div", { class: "game-top" }, back, h("h1", { class: "game-top__title" }, title));
}

/** Nút chọn Dễ / Vừa / Khó */
export function levelPicker(name: string, onPick: (level: Level) => void) {
  const inputs = new Map<Level, HTMLInputElement>();
  const el = h(
    "div",
    { class: "segmented", role: "radiogroup" },
    LEVELS.map(([value, label]) => {
      const input = h("input", { type: "radio", name, value, onchange: () => onPick(value) }) as HTMLInputElement;
      inputs.set(value, input);
      return h("label", {}, input, h("span", {}, label));
    }),
  );
  return { el, set: (level: Level) => (inputs.get(level)!.checked = true) };
}

/** Mức đã chọn lần trước (localStorage có thể bị chặn: khi đó dùng mặc định) */
export function loadLevel(key: string, fallback: Level = "easy"): Level {
  try {
    const v = localStorage.getItem(key);
    if (v === "easy" || v === "medium" || v === "hard") return v;
  } catch {
    /* trình duyệt chặn localStorage */
  }
  return fallback;
}

export function saveLevel(key: string, level: Level): void {
  try {
    localStorage.setItem(key, level);
  } catch {
    /* bỏ qua */
  }
}

export interface RankRow {
  rank: number;
  name: string;
  me: boolean;
}

/** Vẽ bảng xếp hạng vào `el`: top N, kèm dòng của bạn ở cuối nếu bạn ngoài top. `data` null = tải lỗi. */
export function renderRanks<T extends RankRow>(
  el: HTMLElement,
  data: { top: T[]; mine: T | null } | null,
  value: (row: T) => string,
  emptyText: string,
): void {
  if (!data) {
    el.replaceChildren(h("p", { class: "error-text" }, "Không tải được bảng xếp hạng."));
    return;
  }
  const row = (x: T) =>
    h(
      "li",
      { class: `rank-list__row${x.me ? " is-me" : ""}` },
      h("span", { class: "rank-list__no" }, String(x.rank)),
      h("span", { class: "rank-list__name" }, x.name, x.me ? h("small", {}, " (bạn)") : null),
      h("span", { class: "rank-list__time" }, value(x)),
    );
  const inTop = data.top.some((x) => x.me);
  el.replaceChildren(
    data.top.length
      ? h("ol", {}, data.top.map(row), !inTop && data.mine ? [h("li", { class: "rank-list__gap" }, "…"), row(data.mine)] : null)
      : h("p", { class: "muted" }, emptyText),
  );
}
