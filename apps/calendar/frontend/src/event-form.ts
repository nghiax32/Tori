import { api, createDateInput, createDialog, h } from "@tori/ui";
import { fmt, todayIso } from "./dates";
import { createLabelInput } from "./label-input";
import { KIND_LABEL, ruleLabel, type CalendarKind, type EventSummary, type Kind } from "./types";

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

/** Định dạng ô ngày/tháng khi đang gõ: "0503" -> "05/03", "05" -> "05/" */
function formatDayMonth(raw: string): string {
  const [d = "", m] = raw.split("/");
  if (m === undefined) return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2, 4)}` : d.length === 2 ? `${d}/` : d;
  return `${d.slice(0, 2)}/${m.slice(0, 2)}`;
}

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
  const endInput = createDateInput({ pickerStart: () => startInput.value() });
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
  // Một ô chia hai nửa: ngày/tháng (bắt buộc) | năm (không bắt buộc)
  const dayMonthInput = h("input", {
    type: "text",
    inputmode: "numeric",
    autocomplete: "off",
    maxlength: 5,
    placeholder: "dd/mm",
    "aria-label": "Ngày/tháng",
  }) as HTMLInputElement;
  dayMonthInput.addEventListener("input", (e) => {
    // Tự chèn "/" khi gõ số ở cuối ô; không can thiệp khi đang xoá hoặc sửa giữa chừng
    if ((e as InputEvent).inputType?.startsWith("delete")) return;
    if (dayMonthInput.selectionStart !== dayMonthInput.value.length) return;
    if (/^[\d/]*$/.test(dayMonthInput.value)) dayMonthInput.value = formatDayMonth(dayMonthInput.value);
  });
  const yearInput = h("input", {
    type: "text",
    inputmode: "numeric",
    autocomplete: "off",
    maxlength: 4,
    placeholder: "yyyy",
    "aria-label": "Năm (không bắt buộc)",
  }) as HTMLInputElement;
  const lunarLeap = h("input", { type: "checkbox" }) as HTMLInputElement;
  const leapCheck = h("label", { class: "check" }, lunarLeap, "Tháng nhuận");
  const ruleHint = h("small", { class: "muted" });
  const ruleField = h(
    "div",
    { class: "field" },
    h("span", { class: "field-label" }, "Ngày"),
    h("div", { class: "form-row" }, h("div", { class: "split-date" }, dayMonthInput, yearInput), leapCheck),
    ruleHint,
  );
  const eventNote = h("textarea", { placeholder: "Ghi chú chung cho sự kiện" }) as HTMLTextAreaElement;
  const annSection = h(
    "div",
    { class: "form-section" },
    h("div", { class: "field" }, h("span", { class: "field-label" }, "Lịch"), calendar.el),
    ruleField,
    field("Ghi chú", eventNote),
  );

  const labelInput = createLabelInput();
  const labelField = h("div", { class: "field" }, h("span", { class: "field-label" }, "Nhãn"), labelInput.el);

  const trackedInput = h("input", { type: "checkbox" }) as HTMLInputElement;
  const trackedCheck = h("label", { class: "check" }, trackedInput, "Theo dõi: hiện lần gần nhất đã qua / sắp tới bên cạnh lịch");

  const error = h("p", { class: "error-text", role: "alert" });
  const saveBtn = h("button", { class: "btn btn-primary", type: "submit" }, "Lưu") as HTMLButtonElement;
  const { form, close } = createDialog(
    "Thêm sự kiện",
    [
      h("div", { class: "field combo" }, h("span", { class: "field-label" }, "Tên sự kiện"), titleInput, suggest, selectedInfo),
      kindRow,
      labelField,
      // Hai phần chồng lên nhau trong cùng một ô: form luôn cao bằng phần dài nhất, đổi loại không bị nhảy
      h("div", { class: "form-stack" }, occSection, annSection),
      trackedCheck,
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
    labelField.hidden = !!selected;
    showIf(occSection, k === "occasional" && selected?.kind !== "annual");
    showIf(annSection, k === "annual" && !selected);
    saveBtn.disabled = selected?.kind === "annual";
    showIf(trackedCheck, !selected); // sự kiện có sẵn: bật/tắt theo dõi trong hộp thoại của nó

    const lunar = calendar.value() === "lunar";
    showIf(leapCheck, lunar);
    ruleHint.textContent = lunar
      ? "Nhập ngày âm, VD ngày giỗ 20/12. Năm (âm lịch) không bắt buộc: có năm thì chỉ hiện từ năm đó, bỏ trống thì năm nào cũng hiện."
      : "VD ngày sinh 15/03. Năm không bắt buộc: có năm thì chỉ hiện từ năm đó, bỏ trống thì năm nào cũng hiện.";

    if (!selected) {
      selectedInfo.hidden = true;
    } else if (selected.kind === "occasional") {
      selectedInfo.hidden = false;
      selectedInfo.textContent =
        `Thêm lần mới cho “${selected.title}” · đã có ${selected.occurrence_count} lần` +
        (selected.last_date ? `, gần nhất ${fmt(selected.last_date)}` : "");
    } else {
      selectedInfo.hidden = false;
      selectedInfo.textContent = `“${selected.title}” là sự kiện thường niên (${ruleLabel(selected)}). Sự kiện tự hiện mỗi năm, không cần thêm.`;
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
        const body: Record<string, unknown> = {
          title,
          kind: kind.value(),
          labels: labelInput.values(),
          tracked: trackedInput.checked,
        };
        if (kind.value() === "occasional") {
          const dates = occDates();
          if (typeof dates === "string") return void (error.textContent = dates);
          Object.assign(body, dates, { occurrence_note: occNote.value.trim() || null });
        } else {
          body.calendar = calendar.value();
          body.note = eventNote.value.trim() || null;
          const lunar = calendar.value() === "lunar";
          const match = dayMonthInput.value.trim().match(/^(\d{1,2})\/(\d{1,2})$/);
          const [d, m] = match ? [Number(match[1]), Number(match[2])] : [0, 0];
          if (!(d >= 1 && d <= (lunar ? 30 : 31) && m >= 1 && m <= 12)) {
            return void (error.textContent = lunar
              ? "Nhập ngày/tháng âm lịch, ngày 1–30, VD 20/12."
              : "Nhập ngày/tháng hợp lệ, VD 15/03.");
          }
          const yearText = yearInput.value.trim();
          if (yearText && !/^\d{4}$/.test(yearText)) return void (error.textContent = "Năm gồm 4 chữ số, VD 1965.");
          Object.assign(body, {
            rule_day: d,
            rule_month: m,
            rule_leap: lunar && lunarLeap.checked,
            rule_year: yearText ? Number(yearText) : null,
          });
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
