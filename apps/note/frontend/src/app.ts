import { api, createDateInput, createDialog, h, isoToVn } from "@tori/ui";
import { createGarden, type Garden } from "./dandelion";

export interface Note {
  id: number;
  content: string;
  due: string | null;
  done: boolean;
  created_at: string;
  done_at: string | null;
}

type Filter = "open" | "done" | "all";
type View = "list" | "garden";

const VIEW_KEY = "note:view";

function loadView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "garden" ? "garden" : "list";
  } catch {
    return "list";
  }
}

function saveView(view: View) {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // trình duyệt chặn lưu trữ: lần sau mở lại chế độ danh sách
  }
}

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Nhãn hạn chót: "Quá hạn · 20/11/2026", "Hôm nay", "Ngày mai", hoặc "25/11/2026" */
function dueBadge(note: Note): HTMLElement | null {
  if (!note.due) return null;
  const today = isoOf(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  let text = isoToVn(note.due);
  let cls = "due";
  if (!note.done && note.due < today) {
    text = `Quá hạn · ${text}`;
    cls += " due--late";
  } else if (note.due === today) {
    text = "Hôm nay";
    cls += note.done ? "" : " due--today";
  } else if (note.due === isoOf(tomorrow)) {
    text = "Ngày mai";
  }
  return h("span", { class: cls, title: `Hạn chót ${isoToVn(note.due)}` }, text);
}

/** Ô nhập nhiều dòng tự cao theo nội dung; Ctrl/⌘ + Enter để lưu */
function autoGrow(area: HTMLTextAreaElement, onSubmit: () => void): HTMLTextAreaElement {
  const fit = () => {
    area.style.height = "auto";
    area.style.height = `${area.scrollHeight + 2}px`;
  };
  area.addEventListener("input", fit);
  area.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onSubmit();
    }
  });
  requestAnimationFrame(fit);
  return area;
}

