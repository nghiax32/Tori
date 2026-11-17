import { api, h } from "@tori/ui";

/** Phần dùng chung giữa các chế độ học tiếng Anh. */

export interface Word {
  id: number;
  word: string;
  ipa: string;
  meaning: string;
}

export interface ReviewedWord {
  word: string;
  ipa: string;
  meaning: string;
  new: boolean;
  correct: boolean;
  next_days: number;
}

/** Mỗi chế độ vẽ vào `stage` (khung chính) và `side` (cột phải; để trống thì cột ẩn đi) */
export interface ModeCtx {
  stage: HTMLElement;
  side: HTMLElement;
  /** Gọi sau khi xong lượt để cập nhật các ô số liệu phía trên */
  refreshStats(): void;
}
export type ModeMount = (ctx: ModeCtx) => () => void;

// ---------- phát âm (Web Speech API của trình duyệt, không cần server) ----------

const SOUND_KEY = "learningenglish.sound";
export const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

export function soundOn(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

function setSound(on: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    /* bỏ qua */
  }
}

/** Đọc to một từ tiếng Anh (ưu tiên giọng tiếng Anh có sẵn trên máy); `rate` < 1 là đọc chậm */
export function speak(text: string, rate = 0.9): void {
  if (!canSpeak) return;
  const synth = window.speechSynthesis;
  synth.cancel(); // đang đọc từ trước thì dừng, đọc từ mới
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = rate;
  const voice = synth.getVoices().find((v) => v.lang === "en-US") ?? synth.getVoices().find((v) => v.lang.startsWith("en"));
  if (voice) u.voice = voice;
  synth.speak(u);
}

/** Nút 🔊/🔇 bật tắt tự đọc từ (lựa chọn được nhớ trên trình duyệt) */
export function soundToggle(): HTMLButtonElement {
  const btn = h("button", { type: "button", class: "btn btn-sm btn-icon eng__sound" }) as HTMLButtonElement;
  const paint = () => {
    const on = soundOn();
    btn.textContent = on ? "🔊" : "🔇";
    const label = on ? "Đang bật tự đọc từ (bấm để tắt)" : "Đang tắt tự đọc từ (bấm để bật)";
    btn.setAttribute("aria-label", label);
    btn.title = label;
  };
  btn.addEventListener("click", () => {
    setSound(!soundOn());
    paint();
  });
  paint();
  return btn;
}

/** Từ tiếng Anh bấm vào để nghe (trình duyệt không đọc được thì chỉ là chữ đậm) */
export function sayable(word: string): HTMLElement {
  return canSpeak
    ? h("button", { type: "button", class: "eng__say", lang: "en", title: "Nghe phát âm", onclick: () => speak(word) }, word, " 🔊")
    : h("strong", { lang: "en" }, word);
}

// ---------- tiện ích ----------

