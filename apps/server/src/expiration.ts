export function parseExpiration(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error("SERVICE_EXPIRES_AT debe ser una fecha válida.");
  return timestamp;
}

export function isExpired(expiration: number | undefined, now = Date.now()): boolean {
  return expiration !== undefined && now >= expiration;
}
