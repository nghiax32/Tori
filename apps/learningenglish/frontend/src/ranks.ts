import { h } from "@tori/ui";

export interface RankRow {
  rank: number;
  name: string;
  me: boolean;
}

/** Vẽ bảng xếp hạng vào `el`: top N, kèm dòng của bạn ở cuối nếu bạn ngoài top. `data` null = tải lỗi. */
export function renderRanks<T extends RankRow>(
  el: HTMLElement,
  data: { top: T[]; mine: T | null } | null,
  value: (row: T) => string,
  emptyText: string,
): void {
  if (!data) {
    el.replaceChildren(h("p", { class: "error-text" }, "Không tải được bảng xếp hạng."));
    return;
  }
  const row = (x: T) =>
    h(
      "li",
      { class: `rank-list__row${x.me ? " is-me" : ""}` },
      h("span", { class: "rank-list__no" }, String(x.rank)),
      h("span", { class: "rank-list__name" }, x.name, x.me ? h("small", {}, " (bạn)") : null),
      h("span", { class: "rank-list__time" }, value(x)),
    );
  const inTop = data.top.some((x) => x.me);
  el.replaceChildren(
    data.top.length
      ? h("ol", {}, data.top.map(row), !inTop && data.mine ? [h("li", { class: "rank-list__gap" }, "…"), row(data.mine)] : null)
      : h("p", { class: "muted" }, emptyText),
  );
}
