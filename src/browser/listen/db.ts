export interface DownloadEpisode extends Record<string, unknown> {
  guid: string;
  url: string;
}
interface DownloadRow {
  guid: string;
  blob: Blob;
  ep: DownloadEpisode;
  savedAt: number;
}
export interface ListenProgress {
  guid: string;
  position: number;
  duration: number;
  ts: number;
}
/**
 * AGAPAY Listen — ListenDB
 * IndexedDB wrapper for episode downloads and playback progress.
 * Downloads are stored as Blobs so they play offline.
 */

const DB_NAME = 'agapay-listen';
const DB_VERSION = 1;

export class ListenDB {
  declare _db: IDBDatabase | null;
  declare _ready: Promise<IDBDatabase>;
  constructor() {
    this._db = null;
    this._ready = this._open();
  }

  _open() {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('downloads')) {
          db.createObjectStore('downloads', { keyPath: 'guid' });
        }
        if (!db.objectStoreNames.contains('progress')) {
          db.createObjectStore('progress', { keyPath: 'guid' });
        }
      };
      req.onsuccess = (e) => {
        this._db = (e.target as IDBOpenDBRequest).result;
        resolve(this._db);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async _tx(store: string, mode: IDBTransactionMode) {
    const db = await this._ready;
    return db.transaction(store, mode).objectStore(store);
  }

  // ── Downloads ────────────────────────────────────────────────────────────

  /** Download an episode audio file and cache as a Blob. */
  async downloadEpisode(ep: DownloadEpisode, onProgress?: (progress: number) => void) {
    const resp = await fetch(ep.url);
    if (!resp.ok) throw new Error('Fetch failed');

    const total = Number(resp.headers.get('content-length')) || 0;
    const reader = resp.body!.getReader();
    const chunks = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (onProgress && total) onProgress(received / total);
    }

    const blob = new Blob(chunks, { type: 'audio/mpeg' });
    const store = await this._tx('downloads', 'readwrite');
    await idbPut(store, { guid: ep.guid, blob, ep, savedAt: Date.now() });
    return blob;
  }

  async getDownload(guid: string) {
    const store = await this._tx('downloads', 'readonly');
    const row = await idbGet<DownloadRow>(store, guid);
    if (!row) return null;
    return URL.createObjectURL(row.blob);
  }

  async deleteDownload(guid: string) {
    const store = await this._tx('downloads', 'readwrite');
    await idbDelete(store, guid);
  }

  async getAllDownloads() {
    const store = await this._tx('downloads', 'readonly');
    const rows = await idbGetAll<DownloadRow>(store);
    return rows.map((r) => ({ ...r.ep, _blobKey: r.guid, savedAt: r.savedAt }));
  }

  // ── Progress ─────────────────────────────────────────────────────────────

  async saveProgress(guid: string, position: number, duration: number) {
    const store = await this._tx('progress', 'readwrite');
    await idbPut(store, { guid, position, duration, ts: Date.now() });
  }

  async getProgress(guid: string) {
    const store = await this._tx('progress', 'readonly');
    return idbGet(store, guid);
  }
}

// ── IDB promise helpers ───────────────────────────────────────────────────────
function idbPut(store: IDBObjectStore, value: DownloadRow | ListenProgress) {
  return new Promise<IDBValidKey>((res, rej) => {
    const req = store.put(value);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
function idbGet<Row>(store: IDBObjectStore, key: IDBValidKey) {
  return new Promise<Row | null>((res, rej) => {
    const req = store.get(key);
    req.onsuccess = () => res((req.result as Row) || null);
    req.onerror = () => rej(req.error);
  });
}
function idbDelete(store: IDBObjectStore, key: IDBValidKey) {
  return new Promise<void>((res, rej) => {
    const req = store.delete(key);
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
  });
}
function idbGetAll<Row>(store: IDBObjectStore) {
  return new Promise<Row[]>((res, rej) => {
    const req = store.getAll();
    req.onsuccess = () => res((req.result as Row[]) || []);
    req.onerror = () => rej(req.error);
  });
}
