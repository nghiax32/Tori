import { api, ApiError, createDialog, h } from "@tori/ui";
import { renderRanks } from "./ranks";
import {
  canSpeak,
  formatMs,
  intro,
  reviewList,
  shuffle,
  soundOn,
  soundToggle,
  speak,
  topicPicker,
  type ModeCtx,
  type ReviewedWord,
  type Word,
} from "./common";

/** Ghép cặp tính giờ: 8 từ tiếng Anh với 8 nghĩa tiếng Việt, mỗi lần sai cộng 3 giây, có bảng xếp hạng. */

interface Round {
  id: number;
  topic: string;
  words: Word[];
}
interface FinishOut {
  elapsed_ms: number;
  mistakes: number;
  total_ms: number;
  best_ms: number;
  record: boolean;
  rank: number;
  words: ReviewedWord[];
}
interface LeaderRow {
  rank: number;
  name: string;
  total_ms: number;
  rounds: number;
  me: boolean;
}
interface Leaderboard {
  top: LeaderRow[];
  mine: LeaderRow | null;
}

const PENALTY_S = 3;

export function mount({ stage, side, refreshStats }: ModeCtx): () => void {
  let alive = true;
  let timer: number | undefined;

  const picker = topicPicker();
  const boardList = h("div", { class: "rank-list" });
  side.replaceChildren(
    h(
      "aside",
      { class: "card eng__leader" },
      h("h2", {}, "Bảng xếp hạng"),
      h("p", { class: "muted" }, `Lượt Ghép cặp nhanh nhất của mỗi người (mỗi lần sai +${PENALTY_S} giây)`),
      boardList,
    ),
  );

  const loadBoard = async () => {
    const data = await api.get<Leaderboard>("/api/english/leaderboard").catch(() => null);
    if (!alive) return;
    renderRanks(boardList, data, (x) => formatMs(x.total_ms), "Chưa ai chơi. Bạn là người đầu tiên!");
  };

  const showStart = (error = "") => {
    window.clearInterval(timer);
    intro(
      stage,
      "Ghép cặp tính giờ",
      `Ghép 8 từ tiếng Anh với nghĩa tiếng Việt nhanh nhất có thể; mỗi lần ghép sai cộng ${PENALTY_S} giây. ` +
        "Mỗi lượt lấy từ trong một chủ đề: từ cần ôn trước, rồi đến từ mới. Từ ghép sai sẽ gặp lại ngay, từ ghép đúng thì giãn dần lịch ôn.",
      () => void start(),
      error,
      picker,
    );
  };

  const start = async () => {
    let round: Round;
    try {
      round = await api.post<Round>("/api/english/match", { topic: picker.value(), level: picker.level() });
    } catch (e) {
      showStart(e instanceof ApiError ? e.message : "Không tạo được lượt chơi.");
      return;
    }
    if (alive) play(round);
  };

  const play = (round: Round) => {
    const mistakes = new Map<number, number>();
    const matched = new Set<number>();
    let picked: { side: "word" | "meaning"; id: number } | null = null;
    let wrongFlash: number[] = [];
    let justMatched = -1; // cặp vừa ghép đúng: chạy hiệu ứng "nảy" một lần
    let done = false;
    const t0 = performance.now();

    const timeEl = h("span", { class: "eng__time" }, "0:00.0");
    const missEl = h("span", { class: "eng__miss" });
    const wordsCol = h("div", { class: "eng__col" });
    const meaningsCol = h("div", { class: "eng__col" });
    const leftWords = shuffle(round.words);
    const rightWords = shuffle(round.words);

    const totalMistakes = () => [...mistakes.values()].reduce((a, b) => a + b, 0);

    const item = (w: Word, kind: "word" | "meaning") => {
      const cls = [`eng__item eng__item--${kind}`];
      if (matched.has(w.id)) cls.push(w.id === justMatched ? "is-matched is-just" : "is-matched");
      else if (picked?.side === kind && picked.id === w.id) cls.push("is-picked");
      if (wrongFlash[kind === "word" ? 0 : 1] === w.id) cls.push("is-wrong");
      return h(
        "button",
        {
          type: "button",
          class: cls.join(" "),
          disabled: matched.has(w.id) || done,
          lang: kind === "word" ? "en" : "vi",
          onclick: () => choose(kind, w.id),
        },
        kind === "word" ? [h("span", {}, w.word), w.ipa ? h("small", { class: "eng__ipa" }, w.ipa) : null] : w.meaning,
        matched.has(w.id) ? h("span", { class: "eng__check", "aria-hidden": "true" }, "✓") : null,
      );
    };

    const render = () => {
      wordsCol.replaceChildren(...leftWords.map((w) => item(w, "word")));
      meaningsCol.replaceChildren(...rightWords.map((w) => item(w, "meaning")));
      const n = totalMistakes();
      missEl.textContent = n ? `Sai ${n} lần (+${n * PENALTY_S} giây)` : "Chưa sai lần nào";
    };

    const choose = (kind: "word" | "meaning", id: number) => {
      if (done || matched.has(id)) return;
      justMatched = -1;
      if (!picked || picked.side === kind) {
        picked = picked?.side === kind && picked.id === id ? null : { side: kind, id };
        render();
        return;
      }
      const wordId = kind === "word" ? id : picked.id;
      const meaningId = kind === "meaning" ? id : picked.id;
      picked = null;
      if (wordId === meaningId) {
        matched.add(wordId);
        justMatched = wordId;
        if (soundOn()) speak(round.words.find((w) => w.id === wordId)!.word);
        render();
        if (matched.size === round.words.length) void finish();
        return;
      }
      mistakes.set(wordId, (mistakes.get(wordId) ?? 0) + 1); // sai: tính cho từ tiếng Anh đang ghép
      wrongFlash = [wordId, meaningId];
      render();
      window.setTimeout(() => {
        wrongFlash = [];
        if (alive && !done) render();
      }, 450);
    };

    const finish = async () => {
      done = true;
      window.clearInterval(timer);
      const elapsed = Math.round(performance.now() - t0);
      timeEl.textContent = formatMs(elapsed);
      render();
      try {
        const res = await api.post<FinishOut>(`/api/english/match/${round.id}/finish`, {
          elapsed_ms: elapsed,
          mistakes: Object.fromEntries(mistakes),
        });
        if (!alive) return;
        refreshStats();
        void loadBoard();
        showResult(res);
      } catch (e) {
        showStart(e instanceof ApiError ? e.message : "Không gửi được kết quả.");
      }
    };

    stage.replaceChildren(
      h(
        "div",
        { class: "eng__bar" },
        timeEl,
        missEl,
        h("span", { class: "eng__topic-tag" }, picker.label(round.topic)),
        canSpeak ? soundToggle() : null,
        h("button", { type: "button", class: "btn btn-sm", onclick: () => showStart() }, "Bỏ lượt"),
      ),
      h("div", { class: "eng__grid" }, wordsCol, meaningsCol),
    );
    render();
    window.clearInterval(timer);
    timer = window.setInterval(() => {
      if (!done) timeEl.textContent = formatMs(performance.now() - t0);
    }, 100);
  };

  const showResult = (res: FinishOut) => {
    showStart();
    const { form, close } = createDialog(
      res.record ? "Kỷ lục mới! 🎉" : "Hoàn thành!",
      [
        h("p", { class: "eng__result" }, formatMs(res.total_ms)),
        h(
          "p",
          { class: "muted" },
          res.mistakes
            ? `${formatMs(res.elapsed_ms)} + ${res.mistakes * PENALTY_S} giây phạt (sai ${res.mistakes} lần). `
            : "Không sai lần nào. ",
          res.record ? `Hạng ${res.rank} trên bảng xếp hạng.` : `Kỷ lục của bạn: ${formatMs(res.best_ms)} (hạng ${res.rank}).`,
        ),
        reviewList(res.words),
      ],
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
  void loadBoard();

  return () => {
    alive = false;
    window.clearInterval(timer);
  };
}
