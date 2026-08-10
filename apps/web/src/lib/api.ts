export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const message = (body as { error?: string } | null)?.error ?? `Erro ${res.status}`;
    throw new ApiError(res.status, message, body);
  }

  return body as T;
}

export function apiGet<T = unknown>(path: string) {
  return apiFetch<T>(path);
}

export function apiPost<T = unknown>(path: string, data?: unknown) {
  return apiFetch<T>(path, { method: "POST", body: data !== undefined ? JSON.stringify(data) : undefined });
}

export function apiPatch<T = unknown>(path: string, data?: unknown) {
  return apiFetch<T>(path, { method: "PATCH", body: data !== undefined ? JSON.stringify(data) : undefined });
}

export function apiPut<T = unknown>(path: string, data?: unknown) {
  return apiFetch<T>(path, { method: "PUT", body: data !== undefined ? JSON.stringify(data) : undefined });
}

export function apiDelete<T = unknown>(path: string, data?: unknown) {
  return apiFetch<T>(path, { method: "DELETE", body: data !== undefined ? JSON.stringify(data) : undefined });
}
