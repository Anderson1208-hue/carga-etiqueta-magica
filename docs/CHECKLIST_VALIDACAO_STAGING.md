# Checklist de Validação — APK STAGING (Transistorsoft)

**APK em teste:** `orkestria-driver-staging-transistorsoft.apk`
**SHA-256:** `51d59ea851d6df6eeed433384d2fdea7f789c080ec674d8721f7b853e45db0b4`
**Data do build:** 24/06/2026
**Responsável pelo teste de campo:** _______________________
**Aparelho (modelo + Android):** _______________________

---

## 1. Avisos antes de instalar

- [ ] **Assinatura TEMPORÁRIA confirmada.** Este APK foi assinado com `motorista-staging-temp.keystore` (não é a keystore release oficial). Serve apenas para validação de campo desta rodada.
- [ ] **NÃO usar este APK como PROD.** PROD exige rebuild com `./scripts/build-apk-release.sh` usando `motorista-release.keystore`.
- [ ] **NÃO distribuir em massa.** Apenas 1–2 aparelhos de homologação.
- [ ] Se for substituir um STAGING anterior assinado com outra keystore: **desinstalar antes** (vai dar "App not installed" caso contrário).

---

## 2. Identidade do APK (antes do primeiro login)

- [ ] `applicationId = com.orkestria.driver.staging` (Configurações → Apps → Orkestria Driver STAGING → Detalhes).
- [ ] Nome visível: **Orkestria Driver STAGING**.
- [ ] Badge âmbar **"STAGING"** visível na UI após abrir o app.
- [ ] Convive no mesmo aparelho com `com.orkestria.driver` (PROD) e `.homolog` sem sobrescrever.

---

## 3. Transistorsoft ativo + licença aplicada

Conectar o aparelho via USB e rodar:

```bash
adb logcat -s TSLocationManager:V
```

- [ ] Aparece no boot: `✅ Valid license for package com.orkestria.driver.staging`.
- [ ] **NÃO** aparece banner "evaluation only" / "license invalid" / "DEBUG mode" do plugin.
- [ ] Plugin inicializa sem stack trace de `License` ou `meta-data`.

Se aparecer "evaluation": a `<meta-data>` não foi lida → abortar teste, conferir Manifest.

---

## 4. Permissões Android críticas (conceder antes de iniciar rota)

Tela: **Configurações → Apps → Orkestria Driver STAGING → Permissões**

- [ ] Localização: **Permitir o tempo todo** (não "apenas com app aberto").
- [ ] Notificações: **Permitida** (Foreground Service precisa exibir).
- [ ] Câmera: **Permitida** (canhoto/baixa).
- [ ] **Bateria → Sem restrição** (Configurações → Bateria → Orkestria Driver STAGING → Sem restrição/Desempenho).
- [ ] Inicialização automática habilitada (Xiaomi/Huawei/Oppo/Vivo: menu específico do fabricante).
- [ ] Wizard `ValidacaoGpsBackground` do app passa no teste de 90s com tela bloqueada.

---

## 5. Teste 1 — Tela bloqueada, 30 a 60 minutos

Cenário: motorista loga, inicia rota, **trava a tela** e dirige normalmente.

- [ ] Notificação persistente do Foreground Service permanece visível durante todo o período.
- [ ] Após 30 min: rodar a query abaixo e confirmar pings recentes.
- [ ] Após 60 min: nenhum gap > 5 minutos no histórico.

```sql
select created_at, source, latitude, longitude, accuracy
from posicoes_gps
where monitoramento_rota_id = '<ID_DA_ROTA>'
  and created_at >= now() - interval '70 minutes'
order by created_at desc;
```

---

## 6. Teste 2 — App fechado por swipe (kill)

Cenário: durante a rota em andamento, abrir lista de apps recentes e **arrastar o card** para fora (swipe-kill).

- [ ] Notificação do Foreground Service **continua** visível depois do swipe (Transistorsoft mantém o serviço vivo).
- [ ] Após 10 min sem reabrir o app: pings continuam chegando no banco.
- [ ] Reabrir o app: rota ainda está ativa, sem precisar logar de novo.

Se a notificação sumir e os pings pararem: bateria está matando o processo → revisar item 4 (otimização de bateria / inicialização automática).

---

## 7. Confirmação no banco: `source = 'transistor-native-http'`

Esta é a evidência **objetiva** de que o driver Transistorsoft está ativo (e não o community como fallback).

```sql
select source, count(*) as pings
from posicoes_gps
where monitoramento_rota_id = '<ID_DA_ROTA>'
  and created_at >= '<inicio_do_teste>'
group by source
order by pings desc;
```

- [ ] **≥ 95%** dos pings com `source = 'transistor-native-http'`.
- [ ] **Nenhum** ping com `source = 'community-bg'` durante o teste (community só pode aparecer em HOMOLOG).
- [ ] `accuracy` mediana ≤ 30 m em deslocamento urbano.

---

## 8. Critério de aprovação / reprovação

### ✅ APROVAR STAGING (liberar build PROD) se TODOS:
- Logcat confirmou licença válida (item 3).
- Teste 1 (tela bloqueada 30–60 min) sem gaps > 5 min.
- Teste 2 (swipe-kill) manteve envio por ≥ 10 min sem reabrir.
- ≥ 95% dos pings com `source = 'transistor-native-http'`.
- Sem crashes / ANR no logcat durante a janela de teste.
- Validação reproduzida em **2 aparelhos** distintos por **1 a 2 dias** de operação real.

### ❌ REPROVAR (não gerar PROD) se QUALQUER:
- Banner "evaluation only" ou licença inválida no logcat.
- Gap > 10 min com tela bloqueada e bateria liberada.
- Pings param em < 5 min após swipe-kill.
- Qualquer ping `source = 'community-bg'` em STAGING (driver não foi roteado — checar `VITE_BUILD_ENV=staging`).
- Crash recorrente do plugin Transistorsoft no logcat.

---

## 9. Próximo passo após aprovação

Solicitar ao responsável pelo build (Manus) novo APK **PROD** com:

1. `./scripts/setup-android-signing.sh` (uma vez, gera keystore release oficial — guardar senha em cofre).
2. `./scripts/build-apk-release.sh` (usa `apksigner` v2+v3, não `jarsigner`).
3. Anexar git SHA do commit usado no build.
4. Anexar trecho do logcat mostrando "Valid license" com `applicationId = com.orkestria.driver`.
