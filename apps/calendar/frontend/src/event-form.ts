import { api, createDateInput, createDialog, h } from "@tori/ui";
import { fmt, todayIso } from "./dates";
import { KIND_LABEL, ruleLabel, type CalendarKind, type EventSummary, type Kind, type LunarInfo } from "./types";

interface Segmented<T extends string> {
  el: HTMLElement;
  value: () => T;
}

function segmented<T extends string>(
  name: string,
  options: { value: T; label: string }[],
  checked: T,
  onChange: () => void,
): Segmented<T> {
  const el = h(
    "div",
    { class: "segmented", role: "radiogroup" },
    ...options.map((o) =>
      h(
        "label",
        {},
        h("input", { type: "radio", name, value: o.value, checked: o.value === checked, onchange: onChange }),
        h("span", {}, o.label),
      ),
    ),
  );
  return {
    el,
    value: () => (el.querySelector<HTMLInputElement>("input:checked")?.value ?? checked) as T,
  };
}

const field = (label: string, control: Node, hint?: Node | string | null) =>
  h("label", { class: "field" }, h("span", {}, label), control, hint ? h("small", { class: "muted" }, hint) : null);

const CATEGORIES = ["Sinh nhật", "Ngày giỗ", "Kỷ niệm", "Đi chơi", "Bảo dưỡng", "Sức khoẻ"];

