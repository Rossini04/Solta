export const MAX_FILE_SIZE = 10_000_000_000;
export const UPLOAD_INTERVAL = 2 * 60 * 60 * 1000;
export const CHUNK_SIZE = 8 * 1024 * 1024;
export type PublicFile = { id: string; name: string; size: number; mime: string; created_at: number; canDelete?: boolean; folder_id?: string | null };
export function formatSize(n: number) {
  if (n < 1000) return `${n} B`;
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1000)), 3);
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(n / 1000 ** i)} ${["B", "KB", "MB", "GB"][i]}`;
}
