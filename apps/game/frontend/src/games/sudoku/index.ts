import { api, ApiError, createDialog, h } from "@tori/ui";

type Level = "easy" | "medium" | "hard";
const LEVELS: [Level, string][] = [
  ["easy", "Dễ"],
  ["medium", "Vừa"],
  ["hard", "Khó"],
];
const LEVEL_KEY = "game.sudoku.level";
const BACK_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>';

interface Game {
  id: number;
  level: Level;
  puzzle: string;
  board: string;
  notes: number[];
  elapsed: number;
}
interface LeaderRow {
  rank: number;
  name: string;
  seconds: number;
  games: number;
  me: boolean;
}
interface Leaderboard {
  level: Level;
  top: LeaderRow[];
  mine: LeaderRow | null;
}
interface FinishOut {
  seconds: number;
  best: number;
  record: boolean;
  rank: number;
}

/** Các ô cùng hàng, cột hoặc khối 3×3 với từng ô */
const PEERS: number[][] = Array.from({ length: 81 }, (_, i) => {
  const r = Math.floor(i / 9);
  const c = i % 9;
  const br = r - (r % 3);
  const bc = c - (c % 3);
  const set = new Set<number>();
  for (let k = 0; k < 9; k++) {
    set.add(r * 9 + k);
    set.add(k * 9 + c);
    set.add((br + Math.floor(k / 3)) * 9 + bc + (k % 3));
  }
  set.delete(i);
  return [...set];
});

