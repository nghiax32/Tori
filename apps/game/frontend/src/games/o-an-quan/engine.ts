/**
 * Luật Ô ăn quan (bản dân gian phổ biến) và AI cho máy.
 *
 * Bàn có 12 ô xếp thành vòng: ô 0 và 6 là hai ô quan, ô 1..5 của người chơi (hàng dưới, trái → phải),
 * ô 7..11 của máy (hàng trên, phải → trái). Đi theo chiều +1 là ngược chiều kim đồng hồ.
 */

export type Player = 0 | 1; // 0: bạn, 1: máy
export type Dir = 1 | -1;

export const QUAN_CELLS = [0, 6] as const;
export const SIDE: Record<Player, number[]> = { 0: [1, 2, 3, 4, 5], 1: [7, 8, 9, 10, 11] };
export const QUAN_VALUE = 10; // một quan tính bằng 10 dân
const MAX_TURNS = 400; // phòng ván kéo dài vô tận

export interface Score {
  dan: number; // có thể âm khi phải vay dân để rải lại
  quan: number;
}

export interface State {
  dan: number[]; // số dân trong 12 ô
  quan: boolean[]; // ô 0 và 6 còn quan hay không (các ô khác luôn false)
  score: [Score, Score];
  turn: Player;
  turns: number;
  over: boolean;
}

export interface Move {
  cell: number;
  dir: Dir;
}

export type StepKind = "pick" | "drop" | "capture" | "refill" | "collect";

/** Một khoảnh khắc của nước đi, để vẽ lại từng bước (bốc, rải từng viên, ăn...) */
export interface Step {
  kind: StepKind;
  cell: number;
  player: Player;
  dan: number[];
  quan: boolean[];
  score: [Score, Score];
  hand: number; // số dân đang cầm trên tay
}

export const isQuan = (cell: number) => cell === 0 || cell === 6;
export const points = (s: Score) => s.dan + s.quan * QUAN_VALUE;
const wrap = (i: number) => (i + 12) % 12;

export function newGame(first: Player = 0): State {
  const dan = Array(12).fill(5);
  dan[0] = 0;
  dan[6] = 0;
  const quan = Array(12).fill(false);
  quan[0] = true;
  quan[6] = true;
  return {
    dan,
    quan,
    score: [
      { dan: 0, quan: 0 },
      { dan: 0, quan: 0 },
    ],
    turn: first,
    turns: 0,
    over: false,
  };
}

function clone(s: State): State {
  return {
    ...s,
    dan: [...s.dan],
    quan: [...s.quan],
    score: [{ ...s.score[0] }, { ...s.score[1] }],
  };
}

export function legalMoves(s: State): Move[] {
  if (s.over) return [];
  const moves: Move[] = [];
  for (const cell of SIDE[s.turn]) {
    if (s.dan[cell] > 0) moves.push({ cell, dir: 1 }, { cell, dir: -1 });
  }
  return moves;
}

/** Thực hiện nước đi; `steps` (nếu truyền vào) nhận từng bước để vẽ lại. */
export function play(prev: State, move: Move, steps?: Step[]): State {
  const s = clone(prev);
  const p = s.turn;
  const rec = (kind: StepKind, cell: number, hand = 0, player: Player = p) =>
    steps?.push({ kind, cell, player, dan: [...s.dan], quan: [...s.quan], score: [{ ...s.score[0] }, { ...s.score[1] }], hand });
  const empty = (c: number) => s.dan[c] === 0 && !s.quan[c];

  let i = move.cell;
  let hand = s.dan[i];
  s.dan[i] = 0;
  rec("pick", i, hand);
  for (let guard = 0; guard < 100; guard++) {
    while (hand > 0) {
      i = wrap(i + move.dir);
      s.dan[i]++;
      hand--;
      rec("drop", i, hand);
    }
    const next = wrap(i + move.dir);
    if (isQuan(next)) break; // gặp ô quan: hết lượt
    if (s.dan[next] > 0) {
      // ô kế tiếp còn dân: bốc lên rải tiếp
      i = next;
      hand = s.dan[i];
      s.dan[i] = 0;
      rec("pick", i, hand);
      continue;
    }
    // ô kế tiếp trống: ăn ô sau nó; sau ô vừa ăn lại là ô trống thì ăn tiếp (ăn dây)
    let gap = next;
    for (;;) {
      const target = wrap(gap + move.dir);
      if (empty(target)) break;
      s.score[p].dan += s.dan[target];
      s.dan[target] = 0;
      if (s.quan[target]) {
        s.score[p].quan++;
        s.quan[target] = false;
      }
      rec("capture", target);
      gap = wrap(target + move.dir);
      if (!empty(gap)) break;
    }
    break;
  }
  endTurn(s, rec);
  return s;
}

