import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import BackgroundGeolocation from "@transistorsoft/capacitor-background-geolocation";
import type { Location, Subscription } from "@transistorsoft/capacitor-background-geolocation";
import { AuthorizationStatus, DesiredAccuracy } from "@transistorsoft/background-geolocation-types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle2, Lock, MapPin, Settings, XCircle } from "lucide-react";
import { ensureTransistorGpsReady } from "@/hooks/useGpsTrackerTransistor";

/**
 * Wizard de validação ativa do GPS em background do APK Motorista.
 *
 * Por que existe:
 * - O Android esconde a opção "Permitir o tempo todo" atrás de 2 cliques extras.
 *   `requestPermissions:true` do plugin só consegue pedir "Durante o uso".
 *   Sem "Allow all the time" o SO mata callbacks ~5min após bloquear a tela.
 * - Não dá pra detectar via API se a permissão é "always" vs "whileInUse"
 *   no Android. Por isso fazemos um TESTE COMPORTAMENTAL: o motorista
 *   bloqueia a tela por 90s e contamos quantos callbacks do plugin chegam
 *   nesse período. Se chegarem >= 2, o background está realmente funcionando.
 *
 * Fluxo: Intro -> Abrir Configurações -> Teste 90s tela bloqueada -> OK/Falha.
 * Persiste sucesso em localStorage por 14 dias (chave bg_gps_validated_v2_at).
 */

export const VALIDATION_KEY = "bg_gps_validated_v2_at";
export const VALIDATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const TEST_DURATION_S = 90;
const MIN_CALLBACKS_REQUIRED = 2;

export function isBackgroundGpsValidated(): boolean {
  // Só faz sentido em ambiente nativo. Web não passa pelo wizard.
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const v = localStorage.getItem(VALIDATION_KEY);
    if (!v) return false;
    const ts = parseInt(v, 10);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < VALIDATION_TTL_MS;
  } catch {
    return false;
  }
}

type Step = "intro" | "settings" | "test" | "success" | "fail";

interface Props {
  open: boolean;
  onValidated: () => void;
  onCancel?: () => void;
}

