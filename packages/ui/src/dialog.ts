import { h } from "./dom";

export interface DialogParts {
  dialog: HTMLDialogElement;
  form: HTMLFormElement;
  close: () => void;
}

/**
 * Mở hộp thoại modal (thẻ <dialog>). Nội dung nằm trong một <form>; nút type="submit"
 * kích hoạt sự kiện submit của form. Hộp thoại tự gỡ khỏi DOM khi đóng.
 */
export function createDialog(title: string, body: Node[], actions: Node[]): DialogParts {
  const form = h(
    "form",
    { class: "tori-dialog__body", novalidate: true },
    h("h2", { class: "tori-dialog__title" }, title),
    ...body,
    h("div", { class: "tori-dialog__actions" }, ...actions),
  );
  const dialog = h("dialog", { class: "tori-dialog" }, form);
  dialog.addEventListener("close", () => dialog.remove());
  // Bấm ra nền ngoài để đóng: chỉ khi cả lúc nhấn lẫn lúc nhả chuột đều ở nền. Nếu nhấn trong
  // ô nhập (VD bôi đen chữ) rồi kéo ra ngoài, trình duyệt vẫn bắn "click" vào <dialog>.
  let pressedOnBackdrop = false;
  dialog.addEventListener("pointerdown", (e) => {
    pressedOnBackdrop = e.target === dialog;
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog && pressedOnBackdrop) dialog.close();
    pressedOnBackdrop = false;
  });
  document.body.append(dialog);
  dialog.showModal();
  return { dialog, form, close: () => dialog.close() };
}
