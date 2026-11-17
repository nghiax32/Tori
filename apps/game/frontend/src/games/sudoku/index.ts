import { api, ApiError, createDialog, h } from "@tori/ui";
import {
  gameTop,
  levelName,
  levelPicker,
  loadLevel as loadSavedLevel,
  renderRanks,
  saveLevel as storeLevel,
  type Level,
} from "../shared";

const LEVEL_KEY = "game.sudoku.level";

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

const loadLevel = () => loadSavedLevel(LEVEL_KEY);
const saveLevel = (level: Level) => storeLevel(LEVEL_KEY, level);

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
  const levelPick = levelPicker("sudoku-level", (level) => void newGame(level));
  const newBtn = h(
    "button",
    { type: "button", class: "btn btn-primary", onclick: () => void newGame(game?.level ?? loadLevel()) },
    "Ván mới",
  );

  const boardTitle = h("h2", { class: "sudoku__board-title" }, "Bảng xếp hạng");
  const boardList = h("div", { class: "rank-list" });
  const boardPick = levelPicker("sudoku-board", (level) => void loadBoard(level));
  const leaderEl = h(
    "aside",
    { class: "card sudoku__leader" },
    boardTitle,
    h("p", { class: "muted sudoku__leader-hint" }, "Thời gian giải nhanh nhất của mỗi người"),
    boardPick.el,
    boardList,
  );

  root.replaceChildren(
    h(
      "section",
      { class: "sudoku" },
      gameTop("Sudoku"),
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
    const { form, close } = createDialog(
      "Hoàn thành! 🎉",
      [
        h("p", { class: "sudoku__done-time" }, formatTime(res.seconds)),
        h(
          "p",
          { class: "muted" },
          res.record
            ? `Kỷ lục mới của bạn ở mức ${levelName(level)}. Hạng ${res.rank} trên bảng xếp hạng.`
            : `Kỷ lục của bạn ở mức ${levelName(level)}: ${formatTime(res.best)} (hạng ${res.rank}).`,
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
    renderRanks(boardList, data, (x) => formatTime(x.seconds), "Chưa ai giải mức này. Bạn là người đầu tiên!");
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
