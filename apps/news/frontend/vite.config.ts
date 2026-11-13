// Cấu hình chung: packages/ui/vite.base.ts
// Backend chạy riêng: uv run uvicorn news.main:app --reload --port 8002
import { toriViteConfig } from "../../../packages/ui/vite.base";

export default toriViteConfig({ frontendPort: 5175, backendPort: 8002 });
