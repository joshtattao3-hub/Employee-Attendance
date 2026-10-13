// Demo-grade hashing: SHA-256 of "salt:password", in hex.
// This keeps plain-text passwords out of storage, but it is NOT real
// security. Real systems hash on a server with a slow algorithm.
export async function hashPassword(password, salt) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure hashing is unavailable (needs https or localhost).");
  }
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// Random salt for new accounts (used by signup in Stage 3)
export function createSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}