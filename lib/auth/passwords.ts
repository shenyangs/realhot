import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const HASH_PREFIX = "scrypt";
const KEY_LENGTH = 64;

function toHex(value: Uint8Array) {
  return Buffer.from(value).toString("hex");
}

export function isHashedPassword(value: string): boolean {
  return value.startsWith(`${HASH_PREFIX}$`);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derivedKey = scryptSync(password, salt, KEY_LENGTH);
  return `${HASH_PREFIX}$${toHex(salt)}$${toHex(derivedKey)}`;
}

export function verifyStoredPassword(password: string, storedPassword: string): boolean {
  if (!isHashedPassword(storedPassword)) {
    return storedPassword === password;
  }

  const [, saltHex, hashHex] = storedPassword.split("$");

  if (!saltHex || !hashHex) {
    return false;
  }

  const salt = Buffer.from(saltHex, "hex");
  const expectedHash = Buffer.from(hashHex, "hex");
  const derivedKey = scryptSync(password, salt, expectedHash.length);

  if (derivedKey.length !== expectedHash.length) {
    return false;
  }

  return timingSafeEqual(derivedKey, expectedHash);
}

export function normalizeStoredPassword(storedPassword: string): string {
  return isHashedPassword(storedPassword) ? storedPassword : hashPassword(storedPassword);
}

export function ensurePasswordHashMatches(password: string, storedPassword?: string): string {
  if (storedPassword && verifyStoredPassword(password, storedPassword)) {
    return normalizeStoredPassword(storedPassword);
  }

  return hashPassword(password);
}
