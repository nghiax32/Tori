// Chế độ xem "String": trục ngang 15 ngày trước → hôm nay → 15 ngày sau. Mỗi sự kiện đang theo dõi là một hàng,
// có sợi chỉ nối từ hôm nay sang trái tới lần gần nhất đã qua và sang phải tới lần gần nhất sắp tới.
// Lần nào cách quá 15 ngày thì sợi chạy ra mép, không có điểm cuối.
import { h } from "@tori/ui";
import { fmt } from "./dates";
import type { Occurrence, TrackedItem, TrackedList } from "./types";

const NS = "http://www.w3.org/2000/svg";
const WINDOW = 15;
const HEADER_H = 54;
const ROW_H = 64;
const MAX_ROWS = 10; // theo dõi nhiều hơn thì chỉ hiện các sự kiện có lần sắp tới gần nhất

type Attrs = Record<string, string | number>;

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Node | string)[]) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  el.append(...children);
  return el;
}

const utc = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
/** Số ngày từ `from` tới `to` (âm nếu `to` trước `from`) */
const dayDiff = (from: string, to: string) => Math.round((utc(to) - utc(from)) / 86_400_000);
const shiftIso = (iso: string, n: number) => new Date(utc(iso) + n * 86_400_000).toISOString().slice(0, 10);
const short = (iso: string) => fmt(iso).slice(0, 5); // "20/11"

/** Bề rộng ước lượng của chữ cỡ 12px (đủ để tránh chữ chồng nhau, không cần đo thật) */
const textW = (s: string) => s.length * 6.4;

interface Row {
  title: string;
  tone: string;
  past?: TrackedItem;
  next?: TrackedItem;
}

export interface StringViewOptions {
  tone: (o: Occurrence) => string;
  shown: (o: Occurrence) => boolean;
  open: (o: Occurrence) => void;
}