export function ValidacaoGpsBackground({ open, onValidated, onCancel }: Props) {
  const [step, setStep] = useState<Step>("intro");
  const [callbacks, setCallbacks] = useState(0);
  const [bgCallbacks, setBgCallbacks] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(TEST_DURATION_S);
  const [permError, setPermError] = useState<string | null>(null);
  const [screenLockedAtLeastOnce, setScreenLockedAtLeastOnce] = useState(false);

  const subscriptionsRef = useRef<Subscription[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isHiddenRef = useRef(false);
  const bgCallbacksRef = useRef(0);
  const screenLockedRef = useRef(false);

  function countBackgroundPoint(_location?: Location) {
    setCallbacks((c) => c + 1);
    if (isHiddenRef.current) {
      bgCallbacksRef.current += 1;
      setBgCallbacks((c) => c + 1);
    }
  }

  useEffect(() => {
    if (!open) {
      setStep("intro");
      setCallbacks(0);
      setBgCallbacks(0);
      setSecondsLeft(TEST_DURATION_S);
      setPermError(null);
      setScreenLockedAtLeastOnce(false);
      bgCallbacksRef.current = 0;
      screenLockedRef.current = false;
    }
  }, [open]);

  // Page Visibility: marca quando a tela está bloqueada (hidden = tela apagada/app em background)
  useEffect(() => {
    if (step !== "test") return;
    function onVisChange() {
      const hidden = document.hidden;
      isHiddenRef.current = hidden;
      if (hidden) {
        screenLockedRef.current = true;
        setScreenLockedAtLeastOnce(true);
      }
    }
    document.addEventListener("visibilitychange", onVisChange);
    return () => document.removeEventListener("visibilitychange", onVisChange);
  }, [step]);

  async function startTest() {
    setPermError(null);
    setCallbacks(0);
    setBgCallbacks(0);
    bgCallbacksRef.current = 0;
    screenLockedRef.current = false;
    setSecondsLeft(TEST_DURATION_S);
    setStep("test");

    try {
      await ensureTransistorGpsReady(0);
      await BackgroundGeolocation.setConfig({
        geolocation: {
          distanceFilter: 0,
          locationUpdateInterval: 15_000,
          fastestLocationUpdateInterval: 5_000,
          allowIdenticalLocations: true,
        },
        app: { heartbeatInterval: 30 },
      });

      const status = await BackgroundGeolocation.requestPermission();
      if (status !== AuthorizationStatus.Always) {
        setPermError('Permissão ainda não está em "Permitir o tempo todo". Abra as configurações do app e ajuste Localização.');
        stopTest("fail");
        return;
      }

      subscriptionsRef.current = [
        BackgroundGeolocation.onLocation(countBackgroundPoint, () => {
          setPermError("Erro ao receber localização nativa. Verifique GPS e permissões.");
        }),
        BackgroundGeolocation.onHeartbeat(() => countBackgroundPoint()),
      ];

      await BackgroundGeolocation.start();
      await BackgroundGeolocation.changePace(true).catch(() => {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPermError(`Não foi possível iniciar o teste: ${msg}`);
      stopTest("fail");
      return;
    }

    tickRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          // tempo acabou — avalia
          evaluate();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  async function stopTest(_finalStep: Step) {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    for (const sub of subscriptionsRef.current) {
      try { sub.remove(); } catch { /* ignore */ }
    }
    subscriptionsRef.current = [];
    try { await BackgroundGeolocation.stop(); } catch { /* ignore */ }
    setStep(_finalStep);
  }

  function evaluate() {
    // Critério: precisa ter recebido callbacks COM a tela bloqueada.
    // Se o motorista nunca bloqueou a tela, exigimos refazer o teste.
    if (!screenLockedRef.current) {
      setPermError("Você precisa BLOQUEAR a tela do celular durante o teste (botão de ligar).");
      stopTest("fail");
      return;
    }
    if (bgCallbacksRef.current >= MIN_CALLBACKS_REQUIRED) {
      try { localStorage.setItem(VALIDATION_KEY, String(Date.now())); } catch { /* ignore */ }
      stopTest("success");
    } else {
      setPermError(
        `Recebemos apenas ${bgCallbacksRef.current} ponto(s) com tela bloqueada. ` +
          `Provavelmente a permissão está em "Durante o uso". Abra as configurações e mude para "Permitir o tempo todo".`
      );
      stopTest("fail");
    }
  }

  useEffect(() => () => {
    if (tickRef.current) clearInterval(tickRef.current);
    for (const sub of subscriptionsRef.current) {
      try { sub.remove(); } catch { /* ignore */ }
    }
    BackgroundGeolocation.stop().catch(() => {});
  }, []);

  if (!open) return null;

  // Fullscreen blocker — não usa Dialog para não permitir fechar acidentalmente
  return (
    <div className="fixed inset-0 z-[60] bg-background overflow-y-auto">
      <div className="max-w-md mx-auto p-4 pt-8 space-y-4">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-warning/15 mx-auto flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-warning" />
          </div>
          <h1 className="text-xl font-bold">Validação do GPS</h1>
          <p className="text-sm text-muted-foreground">
            Antes de iniciar a rota precisamos confirmar que o GPS continua enviando posições com a tela bloqueada.
          </p>
        </div>

        {step === "intro" && (
          <Card className="p-4 space-y-4">
            <div className="space-y-3 text-sm">
              <div className="flex gap-3">
                <Settings className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">1. Abrir configurações do app</p>
                  <p className="text-muted-foreground">Vá em <strong>Permissões → Localização</strong> e escolha <strong>"Permitir o tempo todo"</strong>.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Lock className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">2. Teste de 90 segundos</p>
                  <p className="text-muted-foreground">Vamos pedir para você bloquear a tela. Se o GPS continuar enviando, está OK.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">3. Liberado por 14 dias</p>
                  <p className="text-muted-foreground">Depois disso, basta abrir o app e seguir trabalhando normalmente.</p>
                </div>
              </div>
            </div>
            <Button className="w-full" size="lg" onClick={() => setStep("settings")}>Começar</Button>
            {onCancel && (
              <Button variant="ghost" className="w-full" onClick={onCancel}>Agora não</Button>
            )}
          </Card>
        )}

        {step === "settings" && (
          <Card className="p-4 space-y-4">
            <div className="space-y-2 text-sm">
              <p className="font-medium">Passo a passo:</p>
              <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
                <li>Toque em <strong>"Abrir configurações"</strong> abaixo.</li>
                <li>Entre em <strong>Permissões</strong>.</li>
                <li>Toque em <strong>Localização</strong>.</li>
                <li>Selecione <strong>"Permitir o tempo todo"</strong>.</li>
                <li>Volte para este app e toque em <strong>"Já configurei"</strong>.</li>
              </ol>
              <p className="text-xs text-warning pt-2">
                Se a opção "Permitir o tempo todo" não aparecer, certifique-se que aceitou a permissão básica de localização antes (a tela com 3 opções: "Durante o uso", "Apenas desta vez", "Não permitir").
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full"
              size="lg"
              onClick={() => BackgroundGeolocation.openSettings().catch(() => setPermError("Não foi possível abrir as configurações."))}
            >
              <Settings className="w-4 h-4 mr-2" />
              Abrir configurações
            </Button>
            <Button className="w-full" size="lg" onClick={startTest}>
              <Lock className="w-4 h-4 mr-2" />
              Já configurei — iniciar teste
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setStep("intro")}>Voltar</Button>
          </Card>
        )}

        {step === "test" && (
          <Card className="p-4 space-y-4">
            <div className="text-center space-y-2">
              <div className="text-4xl font-bold tabular-nums">{secondsLeft}s</div>
              <Progress value={((TEST_DURATION_S - secondsLeft) / TEST_DURATION_S) * 100} />
            </div>
            <div className="rounded-lg bg-warning/10 border border-warning/30 p-3 text-sm text-center">
              <Lock className="w-5 h-5 mx-auto mb-1 text-warning" />
              <p className="font-medium text-warning">BLOQUEIE A TELA AGORA</p>
              <p className="text-muted-foreground text-xs mt-1">
                Aperte o botão de ligar do celular para apagar a tela. Não feche o app, não tire da lista de recentes.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center text-sm">
              <div className="p-2 rounded bg-muted">
                <div className="text-2xl font-bold">{callbacks}</div>
                <div className="text-xs text-muted-foreground">Total recebidos</div>
              </div>
              <div className="p-2 rounded bg-muted">
                <div className="text-2xl font-bold text-primary">{bgCallbacks}</div>
                <div className="text-xs text-muted-foreground">Com tela apagada</div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {screenLockedAtLeastOnce ? "✓ Tela foi bloqueada ao menos uma vez" : "Aguardando você bloquear a tela..."}
            </p>
          </Card>
        )}

        {step === "success" && (
          <Card className="p-6 space-y-4 text-center">
            <CheckCircle2 className="w-14 h-14 text-success mx-auto" />
            <h2 className="text-lg font-bold">GPS validado!</h2>
            <p className="text-sm text-muted-foreground">
              Recebemos <strong>{bgCallbacks} pontos</strong> com a tela bloqueada. O rastreamento vai funcionar normalmente.
            </p>
            <Button className="w-full" size="lg" onClick={onValidated}>
              <MapPin className="w-4 h-4 mr-2" />
              Continuar para a rota
            </Button>
          </Card>
        )}

        {step === "fail" && (
          <Card className="p-4 space-y-4">
            <div className="text-center space-y-2">
              <XCircle className="w-12 h-12 text-destructive mx-auto" />
              <h2 className="text-lg font-bold">Teste não passou</h2>
            </div>
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm">
              {permError || "Nenhum ponto recebido com a tela bloqueada."}
            </div>
            <div className="text-sm space-y-2">
              <p className="font-medium">Possíveis causas:</p>
              <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                <li>Permissão de localização não está em <strong>"Permitir o tempo todo"</strong>.</li>
                <li>Otimização de bateria está ativa para este app.</li>
                <li>Em celulares Xiaomi/Samsung: ative <strong>"Auto-iniciar"</strong> e desative <strong>"sleep profundo"</strong>.</li>
              </ul>
            </div>
            <Button className="w-full" size="lg" onClick={() => setStep("settings")}>
              Tentar novamente
            </Button>
            {onCancel && (
              <Button variant="ghost" className="w-full" onClick={onCancel}>
                Sair (rota não será iniciada)
              </Button>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
