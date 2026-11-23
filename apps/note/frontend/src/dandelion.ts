// Chế độ "Bồ công anh": mỗi ghi chú là một hạt bồ công anh bay theo gió, một cây bồ công anh lớn
// đứng giữa đáy màn hình. Vẽ bằng canvas 2D, không dùng thư viện.
import { h, isoToVn } from "@tori/ui";
import type { Note } from "./app";

const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const darkScheme = matchMedia("(prefers-color-scheme: dark)");

// Kích thước ảnh một hạt (px CSS); (SEED_AX, SEED_AY) là điểm tụ của chùm tơ = vị trí của hạt
const SEED_W = 56;
const SEED_H = 66;
const SEED_AX = 28;
const SEED_AY = 22;

interface Palette {
  dark: boolean;
  skyTop: string;
  skyBottom: string;
  text: string;
  accent: string;
  font: string;
  labelBg: string;
  stalk: string;
  achene: string;
  filament: string;
  shade: string | null;
  stem: string;
  leaf: string;
  leafDark: string;
  groundTop: string;
  groundBottom: string;
  grassBack: string;
  grass: string;
  grassLight: string;
}

function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  const dark = darkScheme.matches;
  return {
    dark,
    skyTop: dark ? "#0c1326" : "#b7d5ef",
    skyBottom: dark ? "#1f2442" : "#f2f1e4",
    text: v("--text") || (dark ? "#ecebe7" : "#1d1c1a"),
    accent: v("--accent") || "#3451d1",
    font: v("--font") || "system-ui, sans-serif",
    labelBg: dark ? "rgba(16, 20, 38, 0.62)" : "rgba(255, 255, 255, 0.74)",
    stalk: dark ? "#bcae96" : "#8b7c66",
    achene: dark ? "#a98157" : "#7a5534",
    filament: dark ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 255, 255, 0.97)",
    shade: dark ? null : "rgba(70, 90, 120, 0.3)", // viền mờ để tơ trắng nổi trên nền trời sáng
    stem: dark ? "#5f9d6a" : "#5b984e",
    leaf: dark ? "#3f7a4c" : "#58a04c",
    leafDark: dark ? "#2a5435" : "#3a7434",
    groundTop: dark ? "#29462f" : "#86b863",
    groundBottom: dark ? "#16261b" : "#557d3d",
    grassBack: dark ? "#24442e" : "#4f8a3f",
    grass: dark ? "#2f5a3b" : "#5f9c47",
    grassLight: dark ? "#3f7350" : "#7fba5d",
  };
}

function canvasOf(w: number, hgt: number, dpr: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = Math.ceil(w * dpr);
  c.height = Math.ceil(hgt * dpr);
  const g = c.getContext("2d")!;
  g.scale(dpr, dpr);
  g.lineCap = "round";
  return [c, g];
}

/** Ảnh một hạt bồ công anh: chùm tơ hình dù, cuống mảnh, hạt nâu ở dưới. */
function makeSeedSprite(p: Palette, stalk: string, dpr: number): HTMLCanvasElement {
  const [c, g] = canvasOf(SEED_W, SEED_H, dpr);
  const ax = SEED_AX;
  const ay = SEED_AY;
  g.strokeStyle = stalk;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(ax, ay);
  g.quadraticCurveTo(ax + 1.5, ay + 16, ax, ay + 31);
  g.stroke();
  g.fillStyle = p.achene;
  g.beginPath();
  g.ellipse(ax, ay + 36, 1.8, 5.2, 0, 0, TAU);
  g.fill();

  const hairs: [number, number][] = [];
  const n = 28;
  for (let i = 0; i < n; i++) {
    hairs.push([-Math.PI * 0.98 + (Math.PI * 0.96 * i) / (n - 1) + rand(-0.04, 0.04), 18 * rand(0.84, 1.06)]);
  }
  const passes: [string, number][] = p.shade ? [[p.shade, 1.9], [p.filament, 0.7]] : [[p.filament, 0.7]];
  for (const [color, width] of passes) {
    g.strokeStyle = color;
    g.lineWidth = width;
    for (const [a, len] of hairs) {
      const ex = ax + Math.cos(a) * len;
      const ey = ay + Math.sin(a) * len * 0.72 - 2;
      g.beginPath();
      g.moveTo(ax, ay);
      g.quadraticCurveTo(ax + Math.cos(a) * len * 0.45, ay + Math.sin(a) * len * 0.62 - 3, ex, ey);
      // nhánh tơ nhỏ ở đầu sợi
      g.moveTo(ex, ey);
      g.lineTo(ex + Math.cos(a - 0.6) * 3, ey + Math.sin(a - 0.6) * 3);
      g.moveTo(ex, ey);
      g.lineTo(ex + Math.cos(a + 0.6) * 3, ey + Math.sin(a + 0.6) * 3);
      g.stroke();
    }
  }
  return c;
}

