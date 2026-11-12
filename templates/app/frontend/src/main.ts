import "@tori/ui/style.css";
import "./style.css";
import { api, getMeta, h, mountHeader } from "@tori/ui";

async function boot() {
  const meta = await getMeta();
  mountHeader(document.getElementById("header")!, { hubUrl: meta.hub_url, appName: "__APP_TITLE__" });

  const { message } = await api.get<{ message: string }>("/api/hello");
  document.getElementById("main")!.replaceChildren(
    h("section", { class: "app" }, h("h1", {}, "__APP_TITLE__"), h("p", { class: "muted" }, message)),
  );
}

boot().catch((err: Error) => {
  document.getElementById("main")!.replaceChildren(h("p", { class: "error-text" }, err.message));
});
