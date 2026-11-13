import { api, h } from "@tori/ui";
import { fmtRange, monthGrid, spanText, toIso, todayIso, WEEKDAYS } from "./dates";
import { loadDraft } from "./draft";
import { openEventForm } from "./event-form";
import { openOccurrenceDialog } from "./occurrence-dialog";
import { KIND_LABEL, type LunarDay, type Occurrence, type TrackedItem, type TrackedList } from "./types";

const WEEKDAY_NAMES = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
const narrow = () => window.matchMedia("(max-width: 640px)").matches;

const svg = (path: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
const CHEVRON_LEFT = svg("M15 18l-6-6 6-6");
const CHEVRON_RIGHT = svg("M9 18l6-6-6-6");

function iconButton(icon: string, label: string, onclick: () => void): HTMLButtonElement {
  const btn = h("button", { class: "btn btn-icon", type: "button", "aria-label": label, title: label, onclick });
  btn.innerHTML = icon; // chuỗi SVG tĩnh
  return btn;
}

/**
 * Ngày âm nhỏ dưới ngày dương: thường chỉ ghi ngày; mùng 1 (và ô đầu lưới) ghi kèm tháng,
 * "N" = tháng nhuận; ngày 15 ghi "Rằm".
 */
function lunarLabel(l: LunarDay | undefined, firstCell: boolean): HTMLElement | null {
  if (!l) return null;
  const dm = `${l.day}/${l.month}${l.leap ? "N" : ""}`;
  const text = l.day === 1 || firstCell ? dm : l.full_moon ? "Rằm" : String(l.day);
  const cls = ["cal-day__lunar"];
  if (l.day === 1) cls.push("cal-day__lunar--first");
  if (l.full_moon) cls.push("cal-day__lunar--full");
  return h(
    "span",
    { class: cls.join(" "), title: `${l.day}/${l.month}${l.leap ? " nhuận" : ""} âm lịch${l.full_moon ? " (rằm)" : ""}` },
    text,
  );
}

/** Tên ngày lễ ở góc phải ô ngày; ngày nghỉ lễ tô đỏ. */
function holidayLabel(l: LunarDay | undefined): HTMLElement | null {
  if (!l?.holidays.length) return null;
  const off = l.holidays.some((x) => x.off);
  const names = l.holidays.map((x) => x.name).join(" · ");
  return h("span", { class: `cal-day__holiday${off ? " cal-day__holiday--off" : ""}`, title: names }, names);
}

/**
 * Xếp sự kiện vào các "làn" (hàng) trong từng tuần của lưới, để sự kiện nhiều ngày nằm thẳng một hàng
 * qua mọi ô nó đi qua. Trả về: ngày -> danh sách theo làn (null = làn trống ở ngày đó, cần giữ chỗ).
 */
function layoutLanes(days: string[], occs: Occurrence[]): Map<string, (Occurrence | null)[]> {
  const slots = new Map<string, (Occurrence | null)[]>(days.map((d) => [d, []]));
  for (let w = 0; w < days.length; w += 7) {
    const week = days.slice(w, w + 7);
    const items = occs
      .filter((o) => o.start_date <= week[6] && o.end_date >= week[0])
      // bắt đầu sớm trước; cùng ngày bắt đầu thì sự kiện dài hơn trước
      .sort((a, b) => a.start_date.localeCompare(b.start_date) || b.end_date.localeCompare(a.end_date));
    for (const o of items) {
      const cells = week.filter((d) => o.start_date <= d && d <= o.end_date);
      let lane = 0;
      while (cells.some((d) => slots.get(d)![lane])) lane++;
      for (const d of cells) {
        const list = slots.get(d)!;
        while (list.length < lane) list.push(null);
        list[lane] = o;
      }
    }
  }
  return slots;
}

export class CalendarView {
  private year: number;
  private month: number; // 0-11
  private query = "";
  private filterYear: number;
  private loadSeq = 0;
  private selected = todayIso(); // ngày đang chọn (màn hình hẹp)
  private occs: Occurrence[] = [];
  private lunar = new Map<string, LunarDay>();
  private readonly lunarCache = new Map<string, Map<string, LunarDay>>(); // "2026-10" -> ngày âm của lưới

  // Chọn tháng / năm thay cho tiêu đề cố định
  private readonly monthSelect = h(
    "select",
    { class: "cal-picker__month", "aria-label": "Tháng" },
    ...Array.from({ length: 12 }, (_, m) => h("option", { value: m }, `Tháng ${m + 1}`)),
  ) as HTMLSelectElement;
  private readonly yearSelect = h("select", { class: "cal-picker__year", "aria-label": "Năm" }) as HTMLSelectElement;
  private readonly picker = h("div", { class: "cal-picker" }, this.monthSelect, this.yearSelect);
  private readonly grid = h("div", { class: "cal-grid", role: "grid" });
  private readonly agenda = h("section", { class: "agenda card", "aria-live": "polite" });
  // Kết quả lọc: bảng nổi dưới ô tìm kiếm, đè lên lịch chứ không đẩy lịch xuống
  private readonly results = h("section", { class: "results card", hidden: true });
  private resultsOpen = false;
  // Sự kiện đang theo dõi: đã qua bên trái lịch, sắp tới bên phải
  private readonly pastPanel = h("aside", { class: "tracked tracked--past card", "aria-label": "Đã qua" });
  private readonly upcomingPanel = h("aside", { class: "tracked tracked--upcoming card", "aria-label": "Sắp tới" });
  private readonly error = h("p", { class: "error-text", hidden: true });

  constructor(private readonly root: HTMLElement) {
    const now = new Date();
    this.year = now.getFullYear();
    this.month = now.getMonth();
    // Tháng đang xem nằm trên URL (?thang=2026-03) để F5 vẫn ở tháng đó
    const params = new URLSearchParams(location.search);
    const m = params.get("thang")?.match(/^(\d{4})-(\d{2})$/);
    if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) {
      this.year = Number(m[1]);
      this.month = Number(m[2]) - 1;
    }
    // Ô tìm kiếm cũng nằm trên URL (?tim=du lịch&nam=2025); năm phải nằm trong danh sách chọn năm của bảng kết quả
    this.query = params.get("tim")?.trim() ?? "";
    this.resultsOpen = !!this.query;
    const nam = Number(params.get("nam"));
    this.filterYear = nam >= now.getFullYear() - 6 && nam <= now.getFullYear() + 1 ? nam : now.getFullYear();
    this.monthSelect.addEventListener("change", () => {
      this.month = Number(this.monthSelect.value);
      void this.reload();
    });
    this.yearSelect.addEventListener("change", () => {
      this.year = Number(this.yearSelect.value);
      void this.reload();
    });
  }

  /** Đồng bộ hai ô chọn với tháng đang xem; danh sách năm luôn bao quanh năm đang xem. */
  private syncPicker(): void {
    this.monthSelect.value = String(this.month);
    const first = Number(this.yearSelect.options[0]?.value);
    const last = Number(this.yearSelect.options[this.yearSelect.options.length - 1]?.value);
    if (!(this.year >= first + 5 && this.year <= last - 5)) {
      const from = Math.min(this.year, new Date().getFullYear()) - 100;
      const to = Math.max(this.year, new Date().getFullYear()) + 10;
      this.yearSelect.replaceChildren(
        ...Array.from({ length: to - from + 1 }, (_, i) => h("option", { value: from + i }, `Năm ${from + i}`)),
      );
    }
    this.yearSelect.value = String(this.year);
  }

  private async lunarFor(days: Date[]): Promise<Map<string, LunarDay>> {
    const key = `${this.year}-${this.month}`;
    const cached = this.lunarCache.get(key);
    if (cached) return cached;
    try {
      const list = await api.get<LunarDay[]>("/api/lunar/range", {
        start: toIso(days[0]),
        end: toIso(days[days.length - 1]),
      });
      const map = new Map(list.map((d) => [d.date, d]));
      this.lunarCache.set(key, map);
      return map;
    } catch {
      return new Map(); // thiếu lịch âm không làm hỏng calendar
    }
  }

  start(): void {
    let timer: number | undefined;
    const search = h("input", {
      class: "input",
      type: "search",
      placeholder: "Lọc theo tên hoặc nhãn, VD: du lịch",
      "aria-label": "Lọc theo tên hoặc nhãn sự kiện",
      value: this.query,
    }) as HTMLInputElement;
    search.addEventListener("input", () => {
      this.resultsOpen = true;
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        this.query = search.value.trim();
        void this.reload();
      }, 200);
    });

    const searchBox = h("div", { class: "toolbar__search" }, search, this.results);
    // Đóng bảng kết quả: bấm ra ngoài hoặc Esc; bấm lại vào ô tìm kiếm thì mở lại
    const showResults = (open: boolean) => {
      this.resultsOpen = open;
      this.results.hidden = !open || !this.query;
    };
    search.addEventListener("focus", () => showResults(true));
    search.addEventListener("keydown", (e) => {
      if (e.key === "Escape") showResults(false);
    });
    document.addEventListener("pointerdown", (e) => {
      if (!searchBox.contains(e.target as Node) && !(e.target as Element).closest?.("dialog")) showResults(false);
    });

    const toolbar = h(
      "div",
      { class: "toolbar" },
      h(
        "div",
        { class: "toolbar__nav" },
        h("button", { class: "btn", type: "button", onclick: () => this.goToday() }, "Hôm nay"),
        iconButton(CHEVRON_LEFT, "Tháng trước", () => this.shift(-1)),
        iconButton(CHEVRON_RIGHT, "Tháng sau", () => this.shift(1)),
        this.picker,
      ),
      h(
        "div",
        { class: "toolbar__actions" },
        searchBox,
        h("button", { class: "btn btn-primary", type: "button", onclick: () => this.openAdd() }, "+ Thêm"),
      ),
    );

    const legend = h(
      "div",
      { class: "legend" },
      h("span", { class: "legend__item" }, h("i", { class: "legend__swatch chip--annual" }), KIND_LABEL.annual),
      h("span", { class: "legend__item" }, h("i", { class: "legend__swatch chip--occasional" }), KIND_LABEL.occasional),
    );

    this.root.replaceChildren(
      h(
        "div",
        { class: "page" },
        toolbar,
        this.error,
        h(
          "div",
          { class: "cal-layout" },
          this.pastPanel,
          h("div", { class: "cal-main" }, this.grid, legend, this.agenda),
          this.upcomingPanel,
        ),
      ),
    );
    void this.reload();

    // Form đang điền dở trước khi F5
    const draft = loadDraft();
    if (draft?.form === "add") openEventForm({ draft, onSaved: () => void this.reload() });
    else if (draft?.form === "occ") openOccurrenceDialog(draft.occ, { draft, onChanged: () => void this.reload() });
  }

  /** Ghi tháng đang xem và ô tìm kiếm lên URL; giá trị mặc định (tháng hiện tại, năm nay, ô trống) thì bỏ tham số */
  private syncUrl(): void {
    const url = new URL(location.href);
    const now = new Date();
    if (this.year === now.getFullYear() && this.month === now.getMonth()) url.searchParams.delete("thang");
    else url.searchParams.set("thang", `${this.year}-${String(this.month + 1).padStart(2, "0")}`);
    if (this.query) url.searchParams.set("tim", this.query);
    else url.searchParams.delete("tim");
    if (this.query && this.filterYear !== now.getFullYear()) url.searchParams.set("nam", String(this.filterYear));
    else url.searchParams.delete("nam");
    history.replaceState(history.state, "", url);
  }

  private shift(delta: number): void {
    const d = new Date(this.year, this.month + delta, 1);
    this.year = d.getFullYear();
    this.month = d.getMonth();
    void this.reload();
  }

  private goToday(): void {
    const now = new Date();
    this.year = now.getFullYear();
    this.month = now.getMonth();
    this.selected = todayIso();
    void this.reload();
  }

  private openAdd(date?: string): void {
    openEventForm({ date, onSaved: () => void this.reload() });
  }

  private openOcc(occ: Occurrence): void {
    openOccurrenceDialog(occ, { onChanged: () => void this.reload() });
  }

  async reload(): Promise<void> {
    const seq = ++this.loadSeq;
    const days = monthGrid(this.year, this.month);
    this.syncPicker();
    this.syncUrl();
    try {
      const [occs, found, lunar, tracked] = await Promise.all([
        api.get<Occurrence[]>("/api/occurrences", {
          start: toIso(days[0]),
          end: toIso(days[days.length - 1]),
          q: this.query,
        }),
        this.query
          ? api.get<Occurrence[]>("/api/occurrences", {
              start: `${this.filterYear}-01-01`,
              end: `${this.filterYear}-12-31`,
              q: this.query,
            })
          : Promise.resolve(null),
        this.lunarFor(days),
        api.get<TrackedList>("/api/tracked"),
      ]);
      if (seq !== this.loadSeq) return; // đã có lần tải mới hơn
      this.error.hidden = true;
      this.occs = occs;
      this.lunar = lunar;
      this.renderGrid(days, occs, lunar);
      this.renderAgenda();
      this.renderResults(found);
      this.renderTracked(tracked);
    } catch (e) {
      if (seq !== this.loadSeq) return;
      this.error.textContent = `Không tải được dữ liệu: ${(e as Error).message}`;
      this.error.hidden = false;
    }
  }

  private renderGrid(days: Date[], occs: Occurrence[], lunar: Map<string, LunarDay>): void {
    const today = todayIso();
    const cells: Node[] = WEEKDAYS.map((w) => h("div", { class: "cal-wd", role: "columnheader" }, w));
    const lanes = layoutLanes(days.map(toIso), occs);

    days.forEach((day, i) => {
      const iso = toIso(day);
      const items = lanes.get(iso) ?? [];
      const cls = ["cal-day"];
      if (day.getMonth() !== this.month) cls.push("cal-day--out");
      if (iso === today) cls.push("cal-day--today");
      if (iso === this.selected) cls.push("cal-day--selected");
      if (lunar.get(iso)?.holidays.some((x) => x.off)) cls.push("cal-day--off");

      const chips = items.map((o) => {
        if (!o) return h("span", { class: "chip chip--gap", "aria-hidden": "true" }, " "); // giữ chỗ cho làn trống
        const multi = o.start_date !== o.end_date;
        const isStart = iso === o.start_date;
        const isEnd = iso === o.end_date;
        const pos = !multi ? "" : isStart ? "chip--start" : isEnd ? "chip--end" : "chip--mid";
        // Sự kiện nhiều ngày: chỉ ghi tên ở ngày đầu và đầu mỗi tuần
        const showLabel = !multi || isStart || i % 7 === 0;
        return h(
          "button",
          {
            class: `chip chip--${o.kind} ${pos}`,
            type: "button",
            title: [o.title, fmtRange(o.start_date, o.end_date), o.labels.map((x) => `#${x}`).join(" "), o.note]
              .filter(Boolean)
              .join(" · "),
            onclick: (e: Event) => {
              if (narrow()) return; // màn hẹp: chạm = chọn ngày, xem danh sách bên dưới
              e.stopPropagation();
              this.openOcc(o);
            },
          },
          showLabel ? o.title : " ",
        );
      });

      const cell = h(
        "div",
        {
          class: cls.join(" "),
          role: "gridcell",
          "aria-label": iso,
          onclick: () => (narrow() ? this.selectDay(iso) : this.openAdd(iso)),
        },
        h(
          "div",
          { class: "cal-day__head" },
          h("div", { class: "cal-day__dates" }, h("span", { class: "cal-day__num" }, day.getDate()), lunarLabel(lunar.get(iso), i === 0)),
          holidayLabel(lunar.get(iso)),
        ),
        ...chips,
      );
      cells.push(cell);
    });
    this.grid.replaceChildren(...cells);
  }

  private selectDay(iso: string): void {
    this.selected = iso;
    this.grid.querySelector(".cal-day--selected")?.classList.remove("cal-day--selected");
    this.grid.querySelector(`[aria-label="${iso}"]`)?.classList.add("cal-day--selected");
    this.renderAgenda();
  }

  /** Danh sách sự kiện của ngày đang chọn. Chỉ hiển thị trên màn hẹp (xem style.css). */
  private renderAgenda(): void {
    const iso = this.selected;
    const items = this.occs.filter((o) => o.start_date <= iso && iso <= o.end_date);
    const [y, m, d] = iso.split("-").map(Number);
    const weekday = WEEKDAY_NAMES[new Date(y, m - 1, d).getDay()];
    const l = this.lunar.get(iso);

    this.agenda.replaceChildren(
      h(
        "div",
        { class: "agenda__head" },
        h(
          "div",
          {},
          h("strong", {}, `${weekday}, ${fmtRange(iso, iso)}`),
          l
            ? h("div", { class: "agenda__lunar muted" }, `${l.day}/${l.month}${l.leap ? " nhuận" : ""} âm lịch${l.full_moon ? " · Rằm" : ""}`)
            : null,
        ),
        h("button", { class: "btn btn-sm", type: "button", onclick: () => this.openAdd(iso) }, "+ Thêm"),
      ),
      h(
        "div",
        { class: "agenda__holidays", hidden: !l?.holidays.length },
        ...(l?.holidays ?? []).map((x) =>
          h("span", { class: `agenda__holiday${x.off ? " agenda__holiday--off" : ""}` }, x.name, x.off ? " · nghỉ lễ" : ""),
        ),
      ),
      items.length
        ? h(
            "ul",
            { class: "agenda__list" },
            ...items.map((o) =>
              h(
                "li",
                {},
                h(
                  "button",
                  { class: `agenda__item agenda__item--${o.kind}`, type: "button", onclick: () => this.openOcc(o) },
                  h("span", { class: "agenda__title" }, o.title),
                  h(
                    "span",
                    { class: "agenda__meta muted" },
                    [o.start_date !== o.end_date ? fmtRange(o.start_date, o.end_date) : null, o.lunar_label, o.note]
                      .filter(Boolean)
                      .join(" · "),
                  ),
                ),
              ),
            ),
          )
        : h("p", { class: "muted agenda__empty" }, "Không có sự kiện."),
    );
  }

  private renderTracked(data: TrackedList): void {
    const item = (x: TrackedItem, future: boolean) => {
      const o = x.occurrence;
      let when: string;
      if (future) {
        when = x.days === 0 ? (o.start_date < data.today ? "Đang diễn ra" : "Hôm nay") : x.days === 1 ? "Ngày mai" : `còn ${x.days} ngày`;
      } else {
        when = x.days === 1 ? "Hôm qua" : `${x.days} ngày trước`;
      }
      // Từ 30 ngày trở lên ghi thêm dạng năm/tháng/ngày cho dễ hình dung
      const span = x.days >= 30 ? (future ? spanText(data.today, o.start_date) : spanText(o.end_date, data.today)) : null;
      return h(
        "li",
        {},
        h(
          "button",
          { class: `tracked__item tracked__item--${o.kind}`, type: "button", onclick: () => this.openOcc(o) },
          h("span", { class: "tracked__title" }, o.title),
          h("span", { class: "tracked__days" }, when),
          h("span", { class: "tracked__meta muted" }, [fmtRange(o.start_date, o.end_date), span].filter(Boolean).join(" · ")),
        ),
      );
    };
    const fill = (panel: HTMLElement, title: string, items: TrackedItem[], future: boolean, empty: string) =>
      panel.replaceChildren(
        h("h2", { class: "tracked__head" }, title),
        items.length
          ? h("ul", { class: "tracked__list" }, ...items.map((x) => item(x, future)))
          : h("p", { class: "muted tracked__empty" }, empty),
      );
    fill(this.pastPanel, "Đã qua", data.past, false, "Chưa có sự kiện theo dõi nào đã qua.");
    fill(this.upcomingPanel, "Sắp tới", data.upcoming, true, "Chưa có. Tích “Theo dõi” khi thêm hoặc sửa sự kiện.");
  }

  private renderResults(found: Occurrence[] | null): void {
    if (!found) {
      this.results.hidden = true;
      return;
    }
    const thisYear = new Date().getFullYear();
    const yearSelect = h(
      "select",
      {
        class: "input results__year",
        "aria-label": "Năm",
        onchange: (e: Event) => {
          this.filterYear = Number((e.target as HTMLSelectElement).value);
          void this.reload();
        },
      },
      ...Array.from({ length: 8 }, (_, i) => thisYear + 1 - i).map((y) =>
        h("option", { value: y, selected: y === this.filterYear }, y),
      ),
    );

    const list = found.length
      ? h(
          "ul",
          { class: "results__list" },
          ...found.map((o) =>
            h(
              "li",
              {},
              h(
                "button",
                { class: "results__item", type: "button", onclick: () => this.openOcc(o) },
                h("span", { class: "results__date" }, fmtRange(o.start_date, o.end_date)),
                h("span", { class: `results__title results__title--${o.kind}` }, o.title),
                ...o.labels.map((x) => h("span", { class: "tag tag--sm" }, x)),
                o.note ? h("span", { class: "results__note muted" }, o.note) : null,
              ),
            ),
          ),
        )
      : h("p", { class: "muted" }, "Không có lần nào.");

    this.results.replaceChildren(
      h(
        "div",
        { class: "results__head" },
        h("strong", {}, `${found.length} lần khớp “${this.query}” trong năm`),
        yearSelect,
      ),
      list,
    );
    this.results.hidden = !this.resultsOpen;
  }
}
