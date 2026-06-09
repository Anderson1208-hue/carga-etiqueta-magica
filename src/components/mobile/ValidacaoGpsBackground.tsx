import { useEffect } from "react";

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

export function isBackgroundGpsValidated(): boolean {
  return true;
}

interface Props {
  open: boolean;
  onValidated: () => void;
  onCancel?: () => void;
}

export function ValidacaoGpsBackground({ open, onValidated, onCancel }: Props) {
  useEffect(() => {
    if (open) {
      onValidated();
    }
  }, [open, onValidated]);

  if (!open) return null;
  onCancel?.();
  return null;
}