/** Ảnh quả cầu bông của cây lớn: các hạt xếp trên mặt cầu (phân bố Fibonacci), hạt phía sau mờ hơn. */
function makePuffSprite(p: Palette, R: number, dpr: number): HTMLCanvasElement {
  const r = R * 0.22;
  const size = Math.ceil((R + r + 4) * 2);
  const [c, g] = canvasOf(size, size, dpr);
  const cx = size / 2;
  const N = Math.round(clamp(R * 1.8, 90, 170));
  const pts: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * (i + 0.5)) / N;
    const rad = Math.sqrt(1 - y * y);
    const th = i * 2.399963;
    pts.push({ x: Math.cos(th) * rad, y, z: Math.sin(th) * rad });
  }
  pts.sort((a, b) => a.z - b.z);

  const receptacle = () => {
    const grad = g.createRadialGradient(cx - R * 0.03, cx - R * 0.03, 1, cx, cx, R * 0.14);
    grad.addColorStop(0, p.dark ? "#9c8a5e" : "#a89a63");
    grad.addColorStop(1, p.dark ? "#5e5233" : "#6f6438");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cx, R * 0.14, 0, TAU);
    g.fill();
  };
  let drewCenter = false;
  for (const pt of pts) {
    if (!drewCenter && pt.z >= 0) {
      receptacle();
      drewCenter = true;
    }
    const px = cx + pt.x * R;
    const py = cx + pt.y * R;
    const depth = 0.35 + 0.65 * ((pt.z + 1) / 2);
    g.globalAlpha = depth * 0.7;
    g.strokeStyle = p.dark ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.9)";
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(cx, cx);
    g.lineTo(px, py);
    g.stroke();
    // chùm tơ của từng hạt nhìn từ xa: hình sao nhỏ
    const rays = 11;
    const passes: [string, number][] = p.shade ? [[p.shade, 1.3], [p.filament, 0.55]] : [[p.filament, 0.55]];
    g.globalAlpha = depth;
    for (const [color, width] of passes) {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.beginPath();
      for (let k = 0; k < rays; k++) {
        const a = (k / rays) * TAU + pt.x * 3;
        const len = r * (0.7 + ((k * 37) % 10) / 33);
        g.moveTo(px, py);
        g.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len);
      }
      g.stroke();
    }
  }
  if (!drewCenter) receptacle();
  g.globalAlpha = 1;
  return c;
}

/** Lá bồ công anh: dài, mép xẻ răng cưa ngược về phía gốc. Toạ độ theo trục lá (gốc ở 0, ngọn ở +x). */
function leafPath(len: number, width: number): Path2D {
  const path = new Path2D();
  const teeth = 6;
  const upper: [number, number][] = [];
  for (let i = 1; i <= teeth; i++) {
    const t = i / (teeth + 1);
    const hw = width * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.1)), 0.8);
    upper.push([t * len - len / 16, hw * 0.45], [t * len, hw]);
  }
  path.moveTo(0, 0);
  for (const [x, y] of upper) path.lineTo(x, -y);
  path.quadraticCurveTo(len * 0.97, -width * 0.25, len, 0);
  for (let i = upper.length - 1; i >= 0; i--) {
    const [x, y] = upper[i];
    path.lineTo(x + len / 30, y * 0.95);
  }
  path.closePath();
  return path;
}

interface Leaf {
  angle: number;
  len: number;
  width: number;
  path: Path2D;
}

interface Seed {
  note: Note;
  label: string;
  dueText: string;
  labelW: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  drift: number;
  scale: number;
  sprite: number;
  alpha: number;
  state: "in" | "float" | "fly" | "fade";
}

