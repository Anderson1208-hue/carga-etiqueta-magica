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
  activeDriver: string | null;
  driverActivatedAt: number | null;
  nativeRouteId: string | null;
  nativeSource: string | null;
  nativeHttpUrlConfigured: boolean | null;
  nativeHttpAutoSync: boolean | null;
  nativeHttpLastStatus: number | null;
  nativeHttpLastSuccess: boolean | null;
  nativeHttpLastAt: number | null;
  nativeHttpLastResponse: string | null;
  nativeStateEnabled: boolean | null;
  nativeStateIsMoving: boolean | null;
  nativeTrackingMode: string | number | null;
  nativeStateLastAt: number | null;
  nativeStartCalledAt: number | null;
  nativeStartSucceededAt: number | null;
  nativeForegroundServiceActive: boolean | null;
  nativeNotificationConfigured: boolean | null;
  nativeLastLocationAt: number | null;
  nativeLastLocationPos: { lat: number; lng: number; accuracy: number; event?: string | null } | null;
  nativePendingLocations: number | null;
  nativeProviderStatus: number | null;
  nativeProviderStatusText: string | null;
  nativeProviderEnabled: boolean | null;
  nativeProviderGps: boolean | null;
  nativeProviderNetwork: boolean | null;
  nativeProviderAccuracyAuthorization: number | null;
  nativeProviderLastAt: number | null;
  nativeReadyAt: number | null;
  nativeReadyEnabled: boolean | null;
  nativeReadyError: string | null;
  nativeRequestPermissionAt: number | null;
  nativeRequestPermissionStatus: number | null;
  nativeRequestPermissionText: string | null;
  nativeRequestPermissionError: string | null;
  nativeBackgroundPermissionRationale: string | null;
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
  activeDriver: null,
  driverActivatedAt: null,
  nativeRouteId: null,
  nativeSource: null,
  nativeHttpUrlConfigured: null,
  nativeHttpAutoSync: null,
  nativeHttpLastStatus: null,
  nativeHttpLastSuccess: null,
  nativeHttpLastAt: null,
  nativeHttpLastResponse: null,
  nativeStateEnabled: null,
  nativeStateIsMoving: null,
  nativeTrackingMode: null,
  nativeStateLastAt: null,
  nativeStartCalledAt: null,
  nativeStartSucceededAt: null,
  nativeForegroundServiceActive: null,
  nativeNotificationConfigured: null,
  nativeLastLocationAt: null,
  nativeLastLocationPos: null,
  nativePendingLocations: null,
  nativeProviderStatus: null,
  nativeProviderStatusText: null,
  nativeProviderEnabled: null,
  nativeProviderGps: null,
  nativeProviderNetwork: null,
  nativeProviderAccuracyAuthorization: null,
  nativeProviderLastAt: null,
  nativeReadyAt: null,
  nativeReadyEnabled: null,
  nativeReadyError: null,
  nativeRequestPermissionAt: null,
  nativeRequestPermissionStatus: null,
  nativeRequestPermissionText: null,
  nativeRequestPermissionError: null,
  nativeBackgroundPermissionRationale: null,
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

export function markNativeDriver(patch: {
  routeId?: string | null;
  source?: string | null;
  httpUrlConfigured?: boolean | null;
  httpAutoSync?: boolean | null;
  notificationConfigured?: boolean | null;
}) {
  write({
    activeDriver: "transistorsoft",
    driverActivatedAt: Date.now(),
    nativeRouteId: patch.routeId ?? null,
    nativeSource: patch.source ?? null,
    nativeHttpUrlConfigured: patch.httpUrlConfigured ?? null,
    nativeHttpAutoSync: patch.httpAutoSync ?? null,
    nativeNotificationConfigured: patch.notificationConfigured ?? null,
  });
}

export function markNativeStartCalled() {
  write({ nativeStartCalledAt: Date.now() });
}

export function markNativeState(state: {
  enabled?: boolean;
  isMoving?: boolean;
  trackingMode?: string | number;
  notificationConfigured?: boolean | null;
  pendingLocations?: number | null;
}) {
  write({
    nativeStateEnabled: state.enabled ?? null,
    nativeStateIsMoving: state.isMoving ?? null,
    nativeTrackingMode: state.trackingMode ?? null,
    nativeStateLastAt: Date.now(),
    nativeStartSucceededAt: state.enabled ? Date.now() : readTelemetry().nativeStartSucceededAt,
    nativeForegroundServiceActive: state.enabled ?? null,
    nativeNotificationConfigured: state.notificationConfigured ?? readTelemetry().nativeNotificationConfigured,
    nativePendingLocations: state.pendingLocations ?? readTelemetry().nativePendingLocations,
  });
}

export function markNativeLocation(pos: { lat: number; lng: number; accuracy: number; event?: string | null }) {
  write({ nativeLastLocationAt: Date.now(), nativeLastLocationPos: pos });
}

export function markNativeHttp(event: { status?: number; success?: boolean; responseText?: string | null }) {
  write({
    nativeHttpLastAt: Date.now(),
    nativeHttpLastStatus: event.status ?? null,
    nativeHttpLastSuccess: event.success ?? null,
    nativeHttpLastResponse: (event.responseText ?? "").slice(0, 200) || null,
  });
}

export function resetTelemetry() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
