/**
 * Generates an opaque client-side Idempotency-Key header value for critical mutations.
 */
export function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for older environments without crypto.randomUUID
  const randomPart = Math.random().toString(36).slice(2, 12);
  return `idemp_${Date.now()}_${randomPart}`;
}
