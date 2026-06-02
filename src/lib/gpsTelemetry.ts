/**
 * Telemetria leve do tracker GPS — persiste em localStorage para a tela
 * de diagnóstico ler mesmo após reabrir o app.
 *
 * Tudo é best-effort: nunca lança, nunca bloqueia o tracker.
 */

const KEY = "gps-telemetry-v1";

export interface GpsTelemetry {
  lastEnqueueAt: number | null;          // último ponto adicionado à fila
  lastEnqueuePos: { lat: number; lng: number; accuracy: number } | null;
  lastSentAt: number | null;             // último envio bem-sucedido ao backend
  lastSentCount: number;                 // quantos pontos no último envio
  lastErrorAt: number | null;
  lastError: string | null;
  watcherStartedAt: number | null;
  watcherRestarts: number;
}

const EMPTY: GpsTelemetry = {
  lastEnqueueAt: null,
  lastEnqueuePos: null,
  lastSentAt: null,
  lastSentCount: 0,
  lastErrorAt: null,
  lastError: null,
  watcherStartedAt: null,
  watcherRestarts: 0,
};

export function readTelemetry(): GpsTelemetry {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<GpsTelemetry>) };
  } catch {
    return { ...EMPTY };
  }
}

function write(patch: Partial<GpsTelemetry>) {
  try {
    const cur = readTelemetry();
    localStorage.setItem(KEY, JSON.stringify({ ...cur, ...patch }));
  } catch {
    /* ignore */
  }
}

export function markEnqueue(pos: { lat: number; lng: number; accuracy: number }) {
  write({ lastEnqueueAt: Date.now(), lastEnqueuePos: pos });
}

export function markSent(count: number) {
  write({ lastSentAt: Date.now(), lastSentCount: count });
}

export function markError(message: string) {
  write({ lastErrorAt: Date.now(), lastError: message.slice(0, 200) });
}

export function markWatcherStart() {
  const cur = readTelemetry();
  write({
    watcherStartedAt: Date.now(),
    watcherRestarts: cur.watcherStartedAt ? cur.watcherRestarts + 1 : 0,
  });
}

export function resetTelemetry() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
