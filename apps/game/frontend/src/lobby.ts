import { h } from "@tori/ui";
import { GAMES } from "./games/registry";

export function renderLobby(root: HTMLElement): void {
  root.replaceChildren(
    h(
      "section",
      { class: "lobby" },
      h("h1", { class: "lobby__title" }, "Trò chơi"),
      h(
        "div",
        { class: "tori-tiles" },
        GAMES.map((g) =>
          h(
            "a",
            { class: "card tori-tile", href: `#/${g.id}` },
            h("div", { class: "tori-tile__icon", "aria-hidden": "true" }, g.icon),
            h("h2", {}, g.name),
            h("p", { class: "muted" }, g.description),
          ),
        ),
      ),
    ),
  );
}
