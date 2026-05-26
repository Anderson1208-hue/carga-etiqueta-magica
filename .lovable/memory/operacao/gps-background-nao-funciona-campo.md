---
name: gps-background-nao-funciona-campo
description: GPS em background NÃO está funcionando em campo apesar do plugin nativo instalado. Não afirmar que "funciona igual Waze". Diagnóstico das 5 causas prováveis.
type: constraint
---
# GPS background do APK Motorista — NÃO confiável

## Realidade (validada em campo pelo cliente)
Apesar de:
- `@capacitor-community/background-geolocation` instalado
- `useGpsTrackerNative` com Foreground Service, heartbeat, supervisor, fallback
- Fila offline (`gpsQueue`) com retry

**O motorista relata que com tela bloqueada o GPS para de enviar.** NÃO repetir o discurso de "funciona igual Waze". A memória `gps-tracker-hibrido-capacitor.md` está OTIMISTA demais; este arquivo prevalece.

## 5 causas prováveis (em ordem de probabilidade)

1. **Permissão "Permitir o tempo todo" não concedida.** Android 11+ esconde essa opção atrás de 2 cliques extras. `requestPermissions:true` do plugin só pede "Enquanto usando o app". Sem "Allow all the time", o SO mata callbacks ~5min após tela apagar — mesmo com Foreground Service ativo.

2. **Otimização de bateria não desativada.** Xiaomi (MIUI), Samsung (One UI), Motorola, OPPO/Realme matam o app agressivamente. Precisa entrar em Bateria > [app] > Sem restrições + Auto-iniciar (Xiaomi) + "Permitir atividade em segundo plano" (Samsung).

3. **AndroidManifest faltando permissões.** `android/` é gerado na máquina do dev (não está no repo Lovable). Conferir que tem TODAS:
   - `ACCESS_FINE_LOCATION`
   - `ACCESS_COARSE_LOCATION`
   - `ACCESS_BACKGROUND_LOCATION` (Android 10+)
   - `FOREGROUND_SERVICE`
   - `FOREGROUND_SERVICE_LOCATION` (Android 14+)
   - `POST_NOTIFICATIONS` (Android 13+)
   - `WAKE_LOCK`

4. **`targetSdkVersion` >= 34 sem declaração de Foreground Service Type.** Android 14 exige `<service android:foregroundServiceType="location" />` no manifest. Versões antigas do plugin podem não declarar isso.

5. **Motorista faz swipe-kill no app.** Foreground Service NÃO sobrevive a swipe-kill em alguns fabricantes (Xiaomi pior). Tela apagada com app vivo = OK. Swipe-kill da lista de recentes = morre.

## O que dá pra fazer dentro do Lovable
- Melhorar tela `/motorista/diagnostico` com checklist visual: permissão exata concedida, otimização de bateria, última posição enviada, fila pendente.
- Onboarding obrigatório (`PermissoesOnboarding`) que NÃO deixa começar rota sem "Allow all the time" + envio para `openSettings()` se faltar.
- Telemetria server-side: ao receber gap > 5min, marcar rota como "GPS instável" no painel da Torre.

## O que precisa ser feito FORA do Lovable (manualmente no PC do dev)
- Inspecionar `android/app/src/main/AndroidManifest.xml` gerado e adicionar permissões/service type faltantes.
- Testar em pelo menos 1 Xiaomi e 1 Samsung reais (emulador não reproduz kill agressivo).
- Considerar trocar plugin por `@transistorsoft/capacitor-background-geolocation` (pago, mas é o que apps de delivery sério usam).

## Status
Caminho B (GPS nativo) está **incompleto na prática**. Antes de prometer Play Store (Caminho A), validar se o background funciona num celular real.
