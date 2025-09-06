// WHY: tiny IndexedDB wrapper for local-first persistence (no backend).
const DB_NAME = 'stormai_v1';
const STORE = 'items';
let conn;

async function open() {
  if (conn) return conn;
  conn = await new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return conn;
}

export async function put(key, val) {
  const cx = (await open()).transaction(STORE, 'readwrite');
  cx.objectStore(STORE).put({ key, val });
  return new Promise((res, rej) => { cx.oncomplete = res; cx.onerror = () => rej(cx.error); });
}

export async function get(key) {
  const cx = (await open()).transaction(STORE, 'readonly');
  const r = cx.objectStore(STORE).get(key);
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result?.val); r.onerror = () => rej(r.error); });
}