export interface Garden {
  /** `visible`: ghi chú đang bay; `all`: mọi ghi chú (để biết ghi chú biến mất vì xong hay vì xoá) */
  setNotes(visible: Note[], all: Note[]): void;
  destroy(): void;
}

export function createGarden(
  host: HTMLElement,
  opts: { onOpen: (note: Note) => void; topInset: () => number; todayIso: () => string },
): Garden {
  const canvas = h("canvas", { role: "img", "aria-label": "Ghi chú dạng hạt bồ công anh" }) as HTMLCanvasElement;
  const tip = h("div", { class: "garden-tip", hidden: true });
  const empty = h(
    "p",
    { class: "garden-empty", hidden: true },
    "Chưa có ghi chú nào đang bay. Viết một ghi chú ở ô phía trên để thả một hạt bồ công anh.",
  );
  host.replaceChildren(canvas, tip, empty);
  const ctx = canvas.getContext("2d")!;

  let W = 0;
  let prevW = 0;
  let H = 0;
  let dpr = 1;
  let palette = readPalette();
  let seedSprites: HTMLCanvasElement[] = [];
  let todaySprites: HTMLCanvasElement[] = [];
  let puff: HTMLCanvasElement | null = null;
  let sky: CanvasGradient | null = null;
  let leaves: Leaf[] = [];
  // mặt đất ở đáy màn hình, cỏ mọc dọc mép đất: lớp sau (đậm, cao) vẽ trước cây, lớp trước vẽ sau để che gốc cây
  let groundH = 50;
  let grassH = 50;
  let baseY = 0; // gốc cây lớn
  let blades: { x: number; h: number; w: number; lean: number; phase: number; layer: 0 | 1 | 2 }[] = [];
  let stemLen = 200;
  let R = 60;
  let top = 0;
  let bottom = 0;
  const head = { x: 0, y: 0 };
  let sway = 0;

  const seeds: Seed[] = [];
  let hover: Seed | null = null;
  const pointer = { x: 0, y: 0, vx: 0, vy: 0, inside: false, lastT: 0 };
  let initialized = false;
  let tt = 0;
  let last = performance.now();
  let raf = 0;

  const labelFont = () => `500 13px ${palette.font}`;
  // màn hẹp (điện thoại): nhãn ngắn hơn, hạt nhỏ hơn
  const narrow = () => W < 600;
  const labelMax = () => (narrow() ? 130 : 210);

  function buildSprites() {
    seedSprites = [0, 1, 2].map(() => makeSeedSprite(palette, palette.stalk, dpr));
    todaySprites = [0, 1, 2].map(() => makeSeedSprite(palette, palette.accent, dpr));
    puff = makePuffSprite(palette, R, dpr);
  }

  function relabel(s: Seed) {
    const first = s.note.content.split("\n")[0].trim();
    ctx.font = labelFont();
    let label = first;
    const max = labelMax();
    if (ctx.measureText(label).width > max) {
      while (label.length > 1 && ctx.measureText(`${label}…`).width > max) label = label.slice(0, -1);
      label = `${label.trimEnd()}…`;
    }
    s.label = label;
    const due = s.note.due;
    s.dueText = !due ? "" : due === opts.todayIso() ? " · Hôm nay" : ` · ${isoToVn(due).slice(0, 5)}`;
    s.labelW = ctx.measureText(label + s.dueText).width + 16;
  }

  /** Mép trên mặt đất: gợn nhẹ, nhô thành gò nhỏ ở giữa (chỗ cây lớn mọc) */
  const groundY = (x: number) =>
    H - groundH + Math.sin((x / W) * Math.PI * 1.3 + 0.5) * 6 - 14 * Math.exp(-(((x - W / 2) / (W * 0.14)) ** 2));

  function resize() {
    const rect = host.getBoundingClientRect();
    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    // màn hẹp: cây thấp và nhỏ hơn để còn chỗ cho các hạt
    stemLen = clamp(H * (narrow() ? 0.32 : 0.4), 120, 360);
    R = clamp(Math.min(stemLen * 0.27, W * (narrow() ? 0.13 : 0.16)), 36, 92);
    top = clamp(opts.topInset() + 24, 20, H * 0.5);
    groundH = clamp(H * 0.07, 30, 60);
    grassH = clamp(H * 0.075, 30, 64);
    baseY = groundY(W / 2) + 6;
    bottom = H - groundH - grassH - 30;
    blades = [];
    for (let x = rand(-4, 2); x < W + 6; x += rand(3, 7)) {
      const layer = Math.random() < 0.45 ? 0 : Math.random() < 0.6 ? 1 : 2;
      blades.push({
        x,
        h: grassH * rand(0.45, 1) * (layer === 0 ? 1.1 : 1),
        w: rand(3, 6),
        lean: rand(-0.4, 0.4),
        phase: rand(0, TAU),
        layer,
      });
    }
    sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, palette.skyTop);
    sky.addColorStop(1, palette.skyBottom);
    const s = stemLen / 300;
    // lá hình hoa thị xoè thấp quanh gốc, to cho cân với cây
    leaves = [
      [-2.95, 1.0],
      [-2.62, 0.85],
      [-0.2, 0.95],
      [-0.52, 0.8],
      [-2.2, 0.62],
      [-0.95, 0.6],
      [-1.62, 0.42],
    ].map(([angle, k]) => {
      const len = 210 * s * k;
      const width = 30 * s * (0.8 + k * 0.3);
      return { angle, len, width, path: leafPath(len, width) };
    });
    buildSprites();
    // bề ngang đổi nhiều (xoay điện thoại, kéo giãn cửa sổ): rải lại các hạt cho đều
    const spread = prevW > 0 && Math.abs(W - prevW) / prevW > 0.25;
    prevW = W;
    for (const seed of seeds) {
      relabel(seed);
      if (spread && seed.state === "float") placeRandom(seed);
      seed.x = clamp(seed.x, 20, Math.max(20, W - 30 - seed.labelW));
      seed.y = clamp(seed.y, top, bottom);
    }
  }

  function placeRandom(s: Seed) {
    let best = { x: 0, y: 0, score: -1 };
    for (let i = 0; i < 24; i++) {
      const x = rand(30, Math.max(40, W - 40 - s.labelW));
      const y = rand(top + 10, Math.max(top + 20, bottom - 30));
      if (Math.hypot(x - W / 2, y - (baseY - stemLen)) < R + 60) continue;
      let score = Infinity;
      for (const o of seeds) {
        if (o === s) continue;
        score = Math.min(score, Math.hypot((x - o.x) / 2.6, y - o.y));
      }
      if (score > best.score) best = { x, y, score };
    }
    s.x = best.x || rand(30, W - 30);
    s.y = best.y || rand(top, bottom);
  }

  function makeSeed(note: Note): Seed {
    const s: Seed = {
      note,
      label: "",
      dueText: "",
      labelW: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      phase: rand(0, TAU),
      drift: rand(-5, 5),
      scale: narrow() ? rand(0.85, 1.05) : rand(1.05, 1.3),
      sprite: Math.floor(rand(0, 3)),
      alpha: 1,
      state: "float",
    };
    relabel(s);
    return s;
  }

  function setNotes(visible: Note[], all: Note[]) {
    const wanted = new Map(visible.map((n) => [n.id, n]));
    const alive = new Map<number, Seed>();
    for (const s of seeds) {
      if (s.state === "fly" || s.state === "fade") continue;
      const next = wanted.get(s.note.id);
      if (next) {
        s.note = next;
        relabel(s);
        alive.set(next.id, s);
      } else {
        const now = all.find((n) => n.id === s.note.id);
        s.state = now?.done ? "fly" : "fade";
        if (s.state === "fly") {
          s.vy = Math.min(s.vy, -110);
          s.vx += 40;
        }
        if (hover === s) setHover(null);
      }
    }
    for (const n of visible) {
      if (alive.has(n.id)) continue;
      const s = makeSeed(n);
      if (initialized) {
        // ghi chú mới: hạt bứt ra từ quả cầu bông của cây lớn rồi bay lên
        s.x = head.x + rand(-R * 0.5, R * 0.5);
        s.y = head.y + rand(-R * 0.5, R * 0.2);
        s.vx = rand(-45, 45);
        s.vy = rand(-120, -80);
        s.alpha = 0;
        s.state = "in";
      } else {
        placeRandom(s);
      }
      seeds.push(s);
    }
    initialized = true;
    empty.hidden = visible.length > 0;
    canvas.setAttribute("aria-label", `${visible.length} ghi chú đang bay dưới dạng hạt bồ công anh`);
  }

  // gió đổi chiều chậm qua lại (trung bình bằng 0) để hạt luôn ở trong màn hình
  const wind = (y: number) => 12 * Math.sin(tt * 0.09) + 6 * Math.sin(tt * 0.31 + y * 0.006);

  function step(d: number) {
    sway = Math.sin(tt * 0.6) * 0.035 + wind(H * 0.5) * 0.003;
    head.x = W / 2 + Math.sin(sway) * stemLen;
    head.y = baseY - Math.cos(sway) * stemLen;
    pointer.vx *= Math.pow(0.02, d);
    pointer.vy *= Math.pow(0.02, d);

    const floating = seeds.filter((s) => s.state === "in" || s.state === "float");
    // các hạt đẩy nhẹ nhau ra để nhãn chữ không chồng lên nhau
    for (let i = 0; i < floating.length; i++) {
      for (let j = i + 1; j < floating.length; j++) {
        const a = floating[i];
        const b = floating[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const nx = dx / (narrow() ? 140 : 170);
        const ny = dy / (narrow() ? 34 : 44);
        const q = nx * nx + ny * ny;
        if (q >= 1 || q === 0) continue;
        const f = (1 - Math.sqrt(q)) * 110 * d;
        const len = Math.hypot(dx, dy) || 1;
        if (a !== hover) {
          a.vx -= (dx / len) * f;
          a.vy -= (dy / len) * f * 1.5;
        }
        if (b !== hover) {
          b.vx += (dx / len) * f;
          b.vy += (dy / len) * f * 1.5;
        }
      }
    }

    for (const s of seeds) {
      if (s.state === "fly") {
        // đã xong: bay vút lên rồi mờ dần
        s.vy -= 170 * d;
        s.vx += (wind(s.y) * 2 + 40 - s.vx) * d;
        s.alpha -= d / 2;
      } else if (s.state === "fade") {
        s.alpha -= d * 2.2;
      } else if (s === hover) {
        const k = Math.min(1, d * 6);
        s.vx -= s.vx * k;
        s.vy -= s.vy * k;
      } else {
        if (s.state === "in") {
          s.alpha = Math.min(1, s.alpha + d * 1.8);
          if (s.alpha >= 1) s.state = "float";
        }
        const tvx = wind(s.y) + s.drift;
        const tvy = Math.sin(tt * 0.5 + s.phase) * 9 - 1.5;
        s.vx += (tvx - s.vx) * d * 0.5;
        s.vy += (tvy - s.vy) * d * 0.5;
        if (s.y < top) s.vy += (top - s.y) * d * 2;
        if (s.y > bottom) s.vy -= (s.y - bottom) * d * 2;
        const left = 16;
        const right = W - 24 - s.labelW;
        if (s.x < left) s.vx += (left - s.x) * d * 2;
        if (s.x > right) s.vx -= (s.x - right) * d * 2;
        // tránh quả cầu bông của cây lớn
        const hx = s.x - head.x;
        const hy = s.y - head.y;
        const hd = Math.hypot(hx, hy) || 1;
        const avoid = R + (narrow() ? 22 : 55);
        if (hd < avoid) {
          const push = (avoid - hd) * d * 3;
          s.vx += (hx / hd) * push;
          s.vy += (hy / hd) * push;
        }
        // chuột lướt qua tạo gió
        if (pointer.inside) {
          const pd = Math.hypot(s.x - pointer.x, s.y - pointer.y);
          if (pd < 150) {
            const f = (1 - pd / 150) * d * 1.4;
            s.vx += pointer.vx * f;
            s.vy += pointer.vy * f;
          }
        }
        const speed = Math.hypot(s.vx, s.vy);
        if (speed > 260) {
          s.vx *= 260 / speed;
          s.vy *= 260 / speed;
        }
      }
      s.x += s.vx * d;
      s.y += s.vy * d;
      if (s.state === "float") {
        // giới hạn cứng: không bay khuất sau ô ghi chú mới / thanh công cụ hay xuống tận đáy
        if (s.y < top - 20) {
          s.y = top - 20;
          s.vy = Math.max(s.vy, 0);
        } else if (s.y > bottom + 20) {
          s.y = bottom + 20;
          s.vy = Math.min(s.vy, 0);
        }
      }
    }
    for (let i = seeds.length - 1; i >= 0; i--) {
      const s = seeds[i];
      if ((s.state === "fly" || s.state === "fade") && (s.alpha <= 0 || s.y < -120)) seeds.splice(i, 1);
    }
  }

  /** Vẽ một lớp cỏ: mỗi lá cỏ là hình thon nhọn, uốn theo gió */
  function drawGround() {
    const g = ctx;
    const grad = g.createLinearGradient(0, H - groundH - 14, 0, H);
    grad.addColorStop(0, palette.groundTop);
    grad.addColorStop(1, palette.groundBottom);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= W + 6; x += 6) g.lineTo(x, groundY(x));
    g.lineTo(W, H);
    g.closePath();
    g.fill();
  }

  function drawGrass(layers: (0 | 1 | 2)[]) {
    const g = ctx;
    const gust = wind(H) * 0.014;
    const colors = [palette.grassBack, palette.grass, palette.grassLight];
    for (const layer of layers) {
      g.fillStyle = colors[layer];
      g.beginPath();
      for (const b of blades) {
        if (b.layer !== layer) continue;
        const bend = b.lean + gust + Math.sin(tt * 1.4 + b.phase) * 0.07;
        const y0 = groundY(b.x) + 4; // gốc cỏ cắm vào mép đất
        const tipX = b.x + bend * b.h;
        const tipY = y0 - b.h * (1 - Math.abs(bend) * 0.25);
        const midX = b.x + bend * b.h * 0.35;
        const midY = y0 - b.h * 0.55;
        g.moveTo(b.x - b.w / 2, y0);
        g.quadraticCurveTo(midX - b.w * 0.3, midY, tipX, tipY);
        g.quadraticCurveTo(midX + b.w * 0.3, midY, b.x + b.w / 2, y0);
      }
      g.fill();
    }
  }

  function drawPlant() {
    const g = ctx;
    const baseX = W / 2;
    // lá
    for (const leaf of leaves) {
      g.save();
      g.translate(baseX, baseY - 4);
      g.rotate(leaf.angle + Math.sin(tt * 0.8 + leaf.angle) * 0.015);
      const grad = g.createLinearGradient(0, 0, leaf.len, 0);
      grad.addColorStop(0, palette.leafDark);
      grad.addColorStop(1, palette.leaf);
      g.fillStyle = grad;
      g.fill(leaf.path);
      g.strokeStyle = "rgba(255,255,255,0.18)";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(leaf.len * 0.92, 0);
      g.stroke();
      g.restore();
    }
    // thân
    const cx = baseX + Math.sin(sway) * stemLen * 0.35;
    const cy = baseY - stemLen * 0.5;
    g.lineCap = "round";
    g.strokeStyle = palette.stem;
    g.lineWidth = clamp(stemLen / 50, 4, 7);
    g.beginPath();
    g.moveTo(baseX, baseY);
    g.quadraticCurveTo(cx, cy, head.x, head.y);
    g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.16)";
    g.lineWidth = 1.5;
    g.stroke();
    // quả cầu bông
    if (puff) {
      const size = puff.width / dpr;
      g.save();
      g.translate(head.x, head.y);
      g.rotate(sway * 1.5);
      g.drawImage(puff, -size / 2, -size / 2, size, size);
      g.restore();
    }
  }

  function roundRect(x: number, y: number, w: number, hgt: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + hgt, r);
    ctx.arcTo(x + w, y + hgt, x, y + hgt, r);
    ctx.arcTo(x, y + hgt, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function labelRect(s: Seed): [number, number, number, number] {
    const right = s.x + 18 + s.labelW <= W - 6;
    return [right ? s.x + 18 : s.x - 18 - s.labelW, s.y - 11, s.labelW, 22];
  }

  function drawSeeds() {
    const g = ctx;
    const today = opts.todayIso();
    g.font = labelFont();
    g.textBaseline = "middle";
    for (const s of seeds) {
      if (s.alpha <= 0) continue;
      g.globalAlpha = clamp(s.alpha, 0, 1);
      const sprites = s.note.due === today ? todaySprites : seedSprites;
      const sprite = sprites[s.sprite];
      const tilt = clamp(s.vx * 0.012, -0.45, 0.45) * 0.6 + Math.sin(tt * 1.3 + s.phase) * 0.07;
      g.save();
      g.translate(s.x, s.y);
      g.rotate(tilt);
      g.drawImage(sprite, -SEED_AX * s.scale, -SEED_AY * s.scale, SEED_W * s.scale, SEED_H * s.scale);
      g.restore();
      if (s.state === "fly" && s.alpha < 0.5) continue;
      const [lx, ly, lw, lh] = labelRect(s);
      roundRect(lx, ly, lw, lh, 11);
      g.fillStyle = palette.labelBg;
      g.fill();
      if (s === hover) {
        g.strokeStyle = palette.accent;
        g.lineWidth = 1.5;
        g.stroke();
      }
      g.fillStyle = palette.text;
      g.fillText(s.label, lx + 8, ly + lh / 2 + 0.5);
      if (s.dueText) {
        g.fillStyle = palette.accent;
        g.fillText(s.dueText, lx + 8 + g.measureText(s.label).width, ly + lh / 2 + 0.5);
      }
    }
    g.globalAlpha = 1;
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = sky ?? palette.skyTop;
    ctx.fillRect(0, 0, W, H);
    drawGround();
    drawGrass([0]);
    drawPlant();
    drawGrass([1, 2]);
    drawSeeds();
  }

  function placeTip() {
    if (!hover) return;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let x = hover.x - tw / 2;
    let y = hover.y + 22;
    if (y + th > H - 8) y = hover.y - 30 - th;
    x = clamp(x, 8, W - tw - 8);
    tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const d = dt * (reduceMotion.matches ? 0.3 : 1);
    tt += d;
    step(d);
    draw();
    placeTip();
    raf = requestAnimationFrame(frame);
  }

  function hitTest(x: number, y: number): Seed | null {
    for (let i = seeds.length - 1; i >= 0; i--) {
      const s = seeds[i];
      if (s.state === "fly" || s.state === "fade") continue;
      if (Math.hypot(x - s.x, y - (s.y + 4)) < 22 * s.scale) return s;
      const [lx, ly, lw, lh] = labelRect(s);
      if (x >= lx && x <= lx + lw && y >= ly && y <= ly + lh) return s;
    }
    return null;
  }

  function setHover(s: Seed | null) {
    if (s === hover) return;
    hover = s;
    canvas.style.cursor = s ? "pointer" : "";
    if (!s) {
      tip.hidden = true;
      return;
    }
    const due = s.note.due ? `Hạn chót ${isoToVn(s.note.due)}` : "Không có hạn chót";
    tip.replaceChildren(s.note.content, h("small", {}, `${due} · Bấm để sửa`));
    tip.hidden = false;
    placeTip();
  }

  const local = (e: PointerEvent | MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const onMove = (e: PointerEvent) => {
    const { x, y } = local(e);
    const now = performance.now();
    const dtp = Math.max(8, now - pointer.lastT) / 1000;
    if (pointer.inside) {
      pointer.vx = pointer.vx * 0.5 + ((x - pointer.x) / dtp) * 0.5;
      pointer.vy = pointer.vy * 0.5 + ((y - pointer.y) / dtp) * 0.5;
    }
    Object.assign(pointer, { x, y, inside: true, lastT: now });
    if (e.pointerType === "mouse") setHover(hitTest(x, y));
  };
  const onLeave = () => {
    pointer.inside = false;
    setHover(null);
  };
  const onClick = (e: MouseEvent) => {
    const { x, y } = local(e);
    const s = hitTest(x, y);
    if (s) opts.onOpen(s.note);
  };
  const onScheme = () => {
    palette = readPalette();
    resize();
    for (const s of seeds) relabel(s);
  };

  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("click", onClick);
  darkScheme.addEventListener("change", onScheme);
  const observer = new ResizeObserver(() => resize());
  observer.observe(host);
  resize();
  raf = requestAnimationFrame(frame);

  return {
    setNotes,
    destroy() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      darkScheme.removeEventListener("change", onScheme);
      host.replaceChildren();
    },
  };
}
