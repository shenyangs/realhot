const encoder = new TextEncoder();
const decoder = new TextDecoder();
const APP_SESSION_VERSION = 1;
const DEFAULT_SESSION_SECRET = "brand-os-local-session-dev-secret";

export const APP_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
export const APP_SESSION_COOKIE_NAME = "brand_os_session";

interface AppSessionPayload {
  version: number;
  userId: string;
  issuedAt: number;
  expiresAt: number;
}

function getSessionSecret() {
  return (
    process.env.LOCAL_SESSION_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    DEFAULT_SESSION_SECRET
  );
}

function toBase64Url(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");

  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(padded, "base64"));
  }

  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function importSigningKey() {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(getSessionSecret()),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );
}

async function signValue(value: string): Promise<string> {
  const key = await importSigningKey();
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return toBase64Url(new Uint8Array(signature));
}

function signaturesMatch(left: string, right: string) {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);

  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  let mismatch = 0;

  for (let index = 0; index < leftBytes.length; index += 1) {
    mismatch |= leftBytes[index] ^ rightBytes[index];
  }

  return mismatch === 0;
}

export async function createAppSessionToken(userId: string, ttlSeconds = APP_SESSION_TTL_SECONDS) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: AppSessionPayload = {
    version: APP_SESSION_VERSION,
    userId,
    issuedAt,
    expiresAt: issuedAt + ttlSeconds
  };
  const encodedPayload = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await signValue(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export async function readAppSessionToken(token?: string | null): Promise<AppSessionPayload | null> {
  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = await signValue(encodedPayload);

  if (!signaturesMatch(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(decoder.decode(fromBase64Url(encodedPayload))) as Partial<AppSessionPayload>;

    if (
      payload.version !== APP_SESSION_VERSION ||
      typeof payload.userId !== "string" ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return {
      version: payload.version,
      userId: payload.userId,
      issuedAt: typeof payload.issuedAt === "number" ? payload.issuedAt : 0,
      expiresAt: payload.expiresAt
    };
  } catch {
    return null;
  }
}

export function getSessionCookieOptions(maxAge = APP_SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge
  };
}
