export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: unknown,
  ) {
    super(ApiError.messageOf(detail) ?? `Lỗi ${status}`);
  }

  static messageOf(detail: unknown): string | undefined {
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object" && "message" in detail) return String(detail.message);
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg); // lỗi validate của FastAPI
    return undefined;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.detail ?? data);
  return data as T;
}

type Params = Record<string, string | number | boolean | null | undefined>;

function withParams(url: string, params?: Params): string {
  if (!params) return url;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") qs.set(k, String(v));
  const s = qs.toString();
  return s ? `${url}?${s}` : url;
}

export const api = {
  get: <T>(url: string, params?: Params) => request<T>("GET", withParams(url, params)),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body ?? {}),
  patch: <T>(url: string, body: unknown) => request<T>("PATCH", url, body),
  del: <T = void>(url: string) => request<T>("DELETE", url),
};

export interface Meta {
  app: string;
  title: string;
  hub_url: string;
  env: string;
}

export interface Me {
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
}

export interface AuthConfig {
  google: boolean;
  dev: boolean;
}

export const getMeta = () => api.get<Meta>("/api/meta");