export function mount(root: HTMLElement): void {
  let notes: Note[] = [];
  let filter: Filter = "open";
  let view: View = loadView();
  let garden: Garden | null = null;

  const errorText = h("p", { class: "error-text", role: "alert" });
  const showError = (err: unknown) => {
    errorText.textContent = err instanceof Error ? err.message : String(err);
  };

  // ---------- ô ghi chú mới ----------
  const contentInput = h("textarea", {
    class: "input note-add__text",
    rows: 2,
    maxlength: 5000,
    placeholder: "Ghi chú mới…  (Ctrl + Enter để lưu)",
    "aria-label": "Nội dung ghi chú",
  }) as HTMLTextAreaElement;
  const dueInput = createDateInput();
  dueInput.input.classList.add("input");
  dueInput.input.setAttribute("aria-label", "Hạn chót (không bắt buộc)");
  dueInput.input.placeholder = "Hạn chót (tuỳ chọn)";

  let saving = false;
  async function addNote() {
    const content = contentInput.value.trim();
    const due = dueInput.value();
    if (!content) return contentInput.focus();
    if (due === null) return dueInput.input.focus();
    if (saving) return;
    saving = true;
    const sent = contentInput.value;
    try {
      await api.post<Note>("/api/notes", { content: sent, due: due || null });
      // lúc chờ lưu mà đã gõ tiếp thì giữ nguyên chữ mới gõ
      if (contentInput.value === sent) {
        contentInput.value = "";
        contentInput.dispatchEvent(new Event("input"));
        dueInput.setValue("");
      }
      errorText.textContent = "";
      if (filter === "done") filter = "open";
      await reload();
      contentInput.focus();
    } catch (err) {
      showError(err);
    } finally {
      saving = false;
    }
  }

  const addForm = h(
    "form",
    {
      class: "card note-add",
      onsubmit: (e: Event) => {
        e.preventDefault();
        addNote();
      },
    },
    autoGrow(contentInput, addNote),
    h(
      "div",
      { class: "note-add__row" },
      dueInput.el,
      h("button", { class: "btn btn-primary", type: "submit" }, "Lưu"),
    ),
  );

  const filterBox = h("div", { class: "segmented", role: "radiogroup", "aria-label": "Lọc" });
  const viewBox = h("div", { class: "segmented", role: "radiogroup", "aria-label": "Chế độ hiển thị" });
  const toolbar = h("div", { class: "note-toolbar" }, filterBox, viewBox);
  const gardenHost = h("div", { class: "garden", hidden: true });
  const list = h("ul", { class: "note-list" });
  const footer = h("div", { class: "note-footer" });

  async function reload() {
    notes = await api.get<Note[]>("/api/notes");
    render();
  }

  async function update(note: Note, patch: Partial<Pick<Note, "content" | "due" | "done">>) {
    try {
      await api.patch<Note>(`/api/notes/${note.id}`, patch);
      errorText.textContent = "";
      await reload();
    } catch (err) {
      showError(err);
    }
  }

  async function remove(note: Note) {
    try {
      await api.del(`/api/notes/${note.id}`);
      await reload();
    } catch (err) {
      showError(err);
    }
  }

  function openEdit(note: Note) {
    const err = h("p", { class: "error-text" });
    const due = createDateInput({ value: note.due ?? "" });
    let submit = () => {};
    const content = autoGrow(
      h("textarea", { rows: 4, maxlength: 5000 }, note.content) as HTMLTextAreaElement,
      () => submit(),
    );
    const { form, close } = createDialog(
      "Sửa ghi chú",
      [
        h("label", { class: "field" }, h("span", {}, "Nội dung"), content),
        h("div", { class: "field" }, h("span", { class: "field-label" }, "Hạn chót (không bắt buộc)"), due.el),
        err,
      ],
      [
        h(
          "button",
          {
            class: "btn note-dialog-done",
            type: "button",
            onclick: async () => {
              close();
              await update(note, { done: !note.done });
            },
          },
          note.done ? "Bỏ đánh dấu xong" : "✓ Đánh dấu xong",
        ),
        h("button", { class: "btn btn-ghost", type: "button", onclick: () => close() }, "Huỷ"),
        h("button", { class: "btn btn-primary", type: "submit" }, "Lưu"),
      ],
    );
    submit = () => form.requestSubmit();
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const dueValue = due.value();
      if (!content.value.trim()) {
        err.textContent = "Ghi chú không được để trống";
        return;
      }
      if (dueValue === null) {
        err.textContent = "Ngày không hợp lệ, nhập theo dạng dd/mm/yyyy";
        return;
      }
      try {
        await api.patch<Note>(`/api/notes/${note.id}`, { content: content.value, due: dueValue || null });
        close();
        await reload();
      } catch (e2) {
        err.textContent = (e2 as Error).message;
      }
    });
    content.focus();
  }

  function row(note: Note): HTMLElement {
    const firstLine = note.content.split("\n")[0];
    return h(
      "li",
      { class: note.done ? "note-item is-done" : "note-item" },
      h("input", {
        type: "checkbox",
        class: "note-check",
        checked: note.done,
        title: note.done ? "Bỏ đánh dấu xong" : "Đánh dấu xong",
        "aria-label": note.done ? `Bỏ đánh dấu xong: ${firstLine}` : `Đánh dấu xong: ${firstLine}`,
        onchange: () => update(note, { done: !note.done }),
      }),
      h(
        "button",
        { class: "note-text", type: "button", title: "Bấm để sửa", onclick: () => openEdit(note) },
        note.content,
      ),
      dueBadge(note),
      h(
        "button",
        {
          class: "btn btn-ghost btn-sm note-delete",
          type: "button",
          "aria-label": `Xoá: ${firstLine}`,
          title: "Xoá",
          onclick: () => remove(note),
        },
        "✕",
      ),
    );
  }

  function render() {
    const open = notes.filter((n) => !n.done);
    const done = notes.filter((n) => n.done);
    const options: [Filter, string][] = [
      ["open", `Đang có (${open.length})`],
      ["done", `Đã xong (${done.length})`],
      ["all", `Tất cả (${notes.length})`],
    ];
    filterBox.replaceChildren(
      ...options.map(([value, label]) =>
        h(
          "label",
          {},
          h("input", {
            type: "radio",
            name: "note-filter",
            value,
            checked: filter === value,
            onchange: () => {
              filter = value;
              render();
            },
          }),
          h("span", {}, label),
        ),
      ),
    );

    const views: [View, string][] = [
      ["list", "📋 Danh sách"],
      ["garden", "🌬️ Bồ công anh"],
    ];
    viewBox.replaceChildren(
      ...views.map(([value, label]) =>
        h(
          "label",
          {},
          h("input", {
            type: "radio",
            name: "note-view",
            value,
            checked: view === value,
            onchange: () => {
              view = value;
              saveView(view);
              render();
            },
          }),
          h("span", {}, label),
        ),
      ),
    );

    const inGarden = view === "garden";
    document.body.classList.toggle("is-garden", inGarden);
    filterBox.hidden = inGarden;
    list.hidden = inGarden;
    footer.hidden = inGarden;
    gardenHost.hidden = !inGarden;
    if (inGarden) {
      if (!garden) {
        window.scrollTo(0, 0);
        garden = createGarden(gardenHost, {
          onOpen: openEdit,
          todayIso: () => isoOf(new Date()),
          // chừa phần trên cho ô ghi chú mới và thanh công cụ, để hạt không bay khuất sau chúng
          topInset: () => toolbar.getBoundingClientRect().bottom - gardenHost.getBoundingClientRect().top,
        });
      }
      // chỉ ghi chú chưa xong và còn hạn (hoặc không có hạn)
      const today = isoOf(new Date());
      garden.setNotes(
        open.filter((n) => !n.due || n.due >= today),
        notes,
      );
      return;
    }
    garden?.destroy();
    garden = null;

    const shown = filter === "open" ? open : filter === "done" ? done : notes;
    if (shown.length === 0) {
      const empty =
        filter === "done"
          ? "Chưa có ghi chú nào đánh dấu xong."
          : notes.length === 0
            ? "Chưa có ghi chú nào. Viết ghi chú đầu tiên ở ô phía trên."
            : "Xong hết rồi 🎉";
      list.replaceChildren(h("li", { class: "note-empty muted" }, empty));
    } else {
      list.replaceChildren(...shown.map(row));
    }

    footer.replaceChildren(
      done.length && filter !== "open"
        ? h(
            "button",
            {
              class: "btn btn-ghost btn-sm",
              type: "button",
              onclick: async () => {
                if (!confirm(`Xoá ${done.length} ghi chú đã xong?`)) return;
                try {
                  await api.del("/api/notes/done");
                  await reload();
                } catch (err) {
                  showError(err);
                }
              },
            },
            "Xoá ghi chú đã xong",
          )
        : "",
    );
  }

  root.replaceChildren(
    h("section", { class: "note" }, h("h1", {}, "Ghi chú"), addForm, errorText, toolbar, list, footer),
    gardenHost,
  );
  reload().catch(showError);
  contentInput.focus();
}
