// GB decimal: 10 GB = 10 bilhões de bytes.
export const MAX_FILE_SIZE = 10_000_000_000;
export const USER_STORAGE_LIMIT = 10_000_000_000;
export const CHUNK_SIZE = 8 * 1024 * 1024;
export const PUBLIC_RETENTION = 15 * 24 * 60 * 60 * 1000;
export const UPLOAD_LIFETIME = 24 * 60 * 60 * 1000;

export function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}
