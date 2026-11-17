import { h } from "@tori/ui";
import { sayable, soundOn, speak } from "./common";
import { feedback, practiceMode } from "./practice";

/** Điền vào câu: một câu tiếng Anh bị che một từ, chọn từ đúng trong 4 lựa chọn. */

const BLANK = "____";

export const mount = practiceMode({
  mode: "fill",
  title: "Điền vào câu",
  text:
    "Mỗi câu ví dụ bị che một từ, chọn từ đúng trong 4 lựa chọn. Học từ trong ngữ cảnh giúp nhớ cách dùng, " +
    "không chỉ nghĩa. Kết quả cập nhật vào lịch ôn chung với các chế độ khác.",
  tips: [
    "Đọc cả câu trước khi chọn: các lựa chọn đều là từ cùng chủ đề.",
    "Có thể bấm phím 1–4 để chọn nhanh, Enter để sang câu sau.",
    "Chọn xong sẽ hiện nghĩa, phiên âm và bản dịch cả câu; bấm vào từ để nghe phát âm.",
  ],
  question(item, done) {
    const [before, after] = (item.sentence ?? "").split(BLANK);
    const blank = h("span", { class: "eng__blank" }, "____");
    const result = h("div");
    let answered = false;

    const choose = (choice: string, btn: HTMLButtonElement) => {
      if (answered) return;
      answered = true;
      document.removeEventListener("keydown", onKey);
      const correct = choice === item.word;
      for (const b of buttons) {
        b.disabled = true;
        if (b.dataset.word === item.word) b.classList.add("is-ok");
      }
      if (!correct) btn.classList.add("is-bad");
      blank.textContent = item.answer ?? item.word;
      blank.classList.add(correct ? "is-ok" : "is-bad");
      result.replaceChildren(feedback(item, correct, correct ? null : `bạn chọn “${choice}”`, sayable));
      if (item.translation) result.append(h("p", { class: "eng__translation" }, h("span", {}, "Dịch: "), item.translation));
      if (soundOn()) speak(item.word);
      done(correct);
    };

    const buttons = (item.choices ?? []).map(
      (choice, i) =>
        h(
          "button",
          {
            type: "button",
            class: "eng__choice",
            lang: "en",
            "data-word": choice,
            onclick: (e: Event) => choose(choice, e.currentTarget as HTMLButtonElement),
          },
          h("small", {}, String(i + 1)),
          choice,
        ) as HTMLButtonElement,
    );

    // Phím 1–4 để chọn; gỡ khi đã trả lời (hoặc khi câu bị thay, phím không còn tác dụng vì `answered`/DOM rời trang)
    const onKey = (e: KeyboardEvent) => {
      if (!el.isConnected) {
        document.removeEventListener("keydown", onKey);
        return;
      }
      const i = Number(e.key) - 1;
      if (i >= 0 && i < buttons.length && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        choose(buttons[i].dataset.word!, buttons[i]);
      }
    };
    document.addEventListener("keydown", onKey);

    const el = h(
      "div",
      { class: "eng__fill" },
      h("p", { class: "eng__sentence", lang: "en" }, before, blank, after),
      h("div", { class: "eng__choices" }, buttons),
      result,
    );
    return el;
  },
});
