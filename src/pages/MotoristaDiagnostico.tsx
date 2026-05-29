import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { BuildModeBadge } from "@/components/mobile/BuildModeBadge";
import { pendingCount } from "@/lib/gpsQueue";
import { readTelemetry, type GpsTelemetry } from "@/lib/gpsTelemetry";
import { VALIDATION_KEY } from "@/components/mobile/ValidacaoGpsBackground";
import {
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Wifi,
  WifiOff,
  MapPin,
  Smartphone,
  Activity,
  Copy,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type PermState = "granted" | "denied" | "prompt" | "unknown";

function fmtTime(ts: number | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString("pt-BR");
}

function fmtAgo(ts: number | null): string {
  if (!ts) return "nunca";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s atrás`;
  if (s < 3600) return `${Math.floor(s / 60)}min atrás`;
  if (s < 86400) return `${Math.floor(s / 3600)}h atrás`;
  return `${Math.floor(s / 86400)}d atrás`;
}

function StatusRow({
  label,
  value,
  ok,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  ok: boolean | null;
  hint?: string;
}) {
  const Icon =
    ok === true ? CheckCircle2 : ok === false ? XCircle : AlertTriangle;
  const color =
    ok === true ? "text-green-600" : ok === false ? "text-destructive" : "text-amber-600";
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-mono text-right break-all">{value}</span>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
    </div>
  );
}

export default function MotoristaDiagnostico() {
  const { toast } = useToast();
  const [online, setOnline] = useState<boolean>(navigator.onLine);
  const [perm, setPerm] = useState<PermState>("unknown");
  const [pos, setPos] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [posError, setPosError] = useState<string | null>(null);
  const [posLoading, setPosLoading] = useState(false);
  const [queue, setQueue] = useState<number>(0);
  const [tele, setTele] = useState<GpsTelemetry>(readTelemetry());
  const [wakeSupported] = useState<boolean>(typeof navigator !== "undefined" && "wakeLock" in navigator);
  const [tick, setTick] = useState(0);

  const isNative = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();

  const refreshAll = useCallback(async () => {
    setOnline(navigator.onLine);
    setTele(readTelemetry());
    try {
      setQueue(await pendingCount());
    } catch {
      setQueue(-1);
    }
    if ("permissions" in navigator) {
      try {
        const p = await (navigator.permissions as Permissions).query({
          name: "geolocation" as PermissionName,
        });
        setPerm(p.state as PermState);
      } catch {
        setPerm("unknown");
      }
    }
  }, []);

  const captureGps = useCallback(() => {
    if (!navigator.geolocation) {
      setPosError("Geolocation API indisponível");
      return;
    }
    setPosLoading(true);
    setPosError(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
        });
        setPosLoading(false);
      },
      (err) => {
        setPosError(`${err.code}: ${err.message}`);
        setPosLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, []);

  useEffect(() => {
    refreshAll();
    captureGps();
    const onOn = () => setOnline(true);
    const onOff = () => setOnline(false);
    window.addEventListener("online", onOn);
    window.addEventListener("offline", onOff);
    const t = setInterval(() => setTick((x) => x + 1), 5000);
    return () => {
      window.removeEventListener("online", onOn);
      window.removeEventListener("offline", onOff);
      clearInterval(t);
    };
  }, [refreshAll, captureGps]);

  // a cada tick, atualiza queue e telemetria
  useEffect(() => {
    refreshAll();
  }, [tick, refreshAll]);

  function copyDiagnostic() {
    const lines = [
      `Build: ${isNative ? "NATIVO" : "WEB"} (${platform})`,
      `Host: ${window.location.hostname}`,
      `User-Agent: ${navigator.userAgent}`,
      `Online: ${online}`,
      `Permissão GPS: ${perm}`,
      `WakeLock suportado: ${wakeSupported}`,
      `Posição atual: ${pos ? `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)} (±${Math.round(pos.accuracy)}m)` : "—"}`,
      `Erro GPS: ${posError ?? "—"}`,
      `Fila offline: ${queue}`,
      `Watcher iniciado: ${fmtTime(tele.watcherStartedAt)} (restarts: ${tele.watcherRestarts})`,
      `Último ponto na fila: ${fmtTime(tele.lastEnqueueAt)} (${fmtAgo(tele.lastEnqueueAt)})`,
      `Último envio OK: ${fmtTime(tele.lastSentAt)} (${fmtAgo(tele.lastSentAt)}) - ${tele.lastSentCount} pts`,
      `Último erro: ${fmtTime(tele.lastErrorAt)} - ${tele.lastError ?? "—"}`,
    ].join("\n");
    navigator.clipboard?.writeText(lines).then(
      () => toast({ title: "Diagnóstico copiado", description: "Cole no WhatsApp do suporte." }),
      () => toast({ title: "Falha ao copiar", variant: "destructive" })
    );
  }

  const trackerMode = isNative ? "Nativo (Foreground Service)" : "Web (navigator.geolocation)";
  const fsActive = isNative && tele.watcherStartedAt !== null;

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-4 sticky top-0 z-10">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <Link to="/motorista">
              <Button variant="ghost" size="sm" className="text-primary-foreground hover:text-primary-foreground/80 -ml-2">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="font-bold text-base flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Diagnóstico
              </h1>
              <p className="text-xs opacity-80">Suporte técnico</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <BuildModeBadge />
            <Button
              variant="ghost"
              size="sm"
              className="text-primary-foreground hover:text-primary-foreground/80"
              onClick={() => {
                refreshAll();
                captureGps();
              }}
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-3">
        {/* Conectividade */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              {online ? <Wifi className="w-4 h-4 text-green-600" /> : <WifiOff className="w-4 h-4 text-destructive" />}
              Conectividade
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <StatusRow
              label="Internet"
              value={online ? "Online" : "Offline"}
              ok={online}
              hint={online ? "App pode sincronizar" : "Pontos GPS ficam na fila local"}
            />
          </CardContent>
        </Card>

        {/* GPS */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              GPS
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 divide-y">
            <StatusRow
              label="Permissão de localização"
              value={perm}
              ok={perm === "granted" ? true : perm === "denied" ? false : null}
              hint={
                perm === "denied"
                  ? "Abra Configurações → Apps → Permissões → Localização → Permitir o tempo todo"
                  : perm === "prompt"
                  ? "App ainda não pediu — entre na tela do motorista"
                  : undefined
              }
            />
            <StatusRow
              label="Modo do tracker"
              value={trackerMode}
              ok={isNative ? true : null}
              hint={isNative ? "GPS funciona com tela bloqueada" : "Web: tela precisa ficar ativa"}
            />
            <StatusRow
              label="Foreground Service"
              value={fsActive ? "Ativo" : "Inativo"}
              ok={fsActive}
              hint={fsActive ? "Notificação persistente deve estar visível" : "Faça login na tela do motorista"}
            />
            <StatusRow
              label="Watcher iniciado"
              value={fmtAgo(tele.watcherStartedAt)}
              ok={tele.watcherStartedAt !== null}
            />
            <StatusRow
              label="Restarts do watcher"
              value={String(tele.watcherRestarts)}
              ok={tele.watcherRestarts < 3 ? true : tele.watcherRestarts < 10 ? null : false}
              hint={tele.watcherRestarts >= 3 ? "Muitos restarts — verificar bateria/permissões" : undefined}
            />
            <StatusRow
              label="Wake Lock"
              value={wakeSupported ? "Suportado" : "Não suportado"}
              ok={wakeSupported}
              hint="Mantém a tela ligada durante a rota (web/PWA)"
            />
          </CardContent>
        </Card>

        {/* Posição atual */}
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Posição agora</CardTitle>
            <Button size="sm" variant="outline" onClick={captureGps} disabled={posLoading}>
              <RefreshCw className={`w-3 h-3 mr-1 ${posLoading ? "animate-spin" : ""}`} />
              Recapturar
            </Button>
          </CardHeader>
          <CardContent className="pt-0 space-y-1 text-sm font-mono">
            {pos ? (
              <>
                <div>Lat: {pos.lat.toFixed(6)}</div>
                <div>Lng: {pos.lng.toFixed(6)}</div>
                <div>Precisão: ±{Math.round(pos.accuracy)}m</div>
                <a
                  className="text-primary underline text-xs font-sans"
                  href={`https://www.google.com/maps?q=${pos.lat},${pos.lng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir no Google Maps
                </a>
              </>
            ) : posError ? (
              <div className="text-destructive text-xs font-sans">{posError}</div>
            ) : (
              <div className="text-muted-foreground text-xs font-sans">Capturando…</div>
            )}
          </CardContent>
        </Card>

        {/* Telemetria de envio */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Envio de posições</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 divide-y">
            <StatusRow
              label="Fila offline (pendente)"
              value={queue < 0 ? "erro" : String(queue)}
              ok={queue === 0 ? true : queue < 50 ? null : false}
              hint={queue > 0 ? "Drena automaticamente ao voltar a internet" : undefined}
            />
            <StatusRow
              label="Último ponto enfileirado"
              value={fmtAgo(tele.lastEnqueueAt)}
              ok={tele.lastEnqueueAt && Date.now() - tele.lastEnqueueAt < 5 * 60_000 ? true : tele.lastEnqueueAt ? null : false}
              hint={tele.lastEnqueueAt ? fmtTime(tele.lastEnqueueAt) : "Ainda não capturou nenhuma posição"}
            />
            <StatusRow
              label="Último envio OK"
              value={`${fmtAgo(tele.lastSentAt)} (${tele.lastSentCount} pts)`}
              ok={tele.lastSentAt && Date.now() - tele.lastSentAt < 5 * 60_000 ? true : tele.lastSentAt ? null : false}
              hint={tele.lastSentAt ? fmtTime(tele.lastSentAt) : undefined}
            />
            <StatusRow
              label="Último erro"
              value={tele.lastError ? fmtAgo(tele.lastErrorAt) : "—"}
              ok={tele.lastError ? false : true}
              hint={tele.lastError ?? undefined}
            />
            {tele.lastEnqueuePos && (
              <div className="pt-2 text-xs text-muted-foreground font-mono">
                Última pos: {tele.lastEnqueuePos.lat.toFixed(5)}, {tele.lastEnqueuePos.lng.toFixed(5)} (±{Math.round(tele.lastEnqueuePos.accuracy)}m)
              </div>
            )}
          </CardContent>
        </Card>

        {/* Aparelho */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Smartphone className="w-4 h-4" />
              Aparelho
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Plataforma</span>
              <Badge variant="secondary">{platform}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Host</span>
              <span className="font-mono text-right break-all">{window.location.hostname}</span>
            </div>
            <Separator />
            <div className="text-muted-foreground break-all">{navigator.userAgent}</div>
          </CardContent>
        </Card>

        <Button variant="outline" className="w-full" onClick={copyDiagnostic}>
          <Copy className="w-4 h-4 mr-2" />
          Copiar diagnóstico (enviar ao suporte)
        </Button>
      </div>
    </div>
  );
}