/** Form thêm sự kiện. Gõ tên sẽ gợi ý sự kiện đã có; chọn gợi ý = thêm lần mới cho sự kiện đó. */
export function openEventForm(opts: { date?: string; onSaved: () => void }): void {
  let selected: EventSummary | null = null;

  // ----- tên + autocomplete -----
  const titleInput = h("input", {
    type: "text",
    autocomplete: "off",
    maxlength: 200,
    placeholder: "VD: Đi du lịch Đà Lạt, Sinh nhật mẹ",
    role: "combobox",
    "aria-autocomplete": "list",
    "aria-expanded": "false",
    "aria-controls": "cal-suggest",
  }) as HTMLInputElement;
  const suggest = h("ul", { class: "suggest", id: "cal-suggest", role: "listbox", hidden: true });
  const selectedInfo = h("p", { class: "selected-info", hidden: true });

  // ----- loại -----
  const kind = segmented<Kind>(
    "kind",
    [
      { value: "occasional", label: KIND_LABEL.occasional },
      { value: "annual", label: KIND_LABEL.annual },
    ],
    "occasional",
    () => sync(),
  );
  const kindRow = h("div", { class: "field" }, h("span", { class: "field-label" }, "Loại"), kind.el);

  // ----- không thường xuyên -----
  const startInput = createDateInput({ value: opts.date ?? todayIso() });
  const endInput = createDateInput();
  const occNote = h("textarea", { placeholder: "VD: đi cùng gia đình, ở homestay gần hồ" }) as HTMLTextAreaElement;
  const occSection = h(
    "div",
    { class: "form-section" },
    h(
      "div",
      { class: "form-row" },
      field("Từ ngày", startInput.el),
      field("Đến ngày", endInput.el, "Bỏ trống nếu chỉ một ngày"),
    ),
    field("Ghi chú cho lần này", occNote),
  );

  // ----- thường niên -----
  const calendar = segmented<CalendarKind>(
    "calendar",
    [
      { value: "solar", label: "Dương lịch" },
      { value: "lunar", label: "Âm lịch" },
    ],
    "solar",
    () => sync(),
  );
  const lunarMode = segmented<"from-solar" | "direct">(
    "lunar-mode",
    [
      { value: "from-solar", label: "Từ ngày dương gốc" },
      { value: "direct", label: "Nhập ngày âm" },
    ],
    "from-solar",
    () => sync(),
  );
  const lunarPreview = h("small", { class: "lunar-preview muted" });
  const originInput = createDateInput({
    // Xem trước ngày âm tương ứng
    onChange: async (iso) => {
      lunarPreview.textContent = "";
      if (!iso) return;
      try {
        const l = await api.get<LunarInfo>("/api/lunar", { date: iso });
        lunarPreview.textContent = `= ${l.label} (năm ${l.year})`;
      } catch {
        /* chỉ là xem trước */
      }
    },
  });
  const lunarDay = h("input", { type: "number", min: 1, max: 30, placeholder: "Ngày" }) as HTMLInputElement;
  const lunarMonth = h("input", { type: "number", min: 1, max: 12, placeholder: "Tháng" }) as HTMLInputElement;
  const lunarLeap = h("input", { type: "checkbox" }) as HTMLInputElement;
  const originHint = h("small", { class: "muted" });
  const originField = h("label", { class: "field" }, h("span", {}, "Ngày gốc (dương lịch)"), originInput.el, originHint, lunarPreview);
  const directBox = h(
    "div",
    { class: "form-row" },
    field("Ngày âm", lunarDay),
    field("Tháng âm", lunarMonth),
    h("label", { class: "check" }, lunarLeap, "Tháng nhuận"),
  );
  const lunarModeRow = h("div", { class: "field" }, h("span", { class: "field-label" }, "Cách nhập"), lunarMode.el);
  const eventNote = h("textarea", { placeholder: "Ghi chú chung cho sự kiện" }) as HTMLTextAreaElement;
  const annSection = h(
    "div",
    { class: "form-section" },
    h("div", { class: "field" }, h("span", { class: "field-label" }, "Lịch"), calendar.el),
    lunarModeRow,
    h("div", { class: "form-stack" }, originField, directBox),
    field("Ghi chú", eventNote),
  );

  const categoryInput = h("input", { type: "text", list: "cal-categories", maxlength: 50, placeholder: "Không bắt buộc" }) as HTMLInputElement;
  const categoryField = field(
    "Nhãn",
    h("div", {}, categoryInput, h("datalist", { id: "cal-categories" }, ...CATEGORIES.map((c) => h("option", { value: c })))),
  );

  const error = h("p", { class: "error-text", role: "alert" });
  const saveBtn = h("button", { class: "btn btn-primary", type: "submit" }, "Lưu") as HTMLButtonElement;
  const { form, close } = createDialog(
    "Thêm sự kiện",
    [
      h("div", { class: "field combo" }, h("span", { class: "field-label" }, "Tên sự kiện"), titleInput, suggest, selectedInfo),
      kindRow,
      categoryField,
      // Hai phần chồng lên nhau trong cùng một ô: form luôn cao bằng phần dài nhất, đổi loại không bị nhảy
      h("div", { class: "form-stack" }, occSection, annSection),
      error,
    ],
    [h("button", { class: "btn", type: "button", onclick: () => close() }, "Huỷ"), saveBtn],
  );

  // ----- hiển thị theo lựa chọn -----
  /** Ẩn nhưng vẫn giữ chỗ (khác `hidden`), để chiều cao form không đổi. `inert` chặn focus/bấm vào phần ẩn. */
  const showIf = (el: HTMLElement, visible: boolean) => {
    el.style.visibility = visible ? "" : "hidden";
    el.inert = !visible;
  };

  function sync(): void {
    const k = selected ? selected.kind : kind.value();
    kindRow.hidden = !!selected;
    categoryField.hidden = !!selected;
    showIf(occSection, k === "occasional" && selected?.kind !== "annual");
    showIf(annSection, k === "annual" && !selected);
    saveBtn.disabled = selected?.kind === "annual";

    const lunar = calendar.value() === "lunar";
    const direct = lunar && lunarMode.value() === "direct";
    showIf(lunarModeRow, lunar);
    showIf(originField, !direct);
    showIf(directBox, direct);
    showIf(lunarPreview, lunar);
    originHint.textContent = lunar
      ? "VD ngày mất. Sẽ được đổi sang âm lịch và lặp lại theo ngày âm mỗi năm."
      : "VD ngày sinh. Mỗi năm lặp lại đúng ngày/tháng này.";

    if (!selected) {
      selectedInfo.hidden = true;
    } else if (selected.kind === "occasional") {
      selectedInfo.hidden = false;
      selectedInfo.textContent =
        `Thêm lần mới cho “${selected.title}” · đã có ${selected.occurrence_count} lần` +
        (selected.last_date ? `, gần nhất ${fmt(selected.last_date)}` : "");
    } else {
      selectedInfo.hidden = false;
      selectedInfo.textContent = `“${selected.title}” là sự kiện thường niên (${ruleLabel(selected)}). Ngày được tự sinh mỗi năm, không cần thêm.`;
    }
  }

  // ----- autocomplete -----
  let items: EventSummary[] = [];
  let active = -1;
  let timer: number | undefined;
  let fetchSeq = 0;

  const hideSuggest = () => {
    suggest.hidden = true;
    titleInput.setAttribute("aria-expanded", "false");
    active = -1;
  };

  const choose = (item: EventSummary) => {
    titleInput.value = item.title;
    selected = item;
    hideSuggest();
    sync();
  };

  const renderSuggest = () => {
    if (!items.length) return hideSuggest();
    suggest.replaceChildren(
      ...items.map((item, i) =>
        h(
          "li",
          {
            role: "option",
            class: i === active ? "is-active" : "",
            "aria-selected": i === active ? "true" : "false",
            onmousedown: (e: Event) => {
              e.preventDefault(); // giữ focus ở ô nhập
              choose(item);
            },
          },
          h("span", { class: "suggest__title" }, item.title),
          h(
            "span",
            { class: "suggest__meta" },
            item.kind === "annual"
              ? `${KIND_LABEL.annual} · ${ruleLabel(item)}`
              : `${item.occurrence_count} lần` + (item.last_date ? ` · gần nhất ${fmt(item.last_date)}` : ""),
          ),
        ),
      ),
    );
    suggest.hidden = false;
    titleInput.setAttribute("aria-expanded", "true");
  };

  titleInput.addEventListener("input", () => {
    if (selected && titleInput.value !== selected.title) {
      selected = null;
      sync();
    }
    clearTimeout(timer);
    timer = window.setTimeout(async () => {
      const q = titleInput.value.trim();
      if (!q) return hideSuggest();
      const seq = ++fetchSeq;
      try {
        const res = await api.get<EventSummary[]>("/api/events", { q, limit: 8 });
        if (seq !== fetchSeq) return;
        items = res;
        active = -1;
        renderSuggest();
      } catch {
        hideSuggest();
      }
    }, 150);
  });

  titleInput.addEventListener("keydown", (e) => {
    if (suggest.hidden) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      renderSuggest();
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === "Escape") {
      e.preventDefault(); // không đóng cả hộp thoại
      hideSuggest();
    }
  });
  titleInput.addEventListener("blur", () => setTimeout(hideSuggest, 100));

  // ----- lưu -----
  const BAD_DATE = "Ngày không hợp lệ. Nhập theo dạng ngày/tháng/năm, VD 05/11/2026.";

  /** Ngày bắt đầu/kết thúc, hoặc câu báo lỗi */
  const occDates = (): { start_date: string; end_date: string | null } | string => {
    const start = startInput.value();
    const end = endInput.value();
    if (start === null || end === null) return BAD_DATE;
    if (!start) return "Nhập ngày bắt đầu.";
    return { start_date: start, end_date: end || null };
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    error.textContent = "";
    const title = titleInput.value.trim();
    if (!title) return void (error.textContent = "Nhập tên sự kiện.");

    try {
      if (selected?.kind === "occasional") {
        const dates = occDates();
        if (typeof dates === "string") return void (error.textContent = dates);
        await api.post(`/api/events/${selected.id}/occurrences`, { ...dates, note: occNote.value.trim() || null });
      } else {
        const body: Record<string, unknown> = { title, kind: kind.value(), category: categoryInput.value.trim() || null };
        if (kind.value() === "occasional") {
          const dates = occDates();
          if (typeof dates === "string") return void (error.textContent = dates);
          Object.assign(body, dates, { occurrence_note: occNote.value.trim() || null });
        } else {
          body.calendar = calendar.value();
          body.note = eventNote.value.trim() || null;
          if (calendar.value() === "lunar" && lunarMode.value() === "direct") {
            const d = Number(lunarDay.value);
            const m = Number(lunarMonth.value);
            if (!(d >= 1 && d <= 30 && m >= 1 && m <= 12)) return void (error.textContent = "Ngày âm 1–30, tháng 1–12.");
            Object.assign(body, { rule_day: d, rule_month: m, rule_leap: lunarLeap.checked });
          } else {
            const origin = originInput.value();
            if (origin === null) return void (error.textContent = BAD_DATE);
            if (!origin) return void (error.textContent = "Nhập ngày gốc.");
            body.origin_date = origin;
          }
        }
        await api.post("/api/events", body);
      }
      close();
      opts.onSaved();
    } catch (err) {
      error.textContent = (err as Error).message;
    }
  });

  sync();
  titleInput.focus();
}
