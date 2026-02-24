import { useState, useEffect, useCallback } from "react";

const DB_NAME = "conferencia_offline";
const DB_VERSION = 2;
const STORE_ETIQUETAS = "etiquetas_cache";
const STORE_SCANS = "scans_pendentes";

export interface OfflineEtiqueta {
  id: string;
  carga_id: string;
  nf_id: string;
  numero_nf: string;
  c_prod: string;
  x_prod: string;
  seq: number;
  total: number;
  qr_payload: string;
  status: string;
  divergencia_motivo: string | null;
}

export interface OfflineScan {
  id: string; // local generated
  etiqueta_id: string;
  carga_id: string;
  numero_nf: string;
  conferido_interno_por: string;
  conferido_interno_em: string;
  synced: boolean;
}

export interface OfflineCargaResumo {
  id: string;
  placa: string;
  motorista: string;
  data: string;
}

const STORE_CARGAS = "cargas_cache";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_ETIQUETAS)) {
        const store = db.createObjectStore(STORE_ETIQUETAS, { keyPath: "id" });
        store.createIndex("carga_id", "carga_id", { unique: false });
        store.createIndex("numero_nf", "numero_nf", { unique: false });
        store.createIndex("qr_payload", "qr_payload", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_SCANS)) {
        const store = db.createObjectStore(STORE_SCANS, { keyPath: "id" });
        store.createIndex("synced", "synced", { unique: false });
        store.createIndex("etiqueta_id", "etiqueta_id", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_CARGAS)) {
        db.createObjectStore(STORE_CARGAS, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function useOfflineConferencia() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    loadPendingCount();
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  async function loadPendingCount() {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_SCANS, "readonly");
      const store = tx.objectStore(STORE_SCANS);
      const index = store.index("synced");
      const request = index.count(IDBKeyRange.only(0));
      request.onsuccess = () => setPendingSyncCount(request.result);
      db.close();
    } catch {
      setPendingSyncCount(0);
    }
  }

  const downloadEtiquetas = useCallback(
    async (cargas: OfflineCargaResumo[], etiquetas: OfflineEtiqueta[], appendOnly?: boolean): Promise<number> => {
      const db = await openDB();

      if (!appendOnly) {
        // Save cargas
        const txCargas = db.transaction(STORE_CARGAS, "readwrite");
        const cargaStore = txCargas.objectStore(STORE_CARGAS);
        cargaStore.clear();
        for (const c of cargas) {
          cargaStore.put(c);
        }
        await new Promise<void>((resolve, reject) => {
          txCargas.oncomplete = () => resolve();
          txCargas.onerror = () => reject(txCargas.error);
        });

        // Clear etiquetas only on first call
        if (etiquetas.length === 0) {
          const txClear = db.transaction(STORE_ETIQUETAS, "readwrite");
          txClear.objectStore(STORE_ETIQUETAS).clear();
          await new Promise<void>((resolve, reject) => {
            txClear.oncomplete = () => resolve();
            txClear.onerror = () => reject(txClear.error);
          });
        }
      }

      // Save etiquetas in batches of 200 to avoid freezing
      const BATCH = 200;
      for (let i = 0; i < etiquetas.length; i += BATCH) {
        const batch = etiquetas.slice(i, i + BATCH);
        const txEt = db.transaction(STORE_ETIQUETAS, "readwrite");
        const etStore = txEt.objectStore(STORE_ETIQUETAS);
        for (const et of batch) {
          etStore.put(et);
        }
        await new Promise<void>((resolve, reject) => {
          txEt.oncomplete = () => resolve();
          txEt.onerror = () => reject(txEt.error);
        });
        // Yield to UI thread between batches
        await new Promise((r) => setTimeout(r, 10));
      }

      db.close();
      return etiquetas.length;
    },
    []
  );

  const getOfflineCargas = useCallback(async (): Promise<OfflineCargaResumo[]> => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_CARGAS, "readonly");
      const store = tx.objectStore(STORE_CARGAS);
      const request = store.getAll();
      const result = await new Promise<OfflineCargaResumo[]>((resolve) => {
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => resolve([]);
      });
      db.close();
      return result;
    } catch {
      return [];
    }
  }, []);

  const getOfflineEtiquetas = useCallback(async (cargaId?: string): Promise<OfflineEtiqueta[]> => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_ETIQUETAS, "readonly");
      const store = tx.objectStore(STORE_ETIQUETAS);

      let request: IDBRequest;
      if (cargaId) {
        const index = store.index("carga_id");
        request = index.getAll(IDBKeyRange.only(cargaId));
      } else {
        request = store.getAll();
      }

      const result = await new Promise<OfflineEtiqueta[]>((resolve) => {
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => resolve([]);
      });
      db.close();
      return result;
    } catch {
      return [];
    }
  }, []);

  const findEtiquetaByQr = useCallback(async (qrPayload: string): Promise<OfflineEtiqueta | null> => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_ETIQUETAS, "readonly");
      const store = tx.objectStore(STORE_ETIQUETAS);
      const index = store.index("qr_payload");
      const request = index.get(IDBKeyRange.only(qrPayload));
      const result = await new Promise<OfflineEtiqueta | null>((resolve) => {
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      });
      db.close();
      return result;
    } catch {
      return null;
    }
  }, []);

  const saveScanOffline = useCallback(
    async (scan: Omit<OfflineScan, "id" | "synced">) => {
      const db = await openDB();

      // Update local etiqueta status
      const txEt = db.transaction(STORE_ETIQUETAS, "readwrite");
      const etStore = txEt.objectStore(STORE_ETIQUETAS);
      const getReq = etStore.get(scan.etiqueta_id);
      await new Promise<void>((resolve) => {
        getReq.onsuccess = () => {
          if (getReq.result) {
            etStore.put({ ...getReq.result, status: "conferido_interno" });
          }
          resolve();
        };
        getReq.onerror = () => resolve();
      });
      await new Promise<void>((r) => {
        txEt.oncomplete = () => r();
        txEt.onerror = () => r();
      });

      // Save scan record
      const txScan = db.transaction(STORE_SCANS, "readwrite");
      const scanStore = txScan.objectStore(STORE_SCANS);
      const record: OfflineScan = {
        ...scan,
        id: `offline_scan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        synced: false,
      };
      scanStore.put(record);
      await new Promise<void>((resolve, reject) => {
        txScan.oncomplete = () => resolve();
        txScan.onerror = () => reject(txScan.error);
      });

      db.close();
      await loadPendingCount();
      return record;
    },
    []
  );

  const getPendingScans = useCallback(async (): Promise<OfflineScan[]> => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_SCANS, "readonly");
      const store = tx.objectStore(STORE_SCANS);
      const request = store.getAll();
      const result = await new Promise<OfflineScan[]>((resolve) => {
        request.onsuccess = () => resolve((request.result || []).filter((s: OfflineScan) => !s.synced));
        request.onerror = () => resolve([]);
      });
      db.close();
      return result;
    } catch {
      return [];
    }
  }, []);

  const markScansAsSynced = useCallback(async (ids: string[]) => {
    const db = await openDB();
    const tx = db.transaction(STORE_SCANS, "readwrite");
    const store = tx.objectStore(STORE_SCANS);
    for (const id of ids) {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        if (getReq.result) {
          store.put({ ...getReq.result, synced: true });
        }
      };
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    await loadPendingCount();
  }, []);

  const hasOfflineData = useCallback(async (): Promise<boolean> => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_ETIQUETAS, "readonly");
      const store = tx.objectStore(STORE_ETIQUETAS);
      const request = store.count();
      const count = await new Promise<number>((resolve) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(0);
      });
      db.close();
      return count > 0;
    } catch {
      return false;
    }
  }, []);

  return {
    isOnline,
    pendingSyncCount,
    downloadEtiquetas,
    getOfflineCargas,
    getOfflineEtiquetas,
    findEtiquetaByQr,
    saveScanOffline,
    getPendingScans,
    markScansAsSynced,
    hasOfflineData,
  };
}
