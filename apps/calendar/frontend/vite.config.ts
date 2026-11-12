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
    port: 5174,
    strictPort: true,
    fs: { allow: [ui, "."] },
    // Backend chạy riêng: uv run uvicorn calendar_app.main:app --reload --port 8001
    proxy: { "/api": "http://127.0.0.1:8001" },
  },
});
