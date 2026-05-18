export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const envelope = (await response.json()) as { ok: boolean; data?: T; error?: { message?: string } };
  if (!envelope.ok) {
    throw new Error(envelope.error?.message || "Ardex request failed");
  }
  return envelope.data as T;
}

export async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return await api<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function enc(value: string): string {
  return encodeURIComponent(value);
}
