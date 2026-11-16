import { createDialog, h } from "@tori/ui";
import { gameTop, levelName, levelPicker, loadLevel, saveLevel } from "../shared";
import {
  bestMove,
  isQuan,
  newGame,
  play,
  points,
  SIDE,
  type Dir,
  type Move,
  type Player,
  type Score,
  type State,
  type Step,
  type StepKind,
} from "./engine";

const LEVEL_KEY = "game.oaq.level";
const NAMES: Record<Player, string> = { 0: "Bạn", 1: "Máy" };
// Thời gian dừng ở mỗi bước khi vẽ lại nước đi (ms)
const DELAY: Record<StepKind, number> = { pick: 420, drop: 200, capture: 650, refill: 700, collect: 500 };
const MAX_DOTS = 18; // nhiều hơn thì chỉ vẽ 18 viên, số đếm vẫn đúng

/** Vị trí trên lưới 7 cột × 2 hàng: quan hai đầu, hàng trên của máy (ô 11 → 7), hàng dưới của bạn (ô 1 → 5) */
function placeOf(cell: number): string {
  if (cell === 0) return "grid-column: 1; grid-row: 1 / 3";
  if (cell === 6) return "grid-column: 7; grid-row: 1 / 3";
  if (cell <= 5) return `grid-column: ${cell + 1}; grid-row: 2`;
  return `grid-column: ${13 - cell}; grid-row: 1`;
}

interface View {
  dan: number[];
  quan: boolean[];
  score: [Score, Score];
  focus: number;
  kind: StepKind | null;
  hand: number;
  player: Player;
}