export function formatTime(s: number): string {
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return hh ? `${hh}:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
}

function loadLevel(): Level {
  try {
    const v = localStorage.getItem(LEVEL_KEY);
    if (v === "easy" || v === "medium" || v === "hard") return v;
  } catch {
    /* trình duyệt chặn localStorage */
  }
  return "easy";
}

function saveLevel(level: Level): void {
  try {
    localStorage.setItem(LEVEL_KEY, level);
  } catch {
    /* bỏ qua */
  }
}

function segmented(name: string, onPick: (level: Level) => void) {
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

export function mount(root: HTMLElement): () => void {
  let game: Game | null = null;
  let board: number[] = [];
  let notes: number[] = [];
  let given: boolean[] = [];
  let selected = -1;
  let notesMode = false;
  let elapsed = 0;
  let finished = false;
  let dirty = false;
  let saveTimer: number | undefined;
  let busy = false;

  const timerEl = h("span", { class: "sudoku__timer", "aria-label": "Thời gian" }, "0:00");
  const statusEl = h("p", { class: "error-text sudoku__status" });
  const gridEl = h("div", { class: "sudoku__grid", role: "grid", "aria-label": "Bàn Sudoku" });
  const padEl = h("div", { class: "sudoku__pad" });
  const notesBtn = h(
    "button",
    {
      type: "button",
      class: "btn sudoku__tool",
      "aria-pressed": "false",
      title: "Ghi số nháp (phím N)",
      onclick: () => toggleNotes(),
    },
    "✏️ Ghi chú: Tắt",
  );
  const eraseBtn = h(
    "button",
    { type: "button", class: "btn sudoku__tool", title: "Xoá ô (Backspace)", onclick: () => erase() },
    "⌫ Xoá",
  );
  const levelPick = segmented("sudoku-level", (level) => void newGame(level));
  const newBtn = h(
    "button",
    { type: "button", class: "btn btn-primary", onclick: () => void newGame(game?.level ?? loadLevel()) },
    "Ván mới",
  );

  const boardTitle = h("h2", { class: "sudoku__board-title" }, "Bảng xếp hạng");
  const boardList = h("div", { class: "sudoku__ranks" });
  const boardPick = segmented("sudoku-board", (level) => void loadBoard(level));
  const leaderEl = h(
    "aside",
    { class: "card sudoku__leader" },
    boardTitle,
    h("p", { class: "muted sudoku__leader-hint" }, "Thời gian giải nhanh nhất của mỗi người"),
    boardPick.el,
    boardList,
  );

  const backBtn = h("a", {
    class: "btn btn-icon sudoku__back",
    href: "#/",
    "aria-label": "Về danh sách trò chơi",
    title: "Về danh sách trò chơi",
  });
  backBtn.innerHTML = BACK_ICON; // chuỗi SVG tĩnh

  root.replaceChildren(
    h(
      "section",
      { class: "sudoku" },
      h(
        "div",
        { class: "sudoku__top" },
        backBtn,
        h("h1", { class: "sudoku__title" }, "Sudoku"),
      ),
      h(
        "div",
        { class: "sudoku__body" },
        h(
          "div",
          { class: "sudoku__play" },
          h("div", { class: "sudoku__controls" }, levelPick.el, newBtn, timerEl),
          gridEl,
          statusEl,
        ),
        h("div", { class: "sudoku__side" }, padEl, h("div", { class: "sudoku__tools" }, notesBtn, eraseBtn), leaderEl),
      ),
    ),
  );

  // ---------- vẽ ----------

  const conflicts = (): Set<number> => {
    const bad = new Set<number>();
    for (let i = 0; i < 81; i++) {
      if (board[i] && PEERS[i].some((p) => board[p] === board[i])) bad.add(i);
    }
    return bad;
  };

  const render = () => {
    const bad = conflicts();
    const sel = selected >= 0 ? selected : -1;
    const selValue = sel >= 0 ? board[sel] : 0;
    const peers = new Set(sel >= 0 ? PEERS[sel] : []);
    gridEl.replaceChildren(
      ...board.map((v, i) => {
        const r = Math.floor(i / 9);
        const c = i % 9;
        const cls = ["sudoku__cell"];
        if (c === 2 || c === 5) cls.push("b-r");
        if (r === 2 || r === 5) cls.push("b-b");
        if (given[i]) cls.push("is-given");
        if (i === sel) cls.push("is-selected");
        else if (selValue && v === selValue) cls.push("is-same");
        else if (peers.has(i)) cls.push("is-peer");
        if (bad.has(i) && !given[i]) cls.push("is-conflict");
        const content = v
          ? String(v)
          : notes[i]
            ? h(
                "span",
                { class: "sudoku__notes" },
                Array.from({ length: 9 }, (_, k) =>
                  h("span", { class: selValue === k + 1 ? "is-same" : null }, notes[i] & (1 << (k + 1)) ? String(k + 1) : ""),
                ),
              )
            : "";
        return h(
          "button",
          {
            type: "button",
            class: cls.join(" "),
            tabindex: -1,
            role: "gridcell",
            "aria-label": `Hàng ${r + 1} cột ${c + 1}${v ? `: ${v}` : ""}`,
            onclick: () => {
              selected = i;
              render();
            },
          },
          content,
        );
      }),
    );
    const counts = Array(10).fill(0);
    board.forEach((v) => counts[v]++);
    padEl.replaceChildren(
      ...Array.from({ length: 9 }, (_, k) => {
        const d = k + 1;
        const left = 9 - counts[d];
        return h(
          "button",
          {
            type: "button",
            class: "sudoku__key",
            disabled: finished || (!notesMode && left <= 0),
            "aria-label": `Số ${d}`,
            onclick: () => input(d),
          },
          h("span", {}, String(d)),
          h("small", {}, left > 0 ? String(left) : "✓"),
        );
      }),
    );
    notesBtn.textContent = `✏️ Ghi chú: ${notesMode ? "Bật" : "Tắt"}`;
    notesBtn.setAttribute("aria-pressed", String(notesMode));
    notesBtn.classList.toggle("is-on", notesMode);
    gridEl.classList.toggle("is-finished", finished);
  };

  // ---------- thao tác ----------

  const editable = () => game && !finished && selected >= 0 && !given[selected];

  const input = (d: number) => {
    if (!editable()) return;
    const i = selected;
    if (notesMode) {
      if (board[i]) return;
      notes[i] ^= 1 << d;
    } else {
      board[i] = board[i] === d ? 0 : d;
      notes[i] = 0;
      if (board[i]) for (const p of PEERS[i]) notes[p] &= ~(1 << d); // gỡ số nháp trùng ở các ô liên quan
    }
    changed();
  };

  const erase = () => {
    if (!editable()) return;
    board[selected] = 0;
    notes[selected] = 0;
    changed();
  };

  const toggleNotes = () => {
    notesMode = !notesMode;
    render();
  };

  const move = (dr: number, dc: number) => {
    if (selected < 0) selected = 40;
    else {
      const r = (Math.floor(selected / 9) + dr + 9) % 9;
      const c = ((selected % 9) + dc + 9) % 9;
      selected = r * 9 + c;
    }
    render();
  };

  const changed = () => {
    dirty = true;
    statusEl.textContent = "";
    render();
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void save(), 1000);
    if (board.every((v) => v > 0) && conflicts().size === 0) void finish();
  };

  // ---------- lưu ----------

  const progressBody = () => ({ board: board.join(""), notes, elapsed });

  const save = async () => {
    window.clearTimeout(saveTimer);
    if (!game || finished || !dirty) return;
    dirty = false;
    try {
      await api.patch(`/api/sudoku/games/${game.id}`, progressBody());
    } catch {
      dirty = true; // lần sau thử lại
    }
  };

  /** Lúc đóng tab: gửi bằng keepalive để request không bị huỷ */
  const saveOnExit = () => {
    if (!game || finished || !dirty) return;
    dirty = false;
    void fetch(`/api/sudoku/games/${game.id}`, {
      method: "PATCH",
      credentials: "same-origin",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(progressBody()),
    }).catch(() => undefined);
  };

  const finish = async () => {
    if (!game || finished) return;
    finished = true;
    window.clearTimeout(saveTimer);
    render();
    try {
      const res = await api.post<FinishOut>(`/api/sudoku/games/${game.id}/finish`, { board: board.join(""), elapsed });
      elapsed = res.seconds;
      timerEl.textContent = formatTime(elapsed);
      void loadBoard(game.level);
      showDone(res, game.level);
    } catch (e) {
      finished = false;
      statusEl.textContent = e instanceof ApiError ? e.message : "Không gửi được kết quả, bạn thử lại nhé.";
      render();
    }
  };

  const showDone = (res: FinishOut, level: Level) => {
    const levelName = LEVELS.find(([v]) => v === level)![1];
    const { form, close } = createDialog(
      "Hoàn thành! 🎉",
      [
        h("p", { class: "sudoku__done-time" }, formatTime(res.seconds)),
        h(
          "p",
          { class: "muted" },
          res.record
            ? `Kỷ lục mới của bạn ở mức ${levelName}. Hạng ${res.rank} trên bảng xếp hạng.`
            : `Kỷ lục của bạn ở mức ${levelName}: ${formatTime(res.best)} (hạng ${res.rank}).`,
        ),
      ],
      [
        h("button", { type: "button", class: "btn", onclick: () => close() }, "Đóng"),
        h("button", { type: "submit", class: "btn btn-primary" }, "Ván mới"),
      ],
    );
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      close();
      void newGame(level);
    });
  };

  // ---------- ván chơi ----------

  const setGame = (g: Game) => {
    game = g;
    board = [...g.board].map(Number);
    notes = [...g.notes];
    given = [...g.puzzle].map((ch) => ch !== "0");
    elapsed = g.elapsed;
    finished = false;
    dirty = false;
    selected = -1;
    statusEl.textContent = "";
    timerEl.textContent = formatTime(elapsed);
    levelPick.set(g.level);
    saveLevel(g.level);
    render();
    void loadBoard(g.level);
  };

  const newGame = async (level: Level) => {
    if (busy) return;
    const playing = game && !finished && board.some((v, i) => v && !given[i]);
    if (playing && !confirm("Bỏ ván đang chơi để bắt đầu ván mới?")) {
      levelPick.set(game!.level);
      return;
    }
    busy = true;
    try {
      setGame(await api.post<Game>("/api/sudoku/games", { level }));
    } catch (e) {
      statusEl.textContent = (e as Error).message;
      if (game) levelPick.set(game.level);
    } finally {
      busy = false;
    }
  };

  let boardSeq = 0;
  const loadBoard = async (level: Level) => {
    const run = ++boardSeq;
    boardPick.set(level);
    const data = await api.get<Leaderboard>("/api/sudoku/leaderboard", { level }).catch(() => null);
    if (run !== boardSeq) return;
    if (!data) {
      boardList.replaceChildren(h("p", { class: "error-text" }, "Không tải được bảng xếp hạng."));
      return;
    }
    const row = (x: LeaderRow) =>
      h(
        "li",
        { class: `sudoku__rank${x.me ? " is-me" : ""}` },
        h("span", { class: "sudoku__rank-no" }, String(x.rank)),
        h("span", { class: "sudoku__rank-name" }, x.name, x.me ? h("small", {}, " (bạn)") : null),
        h("span", { class: "sudoku__rank-time" }, formatTime(x.seconds)),
      );
    const inTop = data.top.some((x) => x.me);
    boardList.replaceChildren(
      data.top.length
        ? h("ol", {}, data.top.map(row), !inTop && data.mine ? [h("li", { class: "sudoku__rank-gap" }, "…"), row(data.mine)] : null)
        : h("p", { class: "muted" }, "Chưa ai giải mức này. Bạn là người đầu tiên!"),
    );
  };

  // ---------- đồng hồ, phím tắt ----------

  const tick = window.setInterval(() => {
    if (!game || finished || document.visibilityState !== "visible") return;
    elapsed++;
    timerEl.textContent = formatTime(elapsed);
    if (elapsed % 15 === 0) {
      dirty = true;
      void save();
    }
  }, 1000);

  const onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector("dialog[open]")) return;
    const t = e.target as HTMLElement;
    if (t.matches("input:not([type=radio]), textarea, select")) return;
    if (/^[1-9]$/.test(e.key)) input(Number(e.key));
    else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") erase();
    else if (e.key === "n" || e.key === "N") toggleNotes();
    else if (e.key === "ArrowUp") move(-1, 0);
    else if (e.key === "ArrowDown") move(1, 0);
    else if (e.key === "ArrowLeft") move(0, -1);
    else if (e.key === "ArrowRight") move(0, 1);
    else return;
    e.preventDefault();
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      dirty = dirty || !!game;
      saveOnExit();
    }
  };
  document.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", saveOnExit);

  render();
  void api
    .get<Game | null>("/api/sudoku/current")
    .then((g) => (g ? setGame(g) : newGame(loadLevel())))
    .catch((e: Error) => (statusEl.textContent = `Không tải được ván chơi: ${e.message}`));

  return () => {
    window.clearInterval(tick);
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", saveOnExit);
    if (dirty) saveOnExit();
  };
}
