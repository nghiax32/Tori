// Cấu hình chung: packages/ui/vite.base.ts
// Backend chạy riêng: uv run uvicorn learningenglish.main:app --reload --port 8004
import { toriViteConfig } from "../../../packages/ui/vite.base";

export default toriViteConfig({ frontendPort: 5177, backendPort: 8004 });
