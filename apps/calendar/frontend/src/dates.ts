// Ngày luôn ở dạng chuỗi ISO "YYYY-MM-DD" theo giờ địa phương, giống backend.

const pad = (n: number) => String(n).padStart(2, "0");

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export const todayIso = () => toIso(new Date());

/** "2026-09-02" -> "02/09/2026" */
export function fmt(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function fmtRange(start: string, end: string): string {
  return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}

/** Khoảng cách giữa hai ngày dạng "1 năm 2 tháng 3 ngày" (from <= to). */
export function spanText(fromIso: string, toIso: string): string {
  const [y1, m1, d1] = fromIso.split("-").map(Number);
  const [y2, m2, d2] = toIso.split("-").map(Number);
  let [y, m, d] = [y2 - y1, m2 - m1, d2 - d1];
  if (d < 0) {
    m -= 1;
    d += new Date(y2, m2 - 1, 0).getDate(); // số ngày của tháng trước tháng `to`
  }
  if (m < 0) {
    y -= 1;
    m += 12;
  }
  return [y && `${y} năm`, m && `${m} tháng`, d && `${d} ngày`].filter(Boolean).join(" ");
}

export const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

/** 42 ngày (6 tuần, bắt đầu thứ Hai) phủ tháng `month` (0-11). */
export function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
