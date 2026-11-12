import { h } from "./dom";

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-11-05" -> "05/11/2026" */
export function isoToVn(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** "5/11/2026", "05-11-2026", "05.11.2026" -> "2026-11-05"; ngày không tồn tại -> null */
export function vnToIso(text: string): string | null {
  const match = text.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!match) return null;
  const [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Định dạng khi đang gõ: "0511" -> "05/11/", "5/11" -> "5/11/", "05112026" -> "05/11/2026" */
export function formatTyping(raw: string): string {
  let segs = raw.split("/");
  if (segs.length === 1 && raw.length > 2) segs = [raw.slice(0, 2), raw.slice(2, 4), raw.slice(4)].filter((s) => s !== "");
  for (let i = 0; i < 2 && i < segs.length; i++) {
    if (segs[i].length > 2) {
      const extra = segs[i].slice(2);
      segs[i] = segs[i].slice(0, 2);
      segs[i + 1] = extra + (segs[i + 1] ?? "");
    }
  }
  segs = segs.slice(0, 3);
  if (segs[2] !== undefined) segs[2] = segs[2].slice(0, 4);
  let out = segs.join("/");
  if (segs.length < 3 && segs[segs.length - 1].length === 2) out += "/";
  return out;
}

export interface DateInput {
  /** Phần tử để đặt vào form */
  el: HTMLElement;
  /** Ô chữ người dùng gõ (dd/mm/yyyy) */
  input: HTMLInputElement;
  /** Ngày dạng ISO "YYYY-MM-DD"; "" nếu để trống; null nếu gõ sai */
  value(): string | null;
  setValue(iso: string): void;
}

const CALENDAR_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/>' +
  '<path d="M3 10h18M8 3v4M16 3v4"/></svg>';

/**
 * Ô nhập ngày luôn hiển thị theo kiểu Việt Nam (dd/mm/yyyy), không phụ thuộc ngôn ngữ trình duyệt.
 * Gõ số sẽ tự chèn dấu "/"; nút lịch mở bảng chọn ngày của trình duyệt.
 */
export function createDateInput(opts: { value?: string; onChange?: (iso: string | null) => void } = {}): DateInput {
  const input = h("input", {
    type: "text",
    inputmode: "numeric",
    autocomplete: "off",
    maxlength: 10,
    placeholder: "dd/mm/yyyy",
    value: isoToVn(opts.value ?? ""),
  }) as HTMLInputElement;
  // Ô date gốc, ẩn, chỉ dùng để mở bảng chọn ngày
  const picker = h("input", { type: "date", class: "date-input__picker", tabindex: -1, "aria-hidden": "true" }) as HTMLInputElement;
  const button = h("button", { type: "button", class: "date-input__btn", "aria-label": "Chọn ngày trên lịch" });
  button.innerHTML = CALENDAR_ICON; // chuỗi tĩnh, không chứa dữ liệu người dùng

  const value = (): string | null => (input.value.trim() ? vnToIso(input.value) : "");
  const validate = () => {
    const invalid = value() === null;
    input.toggleAttribute("aria-invalid", invalid);
    return !invalid;
  };
  const emit = () => {
    validate();
    opts.onChange?.(value());
  };

  input.addEventListener("input", (e) => {
    if (input.hasAttribute("aria-invalid")) validate();
    // Tự chèn "/" khi gõ số ở cuối ô; không can thiệp khi đang xoá hoặc sửa giữa chừng
    if ((e as InputEvent).inputType?.startsWith("delete")) return;
    if (input.selectionStart !== input.value.length) return;
    const raw = input.value.replace(/\/{2,}/g, "/");
    if (!/^[\d/]*$/.test(raw)) return;
    input.value = formatTyping(raw);
  });
  input.addEventListener("change", emit);

  button.addEventListener("click", () => {
    picker.value = value() || "";
    try {
      picker.showPicker();
    } catch {
      picker.focus();
    }
  });
  picker.addEventListener("change", () => {
    input.value = isoToVn(picker.value);
    emit();
  });

  return {
    el: h("div", { class: "date-input" }, input, button, picker),
    input,
    value,
    setValue: (iso: string) => {
      input.value = isoToVn(iso);
      validate();
    },
  };
}
