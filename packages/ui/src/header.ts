import type { Me } from "./api";
import { h } from "./dom";

export interface HeaderOptions {
  hubUrl: string;
  appName?: string;
  user?: Me | null;
  onLogout?: () => void;
}

/** Thanh tiêu đề chung: "Tori / Tên app ........ avatar  Đăng xuất". */
export function mountHeader(target: HTMLElement, opts: HeaderOptions): void {
  const user = opts.user;
  const right = user
    ? h(
        "div",
        { class: "tori-header__user" },
        user.picture ? h("img", { class: "tori-avatar", src: user.picture, alt: "", referrerpolicy: "no-referrer" }) : null,
        h("span", { title: user.email }, user.name || user.email),
        opts.onLogout ? h("button", { class: "btn btn-ghost btn-sm", onclick: opts.onLogout }, "Đăng xuất") : null,
      )
    : null;

  target.replaceChildren(
    h(
      "header",
      { class: "tori-header" },
      h(
        "div",
        { class: "tori-header__inner" },
        h("a", { class: "tori-header__brand", href: opts.hubUrl }, "Tori"),
        opts.appName ? h("span", { class: "tori-header__sep", "aria-hidden": "true" }, "/") : null,
        opts.appName ? h("span", { class: "tori-header__app" }, opts.appName) : null,
        h("div", { class: "tori-header__spacer" }),
        right,
      ),
    ),
  );
}
