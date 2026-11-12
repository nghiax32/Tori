import "@tori/ui/style.css";
import "./style.css";
import { api, getMeta, h, mountHeader } from "@tori/ui";

interface AppInfo {
  name: string;
  title: string;
  description: string;
  icon: string;
  url: string;
}

async function boot() {
  const main = document.getElementById("main")!;
  const [meta, apps] = await Promise.all([getMeta(), api.get<AppInfo[]>("/api/apps")]);
  mountHeader(document.getElementById("header")!, { hubUrl: meta.hub_url });

  main.replaceChildren(
    h(
      "section",
      { class: "hub" },
      h("h1", { class: "hub__title" }, "Tiện ích"),
      apps.length
        ? h(
            "div",
            { class: "hub__grid" },
            ...apps.map((a) =>
              h(
                "a",
                { class: "card hub__card", href: a.url },
                h("div", { class: "hub__icon", "aria-hidden": "true" }, a.icon || "◻️"),
                h("h2", {}, a.title),
                h("p", { class: "muted" }, a.description),
              ),
            ),
          )
        : h("p", { class: "muted" }, "Chưa có ứng dụng nào."),
    ),
  );
}

boot().catch((err: Error) => {
  document.getElementById("main")!.replaceChildren(h("p", { class: "error-text" }, `Không tải được: ${err.message}`));
});
