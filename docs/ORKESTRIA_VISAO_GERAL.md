# Orkestria — Visão Geral e Estado Atual

> Documento vivo. Última atualização: **15/06/2026**.
> Objetivo: dar a qualquer pessoa (técnica ou não) uma fotografia honesta do que é o Orkestria, o que ele já faz hoje, o que está em andamento e o que ainda falta.

---

## 1. O que é o Orkestria

**Orkestria** é uma plataforma de **gestão logística end-to-end** para transportadoras e operadores logísticos, com foco inicial em distribuição rodoviária de cargas fracionadas no Rio de Janeiro.

A plataforma orquestra todo o ciclo de vida de uma Nota Fiscal — da chegada do XML no CD até o canhoto digitalizado entregue ao embarcador — em um único fluxo integrado, eliminando planilhas, retrabalho e perda de rastreabilidade.

### Pilares
1. **Operação de CD** — recebimento de XML/CT-e, endereçamento, etiquetagem QR, conferência em 2 etapas (Galpão + Motorista).
2. **Planejamento e Roteirização** — preparação de cargas por volume/peso, clusterização geográfica, sequenciamento de paradas.
3. **Execução em Campo (App Motorista)** — conferência externa, baixa de entrega com foto/GPS, modo offline.
4. **Monitoramento em Tempo Real** — torre de controle com mapa, GPS híbrido, geofence, alertas de desvio.
5. **Integrações** — IBAC (canhotos), Praxio/Globus (ERP), embarcadores (Pandurata, Bauducco, Docile, Ebenezer, Cacau Show).

### Stack técnica
- **Frontend:** React 18 + Vite 5 + TypeScript + Tailwind + shadcn/ui
- **Backend:** Lovable Cloud (Supabase) — Postgres com RLS, Edge Functions (Deno), Storage, Auth
- **App Motorista:** Capacitor 8 (Android nativo) + Background Geolocation + MLKit + Camera nativa
- **PDFs/Excel:** jsPDF + xlsx
- **Mapas:** Leaflet + OSM + clustering Haversine próprio

---

## 2. Módulos em produção

| Módulo | Status | Observações |
|---|---|---|
| Cadastros (Embarcadores, Destinatários, Veículos, Operadores) | ✅ Produção | Fase 1 concluída |
| Importação XML / CT-e / Minuta / Cubagem | ✅ Produção | Parser robusto, regras Pandurata/Bauducco para `nVol` |
| Endereçamento no CD | ✅ Produção | |
| Etiquetas QR (Zebra ZD220) | ✅ Produção | Ordenação hierárquica operacional |
| Preparação de Cargas | ✅ Produção | Filtros de disponibilidade, status manual |
| Roteirização (automática + manual) | ✅ Produção | Clustering 6km urbano / 17km interior, múltiplas cargas por rota |
| Agendamento | ✅ Produção | Liberação D-1, automação por CNPJ, feriados RJ |
| Conferência Interna (Galpão) | ✅ Produção | Scanner híbrido (BarcodeDetector + MLKit), offline IndexedDB |
| Conferência Externa (Motorista) | ✅ Produção | Mobile, validação por carga |
| Baixa de Entrega | ✅ Produção | Foto + GPS + OCR, fila offline com auto-sync |
| Monitoramento / Torre de Controle | ✅ Produção | Mapa Leaflet, status geofence automático |
| Integração IBAC (eventos + canhotos) | ✅ Produção | Fila com retry/backoff, cron diário enfileira canhotos Cacau Show |
| Integração Praxio/Globus | ✅ Produção | Fila de push de status/ocorrências |
| Relatórios (Romaneio, Resumo Dia/MR/Veículo, Pendentes) | ✅ Produção | PDF + Excel |
| Prestação de Contas / Conciliação | ✅ Produção | |
| Histórico de NF (event store) | ✅ Produção | |

---

## 3. App Motorista (APK Android) — **frente atual**

Hoje é o **principal foco de trabalho**. O app web já roda em qualquer celular via navegador, mas a versão **nativa em APK** é necessária para:
- GPS em background com tela apagada (Transistorsoft Background Geolocation)
- Câmera nativa de alta qualidade para canhotos legíveis pela IA da IBAC
- Scanner MLKit nativo (mais rápido e confiável que o web)
- Wake lock, lock portrait, splash screen profissional
- Push notifications

### Arquitetura de ambientes
| Ambiente | applicationId | Frontend |
|---|---|---|
| **DEV** | `app.lovable.dev.motorista` | hot-reload do Vite local |
| **STAGING** | `app.lovable.staging.motorista` | embedded (build do `dist/`) |
| **PROD** | `app.lovable.motorista` | embedded |

