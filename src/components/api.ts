export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body.error || `Request failed (${res.status})`) as Error & {
      status?: number;
      body?: Record<string, unknown>;
    };
    error.status = res.status;
    error.body = body;
    throw error;
  }
  return body as T;
}
