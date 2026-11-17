import { h } from "@tori/ui";
import { canSpeak, sayable, speak } from "./common";
import { feedback, practiceMode } from "./practice";

/** Nghe – chép: máy đọc to một từ, gõ lại cho đúng chính tả. */

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
// Sửa nhẹ: bỏ qua dấu cách, dấu nháy (' ’ ‘ ` ´) và gạch nối khi so, VD "dont"/"don’t", "icecream", "well known"
const loose = (s: string) => s.toLowerCase().replace(/[\s'’‘`´\-–]+/g, "");

/** Sai đúng 1 chữ cái: thừa, thiếu, gõ nhầm hoặc đảo 2 chữ cạnh nhau (VD "secnd", "seccond", "socond", "secodn"). */
function oneOff(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true; // nhầm 1 chữ
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); // đảo 2 chữ
  }
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  return s.slice(i) === l.slice(i + 1); // thừa hoặc thiếu 1 chữ
}

export const mount = practiceMode({
  mode: "listen",
  title: "Nghe – chép",
  text:
    "Máy đọc to 10 từ, bạn gõ lại cho đúng chính tả. Nghe lại hay nghe chậm bao nhiêu lần cũng được; " +
    "cần thì xem gợi ý nghĩa. Kết quả cập nhật vào lịch ôn chung với các chế độ khác.",
  tips: [
    "Bấm 🔊 để nghe lại, 🐢 để nghe chậm.",
    "Gõ xong bấm Enter để kiểm tra, Enter lần nữa để sang từ sau.",
    "Không phân biệt chữ hoa, chữ thường; gõ thiếu hay thừa dấu cách, dấu nháy, gạch nối vẫn tính đúng.",
    "Sai đúng 1 chữ cái thì được báo và thử lại 1 lần.",
    "Giọng đọc là giọng tiếng Anh có sẵn trên máy của bạn.",
  ],
  unavailable: () => (canSpeak ? null : "Trình duyệt này không đọc được tiếng Anh, bạn thử Chrome, Edge hoặc Safari nhé."),
  question(item, done) {
    const input = h("input", {
      type: "text",
      class: "input eng__answer",
      autocomplete: "off",
      autocapitalize: "off",
      autocorrect: "off",
      spellcheck: "false",
      lang: "en",
      placeholder: "Gõ từ bạn nghe được…",
      "aria-label": "Gõ từ bạn nghe được",
    }) as HTMLInputElement;
    const hint = h("p", { class: "muted eng__hint" });
    const result = h("div");
    const checkBtn = h("button", { type: "submit", class: "btn btn-primary" }, "Kiểm tra") as HTMLButtonElement;
    const skipBtn = h("button", { type: "button", class: "btn" }, "Không biết") as HTMLButtonElement;

    const warn = h("p", { class: "eng__warn", role: "status" });
    let retried = false;

    const answer = (typed: string) => {
      // Sai 1 chữ cái lần đầu: cảnh báo và cho thử lại một lần
      if (!retried && typed && oneOff(loose(typed), loose(item.word))) {
        retried = true;
        warn.textContent = `Gần đúng rồi! “${typed.trim()}” sai 1 chữ cái, sửa lại rồi bấm Kiểm tra (còn 1 lần).`;
        input.select();
        return;
      }
      warn.textContent = "";
      const correct = loose(typed) === loose(item.word);
      const fixed = correct && norm(typed) !== norm(item.word);
      if (fixed) input.value = item.word;
      input.disabled = checkBtn.disabled = skipBtn.disabled = true;
      input.classList.add(correct ? "is-ok" : "is-bad");
      const extra = fixed ? `đã tự sửa từ “${typed.trim()}”` : correct || !typed ? null : `bạn gõ “${typed.trim()}”`;
      result.replaceChildren(feedback(item, correct, extra, sayable));
      done(correct);
    };
    skipBtn.addEventListener("click", () => answer(""));

    const el = h(
      "form",
      {
        class: "eng__listen",
        onsubmit: (e: Event) => {
          e.preventDefault();
          if (input.value.trim() && !input.disabled) answer(input.value);
        },
      },
      h(
        "div",
        { class: "eng__play" },
        h("button", { type: "button", class: "btn eng__play-btn", onclick: () => speak(item.word) }, "🔊 Nghe"),
        h("button", { type: "button", class: "btn", onclick: () => speak(item.word, 0.55) }, "🐢 Nghe chậm"),
        h(
          "button",
          {
            type: "button",
            class: "btn btn-ghost",
            onclick: () => (hint.textContent = `Nghĩa: ${item.meaning}`),
          },
          "💡 Gợi ý nghĩa",
        ),
      ),
      hint,
      h("div", { class: "eng__answer-row" }, input, checkBtn, skipBtn),
      warn,
      result,
    );
    window.setTimeout(() => {
      speak(item.word);
      input.focus();
    }, 150);
    return el;
  },
});
