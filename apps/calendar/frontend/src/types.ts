export type Kind = "annual" | "occasional";
export type CalendarKind = "solar" | "lunar";

export interface EventSummary {
  id: number;
  title: string;
  kind: Kind;
  labels: string[];
  note: string | null;
  calendar: CalendarKind | null;
  rule_month: number | null;
  rule_day: number | null;
  rule_leap: boolean;
  rule_year: number | null; // năm bắt đầu (năm âm nếu lịch âm); null = năm nào cũng hiện
  tracked: boolean; // hiện lần gần nhất đã qua / sắp tới ở hai bên lịch
  archived: boolean;
  occurrence_count: number;
  last_date: string | null;
  lunar_label: string | null;
}

export interface Occurrence {
  id: number | null; // null: lần của sự kiện thường niên, tính từ quy tắc nên không sửa/xoá riêng được
  event_id: number;
  title: string;
  kind: Kind;
  labels: string[];
  start_date: string;
  end_date: string;
  note: string | null;
  tracked: boolean; // theo sự kiện
  lunar_label: string | null;
}

export interface TrackedItem {
  occurrence: Occurrence;
  /** Sắp tới: số ngày còn lại (0 = hôm nay / đang diễn ra). Đã qua: số ngày kể từ ngày kết thúc. */
  days: number;
}

export interface TrackedList {
  today: string;
  upcoming: TrackedItem[];
  past: TrackedItem[];
}

export interface CreateResult {
  event: EventSummary;
  occurrence: Occurrence | null;
  reused: boolean;
}

export interface Holiday {
  name: string;
  calendar: CalendarKind;
  off: boolean; // ngày nghỉ lễ theo Bộ luật Lao động
}

export interface LunarDay {
  date: string;
  day: number;
  month: number;
  year: number;
  leap: boolean;
  full_moon: boolean;
  holidays: Holiday[];
}

export const KIND_LABEL: Record<Kind, string> = {
  annual: "Thường niên",
  occasional: "Không thường xuyên",
};

export function ruleLabel(e: Pick<EventSummary, "calendar" | "rule_day" | "rule_month" | "lunar_label">): string {
  if (e.calendar === "lunar") return e.lunar_label ?? "";
  return `${e.rule_day}/${e.rule_month} hằng năm`;
}