Todos compartilham o mesmo backend Supabase (isolamento por código de acesso de veículo e flags de teste).

### Estado do APK hoje (15/06/2026)
- ✅ Capacitor configurado, plugins instalados, scripts de build prontos (`scripts/build-apk-staging.sh`, `build-apk-release.sh`)
- ✅ Documentação completa: `docs/APK_BUILD_PRODUCAO.md`, `.lovable/memory/operacao/ambientes-apk-motorista.md`
- ✅ Hooks GPS híbridos prontos (`useGpsTrackerHybrid`, `useGpsTrackerTransistor`, `useGpsTrackerNative`)
- ✅ Fila GPS offline (IndexedDB) + worker de sync
- ✅ Câmera nativa, scanner MLKit, wake lock, lock portrait
- ✅ Tela de diagnóstico do motorista (`MotoristaDiagnostico`)
- ✅ Onboarding de permissões, badge de build mode, validação GPS background
- ⏳ **Pendente:** primeiro build assinado de APK (será feito via parceria com Manus — ver `briefing` enviado em chat)
- ⏳ **Pendente:** licença Transistorsoft (será comprada **depois** de validar o app aberto rodando redondo)
- ⏳ **Pendente:** publicação na Play Store

### Restrições importantes (já conhecidas)
- GPS em background **só funciona com a aba ativa** no modo PWA web (limitação do navegador). Por isso o APK nativo é obrigatório para produção real.
- Sem licença Transistorsoft, o plugin roda em modo trial — bom para validar tela aberta, ruim para tela apagada por horas.
- Keystore (`.jks`) **nunca pode ser perdido** — sem ele, não há como atualizar o app na Play Store.

---

## 4. O que está em andamento agora

1. **Build do primeiro APK STAGING assinado** — briefing pronto para enviar ao Manus, aguardando o usuário sincronizar o repo no GitHub e disparar.
2. **Validação em campo do app aberto** — testar conferência externa, baixa de entrega, GPS com tela ligada.
3. **Cron diário de envio de canhotos para a IBAC** — plano em `.lovable/plan.md`, schema e edge function `ibac-enfileirar-canhotos` em fase final.

---

## 5. Roadmap curto (próximas 4-6 semanas)

| Prioridade | Item |
|---|---|
| 🔴 P0 | APK STAGING assinado nas mãos do motorista piloto |
| 🔴 P0 | Rodada de testes em campo com tela aberta |
| 🟡 P1 | Compra da licença Transistorsoft + rebuild com background real |
| 🟡 P1 | APK PROD assinado e distribuição controlada (APK direto, antes da Play Store) |
| 🟢 P2 | Publicação na Play Store (interno → fechado → produção) |
| 🟢 P2 | Cron IBAC canhotos rodando 23h diariamente |
| 🟢 P2 | Dashboard de saúde do GPS (cobertura, gaps, bateria) |

---

## 6. Decisões arquiteturais consolidadas (não revisitar sem motivo forte)

- **Lovable Cloud (Supabase) como único backend** — sem servidor próprio.
- **RLS em todas as tabelas públicas** + função `has_role` security-definer.
- **Mobile (<768px) é forçado para rotas operacionais** — desktop não vê tela de motorista e vice-versa.
- **Conferência em 2 etapas obrigatória** — Interna (Galpão) e Externa (Motorista). Nunca mesclar.
- **1 unidade = 1 caixa** no `calculateBoxes`. Lógica congelada.
- **`cargas.status` é manual** — só o módulo Cargas escreve.
- **Datas normalizadas com `T00:00:00`** para evitar timezone shift.
- **`nVol` Pandurata/Bauducco** só é m³ se for decimal; inteiro = quantidade de caixas.
- **Coordenadas do CD fixas:** `-22.8783, -43.3367`.
- **Projeto "app tipo Waze" arquivado** — não revisitar.

---

## 7. Onde encontrar mais detalhes

- **Memórias do projeto:** `.lovable/memory/index.md` (índice completo de decisões e funcionalidades)
- **Build do APK:** `docs/APK_BUILD_PRODUCAO.md`
- **Ambientes APK:** `.lovable/memory/operacao/ambientes-apk-motorista.md`
- **Runbook IBAC:** `docs/IBAC_RUNBOOK.md`
- **Plano ativo:** `.lovable/plan.md`

---

**Resumo em uma frase:** o Orkestria é uma plataforma logística completa já em produção no desktop e na web, com a operação de CD, roteirização, monitoramento e integrações funcionando — o trabalho ativo hoje é **finalizar o APK nativo do motorista** para destravar o GPS em background e a câmera de alta qualidade em produção real.