function endTurn(s: State, rec: (kind: StepKind, cell: number, hand?: number, player?: Player) => void): void {
  s.turns++;
  s.turn = (1 - s.turn) as Player;
  const bothQuanGone = QUAN_CELLS.every((c) => s.dan[c] === 0 && !s.quan[c]);
  if (bothQuanGone || s.turns >= MAX_TURNS) {
    // Hết quan, tàn dân: ai còn dân bên mình thì thu về
    for (const pl of [0, 1] as Player[]) {
      for (const c of SIDE[pl]) {
        if (s.dan[c] > 0) {
          s.score[pl].dan += s.dan[c];
          s.dan[c] = 0;
          rec("collect", c, 0, pl);
        }
      }
    }
    s.over = true;
    return;
  }
  // Đến lượt mà cả 5 ô bên mình đều trống: lấy 5 dân đã ăn rải lại mỗi ô một viên (thiếu thì coi như vay, điểm âm)
  if (SIDE[s.turn].every((c) => s.dan[c] === 0)) {
    for (const c of SIDE[s.turn]) s.dan[c] = 1;
    s.score[s.turn].dan -= 5;
    rec("refill", SIDE[s.turn][0], 0, s.turn);
  }
}

/** Chênh lệch điểm theo góc nhìn của `p` (tính cả dân còn trên các ô bên mình, ở cuối ván sẽ được thu về) */
function evaluate(s: State, p: Player): number {
  const side = (pl: Player) => SIDE[pl].reduce((n, c) => n + s.dan[c], 0);
  const diff = points(s.score[p]) - points(s.score[(1 - p) as Player]);
  if (s.over) return diff * 100;
  return diff + 0.3 * (side(p) - side((1 - p) as Player));
}

function search(s: State, depth: number, alpha: number, beta: number, me: Player): number {
  if (depth === 0 || s.over) return evaluate(s, me);
  const moves = legalMoves(s);
  if (!moves.length) return evaluate(s, me);
  if (s.turn === me) {
    let best = -Infinity;
    for (const m of moves) {
      best = Math.max(best, search(play(s, m), depth - 1, alpha, beta, me));
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return best;
  }
  let best = Infinity;
  for (const m of moves) {
    best = Math.min(best, search(play(s, m), depth - 1, alpha, beta, me));
    beta = Math.min(beta, best);
    if (alpha >= beta) break;
  }
  return best;
}

export type Level = "easy" | "medium" | "hard";
const DEPTH: Record<Level, number> = { easy: 1, medium: 3, hard: 7 };

/** Nước đi của máy. Mức Dễ: thỉnh thoảng đi ngẫu nhiên. Các nước ngang điểm thì chọn ngẫu nhiên. */
export function bestMove(s: State, level: Level, rng: () => number = Math.random): Move {
  const moves = legalMoves(s);
  if (level === "easy" && rng() < 0.35) return moves[Math.floor(rng() * moves.length)];
  let best = -Infinity;
  let picks: Move[] = [];
  for (const m of moves) {
    const v = search(play(s, m), DEPTH[level] - 1, -Infinity, Infinity, s.turn);
    if (v > best + 1e-9) {
      best = v;
      picks = [m];
    } else if (Math.abs(v - best) <= 1e-9) picks.push(m);
  }
  return picks[Math.floor(rng() * picks.length)];
}