export function mount(root: HTMLElement): () => void {
  let level = loadLevel(LEVEL_KEY, "medium");
  let first: Player = 0;
  let state = newGame(first);
  let selected = -1;
  let busy = false; // đang vẽ nước đi hoặc máy đang nghĩ
  let token = 0; // đổi khi bắt đầu ván mới hoặc rời trang: huỷ hoạt cảnh đang chạy

  const boardEl = h("div", { class: "oaq__board", role: "group", "aria-label": "Bàn Ô ăn quan" });
  const statusEl = h("p", { class: "oaq__status", "aria-live": "polite" });
  const scoreEls = { 0: h("div", { class: "oaq__score" }), 1: h("div", { class: "oaq__score" }) } as Record<Player, HTMLElement>;
  const levelPick = levelPicker("oaq-level", (lv) => {
    if (!confirmAbandon()) {
      levelPick.set(level);
      return;
    }
    level = lv;
    saveLevel(LEVEL_KEY, lv);
    start();
  });
  const newBtn = h(
    "button",
    {
      type: "button",
      class: "btn btn-primary",
      onclick: () => {
        if (confirmAbandon()) start();
      },
    },
    "Ván mới",
  );

  root.replaceChildren(
    h(
      "section",
      { class: "oaq" },
      gameTop("Ô ăn quan"),
      h(
        "div",
        { class: "oaq__controls" },
        h("span", { class: "muted oaq__label" }, "Máy:"),
        levelPick.el,
        newBtn,
      ),
      scoreEls[1],
      boardEl,
      scoreEls[0],
      statusEl,
      rules(),
    ),
  );

  // ---------- vẽ ----------

  const viewOf = (s: State): View => ({
    dan: s.dan,
    quan: s.quan,
    score: s.score,
    focus: -1,
    kind: null,
    hand: 0,
    player: s.turn,
  });

  const canPick = (cell: number) => !busy && !state.over && state.turn === 0 && SIDE[0].includes(cell) && state.dan[cell] > 0;

  const render = (v: View) => {
    boardEl.replaceChildren(
      ...Array.from({ length: 12 }, (_, cell) => {
        const quanCell = isQuan(cell);
        const n = v.dan[cell];
        const cls = ["oaq__cell", quanCell ? (cell === 0 ? "oaq__quan oaq__quan--left" : "oaq__quan oaq__quan--right") : ""];
        if (cell <= 5 && !quanCell) cls.push("is-mine");
        if (canPick(cell)) cls.push("is-pickable");
        if (cell === selected) cls.push("is-selected");
        if (cell === v.focus && v.kind) cls.push(`is-${v.kind}`);
        const dots = Array.from({ length: Math.min(n, MAX_DOTS) }, () => h("span", { class: "oaq__dan" }));
        const label = `${quanCell ? "Ô quan" : "Ô"} ${cell}: ${v.quan[cell] ? "có quan, " : ""}${n} dân`;
        return h(
          "div",
          {
            class: cls.join(" "),
            style: placeOf(cell),
            role: canPick(cell) ? "button" : null,
            tabindex: canPick(cell) ? 0 : null,
            "aria-label": label,
            onclick: () => select(cell),
            onkeydown: ((e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                select(cell);
              }
            }) as EventListener,
          },
          h("span", { class: "oaq__stones" }, v.quan[cell] ? h("span", { class: "oaq__quan-stone", title: "Quan" }) : null, dots),
          h("span", { class: "oaq__count" }, String(n)),
          cell === selected && selected >= 0
            ? h(
                "span",
                { class: "oaq__dirs" },
                arrow("←", "Rải sang trái", -1),
                arrow("→", "Rải sang phải", 1),
              )
            : null,
        );
      }),
    );
    for (const p of [0, 1] as Player[]) {
      const s = v.score[p];
      scoreEls[p].className = `oaq__score${!state.over && v.player === p ? " is-turn" : ""}`;
      scoreEls[p].replaceChildren(
        h("span", { class: "oaq__score-name" }, NAMES[p], p === 1 ? h("small", {}, ` · ${levelName(level)}`) : null),
        h("span", { class: "oaq__score-detail" }, `${s.quan} quan · ${s.dan} dân`),
        h("strong", { class: "oaq__score-points" }, String(points(s))),
      );
    }
  };

  const arrow = (text: string, label: string, dir: Dir) =>
    h(
      "button",
      {
        type: "button",
        class: "oaq__dir",
        "aria-label": label,
        title: label,
        onclick: (e: Event) => {
          e.stopPropagation();
          void humanMove({ cell: selected, dir });
        },
      },
      text,
    );

  const setStatus = (text: string) => (statusEl.textContent = text);

  // ---------- lượt chơi ----------

  const select = (cell: number) => {
    if (!canPick(cell)) return;
    selected = selected === cell ? -1 : cell;
    setStatus(selected >= 0 ? "Chọn hướng rải: ← hoặc →" : "Lượt của bạn: chọn một ô bên mình (hàng dưới)");
    render(viewOf(state));
  };

  const sleep = (ms: number, run: number) =>
    new Promise<boolean>((resolve) => window.setTimeout(() => resolve(run === token), ms));

  /** Vẽ lại từng bước của nước đi; trả về false nếu bị huỷ giữa chừng */
  const animate = async (steps: Step[], run: number): Promise<boolean> => {
    for (const st of steps) {
      render({ ...st, focus: st.cell, kind: st.kind });
      const who = NAMES[st.player];
      if (st.kind === "pick") setStatus(`${who} bốc ${st.hand} dân`);
      else if (st.kind === "capture") setStatus(`${who} ăn ô ${isQuan(st.cell) ? "quan" : "dân"}!`);
      else if (st.kind === "refill") setStatus(`${who} hết dân bên mình: rải lại 5 dân`);
      else if (st.kind === "collect") setStatus("Hết quan, tàn dân: thu quân, kéo về");
      if (!(await sleep(DELAY[st.kind], run))) return false;
    }
    return true;
  };

  const apply = async (move: Move): Promise<boolean> => {
    const run = token;
    const steps: Step[] = [];
    const next = play(state, move, steps);
    busy = true;
    selected = -1;
    const ok = await animate(steps, run);
    if (!ok) return false;
    state = next;
    busy = false;
    render(viewOf(state));
    return true;
  };

  const humanMove = async (move: Move) => {
    if (busy || state.turn !== 0 || state.over) return;
    if (await apply(move)) await afterMove();
  };

  const afterMove = async () => {
    if (state.over) {
      showResult();
      return;
    }
    if (state.turn === 0) {
      setStatus("Lượt của bạn: chọn một ô bên mình (hàng dưới)");
      return;
    }
    const run = token;
    busy = true;
    setStatus("Máy đang nghĩ…");
    if (!(await sleep(450, run))) return;
    const move = bestMove(state, level);
    if (await apply(move)) await afterMove();
  };

  const showResult = () => {
    const me = points(state.score[0]);
    const ai = points(state.score[1]);
    const title = me > ai ? "Bạn thắng! 🎉" : me < ai ? "Máy thắng" : "Hoà";
    setStatus(`Hết ván: ${title.replace(" 🎉", "")} (${me} – ${ai})`);
    const { form, close } = createDialog(
      title,
      [
        h("p", { class: "oaq__result" }, `${me} – ${ai}`),
        h("p", { class: "muted" }, `Bạn ${me} điểm, máy (mức ${levelName(level)}) ${ai} điểm. Một quan tính bằng 10 dân.`),
      ],
      [
        h("button", { type: "button", class: "btn", onclick: () => close() }, "Đóng"),
        h("button", { type: "submit", class: "btn btn-primary" }, "Ván mới"),
      ],
    );
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      close();
      start();
    });
  };

  const confirmAbandon = () => state.over || state.turns === 0 || confirm("Bỏ ván đang chơi để bắt đầu ván mới?");

  /** Ván mới; hai bên lần lượt đổi nhau đi trước */
  const start = () => {
    token++;
    busy = false;
    selected = -1;
    state = newGame(first);
    first = (1 - first) as Player;
    levelPick.set(level);
    render(viewOf(state));
    void afterMove();
  };

  start();

  return () => {
    token++;
  };
}

function rules(): HTMLElement {
  return h(
    "details",
    { class: "card oaq__rules" },
    h("summary", {}, "Luật chơi"),
    h(
      "ul",
      {},
      h("li", {}, "Bàn có 10 ô dân (mỗi ô 5 dân) và 2 ô quan ở hai đầu (mỗi ô 1 quan). Hàng dưới là của bạn, hàng trên của máy."),
      h("li", {}, "Đến lượt: chọn một ô dân bên mình còn dân, chọn hướng, bốc hết dân rải lần lượt mỗi ô một viên."),
      h("li", {}, "Rải xong, ô kế tiếp còn dân thì bốc lên rải tiếp. Ô kế tiếp là ô quan thì hết lượt."),
      h(
        "li",
        {},
        "Ô kế tiếp trống thì ăn hết ô ngay sau nó. Sau ô vừa ăn lại là một ô trống rồi đến ô có quân thì ăn tiếp (ăn dây). Hai ô trống liền nhau thì hết lượt.",
      ),
      h("li", {}, "Đến lượt mà 5 ô bên mình đều trống: lấy 5 dân đã ăn rải lại mỗi ô một viên (không đủ thì vay, bị trừ điểm)."),
      h("li", {}, "Ván kết thúc khi cả hai ô quan đã bị ăn hết; dân còn bên ai thì về người đó. Một quan bằng 10 dân, ai nhiều điểm hơn thắng."),
    ),
  );
}
