export function createIdempotencyKey(): string {
  // Browser-only; Vite app runs in client context.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  // Fallback (non-cryptographic). Should rarely be used in modern browsers.
  return `idem_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

