/**
 * Fila persistente de posições GPS para o APK do motorista.
 *
 * Por que existe:
 * - Em campo (4G ruim, túnel, área sem sinal) o `fetch` para o backend pode
 *   falhar. Sem fila, esse ponto é perdido para sempre — buracos na rota.
 * - Garantimos: TODO ponto vai primeiro à fila (IndexedDB) e só sai dela
 *   após confirmação 2xx do backend.
 * - Worker tenta drenar a fila com backoff exponencial.
 * - Dedup via `client_ts` (timestamp do celular) — server faz UPSERT, então
 *   reenviar o mesmo ponto é seguro.
 *
 * NÃO depende de Capacitor — funciona em web também (usado só pelo nativo).
 */

const DB_NAME = "ebenezer-gps-queue";
const DB_VERSION = 1;
const STORE = "gps_pending";

export interface QueuedPosition {
  id?: number; // autoincrement
  monitoramento_rota_id: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string; // ISO — também usado como client_ts pelo backend
  heartbeat: boolean;
  attempts: number;
  next_try_at: number; // epoch ms
  created_at: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("rota", "monitoramento_rota_id", { unique: false });
        store.createIndex("next_try_at", "next_try_at", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function enqueue(
  pos: Omit<QueuedPosition, "id" | "attempts" | "next_try_at" | "created_at">
): Promise<void> {
  const db = await openDB();
  const now = Date.now();
  const item: QueuedPosition = {
    ...pos,
    attempts: 0,
    next_try_at: now,
    created_at: now,
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function pendingCount(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function pickReadyBatch(maxItems = 20): Promise<QueuedPosition[]> {
  const db = await openDB();
  const now = Date.now();
  return new Promise((resolve, reject) => {
    const out: QueuedPosition[] = [];
    const tx = db.transaction(STORE, "readonly");
    const idx = tx.objectStore(STORE).index("next_try_at");
    const req = idx.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor && out.length < maxItems) {
        const v = cursor.value as QueuedPosition;
        if (v.next_try_at <= now) {
          out.push(v);
        }
        cursor.continue();
      } else {
        resolve(out);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function removeMany(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const id of ids) store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Backoff exponencial com teto: 1s, 5s, 30s, 2min, 10min, 30min */
const BACKOFF_MS = [1_000, 5_000, 30_000, 120_000, 600_000, 1_800_000];

export async function rescheduleMany(items: QueuedPosition[]): Promise<void> {
  if (items.length === 0) return;
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const it of items) {
      const next = { ...it };
      next.attempts += 1;
      const i = Math.min(next.attempts - 1, BACKOFF_MS.length - 1);
      next.next_try_at = Date.now() + BACKOFF_MS[Math.max(i, 0)];
      store.put(next);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Drena a fila enviando lotes para o endpoint informado.
 * Retorna { sent, remaining }.
 */
export async function drainQueue(opts: {
  endpoint: string;
  apikey: string;
}): Promise<{ sent: number; remaining: number }> {
  const ready = await pickReadyBatch(20);
  if (ready.length === 0) {
    return { sent: 0, remaining: await pendingCount() };
  }

  // Agrupa por rota — uma chamada por rota
  const byRoute = new Map<string, QueuedPosition[]>();
  for (const item of ready) {
    const list = byRoute.get(item.monitoramento_rota_id) ?? [];
    list.push(item);
    byRoute.set(item.monitoramento_rota_id, list);
  }

  let sent = 0;
  for (const [rotaId, items] of byRoute) {
    const last = items[items.length - 1];
    const body = {
      monitoramento_rota_id: rotaId,
      latitude: last.latitude,
      longitude: last.longitude,
      accuracy: last.accuracy,
      heartbeat: items.every((i) => i.heartbeat),
      batch: items.map((i) => ({
        latitude: i.latitude,
        longitude: i.longitude,
        accuracy: i.accuracy,
        timestamp: i.timestamp,
        heartbeat: i.heartbeat,
      })),
    };
    try {
      const res = await fetch(opts.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.apikey}`,
          apikey: opts.apikey,
        },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        await removeMany(items.map((i) => i.id!).filter((x): x is number => x != null));
        sent += items.length;
      } else {
        console.warn("[gpsQueue] backend status", res.status);
        await rescheduleMany(items);
      }
    } catch (err) {
      console.warn("[gpsQueue] fetch falhou, reagendando", err);
      await rescheduleMany(items);
    }
  }

  return { sent, remaining: await pendingCount() };
}
