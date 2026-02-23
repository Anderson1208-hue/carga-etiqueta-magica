import { useState, useEffect, useCallback } from "react";

const DB_NAME = "entregas_offline";
const DB_VERSION = 1;
const STORE_NFS = "nfs_cache";
const STORE_BAIXAS = "baixas_pendentes";

export interface OfflineNf {
  nf_id: string;
  veiculo_id: string;
  numero_nf: string;
  dest_razao_social: string;
  dest_logradouro: string;
  dest_numero: string;
  dest_bairro: string;
  dest_cidade: string;
  dest_uf: string;
  cnpj_destinatario: string;
}

export interface OfflineBaixa {
  id: string; // local generated id
  veiculo_id: string;
  nf_id: string;
  status: string;
  ocorrencia: string;
  recebedor_nome: string | null;
  observacao: string | null;
  latitude: number | null;
  longitude: number | null;
  registrado_por: string | null;
  registrado_em: string;
  synced: boolean;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NFS)) {
        const nfStore = db.createObjectStore(STORE_NFS, { keyPath: "nf_id" });
        nfStore.createIndex("veiculo_id", "veiculo_id", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_BAIXAS)) {
        const baixaStore = db.createObjectStore(STORE_BAIXAS, { keyPath: "id" });
        baixaStore.createIndex("synced", "synced", { unique: false });
        baixaStore.createIndex("veiculo_id", "veiculo_id", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function useOfflineEntregas() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [offlineNfs, setOfflineNfs] = useState<OfflineNf[]>([]);
  const [offlineBaixas, setOfflineBaixas] = useState<OfflineBaixa[]>([]);

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
      const tx = db.transaction(STORE_BAIXAS, "readonly");
      const store = tx.objectStore(STORE_BAIXAS);
      const index = store.index("synced");
      const request = index.count(IDBKeyRange.only(0)); // false stored as 0
      request.onsuccess = () => setPendingSyncCount(request.result);
      db.close();
    } catch {
      setPendingSyncCount(0);
    }
  }

  const downloadNfsForVeiculo = useCallback(async (veiculoId: string, nfs: OfflineNf[]) => {
    const db = await openDB();
    const tx = db.transaction(STORE_NFS, "readwrite");
    const store = tx.objectStore(STORE_NFS);
    
    // Clear old NFs for this vehicle
    const index = store.index("veiculo_id");
    const existing = index.openCursor(IDBKeyRange.only(veiculoId));
    existing.onsuccess = () => {
      const cursor = existing.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    await new Promise<void>((resolve) => {
      existing.onsuccess = () => {
        if (!existing.result) resolve();
        else {
          existing.result.delete();
          existing.result.continue();
        }
      };
    }).catch(() => {});

    // Add new NFs
    for (const nf of nfs) {
      store.put({ ...nf, veiculo_id: veiculoId });
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    db.close();
    return nfs.length;
  }, []);

  const loadOfflineNfs = useCallback(async (veiculoId: string) => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NFS, "readonly");
      const store = tx.objectStore(STORE_NFS);
      const index = store.index("veiculo_id");
      const request = index.getAll(IDBKeyRange.only(veiculoId));

      const result = await new Promise<OfflineNf[]>((resolve) => {
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => resolve([]);
      });

      db.close();
      setOfflineNfs(result);
      return result;
    } catch {
      return [];
    }
  }, []);

  const loadOfflineBaixas = useCallback(async (veiculoId: string) => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_BAIXAS, "readonly");
      const store = tx.objectStore(STORE_BAIXAS);
      const index = store.index("veiculo_id");
      const request = index.getAll(IDBKeyRange.only(veiculoId));

      const result = await new Promise<OfflineBaixa[]>((resolve) => {
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => resolve([]);
      });

      db.close();
      setOfflineBaixas(result);
      return result;
    } catch {
      return [];
    }
  }, []);

  const saveBaixaOffline = useCallback(async (baixa: Omit<OfflineBaixa, "id" | "synced">) => {
    const db = await openDB();
    const tx = db.transaction(STORE_BAIXAS, "readwrite");
    const store = tx.objectStore(STORE_BAIXAS);

    const record: OfflineBaixa = {
      ...baixa,
      id: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      synced: false,
    };

    store.put(record);

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    db.close();
    await loadPendingCount();
    return record;
  }, []);

  const getPendingBaixas = useCallback(async (): Promise<OfflineBaixa[]> => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_BAIXAS, "readonly");
      const store = tx.objectStore(STORE_BAIXAS);
      const request = store.getAll();

      const result = await new Promise<OfflineBaixa[]>((resolve) => {
        request.onsuccess = () => resolve((request.result || []).filter((b: OfflineBaixa) => !b.synced));
        request.onerror = () => resolve([]);
      });

      db.close();
      return result;
    } catch {
      return [];
    }
  }, []);

  const markAsSynced = useCallback(async (ids: string[]) => {
    const db = await openDB();
    const tx = db.transaction(STORE_BAIXAS, "readwrite");
    const store = tx.objectStore(STORE_BAIXAS);

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

  const hasOfflineData = useCallback(async (veiculoId: string): Promise<boolean> => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NFS, "readonly");
      const store = tx.objectStore(STORE_NFS);
      const index = store.index("veiculo_id");
      const request = index.count(IDBKeyRange.only(veiculoId));

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
    offlineNfs,
    offlineBaixas,
    downloadNfsForVeiculo,
    loadOfflineNfs,
    loadOfflineBaixas,
    saveBaixaOffline,
    getPendingBaixas,
    markAsSynced,
    hasOfflineData,
  };
}
