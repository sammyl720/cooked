import type { CookedLabel } from "./domain";

export type ProofClaims = {
  index: number;
  label: CookedLabel;
  mode: "dating";
  resultVersion: "cooked_v1";
  exp: number;
};

const encoder = new TextEncoder();
const b64url = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromB64url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

async function key() {
  const secret = process.env.CHALLENGE_SIGNING_SECRET?.trim() || "local-development-only-cooked-proof";
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createProof(claims: Omit<ProofClaims, "exp">) {
  const payload = b64url(encoder.encode(JSON.stringify({ ...claims, exp: Date.now() + 15 * 60_000 })));
  const signature = await crypto.subtle.sign("HMAC", await key(), encoder.encode(payload));
  return `${payload}.${b64url(new Uint8Array(signature))}`;
}

export async function verifyProof(token: string): Promise<ProofClaims | null> {
  const [payload, signature, ...rest] = token.split(".");
  if (!payload || !signature || rest.length) return null;
  const valid = await crypto.subtle.verify("HMAC", await key(), fromB64url(signature), encoder.encode(payload));
  if (!valid) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as ProofClaims;
    if (!claims || claims.exp < Date.now() || claims.mode !== "dating" || claims.resultVersion !== "cooked_v1") return null;
    return claims;
  } catch {
    return null;
  }
}

export async function sha256(value: string) {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

export function randomToken(bytes = 24) {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}
