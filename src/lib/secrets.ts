/**
 * @module secrets
 * Lightweight AES-GCM encryption for sensitive values stored in chrome.storage.local.
 *
 * **Security model & limitations:**
 * This module provides *obfuscation* — it prevents secrets (API keys, passwords)
 * from being visible in plaintext when a user opens DevTools → Application →
 * Storage. It is NOT a strong protection against a determined attacker who has
 * extension-level access (e.g. another extension with `debugger` or
 * `chrome.storage` permissions, or a compromised browser process). The key
 * material is derived from `chrome.runtime.id` (public) and a salt also stored
 * in `chrome.storage.local`, so any code running in this extension's context
 * can derive the same key and decrypt. Treat this as a defense against casual
 * snooping, not a vault.
 */

const SALT_KEY = "glean_salt";
const SALT_LENGTH = 16; // 128-bit salt
const PBKDF2_ITERATIONS = 100_000;
const AES_KEY_LENGTH = 256; // bits
const IV_LENGTH = 12; // 96-bit IV, recommended for AES-GCM

/** Internal shape persisted to chrome.storage.local for each secret. */
interface EncryptedBlob {
  iv: string;  // hex-encoded IV
  data: string; // hex-encoded ciphertext
}

// ── Hex helpers ──────────────────────────────────────────────

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBuf(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex string");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// ── Salt management ──────────────────────────────────────────

async function ensureSalt(): Promise<Uint8Array> {
  const result = await chrome.storage.local.get(SALT_KEY);
  const existing = result[SALT_KEY] as string | undefined;
  if (existing) {
    return hexToBuf(existing);
  }
  // First run — generate and persist
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  await chrome.storage.local.set({ [SALT_KEY]: bufToHex(salt.buffer as ArrayBuffer) });
  return salt;
}

// ── Key derivation ───────────────────────────────────────────

let cachedKey: CryptoKey | null = null;

async function deriveKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  const salt = await ensureSalt();

  // PBKDF2 passphrase = extension id (stable per install, unique per extension)
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(chrome.runtime.id),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  cachedKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: AES_KEY_LENGTH },
    false,
    ["encrypt", "decrypt"],
  );

  return cachedKey;
}

// ── Public API ───────────────────────────────────────────────

/**
 * Encrypt `value` and store it under `key` in chrome.storage.local.
 * The stored value is `{ iv: hex, data: hex }`.
 */
export async function setSecret(key: string, value: unknown): Promise<void> {
  const aesKey = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    plaintext,
  );

  const blob: EncryptedBlob = {
    iv: bufToHex(iv.buffer as ArrayBuffer),
    data: bufToHex(ciphertext),
  };

  await chrome.storage.local.set({ [key]: blob });
}

/**
 * Read and decrypt the value stored under `key`.
 * Returns `null` if the key does not exist or decryption fails.
 */
export async function getSecret<T>(key: string): Promise<T | null> {
  try {
    const result = await chrome.storage.local.get(key);
    const blob = result[key] as EncryptedBlob | undefined;
    if (!blob?.iv || !blob?.data) return null;

    const aesKey = await deriveKey();
    const iv = hexToBuf(blob.iv);
    const ciphertext = hexToBuf(blob.data);

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      aesKey,
      ciphertext.buffer as ArrayBuffer,
    );

    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch {
    // Decryption failure (corrupted data, changed salt, etc.) — treat as absent.
    return null;
  }
}

/**
 * Remove the encrypted value stored under `key`.
 */
export async function removeSecret(key: string): Promise<void> {
  await chrome.storage.local.remove(key);
}
