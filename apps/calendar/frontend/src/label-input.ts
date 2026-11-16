import { api, h } from "@tori/ui";
import { HOLIDAY_LABEL } from "./types";

/** Nhãn mẫu, gợi ý kèm các nhãn đã dùng */
const PRESETS = ["Sinh nhật", "Ngày giỗ", "Kỷ niệm", "Đi chơi", "Bảo dưỡng", "Sức khoẻ"];

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

let datalistSeq = 0;

export interface LabelInput {
  el: HTMLElement;
  /** Ô gõ nhãn */
  input: HTMLInputElement;
  /** Các nhãn đang gắn (tính cả chữ đang gõ dở) */
  values(): string[];
  /** Các nhãn đã gắn, không tính chữ đang gõ dở */
  current(): string[];
}

/** Ô gắn nhiều nhãn: gõ rồi Enter (hoặc dấu phẩy) để thêm, bấm ✕ hoặc Backspace để gỡ.
 * `holiday`: ô nhãn của sự kiện ngày lễ, nhãn "Ngày lễ" luôn có và không gỡ được.
 * Ngoài ra nhãn "Ngày lễ" không có trong gợi ý (chỉ dành cho ngày lễ). */
export function createLabelInput(initial: string[] = [], opts: { holiday?: boolean } = {}): LabelInput {
  const labels: string[] = [];
  const locked = (name: string) => !!opts.holiday && norm(name) === norm(HOLIDAY_LABEL);
  const listId = `cal-labels-${++datalistSeq}`;
  const datalist = h("datalist", { id: listId });
  const input = h("input", {
    type: "text",
    list: listId,
    maxlength: 50,
    placeholder: "Thêm nhãn…",
    "aria-label": "Thêm nhãn",
  }) as HTMLInputElement;
  const chips = h("span", { class: "tags__chips" });
  const el = h("div", { class: "tags", onclick: () => input.focus() }, chips, input, datalist);

  const render = () => {
    chips.replaceChildren(
      ...labels.map((name, i) =>
        h(
          "span",
          { class: `tag${locked(name) ? " tag--locked" : ""}`, title: locked(name) ? "Nhãn cố định của ngày lễ" : null },
          name,
          locked(name)
            ? null
            : h(
                "button",
                {
                  type: "button",
                  class: "tag__remove",
                  "aria-label": `Gỡ nhãn ${name}`,
                  onclick: (e: Event) => {
                    e.stopPropagation();
                    labels.splice(i, 1);
                    render();
                  },
                },
                "✕",
              ),
        ),
      ),
    );
    input.placeholder = labels.length ? "" : "Thêm nhãn…";
  };

  const add = (raw: string) => {
    const name = raw.trim().replace(/\s+/g, " ").slice(0, 50);
    if (name && !labels.some((x) => norm(x) === norm(name))) labels.push(name);
    input.value = "";
    render();
  };

  input.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === ",") && input.value.trim()) {
      e.preventDefault(); // không gửi form
      add(input.value);
    } else if (e.key === "Backspace" && !input.value && labels.length && !locked(labels[labels.length - 1])) {
      labels.pop();
      render();
    }
  });
  // Chọn từ danh sách gợi ý thì thêm luôn
  input.addEventListener("input", (e) => {
    if (!(e as InputEvent).inputType || (e as InputEvent).inputType === "insertReplacementText") {
      if (datalist.querySelector(`option[value="${CSS.escape(input.value)}"]`)) add(input.value);
    }
  });

  if (opts.holiday) add(HOLIDAY_LABEL); // đứng đầu, kể cả khi bản nháp cũ thiếu
  initial.forEach(add);
  // Gợi ý: nhãn đã dùng + nhãn mẫu
  void api
    .get<string[]>("/api/labels")
    .catch(() => [] as string[])
    .then((used) => {
      const all = [...used, ...PRESETS.filter((p) => !used.some((u) => norm(u) === norm(p)))].filter(
        (x) => norm(x) !== norm(HOLIDAY_LABEL),
      );
      datalist.replaceChildren(...all.map((name) => h("option", { value: name })));
    });

  return {
    el,
    input,
    current: () => [...labels],
    values: () => {
      if (input.value.trim()) add(input.value);
      return [...labels];
    },
  };
}