export function renderStringView(host: HTMLElement, data: TrackedList, opts: StringViewOptions): void {
  const today = data.today;
  const byEvent = new Map<number, Row>();
  const rowOf = (x: TrackedItem) => {
    const o = x.occurrence;
    let row = byEvent.get(o.event_id);
    if (!row) {
      row = { title: o.title, tone: opts.tone(o) };
      byEvent.set(o.event_id, row);
    }
    return row;
  };
  for (const x of data.past) if (opts.shown(x.occurrence)) rowOf(x).past = x;
  for (const x of data.upcoming) if (opts.shown(x.occurrence)) rowOf(x).next = x;
  // gần hôm nay nhất lên trên
  const rank = (r: Row) => Math.min(r.past?.days ?? Infinity, r.next?.days ?? Infinity);
  const all = [...byEvent.values()];
  // Theo dõi nhiều quá thì chỉ lấy MAX_ROWS sự kiện có lần sắp tới gần nhất (không có lần sắp tới thì xếp sau,
  // theo lần đã qua gần nhất)
  const soonest = (r: Row) => [r.next?.days ?? Infinity, r.past?.days ?? Infinity];
  const picked =
    all.length <= MAX_ROWS
      ? all
      : [...all]
          .sort((a, b) => {
            const [an, ap] = soonest(a);
            const [bn, bp] = soonest(b);
            return an - bn || ap - bp || a.title.localeCompare(b.title, "vi");
          })
          .slice(0, MAX_ROWS);
  const rows = picked.sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title, "vi"));

  const hint = h(
    "p",
    { class: "muted string-view__hint" },
    "Sợi chỉ nối từ hôm nay tới lần gần nhất đã qua (bên trái) và sắp tới (bên phải) của sự kiện đang theo dõi. " +
      "Cách hơn 15 ngày thì sợi chạy ra mép." +
      (all.length > MAX_ROWS ? ` Đang hiện ${MAX_ROWS}/${all.length} sự kiện có lần sắp tới gần nhất.` : ""),
  );
  if (!rows.length) {
    const any = data.past.length + data.upcoming.length > 0;
    host.replaceChildren(
      h(
        "p",
        { class: "muted string-view__empty" },
        any
          ? "Không có sự kiện thuộc loại đang chọn ở nút “Theo dõi”."
          : "Chưa có sự kiện nào đang theo dõi. Tích “Theo dõi” khi thêm hoặc sửa sự kiện.",
      ),
      hint,
    );
    return;
  }

  // bề rộng phần nội dung (clientWidth gồm cả padding của khung)
  const css = getComputedStyle(host);
  const W = Math.max(280, host.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight));
  const narrow = W < 640;
  const padX = narrow ? 10 : 18;
  const H = HEADER_H + 30 + (rows.length - 1) * ROW_H + 40;
  const dayW = (W - padX * 2) / (WINDOW * 2 + 1);
  const x = (off: number) => padX + (off + WINDOW + 0.5) * dayW;
  const x0 = x(0);
  const root = svg("svg", {
    class: "string-view__svg",
    width: W,
    height: H,
    viewBox: `0 0 ${W} ${H}`,
    role: "group",
    "aria-label": "Sự kiện theo dõi trong 15 ngày trước và sau hôm nay",
  });

  // ---------- trục ngày ----------
  root.append(svg("rect", { class: "sv-today-band", x: x0 - dayW / 2, y: 0, width: dayW, height: H, rx: 6 }));
  const everyDay = dayW >= 22;
  for (let off = -WINDOW; off <= WINDOW; off++) {
    const iso = shiftIso(today, off);
    const day = Number(iso.slice(8));
    const xi = x(off);
    root.append(svg("line", { class: "sv-grid", x1: xi, y1: HEADER_H - 8, x2: xi, y2: H }));
    if (off === 0 || everyDay || off % 5 === 0) {
      root.append(svg("text", { class: off === 0 ? "sv-day sv-day--today" : "sv-day", x: xi, y: HEADER_H - 16 }, String(day)));
    }
    if (day === 1 || off === -WINDOW) {
      const label = `Tháng ${Number(iso.slice(5, 7))}`;
      // tên tháng cùng dòng với chữ "Hôm nay": quá gần thì dời sang phải chữ đó
      const mx = Math.abs(xi - x0) < 70 ? x0 + 34 : Math.max(padX, xi - dayW / 2);
      root.append(svg("text", { class: "sv-month", x: mx, y: 16 }, label));
    }
  }
  root.append(svg("text", { class: "sv-day sv-day--today", x: x0, y: 16 }, "Hôm nay"));
  root.append(svg("line", { class: "sv-today-line", x1: x0, y1: HEADER_H - 8, x2: x0, y2: H }));

  // ---------- từng sự kiện: mọi sợi cùng xuất phát từ một điểm ở cột hôm nay ----------
  const firstY = HEADER_H + 30;
  const lastY = firstY + (rows.length - 1) * ROW_H;
  const P = { x: x0, y: (firstY + lastY) / 2 };
  const strandsLayer = svg("g");
  const namesLayer = svg("g"); // tên vẽ trên cùng để sợi khác không đè lên
  const taken: { x1: number; x2: number; y1: number; y2: number }[] = [];
  /** Đặt tên vào chỗ trống: thử dịch lên/xuống dần cho tới khi không chồng tên đã đặt */
  const place = (cx: number, cy: number, w: number) => {
    for (const dy of [0, -15, 15, -30, 30, -45, 45]) {
      const box = { x1: cx - w / 2 - 4, x2: cx + w / 2 + 4, y1: cy + dy - 11, y2: cy + dy + 4 };
      if (!taken.some((b) => b.x1 < box.x2 && box.x1 < b.x2 && b.y1 < box.y2 && box.y1 < b.y2)) {
        taken.push(box);
        return cy + dy;
      }
    }
    return cy;
  };
  const nameW = (t: string) => t.length * 7.2; // chữ 13px đậm
  // tên đặt sau cùng, khi đã biết chỗ của mọi chữ dưới đầu sợi, để tránh cả những chữ đó
  const pending: { name: string; cx: number; cy: number; w: number; tone: string; tip: string; open: () => void }[] = [];

  rows.forEach((row, i) => {
    const y = firstY + i * ROW_H;
    const g = svg("g", { class: `sv-row sv-tone-${row.tone}` });
    const labels: { el: SVGTextElement; cx: number; w: number; side: -1 | 1 }[] = [];
    const name = row.title.length > 28 ? `${row.title.slice(0, 27).trimEnd()}…` : row.title;

    const strand = (item: TrackedItem, future: boolean) => {
      const o = item.occurrence;
      const startOff = dayDiff(today, o.start_date);
      const endOff = dayDiff(today, o.end_date);
      // điểm cuối: lần sắp tới tính từ ngày bắt đầu (đang diễn ra thì là hôm nay), lần đã qua tính từ ngày kết thúc
      const off = future ? Math.max(startOff, 0) : endOff;
      const inside = Math.abs(off) <= WINDOW;
      const tx = inside ? x(off) : future ? W - padX : padX;
      const hit = svg("g", { class: "sv-hit", tabindex: 0, role: "button" });
      const when = future
        ? item.days === 0
          ? o.start_date < today
            ? "Đang diễn ra"
            : "Hôm nay"
          : item.days === 1
            ? "Ngày mai"
            : `còn ${item.days} ngày`
        : item.days === 1
          ? "Hôm qua"
          : `${item.days} ngày trước`;
      const dateText = future ? o.start_date : o.end_date;
      const tip = `${o.title} · ${fmt(o.start_date)}${o.end_date !== o.start_date ? ` – ${fmt(o.end_date)}` : ""} · ${when}`;
      hit.append(svg("title", {}, tip));

      // sợi cong mềm từ điểm chung ở hôm nay tới hàng của sự kiện
      const dx = tx - P.x;
      hit.append(
        svg("path", {
          class: "sv-string",
          d: `M ${P.x} ${P.y} C ${P.x + dx * 0.45} ${P.y} ${P.x + dx * 0.55} ${y} ${tx} ${y}`,
        }),
      );
      // sự kiện nhiều ngày: một đoạn trên hàng
      if (startOff !== endOff) {
        const a = Math.max(-WINDOW - 0.5, Math.min(WINDOW + 0.5, startOff));
        const b = Math.max(-WINDOW - 0.5, Math.min(WINDOW + 0.5, endOff));
        if (a !== b) hit.append(svg("line", { class: "sv-range", x1: x(a), y1: y, x2: x(b), y2: y }));
      }
      let text: string;
      if (inside) {
        hit.append(svg("circle", { class: "sv-bead", cx: tx, cy: y, r: 5.5 }));
        text = item.days <= 1 || narrow ? when : `${short(dateText)} · ${when}`;
      } else {
        // không có điểm cuối: đầu sợi tưa ra ở mép
        const dir = future ? 1 : -1;
        for (const a of [-0.5, 0, 0.5]) {
          hit.append(
            svg("line", {
              class: "sv-fray",
              x1: tx - dir * 6,
              y1: y,
              x2: tx + dir * Math.cos(a) * 2,
              y2: y + Math.sin(a) * 7,
            }),
          );
        }
        text = narrow ? (future ? `${when} →` : `← ${when}`) : future ? `${fmt(dateText)} · ${when} →` : `← ${fmt(dateText)} · ${when}`;
      }
      const w = textW(text);
      const el = svg("text", { class: "sv-label", y: y + 23 }, text);
      hit.append(el);
      labels.push({ el, cx: inside ? tx : future ? W - padX - w / 2 : padX + w / 2, w, side: future ? 1 : -1 });

      // tên sự kiện ở giữa sợi; sợi quá ngắn thì đặt cạnh đầu sợi
      const nw = nameW(name);
      let ncx = P.x + dx / 2;
      let ncy = (P.y + y) / 2 - 7;
      if (Math.abs(dx) < nw + 30) {
        ncx = future ? tx + 12 + nw / 2 : tx - 12 - nw / 2;
        ncy = y - 9;
      }
      ncx = Math.max(padX + nw / 2, Math.min(W - padX - nw / 2, ncx));
      const open = () => opts.open(o);
      pending.push({ name, cx: ncx, cy: ncy, w: nw, tone: row.tone, tip, open });
      hit.addEventListener("click", open);
      hit.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });
      g.append(hit);
    };
    if (row.past) strand(row.past, false);
    if (row.next) strand(row.next, true);

    // chữ dưới hai đầu sợi: giữ trong khung, hai bên chồng nhau thì đẩy ra hai phía
    for (const l of labels) l.cx = Math.max(padX + l.w / 2, Math.min(W - padX - l.w / 2, l.cx));
    if (labels.length === 2) {
      const [left, right] = labels[0].side < 0 ? labels : [labels[1], labels[0]];
      const overlap = left.cx + left.w / 2 + 10 - (right.cx - right.w / 2);
      if (overlap > 0) {
        left.cx = Math.max(padX + left.w / 2, left.cx - overlap / 2);
        right.cx = Math.min(W - padX - right.w / 2, right.cx + overlap / 2);
      }
    }
    for (const l of labels) {
      l.el.setAttribute("x", String(l.cx));
      taken.push({ x1: l.cx - l.w / 2 - 2, x2: l.cx + l.w / 2 + 2, y1: y + 12, y2: y + 27 });
    }
    strandsLayer.append(g);
  });
  for (const n of pending) {
    const label = svg("text", { class: "sv-name sv-hit", x: n.cx, y: place(n.cx, n.cy, n.w) }, n.name);
    label.append(svg("title", {}, n.tip));
    label.addEventListener("click", n.open);
    namesLayer.append(svg("g", { class: `sv-tone-${n.tone}` }, label));
  }
  root.append(strandsLayer, namesLayer);
  // điểm chung của mọi sợi
  root.append(svg("circle", { class: "sv-hub", cx: P.x, cy: P.y, r: 6 }));

  host.replaceChildren(root, hint);
}
