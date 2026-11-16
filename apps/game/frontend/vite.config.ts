// Cấu hình chung: packages/ui/vite.base.ts
// Backend chạy riêng: uv run uvicorn game.main:app --reload --port 8003
import { toriViteConfig } from "../../../packages/ui/vite.base";

export default toriViteConfig({ frontendPort: 5176, backendPort: 8003 });
