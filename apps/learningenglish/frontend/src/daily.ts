import { api, ApiError, h } from "@tori/ui";
import { renderRanks } from "./ranks";
import { formatSeconds, sayable, type ModeCtx } from "./common";

/** Từ của ngày: đoán một từ tiếng Anh 5 chữ cái trong 6 lượt; mọi người cùng một từ mỗi ngày. */

interface Guess {
  word: string;
  marks: string; // "g" đúng chỗ, "y" có nhưng sai chỗ, "." không có
}
interface DailyState {
  day: string;
  length: number;
  max_guesses: number;
  guesses: Guess[];
  solved: boolean;
  over: boolean;
  seconds: number | null;
  answer: { word: string; ipa: string; meaning: string } | null;
}
interface DailyRow {
  rank: number;
  name: string;
  guesses: number;
  seconds: number;
  me: boolean;
}

const KEYS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const MARK_CLASS: Record<string, string> = { g: "is-hit", y: "is-near", ".": "is-miss" };
const MARK_LABEL: Record<string, string> = { g: "đúng chỗ", y: "sai chỗ", ".": "không có" };

export function mount({ stage, side, refreshStats }: ModeCtx): () => void {
  let alive = true;
  let state: DailyState | null = null;
  let typing = "";
  let busy = false;

  const boardList = h("div", { class: "rank-list" });
  side.replaceChildren(
    h(
      "aside",
      { class: "card eng__leader" },
      h("h2", {}, "Hôm nay"),
      h("p", { class: "muted" }, "Những người đã đoán đúng: ít lượt hơn xếp trên, bằng lượt thì nhanh hơn xếp trên."),
      boardList,
    ),
  );

  const gridEl = h("div", { class: "daily__grid", role: "grid", "aria-label": "Các lượt đoán" });
  const statusEl = h("p", { class: "daily__status", "aria-live": "polite" });
  const keyboardEl = h("div", { class: "daily__keys" });
  const doneEl = h("div");

  stage.replaceChildren(
    h("h2", {}, "Từ của ngày"),
    h(
      "p",
      { class: "muted" },
      "Đoán từ tiếng Anh 5 chữ cái trong 6 lượt. Sau mỗi lượt: ô xanh là chữ đúng chỗ, ô vàng là chữ có trong từ nhưng sai chỗ, ô xám là chữ không có. Mỗi ngày một từ, ai cũng đoán cùng một từ.",
    ),
    gridEl,
    statusEl,
    doneEl,
    keyboardEl,
  );

  const loadBoard = async () => {
    const data = await api.get<{ top: DailyRow[]; mine: DailyRow | null }>("/api/english/daily/leaderboard").catch(() => null);
    if (!alive) return;
    renderRanks(boardList, data, (x) => `${x.guesses}/6 · ${formatSeconds(x.seconds)}`, "Chưa ai đoán đúng hôm nay.");
  };

  /** Màu tốt nhất đã biết của từng chữ, để tô bàn phím */
  const letterMarks = () => {
    const best: Record<string, string> = {};
    const rank = { g: 3, y: 2, ".": 1 } as Record<string, number>;
    for (const g of state?.guesses ?? []) {
      [...g.word].forEach((ch, i) => {
        const m = g.marks[i];
        if (!best[ch] || rank[m] > rank[best[ch]]) best[ch] = m;
      });
    }
    return best;
  };

  const render = () => {
    if (!state) return;
    const rows = [];
    for (let r = 0; r < state.max_guesses; r++) {
      const g = state.guesses[r];
      const current = !g && r === state.guesses.length && !state.over;
      const letters = g ? g.word : current ? typing : "";
      rows.push(
        h(
          "div",
          { class: `daily__row${current ? " is-current" : ""}`, role: "row" },
          Array.from({ length: state.length }, (_, i) => {
            const ch = letters[i] ?? "";
            const mark = g?.marks[i];
            return h(
              "span",
              {
                class: `daily__tile${mark ? ` ${MARK_CLASS[mark]}` : ch ? " is-filled" : ""}`,
                role: "gridcell",
                "aria-label": ch ? `${ch.toUpperCase()}${mark ? `: ${MARK_LABEL[mark]}` : ""}` : "trống",
              },
              ch.toUpperCase(),
            );
          }),
        ),
      );
    }
    gridEl.replaceChildren(...rows);

    const marks = letterMarks();
    keyboardEl.replaceChildren(
      ...KEYS.map((row, ri) =>
        h(
          "div",
          { class: "daily__keyrow" },
          ri === 2 ? key("Enter", "Đoán", "daily__key--wide") : null,
          [...row].map((ch) => key(ch, ch.toUpperCase(), marks[ch] ? MARK_CLASS[marks[ch]] : "")),
          ri === 2 ? key("Backspace", "⌫", "daily__key--wide") : null,
        ),
      ),
    );
    keyboardEl.hidden = state.over;

    doneEl.replaceChildren();
    if (state.over && state.answer) {
      const a = state.answer;
      doneEl.replaceChildren(
        h(
          "div",
          { class: `eng__feedback ${state.solved ? "is-ok" : "is-bad"}` },
          h(
            "strong",
            { class: "eng__feedback-title" },
            state.solved
              ? `🎉 Đoán đúng sau ${state.guesses.length}/${state.max_guesses} lượt${state.seconds ? ` · ${formatSeconds(state.seconds)}` : ""}`
              : "Hết lượt rồi. Từ hôm nay là:",
          ),
          h("div", { class: "eng__feedback-word" }, sayable(a.word), h("span", { class: "eng__ipa" }, a.ipa)),
          h("div", {}, a.meaning),
          h("small", { class: "muted" }, "Mai có từ mới, quay lại nhé!"),
        ),
      );
    }
  };

  const key = (value: string, label: string, cls: string) =>
    h("button", { type: "button", class: `daily__key ${cls}`, onclick: () => press(value), "aria-label": value === "Enter" ? "Đoán" : value === "Backspace" ? "Xoá chữ" : label }, label);

  const press = (k: string) => {
    if (!state || state.over || busy) return;
    if (k === "Enter") void submit();
    else if (k === "Backspace") typing = typing.slice(0, -1);
    else if (/^[a-z]$/i.test(k) && typing.length < state.length) typing += k.toLowerCase();
    else return;
    statusEl.textContent = "";
    render();
  };

  const submit = async () => {
    if (!state) return;
    if (typing.length < state.length) {
      statusEl.textContent = `Cần đủ ${state.length} chữ cái.`;
      gridEl.querySelector(".daily__row.is-current")?.classList.add("is-shake");
      return;
    }
    busy = true;
    try {
      state = await api.post<DailyState>("/api/english/daily/guess", { guess: typing });
      typing = "";
      if (!alive) return;
      render();
      if (state.over) {
        refreshStats();
        void loadBoard();
      }
    } catch (e) {
      statusEl.textContent = e instanceof ApiError ? e.message : "Không gửi được lượt đoán.";
    } finally {
      busy = false;
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector("dialog[open]")) return;
    if ((e.target as HTMLElement).matches("input, textarea, select")) return;
    if (e.key === "Enter" || e.key === "Backspace" || /^[a-z]$/i.test(e.key)) {
      e.preventDefault();
      press(e.key);
    }
  };
  document.addEventListener("keydown", onKey);

  void api
    .get<DailyState>("/api/english/daily")
    .then((s) => {
      if (!alive) return;
      state = s;
      render();
    })
    .catch(() => (statusEl.textContent = "Không tải được Từ của ngày."));
  void loadBoard();

  return () => {
    alive = false;
    document.removeEventListener("keydown", onKey);
  };
}
