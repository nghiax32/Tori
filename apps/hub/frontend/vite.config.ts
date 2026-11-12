// Cấu hình chung: packages/ui/vite.base.ts
// Backend chạy riêng: uv run uvicorn hub.main:app --reload --port 8000
import { toriViteConfig } from "../../../packages/ui/vite.base";

export default toriViteConfig({ frontendPort: 5173, backendPort: 8000 });