/** 12345 ms -> "0:12.3" */
export function formatMs(ms: number): string {
  const tenths = Math.floor(ms / 100);
  const s = Math.floor(tenths / 10);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}.${tenths % 10}`;
}

/** 84 giây -> "1:24" */
export function formatSeconds(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const nextLabel = (days: number) => (days === 0 ? "ôn lại hôm nay" : days === 1 ? "ôn lại ngày mai" : `ôn lại sau ${days} ngày`);

/** Danh sách từ đã làm trong lượt: đúng/sai, nghĩa, phiên âm, khi nào ôn lại */
export function reviewList(words: ReviewedWord[]): HTMLElement {
  return h(
    "ul",
    { class: "eng__review" },
    words.map((w) =>
      h(
        "li",
        { class: w.correct ? "" : "is-wrong" },
        h("span", { class: "eng__review-mark" }, w.correct ? "✓" : "✗"),
        sayable(w.word),
        h("span", {}, w.meaning),
        h(
          "small",
          { class: "muted" },
          w.ipa ? h("span", { class: "eng__ipa" }, w.ipa) : null,
          `${w.ipa ? " · " : ""}${w.new ? "từ mới · " : ""}${nextLabel(w.next_days)}`,
        ),
      ),
    ),
  );
}

/** Màn bắt đầu của một chế độ: tiêu đề, giới thiệu, chọn chủ đề (nếu có), lỗi (nếu có), nút Bắt đầu */
export function intro(
  stage: HTMLElement,
  title: string,
  text: string,
  onStart: () => void,
  error = "",
  picker: TopicPicker | null = null,
): void {
  stage.replaceChildren(
    h("h2", {}, title),
    h("p", { class: "muted" }, text),
    ...(picker ? [picker.el] : []),
    h("p", { class: "error-text" }, error), // trống thì tự ẩn
    h("button", { type: "button", class: "btn btn-primary eng__start", onclick: onStart }, "Bắt đầu"),
  );
  picker?.refresh();
}

// ---------- chủ đề ----------

export interface Topic {
  id: string;
  label: string;
  group: string;
  total: number;
  seen: number;
  due: number;
}

export interface TopicPicker {
  el: HTMLElement;
  /** Chủ đề đang chọn; null = để máy tự chọn */
  value(): string | null;
  /** Trình độ đang chọn ("A2" / "B1" / "B2"); null = mọi trình độ */
  level(): string | null;
  /** Tên hiển thị của một chủ đề (VD hiện trên thanh lượt chơi) */
  label(id: string): string;
  /** Tải lại tiến độ từng chủ đề (sau mỗi lượt) */
  refresh(): void;
}

const TOPIC_KEY = "learningenglish.topic";
const LEVEL_KEY = "learningenglish.level";
const LEVEL_OPTIONS: [string | null, string][] = [
  [null, "Mọi trình độ"],
  ["A2", "Cơ bản"],
  ["B1", "Trung cấp"],
  ["B2", "Nâng cao"],
];

function load(key: string): string | null {
  try {
    return localStorage.getItem(key) || null;
  } catch {
    return null; // trình duyệt chặn localStorage
  }
}

function store(key: string, value: string | null): void {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* bỏ qua */
  }
}

/** Bỏ dấu, chữ thường: để tìm "du lich" ra "Du lịch" */
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();

/** Chọn trình độ và chủ đề, dùng chung cho các chế độ theo lịch ôn; lựa chọn được nhớ trên trình duyệt.
 * Danh sách chủ đề dài nên chia nhóm thu gọn được, kèm ô tìm chủ đề. */
export function topicPicker(): TopicPicker {
  let topics: Topic[] = [];
  let selected = load(TOPIC_KEY);
  let level = load(LEVEL_KEY);
  if (!LEVEL_OPTIONS.some(([v]) => v === level)) level = null;
  let query = "";
  const open = new Set<string>(); // nhóm đang mở (giữ nguyên khi vẽ lại)

  const currentEl = h("p", { class: "eng__picker-current" });
  const listEl = h("div", { class: "eng__topics", role: "radiogroup", "aria-label": "Chủ đề" });
  const search = h("input", {
    type: "search",
    class: "input eng__picker-search",
    placeholder: "Tìm chủ đề… (VD: ăn, tiền, du lịch)",
    "aria-label": "Tìm chủ đề",
    oninput: () => {
      query = fold(search.value.trim());
      render();
    },
  }) as HTMLInputElement;
  const levelName = `eng-level-${Math.random().toString(36).slice(2)}`; // một nhóm radio cho cả 4 nút
  const levelEl = h(
    "div",
    { class: "segmented eng__levels", role: "radiogroup", "aria-label": "Trình độ" },
    LEVEL_OPTIONS.map(([value, text]) =>
      h(
        "label",
        {},
        h("input", {
          type: "radio",
          name: levelName,
          checked: level === value,
          onchange: () => {
            level = value;
            store(LEVEL_KEY, value);
            refresh();
          },
        }),
        h("span", {}, text),
      ),
    ),
  );
  const el = h(
    "div",
    { class: "eng__picker" },
    h("div", { class: "eng__picker-row" }, h("span", { class: "eng__picker-label" }, "Trình độ"), levelEl),
    currentEl,
    search,
    listEl,
  );

  const choose = (id: string | null) => {
    selected = id;
    store(TOPIC_KEY, id);
    render();
  };

  const chip = (id: string | null, label: string, note: string, due = 0) =>
    h(
      "button",
      {
        type: "button",
        role: "radio",
        class: "eng__topic",
        "aria-checked": String(selected === id),
        onclick: () => choose(id),
      },
      h("span", {}, label),
      h("small", {}, note, due ? h("b", {}, ` · ${due} cần ôn`) : null),
    );
  const topicChip = (t: Topic) => chip(t.id, t.label, `${t.seen}/${t.total} từ đã học`, t.due);

  const render = () => {
    if (selected && topics.length && !topics.some((t) => t.id === selected)) selected = null;
    const cur = topics.find((t) => t.id === selected);
    currentEl.replaceChildren(
      h("span", { class: "eng__picker-label" }, "Đang chọn"),
      h("strong", {}, cur ? cur.label : "🎲 Tự chọn"),
      h("small", { class: "muted" }, cur ? ` · ${cur.seen}/${cur.total} từ đã học` : " · ưu tiên chủ đề cần ôn"),
    );
    if (query) {
      const hits = topics.filter((t) => fold(t.label).includes(query));
      listEl.replaceChildren(
        hits.length
          ? h("div", { class: "eng__topics-grid" }, hits.map(topicChip))
          : h("p", { class: "muted" }, "Không có chủ đề nào khớp."),
      );
      return;
    }
    const groups = [...new Set(topics.map((t) => t.group))];
    listEl.replaceChildren(
      h("div", { class: "eng__topics-grid" }, chip(null, "🎲 Tự chọn", "ưu tiên chủ đề cần ôn")),
      ...groups.map((g) => {
        const items = topics.filter((t) => t.group === g);
        const due = items.reduce((n, t) => n + t.due, 0);
        const details = h(
          "details",
          { class: "eng__topic-group", open: open.has(g) },
          h(
            "summary",
            {},
            h("span", {}, g),
            h("small", { class: "muted" }, ` · ${items.length} chủ đề`, due ? h("b", {}, ` · ${due} cần ôn`) : null),
          ),
          h("div", { class: "eng__topics-grid" }, items.map(topicChip)),
        ) as HTMLDetailsElement;
        details.addEventListener("toggle", () => (details.open ? open.add(g) : open.delete(g)));
        return details;
      }),
    );
  };

  const refresh = () =>
    void api
      .get<Topic[]>("/api/english/topics", { level })
      .then((ts) => {
        topics = ts;
        render();
      })
      .catch(() => undefined);

  render();
  return {
    el,
    value: () => selected,
    level: () => level,
    label: (id) => topics.find((t) => t.id === id)?.label ?? id,
    refresh,
  };
}
