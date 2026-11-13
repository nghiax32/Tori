import type { CalendarKind, EventSummary, Kind, Occurrence } from "./types";

/** Nháp form "Thêm sự kiện". Ô ngày lưu nguyên chữ đang gõ (có thể chưa đủ ngày). */
export interface AddDraft {
  form: "add";
  title: string;
  selected: EventSummary | null;
  kind: Kind;
  start: string;
  end: string;
  occNote: string;
  calendar: CalendarKind;
  dayMonth: string;
  year: string;
  leap: boolean;
  eventNote: string;
  labels: string[];
  labelText: string;
  tracked: boolean;
}

/** Nháp hộp thoại sửa một lần xảy ra */
export interface OccDraft {
  form: "occ";
  occ: Occurrence;
  title: string;
  start: string;
  end: string;
  note: string;
  labels: string[];
  labelText: string;
  tracked: boolean;
}

export type Draft = AddDraft | OccDraft;

// sessionStorage: còn sau F5, mất khi đóng tab
const KEY = "calendar:draft";

export function loadDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function clearDraft(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // không lưu được nháp thì thôi
  }
}

/** Lưu nháp mỗi khi form thay đổi; xoá nháp khi hộp thoại đóng (Huỷ, Esc, lưu xong). F5 không đóng hộp thoại nên nháp còn. */
export function keepDraft(dialog: HTMLDialogElement, form: HTMLFormElement, snapshot: () => Draft): void {
  const save = () =>
    queueMicrotask(() => {
      if (!dialog.open) return clearDraft(); // vừa bấm Huỷ: sự kiện "close" đến sau, xoá luôn kẻo F5 ngay thì mở lại
      try {
        sessionStorage.setItem(KEY, JSON.stringify(snapshot()));
      } catch {
        // không lưu được nháp thì thôi
      }
    });
  for (const type of ["input", "change", "click", "keydown"]) form.addEventListener(type, save);
  dialog.addEventListener("close", clearDraft);
}
