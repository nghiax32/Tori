// Cấu hình chung: packages/ui/vite.base.ts
// Backend chạy riêng: uv run uvicorn calendar_app.main:app --reload --port 8001
import { toriViteConfig } from "../../../packages/ui/vite.base";

export default toriViteConfig({ frontendPort: 5174, backendPort: 8001 });
