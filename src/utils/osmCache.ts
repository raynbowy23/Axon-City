import type { FeatureCollection } from 'geojson';

// Persistent IndexedDB cache for Overpass responses so reloads and
// shared-link visits don't re-fetch data the browser already has.

const DB_NAME = 'axoncity-osm-cache';
const STORE_NAME = 'responses';
const DB_VERSION = 1;

// OSM data changes slowly; a week-old response is still useful
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CacheEntry {
  key: string;
  timestamp: number;
  data: FeatureCollection;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      // Gracefully degrade to network-only when IndexedDB is unavailable
      // (private browsing modes, non-browser environments)
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          }
        };
        request.onsuccess = () => {
          pruneExpired(request.result);
          resolve(request.result);
        };
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

/**
 * Delete expired entries (best-effort, fire-and-forget on first open)
 */
function pruneExpired(db: IDBDatabase): void {
  try {
    const cutoff = Date.now() - CACHE_TTL_MS;
    const store = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME);
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if ((cursor.value as CacheEntry).timestamp < cutoff) {
        cursor.delete();
      }
      cursor.continue();
    };
  } catch {
    // Pruning is best-effort
  }
}

export async function getCachedResponse(key: string): Promise<FeatureCollection | null> {
  const db = await openDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
      request.onsuccess = () => {
        const entry = request.result as CacheEntry | undefined;
        if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
          resolve(entry.data);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function setCachedResponse(key: string, data: FeatureCollection): Promise<void> {
  const db = await openDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const entry: CacheEntry = { key, timestamp: Date.now(), data };
      const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function clearPersistentCache(): Promise<void> {
  const db = await openDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).clear();
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
