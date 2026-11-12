import { api, createDateInput, createDialog, h } from "@tori/ui";
import { fmt } from "./dates";
import { KIND_LABEL, type Occurrence } from "./types";

/** Xem/sửa một lần xảy ra, đổi tên hoặc xoá sự kiện. Sự kiện thường niên không có lần riêng: chỉ sửa tên/ghi chú của sự kiện. */
export function openOccurrenceDialog(occ: Occurrence, opts: { onChanged: () => void }): void {
  const annual = occ.id === null;
  const titleInput = h("input", { type: "text", value: occ.title, maxlength: 200 }) as HTMLInputElement;
  const startInput = createDateInput({ value: occ.start_date });
  const endInput = createDateInput({ value: occ.end_date });
  const noteInput = h("textarea", {}, occ.note ?? "") as HTMLTextAreaElement;
  const error = h("p", { class: "error-text", role: "alert" });

  const badges = [
    h("span", { class: `badge badge--${occ.kind}` }, KIND_LABEL[occ.kind]),
    occ.lunar_label ? h("span", { class: "badge" }, occ.lunar_label) : null,
    occ.category ? h("span", { class: "badge" }, occ.category) : null,
  ];

  const run = async (fn: () => Promise<unknown>) => {
    error.textContent = "";
    try {
      await fn();
      close();
      opts.onChanged();
    } catch (err) {
      error.textContent = (err as Error).message;
    }
  };

  const deleteOcc = h(
    "button",
    {
      class: "btn btn-danger",
      type: "button",
      onclick: () => confirm("Xoá lần này?") && run(() => api.del(`/api/occurrences/${occ.id}`)),
    },
    "Xoá lần này",
  );
  const deleteEvent = h(
    "button",
    {
      class: "btn btn-danger",
      type: "button",
      onclick: () =>
        confirm(`Xoá sự kiện “${occ.title}” và TẤT CẢ các lần của nó?`) && run(() => api.del(`/api/events/${occ.event_id}`)),
    },
    "Xoá sự kiện",
  );

  const { form, close } = createDialog(
    occ.title,
    [
      h("div", { class: "badges" }, ...badges),
      h("label", { class: "field" }, h("span", {}, "Tên sự kiện"), titleInput),
      annual
        ? h("p", { class: "muted" }, `Ngày ${fmt(occ.start_date)}. Sự kiện thường niên lặp lại mỗi năm, không sửa riêng từng năm.`)
        : h(
            "div",
            { class: "form-row" },
            h("label", { class: "field" }, h("span", {}, "Từ ngày"), startInput.el),
            h("label", { class: "field" }, h("span", {}, "Đến ngày"), endInput.el),
          ),
      h("label", { class: "field" }, h("span", {}, "Ghi chú"), noteInput),
      error,
    ],
    [
      annual ? null : deleteOcc,
      deleteEvent,
      h("span", { class: "spacer" }),
      h("button", { class: "btn", type: "button", onclick: () => close() }, "Đóng"),
      h("button", { class: "btn btn-primary", type: "submit" }, "Lưu"),
    ].filter((x): x is HTMLElement => x !== null),
  );

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    void run(async () => {
      const title = titleInput.value.trim();
      if (!title) throw new Error("Tên sự kiện trống.");
      const start = startInput.value();
      const end = endInput.value();
      if (!start || !end) throw new Error("Ngày không hợp lệ. Nhập theo dạng ngày/tháng/năm, VD 05/11/2026.");
      const note = noteInput.value.trim();
      if (annual) {
        // Ghi chú của lần thường niên là ghi chú của sự kiện
        const patch: Record<string, unknown> = {};
        if (title !== occ.title) patch.title = title;
        if (note !== (occ.note ?? "")) patch.note = note || null;
        if (Object.keys(patch).length) await api.patch(`/api/events/${occ.event_id}`, patch);
        return;
      }
      if (title !== occ.title) await api.patch(`/api/events/${occ.event_id}`, { title });

      const patch: Record<string, unknown> = {};
      if (start !== occ.start_date) patch.start_date = start;
      if (end !== occ.end_date) patch.end_date = end;
      if (noteInput.value.trim() !== (occ.note ?? "")) patch.note = noteInput.value.trim() || null;
      if (Object.keys(patch).length) await api.patch(`/api/occurrences/${occ.id}`, patch);
    });
  });
}
