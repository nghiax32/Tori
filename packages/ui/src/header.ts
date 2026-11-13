import type { Me } from "./api";
import { h } from "./dom";

export interface HeaderOptions {
  hubUrl: string;
  appName?: string;
  user?: Me | null;
  onLogout?: () => void;
  /** Có thì hiện nút "Đăng nhập" khi chưa đăng nhập */
  onLogin?: () => void;
}

/** Đồng hồ giờ Việt Nam (Asia/Ho_Chi_Minh) theo đồng hồ máy người xem, nhảy đúng đầu mỗi giây. */
function createClock(): HTMLElement {
  const fmt = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const time = h("time", { class: "tori-clock__time" });
  const el = h(
    "div",
    { class: "tori-clock", title: "Giờ Việt Nam (Asia/Ho_Chi_Minh)" },
    time,
    h("span", { class: "tori-clock__zone" }, "GMT+7"),
  );
  let mounted = false;
  const tick = () => {
    if (el.isConnected) mounted = true;
    else if (mounted) return; // header đã bị thay: dừng đồng hồ
    // Mỗi chữ số một ô rộng cố định: font không có số rộng đều (tnum) nên giây nhảy làm đồng hồ co giãn
    time.replaceChildren(
      ...[...fmt.format(new Date())].map((c) => (/\d/.test(c) ? h("span", { class: "tori-clock__digit" }, c) : c)),
    );
    setTimeout(tick, 1000 - (Date.now() % 1000));
  };
  tick();
  return el;
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
    : opts.onLogin
      ? h("button", { class: "btn btn-sm", onclick: opts.onLogin }, "Đăng nhập")
      : null;

  target.replaceChildren(
    h(
      "header",
      { class: "tori-header" },
      h(
        "div",
        { class: "tori-header__inner" },
        h(
          "a",
          { class: "tori-header__brand", href: opts.hubUrl },
          h("span", { class: "tori-header__logo", "aria-hidden": "true" }, "🐦"),
          "Tori",
        ),
        opts.appName ? h("span", { class: "tori-header__sep", "aria-hidden": "true" }, "/") : null,
        opts.appName ? h("span", { class: "tori-header__app" }, opts.appName) : null,
        h("div", { class: "tori-header__spacer" }),
        createClock(),
        right,
      ),
    ),
  );
}
