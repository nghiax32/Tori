import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const ui = fileURLToPath(new URL("../../../packages/ui/src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@tori\/ui$/, replacement: `${ui}/index.ts` },
      { find: /^@tori\/ui\//, replacement: `${ui}/` },
    ],
  },
  server: {
    port: __FRONTEND_PORT__,
    strictPort: true,
    fs: { allow: [ui, "."] },
    // Backend chạy riêng: uv run uvicorn __APP_MODULE__.main:app --reload --port __BACKEND_PORT__
    proxy: { "/api": "http://127.0.0.1:__BACKEND_PORT__" },
  },
});
