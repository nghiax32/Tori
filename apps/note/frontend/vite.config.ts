// Cấu hình chung: packages/ui/vite.base.ts
// Backend chạy riêng: uv run uvicorn note.main:app --reload --port 8005
import { toriViteConfig } from "../../../packages/ui/vite.base";

export default toriViteConfig({ frontendPort: 5178, backendPort: 8005 });
