import { api, createDateInput, createDialog, h } from "@tori/ui";
import { fmt } from "./dates";
import { keepDraft, type OccDraft } from "./draft";
import { createLabelInput } from "./label-input";
import { KIND_LABEL, type Occurrence } from "./types";

/** Xem/sửa một lần xảy ra, đổi tên hoặc xoá sự kiện. Sự kiện thường niên không có lần riêng: chỉ sửa tên/ghi chú của sự kiện. */
export function openOccurrenceDialog(occ: Occurrence, opts: { draft?: OccDraft; onChanged: () => void }): void {
  const annual = occ.id === null;
  const titleInput = h("input", { type: "text", value: occ.title, maxlength: 200 }) as HTMLInputElement;
  const startInput = createDateInput({ value: occ.start_date });
  const endInput = createDateInput({ value: occ.end_date });
  const noteInput = h("textarea", {}, occ.note ?? "") as HTMLTextAreaElement;
  const labelInput = createLabelInput(opts.draft?.labels ?? occ.labels);
  const trackedInput = h("input", { type: "checkbox", checked: occ.tracked }) as HTMLInputElement;
  const error = h("p", { class: "error-text", role: "alert" });

  const badges = [
    h("span", { class: `badge badge--${occ.kind}` }, KIND_LABEL[occ.kind]),
    occ.lunar_label ? h("span", { class: "badge" }, occ.lunar_label) : null,
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

  const { dialog, form, close } = createDialog(
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
      h(
        "div",
        { class: "field" },
        h("span", { class: "field-label" }, annual ? "Nhãn" : "Nhãn của lần này"),
        labelInput.el,
      ),
      h("label", { class: "field" }, h("span", {}, "Ghi chú"), noteInput),
      h(
        "label",
        { class: "check" },
        trackedInput,
        "Theo dõi sự kiện này",
      ),
      error,
    ],
    [
      annual ? deleteEvent : deleteOcc,
      h("span", { class: "spacer" }),
      h("button", { class: "btn", type: "button", onclick: () => close() }, "Đóng"),
      h("button", { class: "btn btn-primary", type: "submit" }, "Lưu"),
    ].filter((x): x is HTMLElement => x !== null),
  );

  // ----- nháp: F5 giữa chừng vẫn mở lại hộp thoại với dữ liệu đang sửa -----
  const d = opts.draft;
  if (d) {
    titleInput.value = d.title;
    startInput.input.value = d.start;
    endInput.input.value = d.end;
    noteInput.value = d.note;
    labelInput.input.value = d.labelText;
    trackedInput.checked = d.tracked;
  }
  keepDraft(dialog, form, () => ({
    form: "occ",
    occ,
    title: titleInput.value,
    start: startInput.input.value,
    end: endInput.input.value,
    note: noteInput.value,
    labels: labelInput.current(),
    labelText: labelInput.input.value,
    tracked: trackedInput.checked,
  }));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    void run(async () => {
      const title = titleInput.value.trim();
      if (!title) throw new Error("Tên sự kiện trống.");
      const start = startInput.value();
      const end = endInput.value();
      if (!start || !end) throw new Error("Ngày không hợp lệ. Nhập theo dạng ngày/tháng/năm, VD 05/11/2026.");
      const note = noteInput.value.trim();
      const labels = labelInput.values();
      const labelsChanged = labels.join("\n") !== occ.labels.join("\n");
      if (annual) {
        // Ghi chú của lần thường niên là ghi chú của sự kiện
        const patch: Record<string, unknown> = {};
        if (title !== occ.title) patch.title = title;
        if (note !== (occ.note ?? "")) patch.note = note || null;
        if (trackedInput.checked !== occ.tracked) patch.tracked = trackedInput.checked;
        if (labelsChanged) patch.labels = labels; // thường niên: nhãn của cả sự kiện
        if (Object.keys(patch).length) await api.patch(`/api/events/${occ.event_id}`, patch);
        return;
      }
      const eventPatch: Record<string, unknown> = {};
      if (title !== occ.title) eventPatch.title = title;
      if (trackedInput.checked !== occ.tracked) eventPatch.tracked = trackedInput.checked;
      if (Object.keys(eventPatch).length) await api.patch(`/api/events/${occ.event_id}`, eventPatch);

      const patch: Record<string, unknown> = {};
      if (start !== occ.start_date) patch.start_date = start;
      if (end !== occ.end_date) patch.end_date = end;
      if (noteInput.value.trim() !== (occ.note ?? "")) patch.note = noteInput.value.trim() || null;
      if (labelsChanged) patch.labels = labels; // chỉ lần này
      if (Object.keys(patch).length) await api.patch(`/api/occurrences/${occ.id}`, patch);
    });
  });
}
