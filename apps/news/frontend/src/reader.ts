import { h } from "@tori/ui";

/** Bản tin đã tách mục/tin ở backend (news/structure.py). HTML trong đây do backend dựng từ markdown:
 * HTML viết sẵn trong bài đã bị escape, link javascript: bị chặn. */
export interface Source {
  name: string;
  url: string;
}

type Block =
  | { type: "top"; num: number; title_html: string; body_html: string; sources: Source[] }
  | { type: "item"; title_html: string; meta: string | null; body_html: string; sources: Source[] }
  | { type: "html"; html: string }
  | { type: "table"; html: string }
  | { type: "timeline"; entries: { when: string; html: string }[] }
  | { type: "sources"; links: Source[] }
  | { type: "sources_inline"; links: Source[] };

type Kind = "top" | "category" | "timeline" | "table" | "sources";
type Tone = "world" | "economy" | "tech" | "asia" | "science" | "security" | "dev";

export interface Section {
  title: string;
  icon: string | null;
  kind: Kind;
  tone: Tone | null;
  blocks: Block[];
}

export interface Structure {
  updated: string | null;
  sections: Section[];
}

const KIND_ICON: Record<Exclude<Kind, "category">, string> = { top: "⭐", timeline: "📅", table: "📊", sources: "🔗" };
const TONE_ICON: Record<Tone, string> = {
  world: "🌍",
  economy: "💹",
  tech: "🤖",
  asia: "🌏",
  science: "🔬",
  security: "🛡️",
  dev: "💻",
};

function icon(s: Section): string {
  if (s.icon) return s.icon;
  if (s.kind !== "category") return KIND_ICON[s.kind];
  return s.tone ? TONE_ICON[s.tone] : "📰";
}

/** Số mục hiện trên thanh mục lục: số tin, số mốc lịch, số nguồn */
function count(s: Section): number {
  return s.blocks.reduce((n, b) => {
    if (b.type === "top" || b.type === "item") return n + 1;
    if (b.type === "timeline") return n + b.entries.length;
    if (b.type === "sources") return n + b.links.length;
    return n;
  }, 0);
}

function html(tag: "div" | "span" | "p", cls: string, markup: string): HTMLElement {
  const el = h(tag, { class: cls });
  el.innerHTML = markup;
  return el;
}

/** Tên miền ngắn để hiện cạnh tên nguồn: "https://www.reuters.com/x" -> "reuters.com" */
function domain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function sourceChips(links: Source[]): HTMLElement | null {
  if (!links.length) return null;
  return h(
    "div",
    { class: "news-sources" },
    ...links.map((s) =>
      h("a", { class: "news-source", href: s.url, target: "_blank", rel: "noopener noreferrer", title: s.url }, `${s.name} ↗`),
    ),
  );
}

/** Tô xanh/đỏ các mức thay đổi "+2,5%", "−0,4%" trong bảng và số liệu thị trường */
function markChanges(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  const re = /([+−-])\s?\d[\d.,]*\s?%/g;
  for (const node of nodes) {
    const text = node.data;
    if (!re.test(text)) continue;
    re.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const m of text.matchAll(re)) {
      frag.append(text.slice(last, m.index));
      frag.append(h("span", { class: m[1] === "+" ? "news-up" : "news-down" }, m[0]));
      last = m.index! + m[0].length;
    }
    frag.append(text.slice(last));
    node.replaceWith(frag);
  }
}

function renderBlock(b: Block, kind: Kind): Node | null {
  switch (b.type) {
    case "top":
      return h(
        "div",
        { class: "news-top" },
        h("span", { class: "news-top__num" }, String(b.num)),
        h(
          "div",
          { class: "news-top__content" },
          html("p", "news-top__title", b.title_html),
          html("p", "news-top__body", b.body_html),
          sourceChips(b.sources),
        ),
      );
    case "item":
      return h(
        "div",
        { class: "news-item" },
        h(
          "div",
          { class: "news-item__head" },
          html("p", "news-item__title", b.title_html),
          b.meta ? h("span", { class: "news-item__meta" }, b.meta) : null,
        ),
        b.body_html ? html("p", "news-item__body", b.body_html) : null,
        sourceChips(b.sources),
      );
    case "table": {
      const el = html("div", "news-table", b.html);
      markChanges(el);
      return el;
    }
    case "timeline":
      return h(
        "ol",
        { class: "news-timeline" },
        ...b.entries.map((e) =>
          h("li", { class: "news-timeline__entry" }, h("span", { class: "news-timeline__when" }, e.when), html("span", "news-timeline__what", e.html)),
        ),
      );
    case "sources":
      return h(
        "details",
        { class: "news-sources-all" },
        h("summary", {}, `Xem ${b.links.length} nguồn`),
        h(
          "ul",
          {},
          ...b.links.map((s) =>
            h(
              "li",
              {},
              h("a", { href: s.url, target: "_blank", rel: "noopener noreferrer" }, s.name),
              h("span", { class: "muted" }, ` · ${domain(s.url)}`),
            ),
          ),
        ),
      );
    case "sources_inline":
      return h("div", { class: "news-sources-line" }, h("span", { class: "muted" }, "Nguồn:"), sourceChips(b.links));
    case "html": {
      const el = html("div", "news-prose", b.html);
      if (kind === "table" || el.querySelector("ul, table")) markChanges(el);
      return el;
    }
  }
}

