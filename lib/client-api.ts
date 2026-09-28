export class RequestError extends Error { constructor(message: string, public status = 0, public folderId?: string) { super(message); } }
export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(45000) });
  const value = await response.json().catch(() => ({})) as { error?: string; folderId?: string };
  if (!response.ok) throw new RequestError(value.error || "Não foi possível concluir. Tente novamente.", response.status, value.folderId);
  return value as T;
}
export function post<T = unknown>(url: string, body: unknown) { return api<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
export type Session = { user: { id: string; name: string } | null; admin: boolean; nextUploadAt: number };
export async function copyText(value: string) { await navigator.clipboard.writeText(value); }
