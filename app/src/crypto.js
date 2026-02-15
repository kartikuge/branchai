// crypto.js — AES-256-GCM encryption for API keys at rest

const SALT_KEY = 'branchai_install_salt';
const HKDF_INFO = new TextEncoder().encode('branchai-api-key-encryption-v1');

let _cachedKey = null;

function isExtensionContext() {
  try {
    return typeof chrome !== 'undefined' && !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

async function getInstallSalt() {
  const result = await chrome.storage.local.get(SALT_KEY);
  if (result[SALT_KEY]) return new Uint8Array(result[SALT_KEY]);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await chrome.storage.local.set({ [SALT_KEY]: Array.from(salt) });
  return salt;
}

async function deriveKey() {
  if (_cachedKey) return _cachedKey;

  const salt = await getInstallSalt();
  const ikm = new TextEncoder().encode(chrome.runtime.id);
  const baseKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveKey']);
  _cachedKey = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: HKDF_INFO },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  return _cachedKey;
}

function toBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function fromBase64(str) {
  const bin = atob(str);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

export async function encrypt(plaintext) {
  if (!isExtensionContext()) return plaintext;
  if (!plaintext) return plaintext;

  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return { _enc: true, iv: toBase64(iv), ct: toBase64(ct) };
}

export async function decrypt(value) {
  if (!isEncrypted(value)) return value;
  if (!isExtensionContext()) {
    console.warn('[BranchAI] Cannot decrypt outside extension context');
    return '';
  }

  const key = await deriveKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(value.iv) },
    key,
    fromBase64(value.ct)
  );
  return new TextDecoder().decode(decrypted);
}

export function isEncrypted(value) {
  return value != null && typeof value === 'object' && value._enc === true;
}
