// idbStore.js (or inline this in a <script> before your usage)
const DB_NAME = 'app-storage';
const STORE_NAME = 'kv';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      return reject(new Error('IndexedDB not supported in this browser'));
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME); // key -> any value
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let _dbp;
function getDB() {
  if (!_dbp) _dbp = openDB();
  return _dbp;
}
function withStore(mode, fn) {
  return getDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const res = fn(store);
        tx.oncomplete = () => resolve(res?._result ?? res);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
      })
  );
}

const idbStore = {
  async setItem(key, value) {
    return withStore('readwrite', (store) => store.put(value, key));
  },
  async getItem(key) {
    return withStore('readonly', (store) => {
      const req = store.get(key);
      return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      });
    });
  },
  async removeItem(key) {
    return withStore('readwrite', (store) => store.delete(key));
  },
  async clear() {
    return withStore('readwrite', (store) => store.clear());
  },
  async keys() {
    return withStore('readonly', (store) => {
      if (store.getAllKeys) {
        const req = store.getAllKeys();
        return new Promise((resolve, reject) => {
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      }
      // fallback cursor
      return new Promise((resolve, reject) => {
        const out = [];
        const req = store.openKeyCursor();
        req.onsuccess = (e) => {
          const c = e.target.result;
          if (c) { out.push(c.key); c.continue(); } else { resolve(out); }
        };
        req.onerror = () => reject(req.error);
      });
    });
  },
  async length() {
    return withStore('readonly', (store) => {
      const req = store.count();
      return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    });
  },
};


