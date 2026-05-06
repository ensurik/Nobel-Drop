// HMAC-signert pickup-token. Deno Web Crypto.
const encoder = new TextEncoder();

async function importKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toBase64Url(buf: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(s: string) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export async function signPickupToken(orderId: string, secret: string) {
  const key = await importKey(secret);
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = `${orderId}.${issuedAt}`;
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return `${payload}.${toBase64Url(sig)}`;
}

export async function verifyPickupToken(token: string, secret: string) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("invalid_token_format");
  const [orderId, issuedAtStr, sigB64] = parts;
  const key = await importKey(secret);
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    fromBase64Url(sigB64),
    encoder.encode(`${orderId}.${issuedAtStr}`),
  );
  if (!ok) throw new Error("invalid_signature");
  return { orderId, issuedAt: Number(issuedAtStr) };
}
