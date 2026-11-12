/**
 * Cấu hình Vite dùng chung cho frontend của mọi app. Trong apps/<app>/frontend/vite.config.ts:
 *
 *   import { toriViteConfig } from "../../../packages/ui/vite.base";
 *   export default toriViteConfig({ frontendPort: 5174, backendPort: 8001 });
 *
 * Chỉ import kiểu từ "vite" (bị xoá khi chạy): file này nằm ngoài node_modules của app nên
 * không import giá trị từ package nào được.
 */
import type { UserConfig } from "vite";
import { fileURLToPath } from "node:url";

const ui = fileURLToPath(new URL("./src", import.meta.url));

export function toriViteConfig(opts: { frontendPort: number; backendPort: number }): UserConfig {
  return {
    resolve: {
      alias: [
        { find: /^@tori\/ui$/, replacement: `${ui}/index.ts` },
        { find: /^@tori\/ui\//, replacement: `${ui}/` },
      ],
    },
    server: {
      port: opts.frontendPort,
      strictPort: true,
      fs: { allow: [ui, "."] },
      // Gọi /api/* sang backend FastAPI chạy riêng ở cổng backendPort
      proxy: { "/api": `http://127.0.0.1:${opts.backendPort}` },
    },
  };
}
