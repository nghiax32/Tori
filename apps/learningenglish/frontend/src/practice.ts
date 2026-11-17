import { api, ApiError, createDialog, h } from "@tori/ui";
import { intro, reviewList, topicPicker, type ModeCtx, type ModeMount, type ReviewedWord } from "./common";

/** Khung chung cho các chế độ luyện tập 10 câu (Nghe – chép, Điền vào câu): lấy lượt từ server, hỏi lần lượt
 * từng câu, câu nào xong thì hiện nút Tiếp, hết lượt thì gửi kết quả để cập nhật lịch ôn. */

export interface PracticeItem {
  id: number;
  word: string;
  ipa: string;
  meaning: string;
  sentence: string | null;
  answer: string | null;
  choices: string[] | null;
  translation: string | null;
}
interface PracticeOut {
  id: number;
  topic: string;
  items: PracticeItem[];
}
interface FinishOut {
  correct: number;
  total: number;
  words: ReviewedWord[];
}

export interface PracticeOptions {
  mode: "listen" | "fill";
  title: string;
  text: string;
  tips: string[];
  /** Không chơi được trên trình duyệt này thì trả về lý do */
  unavailable?: () => string | null;
  /** Vẽ một câu hỏi; gọi `done` đúng một lần khi đã trả lời (đúng hay sai) */
  question: (item: PracticeItem, done: (correct: boolean) => void) => HTMLElement;
}

export function practiceMode(opts: PracticeOptions): ModeMount {
  return ({ stage, side, refreshStats }: ModeCtx) => {
    let alive = true;
    const picker = topicPicker();

    side.replaceChildren(
      h(
        "aside",
        { class: "card eng__leader" },
        h("h2", {}, "Cách chơi"),
        h("ul", { class: "eng__tips" }, opts.tips.map((t) => h("li", {}, t))),
      ),
    );

    const showStart = (error = "") => {
      const reason = opts.unavailable?.() ?? null;
      intro(stage, opts.title, opts.text, () => void start(), reason ?? error, picker);
      if (reason) stage.querySelector<HTMLButtonElement>(".eng__start")!.disabled = true;
    };

    const start = async () => {
      let round: PracticeOut;
      try {
        round = await api.post<PracticeOut>("/api/english/practice", {
          mode: opts.mode,
          topic: picker.value(),
          level: picker.level(),
        });
      } catch (e) {
        showStart(e instanceof ApiError ? e.message : "Không tạo được lượt chơi.");
        return;
      }
      if (alive) play(round);
    };

    const play = (round: PracticeOut) => {
      const results: Record<number, boolean> = {};
      let index = 0;

      const progressEl = h("span", { class: "eng__progress" });
      const scoreEl = h("span", { class: "eng__miss" });
      const body = h("div", { class: "eng__question" });
      const nextBtn = h("button", { type: "button", class: "btn btn-primary eng__next", onclick: () => next() }) as HTMLButtonElement;

      const paint = () => {
        progressEl.textContent = `Câu ${Math.min(index + 1, round.items.length)}/${round.items.length}`;
        const answered = Object.values(results);
        scoreEl.textContent = answered.length ? `Đúng ${answered.filter(Boolean).length}/${answered.length}` : "";
      };

      const ask = () => {
        const item = round.items[index];
        nextBtn.hidden = true;
        nextBtn.textContent = index === round.items.length - 1 ? "Xem kết quả" : "Tiếp →";
        let answered = false;
        body.replaceChildren(
          opts.question(item, (correct) => {
            if (answered || !alive) return;
            answered = true;
            results[item.id] = correct;
            paint();
            nextBtn.hidden = false;
            nextBtn.focus(); // Enter để sang câu sau
          }),
        );
        paint();
      };

      const next = () => {
        index++;
        if (index < round.items.length) ask();
        else void finish();
      };

      const finish = async () => {
        try {
          const res = await api.post<FinishOut>(`/api/english/practice/${round.id}/finish`, { results });
          if (!alive) return;
          refreshStats();
          showStart();
          showResult(res);
        } catch (e) {
          showStart(e instanceof ApiError ? e.message : "Không gửi được kết quả.");
        }
      };

      stage.replaceChildren(
        h(
          "div",
          { class: "eng__bar" },
          progressEl,
          scoreEl,
          h("span", { class: "eng__topic-tag" }, picker.label(round.topic)),
          h("button", { type: "button", class: "btn btn-sm", onclick: () => showStart() }, "Bỏ lượt"),
        ),
        body,
        h("div", { class: "eng__actions" }, nextBtn),
      );
      ask();
    };

    const showResult = (res: FinishOut) => {
      const perfect = res.total > 0 && res.correct === res.total;
      const { form, close } = createDialog(
        perfect ? "Đúng hết! 🎉" : "Hoàn thành!",
        [h("p", { class: "eng__result" }, `${res.correct}/${res.total}`), reviewList(res.words)],
        [
          h("button", { type: "button", class: "btn", onclick: () => close() }, "Đóng"),
          h("button", { type: "submit", class: "btn btn-primary" }, "Lượt mới"),
        ],
      );
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        close();
        void start();
      });
    };

    showStart();
    return () => {
      alive = false;
    };
  };
}

/** Dòng hiện đáp án sau khi trả lời: đúng/sai, từ (bấm để nghe), phiên âm, nghĩa */
export function feedback(item: PracticeItem, correct: boolean, extra: string | null, say: (w: string) => HTMLElement): HTMLElement {
  return h(
    "div",
    { class: `eng__feedback ${correct ? "is-ok" : "is-bad"}` },
    h("strong", { class: "eng__feedback-title" }, correct ? "✓ Chính xác" : "✗ Chưa đúng", extra ? h("span", {}, ` · ${extra}`) : null),
    h("div", { class: "eng__feedback-word" }, say(item.word), item.ipa ? h("span", { class: "eng__ipa" }, item.ipa) : null),
    h("div", {}, item.meaning),
  );
}
