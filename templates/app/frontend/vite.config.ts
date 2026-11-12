// Cấu hình chung: packages/ui/vite.base.ts
// Backend chạy riêng: uv run uvicorn __APP_MODULE__.main:app --reload --port __BACKEND_PORT__
import { toriViteConfig } from "../../../packages/ui/vite.base";

export default toriViteConfig({ frontendPort: __FRONTEND_PORT__, backendPort: __BACKEND_PORT__ });