/**
 * Dựng bài đã tách mục: thanh mục lục dính ở trên (bấm để nhảy, tô mục đang đọc) và các mục.
 * Trả về các phần tử để chèn vào khung đọc, cùng hàm dọn (ngắt theo dõi cuộn) khi đổi bài.
 */
export function renderStructured(st: Structure): { nodes: Node[]; dispose: () => void } {
  const chips: HTMLAnchorElement[] = [];
  let clicked: number | null = null; // mục vừa bấm trên mục lục: cuộn hết trang mà đầu mục chưa lên tới thì vẫn tô mục này
  const goTo = (i: number) => {
    clicked = i;
    // Cuộn sao cho đầu mục nằm ngay dưới mục lục dính (mục lục cao 1-2 dòng tuỳ bề rộng)
    const header = document.getElementById("header")?.getBoundingClientRect().height ?? 0;
    const top = sections[i].getBoundingClientRect().top + window.scrollY - header - toc.offsetHeight - 12;
    window.scrollTo({ top, behavior: "smooth" });
  };
  const sections = st.sections.map((s, i) => {
    const id = `muc-${i + 1}`;
    const n = count(s);
    chips.push(
      h(
        "a",
        {
          class: `news-toc__chip${s.tone ? ` tone-${s.tone}` : ""} kind-${s.kind}`,
          href: `#${id}`,
          onclick: (e: Event) => {
            e.preventDefault();
            goTo(i);
          },
        },
        `${icon(s)} ${s.kind === "top" ? "Nổi bật" : s.title}`,
        n ? h("span", { class: "news-toc__count" }, String(n)) : null,
      ),
    );
    return h(
      "section",
      { id, class: `news-sec kind-${s.kind}${s.tone ? ` tone-${s.tone}` : ""}` },
      h(
        "h2",
        { class: "news-sec__title" },
        h("span", { class: "news-sec__icon", "aria-hidden": "true" }, icon(s)),
        s.title,
        n && s.kind !== "sources" ? h("span", { class: "news-sec__count" }, String(n)) : null,
      ),
      ...s.blocks.map((b) => renderBlock(b, s.kind)),
    );
  });

  const toc = h("nav", { class: "news-toc", "aria-label": "Các mục trong bản tin" }, ...chips);

  // Mục đang đọc: mục cuối cùng có đầu mục đã cuộn qua mép dưới thanh mục lục
  const onScroll = () => {
    const edge = toc.getBoundingClientRect().bottom + 24;
    let current = 0;
    sections.forEach((sec, i) => {
      if (sec.getBoundingClientRect().top <= edge) current = i;
    });
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    if (atBottom && clicked !== null) current = Math.max(current, clicked);
    chips.forEach((c, i) => c.classList.toggle("is-current", i === current));
    const active = chips[current];
    if (active && toc.scrollWidth > toc.clientWidth) {
      // Thanh mục lục cuộn ngang (màn hẹp): giữ chip đang đọc trong tầm nhìn
      const left = active.offsetLeft - toc.clientWidth / 2 + active.clientWidth / 2;
      toc.scrollTo({ left, behavior: "smooth" });
    }
  };
  let frame = 0;
  const listener = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(onScroll);
  };
  const forget = () => (clicked = null); // người dùng tự cuộn: bỏ mục vừa bấm
  window.addEventListener("scroll", listener, { passive: true });
  for (const ev of ["wheel", "touchstart", "keydown"]) window.addEventListener(ev, forget, { passive: true });
  requestAnimationFrame(onScroll);

  return {
    nodes: [toc, ...sections],
    dispose: () => {
      window.removeEventListener("scroll", listener);
      for (const ev of ["wheel", "touchstart", "keydown"]) window.removeEventListener(ev, forget);
    },
  };
}

export function updatedLine(st: Structure): HTMLElement | null {
  return st.updated ? h("p", { class: "news-updated" }, `🕗 ${st.updated}`) : null;
}
