type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>;
type Child = Node | string | number | null | undefined | false;

/**
 * Tạo phần tử DOM. Chuỗi con luôn được đưa vào dưới dạng text (không phải HTML),
 * nên an toàn với dữ liệu người dùng nhập.
 *
 *   h("button", { class: "btn", onclick: () => save() }, "Lưu")
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2), value);
    } else if (value === true) {
      el.setAttribute(key, "");
    } else {
      el.setAttribute(key, String(value));
    }
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}
