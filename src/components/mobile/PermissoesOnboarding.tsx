import { useEffect, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, BatteryCharging, Bell, MapPin, Settings } from "lucide-react";

/**
 * Onboarding de permissões e bateria do APK do motorista.
 *
 * Por que existe:
 * - O Foreground Service só sobrevive em campo se o motorista permitir
 *   "Localização o tempo todo", notificações (Android 13+) e desativar a
 *   otimização de bateria do app.
 * - Cada fabricante (Xiaomi MIUI, Samsung One UI, Motorola, etc) tem uma
 *   tela diferente. Aqui mostramos instruções específicas e abrimos as
 *   configurações do app via plugin já existente.
 *
 * Persistência: marca confirmação no localStorage ("oem_onboarding_v1").
 * O wizard volta a aparecer se o motorista limpar dados ou em novo APK.
 */

interface BackgroundGeolocationPlugin {
  openSettings(): Promise<void>;
}
const BackgroundGeolocation =
  registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");

const STORAGE_KEY = "oem_onboarding_v1";

type Manufacturer = "xiaomi" | "samsung" | "motorola" | "huawei" | "oppo" | "outro";

function detectManufacturer(): Manufacturer {
  const ua = navigator.userAgent.toLowerCase();
  if (/xiaomi|redmi|poco|miui/.test(ua)) return "xiaomi";
  if (/samsung|sm-/.test(ua)) return "samsung";
  if (/moto|motorola/.test(ua)) return "motorola";
  if (/huawei|honor/.test(ua)) return "huawei";
  if (/oppo|realme/.test(ua)) return "oppo";
  return "outro";
}

const TIPS_BY_MANUFACTURER: Record<Manufacturer, string[]> = {
  xiaomi: [
    "Em Bateria do app, escolha 'Sem restrição'.",
    "Em Inicialização automática, ative para este app.",
    "Em Outras permissões, ative 'Exibir pop-up enquanto está em segundo plano'.",
  ],
  samsung: [
    "Em Bateria, escolha 'Sem restrição'.",
    "Em Apps em sleep profundo, certifique-se que este app NÃO está na lista.",
    "Mantenha o app fixado nas tarefas recentes (cadeado).",
  ],
  motorola: [
    "Em Bateria, escolha 'Não otimizar' para este app.",
    "Em Apps em segundo plano, mantenha 'Permitir' ativo.",
  ],
  huawei: [
    "Em Bateria → Inicialização do app, troque para 'Gerenciar manualmente' e ative os 3 itens.",
    "Em Configurações de bateria, desative 'Iniciar fechamento de apps em segundo plano'.",
  ],
  oppo: [
    "Em Bateria → Otimização, escolha 'Não otimizar'.",
    "Em Apps em segundo plano, ative para este app.",
  ],
  outro: [
    "Em Bateria do aplicativo, escolha 'Sem restrição' ou 'Não otimizar'.",
    "Permita execução em segundo plano.",
  ],
};

export function PermissoesOnboarding({
  active,
}: {
  /** Mostre apenas quando o motorista está em rota (evita aparecer fora de hora). */
  active: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirmLocation, setConfirmLocation] = useState(false);
  const [confirmNotifications, setConfirmNotifications] = useState(false);
  const [confirmBattery, setConfirmBattery] = useState(false);

  useEffect(() => {
    if (!active) return;
    if (!Capacitor.isNativePlatform()) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") return;
    } catch {
      /* ignore */
    }
    setOpen(true);
  }, [active]);

  const manufacturer = detectManufacturer();
  const tips = TIPS_BY_MANUFACTURER[manufacturer];

  const allChecked = confirmLocation && confirmNotifications && confirmBattery;

  function handleOpenSettings() {
    BackgroundGeolocation.openSettings().catch(() => {
      console.warn("[PermissoesOnboarding] openSettings indisponível");
    });
  }

  function handleFinish() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Configuração crítica do GPS
          </DialogTitle>
          <DialogDescription>
            Para o GPS funcionar com a tela bloqueada e durante toda a rota,
            precisamos que você confirme 3 ajustes no celular.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              checked={confirmLocation}
              onCheckedChange={(v) => setConfirmLocation(!!v)}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 font-medium">
                <MapPin className="h-4 w-4" />
                Localização: "O tempo todo"
              </div>
              <p className="text-sm text-muted-foreground">
                Quando o app pedir a permissão de localização, escolha
                <strong> Permitir o tempo todo</strong> (não só "Enquanto usa").
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              checked={confirmNotifications}
              onCheckedChange={(v) => setConfirmNotifications(!!v)}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 font-medium">
                <Bell className="h-4 w-4" />
                Notificações ativas
              </div>
              <p className="text-sm text-muted-foreground">
                A notificação fixa "Rastreamento ativo" precisa ficar visível.
                <strong> Não desligue</strong> as notificações deste app.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              checked={confirmBattery}
              onCheckedChange={(v) => setConfirmBattery(!!v)}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 font-medium">
                <BatteryCharging className="h-4 w-4" />
                Bateria sem restrição
              </div>
              <p className="text-sm text-muted-foreground">
                Seu celular detectado: <strong>{manufacturer.toUpperCase()}</strong>.
              </p>
              <ul className="text-sm text-muted-foreground list-disc pl-4 mt-1 space-y-1">
                {tips.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          </label>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleOpenSettings}
          >
            <Settings className="h-4 w-4 mr-2" />
            Abrir configurações do app
          </Button>
        </div>

        <DialogFooter>
          <Button
            type="button"
            disabled={!allChecked}
            onClick={handleFinish}
            className="w-full"
          >
            Tudo configurado, pode rastrear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
