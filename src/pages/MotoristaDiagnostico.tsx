import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Capacitor, registerPlugin } from "@capacitor/core";

interface BgLocation { latitude: number; longitude: number; accuracy: number; time: number | null; }
interface BgWatcherOptions { backgroundMessage?: string; backgroundTitle?: string; requestPermissions?: boolean; stale?: boolean; distanceFilter?: number; }
interface BackgroundGeolocationPlugin {
  addWatcher(opts: BgWatcherOptions, cb: (loc: BgLocation | null, err?: { code: string; message: string }) => void): Promise<string>;
  removeWatcher(opts: { id: string }): Promise<void>;
  openSettings(): Promise<void>;
}
const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { BuildModeBadge } from "@/components/mobile/BuildModeBadge";
import { pendingCount } from "@/lib/gpsQueue";
import { readTelemetry, markSent, markError, type GpsTelemetry } from "@/lib/gpsTelemetry";
import { VALIDATION_KEY } from "@/components/mobile/ValidacaoGpsBackground";
import { supabase } from "@/integrations/supabase/client";
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
  RotateCcw,
  Send,
  ShieldCheck,
  Settings,
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

  // Teste manual de envio para o backend
  const [testCode, setTestCode] = useState<string>(() => {
    try { return localStorage.getItem("motorista-diag-test-code") || ""; } catch { return ""; }
  });
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string; detail?: string } | null>(null);

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

  async function getFreshPosition(): Promise<{ lat: number; lng: number; accuracy: number }> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("Geolocation indisponível"));
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
        (err) => reject(new Error(`GPS ${err.code}: ${err.message}`)),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }

  const [permLoading, setPermLoading] = useState(false);

  async function solicitarPermissaoLocalizacao() {
    setPermLoading(true);
    try {
      if (isNative) {
        // Dispara o diálogo nativo do Android via plugin (requestPermissions:true).
        // Mantém o watcher por ~3s só para forçar o sistema a registrar a permissão,
        // depois remove para não deixar serviço rodando sem rota.
        let watcherId: string | null = null;
        const got = await new Promise<PermState>((resolve) => {
          const timeout = setTimeout(() => resolve("unknown"), 30_000);
          BackgroundGeolocation.addWatcher(
            {
              backgroundTitle: "Solicitando permissão",
              backgroundMessage: "Toque em Permitir na próxima tela",
              requestPermissions: true,
              stale: false,
              distanceFilter: 0,
            },
            (loc, err) => {
              if (err) {
                clearTimeout(timeout);
                if (err.code === "NOT_AUTHORIZED") resolve("denied");
                else resolve("unknown");
                return;
              }
              if (loc) {
                clearTimeout(timeout);
                resolve("granted");
              }
            }
          )
            .then((id) => { watcherId = id; })
            .catch(() => { clearTimeout(timeout); resolve("unknown"); });
        });

        // limpa watcher temporário
        if (watcherId) {
          BackgroundGeolocation.removeWatcher({ id: watcherId }).catch(() => {});
        }

        await refreshAll();

        if (got === "granted") {
          toast({ title: "Permissão concedida ✓", description: "Agora abra Configurações → Localização e marque 'Permitir o tempo todo'." });
        } else if (got === "denied") {
          toast({
            title: "Permissão negada",
            description: "Abra as Configurações do app e libere a localização manualmente.",
            variant: "destructive",
          });
          BackgroundGeolocation.openSettings().catch(() => {});
        } else {
          toast({ title: "Sem resposta", description: "Tente novamente ou abra as configurações.", variant: "destructive" });
        }
      } else {
        // Web: getCurrentPosition já dispara o prompt do navegador
        await new Promise<void>((resolve) => {
          if (!navigator.geolocation) return resolve();
          navigator.geolocation.getCurrentPosition(
            (p) => {
              setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
              resolve();
            },
            () => resolve(),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
          );
        });
        await refreshAll();
      }
    } finally {
      setPermLoading(false);
    }
  }


    setTestLoading(true);
    setTestResult(null);
    const code = testCode.trim().toUpperCase();
    try {
      if (code.length !== 6) throw new Error("Digite o código de 6 caracteres da placa");
      try { localStorage.setItem("motorista-diag-test-code", code); } catch { /* ignore */ }

      // 1) Resolve a rota ativa via motorista-acesso
      const { data: acessoData, error: acessoErr } = await supabase.functions.invoke("motorista-acesso", {
        body: { code },
      });
      if (acessoErr) throw new Error(`Acesso: ${acessoErr.message}`);
      if (acessoData?.error) throw new Error(`Acesso: ${acessoData.error}`);
      const rotaId: string | null = acessoData?.monitoramento_rota_id ?? null;
      if (!rotaId) throw new Error("Sem rota ativa para esta placa. Abra a rota em /monitoramento primeiro.");

      // 2) Pega posição fresca
      const fresh = await getFreshPosition();
      setPos(fresh);

      // 3) Envia ao processar-gps
      const { data: gpsData, error: gpsErr } = await supabase.functions.invoke("processar-gps", {
        body: {
          monitoramento_rota_id: rotaId,
          latitude: fresh.lat,
          longitude: fresh.lng,
          accuracy: fresh.accuracy,
          heartbeat: false,
        },
      });
      if (gpsErr) throw new Error(`Backend: ${gpsErr.message}`);
      if (gpsData?.error) throw new Error(`Backend: ${gpsData.error}`);

      markSent(1);
      setTele(readTelemetry());
      setTestResult({
        ok: true,
        msg: "Envio OK — a Torre já deve mostrar a posição",
        detail: `Rota ${rotaId.slice(0, 8)}… • ${fresh.lat.toFixed(5)}, ${fresh.lng.toFixed(5)} (±${Math.round(fresh.accuracy)}m)`,
      });
      toast({ title: "GPS de teste enviado ✓", description: "Veja na Torre de Controle." });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      markError(msg);
      setTele(readTelemetry());
      setTestResult({ ok: false, msg: "Falha no teste", detail: msg });
      toast({ title: "Teste falhou", description: msg, variant: "destructive" });
    } finally {
      setTestLoading(false);
    }
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

        {/* Teste manual de envio ao backend — isola permissão vs. acesso à rota vs. rede */}
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="w-4 h-4" />
              Testar envio para o backend
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <p className="text-xs text-muted-foreground">
              Digite o <strong>código de 6 caracteres</strong> da placa (gerado em <code>/monitoramento</code>) e envie uma posição agora.
              Confirma se o caminho <em>celular → backend → Torre</em> está funcionando.
            </p>
            <Input
              value={testCode}
              onChange={(e) => setTestCode(e.target.value.toUpperCase().slice(0, 6))}
              placeholder="ABC123"
              maxLength={6}
              className="font-mono text-center text-lg tracking-widest uppercase"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
            <Button
              className="w-full"
              onClick={testarEnvioBackend}
              disabled={testLoading || testCode.trim().length !== 6}
            >
              <Send className={`w-4 h-4 mr-2 ${testLoading ? "animate-pulse" : ""}`} />
              {testLoading ? "Enviando…" : "Enviar posição de teste agora"}
            </Button>
            {testResult && (
              <div
                className={`text-xs rounded-md p-2 border ${
                  testResult.ok
                    ? "border-green-300 bg-green-50 text-green-800"
                    : "border-destructive/40 bg-destructive/5 text-destructive"
                }`}
              >
                <div className="font-medium flex items-center gap-1">
                  {testResult.ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {testResult.msg}
                </div>
                {testResult.detail && <div className="mt-1 font-mono break-all">{testResult.detail}</div>}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Reset wizard de validação GPS — destrava motorista quando o cache de 14d "passou" sem o app ter realmente recebido a permissão "Permitir o tempo todo" */}
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-4 h-4" />
              Resetar validação GPS
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <p className="text-xs text-muted-foreground">
              Use quando: <strong>Permissão GPS</strong> aparece como <code>prompt</code> ou <code>denied</code> e o <strong>Watcher</strong> não inicia.
              Limpa o cache de 14 dias e reabre o passo a passo de permissão na próxima vez que entrar com o código da placa.
            </p>
            <Button
              variant="outline"
              className="w-full border-amber-400 text-amber-700 hover:bg-amber-100"
              onClick={() => {
                try {
                  localStorage.removeItem(VALIDATION_KEY);
                } catch { /* ignore */ }
                toast({
                  title: "Validação resetada",
                  description: "Saia, entre de novo com o código da placa e siga o passo a passo do GPS.",
                });
                setTimeout(() => {
                  window.location.href = "/motorista";
                }, 800);
              }}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Resetar e voltar pro login
            </Button>
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
