import { api, h } from "@tori/ui";

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
  /** Các nhãn đang gắn (tính cả chữ đang gõ dở) */
  values(): string[];
}

/** Ô gắn nhiều nhãn: gõ rồi Enter (hoặc dấu phẩy) để thêm, bấm ✕ hoặc Backspace để gỡ. */
export function createLabelInput(initial: string[] = []): LabelInput {
  const labels: string[] = [];
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
          { class: "tag" },
          name,
          h(
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
    } else if (e.key === "Backspace" && !input.value && labels.length) {
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

  initial.forEach(add);
  // Gợi ý: nhãn đã dùng + nhãn mẫu
  void api
    .get<string[]>("/api/labels")
    .catch(() => [] as string[])
    .then((used) => {
      const all = [...used, ...PRESETS.filter((p) => !used.some((u) => norm(u) === norm(p)))];
      datalist.replaceChildren(...all.map((name) => h("option", { value: name })));
    });

  return {
    el,
    values: () => {
      if (input.value.trim()) add(input.value);
      return [...labels];
    },
  };
}
