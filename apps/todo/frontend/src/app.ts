import { api, createDateInput, createDialog, h, isoToVn } from "@tori/ui";

interface Task {
  id: number;
  title: string;
  due: string | null;
  done: boolean;
  created_at: string;
  done_at: string | null;
}

type Filter = "open" | "done" | "all";

const pad = (n: number) => String(n).padStart(2, "0");
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Nhãn hạn chót: "Quá hạn · 20/11/2026", "Hôm nay", "Ngày mai", hoặc "25/11/2026" */
function dueBadge(task: Task): HTMLElement | null {
  if (!task.due) return null;
  const today = todayIso();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
  let text = isoToVn(task.due);
  let cls = "due";
  if (!task.done && task.due < today) {
    text = `Quá hạn · ${text}`;
    cls += " due--late";
  } else if (task.due === today) {
    text = "Hôm nay";
    cls += task.done ? "" : " due--today";
  } else if (task.due === tomorrowIso) {
    text = "Ngày mai";
  }
  return h("span", { class: cls, title: `Hạn chót ${isoToVn(task.due)}` }, text);
}

export function mount(root: HTMLElement): void {
  let tasks: Task[] = [];
  let filter: Filter = "open";

  const errorText = h("p", { class: "error-text", role: "alert" });
  const showError = (err: unknown) => {
    errorText.textContent = err instanceof Error ? err.message : String(err);
  };

  // ---------- ô thêm việc ----------
  const titleInput = h("input", {
    class: "input",
    type: "text",
    maxlength: 200,
    placeholder: "Thêm việc cần làm…",
    "aria-label": "Tên việc",
    required: true,
  }) as HTMLInputElement;
  const dueInput = createDateInput();
  dueInput.input.classList.add("input");
  dueInput.input.setAttribute("aria-label", "Hạn chót (không bắt buộc)");
  dueInput.input.placeholder = "Hạn chót";
  const addForm = h(
    "form",
    {
      class: "card todo-add",
      onsubmit: async (e: Event) => {
        e.preventDefault();
        const title = titleInput.value.trim();
        const due = dueInput.value();
        if (!title) return titleInput.focus();
        if (due === null) return dueInput.input.focus();
        try {
          await api.post<Task>("/api/tasks", { title, due: due || null });
          titleInput.value = "";
          dueInput.setValue("");
          errorText.textContent = "";
          if (filter === "done") filter = "open";
          await reload();
          titleInput.focus();
        } catch (err) {
          showError(err);
        }
      },
    },
    titleInput,
    dueInput.el,
    h("button", { class: "btn btn-primary", type: "submit" }, "Thêm"),
  );

  // ---------- bộ lọc ----------
  const filterBox = h("div", { class: "segmented", role: "radiogroup", "aria-label": "Lọc" });
  const list = h("ul", { class: "todo-list" });
  const footer = h("div", { class: "todo-footer" });

  async function reload() {
    tasks = await api.get<Task[]>("/api/tasks");
    render();
  }

  async function update(task: Task, patch: Partial<Pick<Task, "title" | "due" | "done">>) {
    try {
      await api.patch<Task>(`/api/tasks/${task.id}`, patch);
      errorText.textContent = "";
      await reload();
    } catch (err) {
      showError(err);
    }
  }

  async function remove(task: Task) {
    try {
      await api.del(`/api/tasks/${task.id}`);
      await reload();
    } catch (err) {
      showError(err);
    }
  }

  function openEdit(task: Task) {
    const title = h("input", { type: "text", maxlength: 200, value: task.title, required: true }) as HTMLInputElement;
    const due = createDateInput({ value: task.due ?? "" });
    const err = h("p", { class: "error-text" });
    const { form, close } = createDialog(
      "Sửa việc",
      [
        h("label", { class: "field" }, h("span", {}, "Tên việc"), title),
        h("div", { class: "field" }, h("span", { class: "field-label" }, "Hạn chót (không bắt buộc)"), due.el),
        err,
      ],
      [
        h("button", { class: "btn btn-ghost", type: "button", onclick: () => close() }, "Huỷ"),
        h("button", { class: "btn btn-primary", type: "submit" }, "Lưu"),
      ],
    );
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const dueValue = due.value();
      if (!title.value.trim()) {
        err.textContent = "Tên việc không được để trống";
        return;
      }
      if (dueValue === null) {
        err.textContent = "Ngày không hợp lệ, nhập theo dạng dd/mm/yyyy";
        return;
      }
      try {
        await api.patch<Task>(`/api/tasks/${task.id}`, { title: title.value.trim(), due: dueValue || null });
        close();
        await reload();
      } catch (e2) {
        err.textContent = (e2 as Error).message;
      }
    });
    title.focus();
    title.select();
  }

  function row(task: Task): HTMLElement {
    const check = h("input", {
      type: "checkbox",
      class: "todo-check",
      checked: task.done,
      "aria-label": task.done ? `Bỏ đánh dấu xong: ${task.title}` : `Đánh dấu xong: ${task.title}`,
      onchange: () => update(task, { done: !task.done }),
    });
    return h(
      "li",
      { class: task.done ? "todo-item is-done" : "todo-item" },
      check,
      h(
        "button",
        { class: "todo-title", type: "button", title: "Bấm để sửa", onclick: () => openEdit(task) },
        task.title,
      ),
      dueBadge(task),
      h(
        "button",
        {
          class: "btn btn-ghost btn-sm todo-delete",
          type: "button",
          "aria-label": `Xoá: ${task.title}`,
          title: "Xoá",
          onclick: () => remove(task),
        },
        "✕",
      ),
    );
  }

  function render() {
    const open = tasks.filter((t) => !t.done);
    const done = tasks.filter((t) => t.done);
    const options: [Filter, string][] = [
      ["open", `Chưa xong (${open.length})`],
      ["done", `Đã xong (${done.length})`],
      ["all", `Tất cả (${tasks.length})`],
    ];
    filterBox.replaceChildren(
      ...options.map(([value, label]) =>
        h(
          "label",
          {},
          h("input", {
            type: "radio",
            name: "todo-filter",
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

    const shown = filter === "open" ? open : filter === "done" ? done : tasks;
    if (shown.length === 0) {
      const empty =
        filter === "done"
          ? "Chưa có việc nào xong."
          : tasks.length === 0
            ? "Chưa có việc nào. Thêm việc đầu tiên ở ô phía trên."
            : "Xong hết rồi 🎉";
      list.replaceChildren(h("li", { class: "todo-empty muted" }, empty));
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
                if (!confirm(`Xoá ${done.length} việc đã xong?`)) return;
                try {
                  await api.del("/api/tasks/done");
                  await reload();
                } catch (err) {
                  showError(err);
                }
              },
            },
            "Xoá việc đã xong",
          )
        : "",
    );
  }

  root.replaceChildren(
    h(
      "section",
      { class: "todo" },
      h("h1", {}, "Việc cần làm"),
      addForm,
      errorText,
      filterBox,
      list,
      footer,
    ),
  );
  reload().catch(showError);
  titleInput.focus();
}
