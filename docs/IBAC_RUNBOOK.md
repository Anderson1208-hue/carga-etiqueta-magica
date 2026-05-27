# Runbook Operacional — Integração IBAC

Guia de configuração, homologação, operação e troubleshooting da integração com a IBAC.

---

## 1. Visão geral

A integração envia eventos logísticos (entrega, ocorrência, etc.) para a API da IBAC de forma assíncrona.

Fluxo:

```
Operação (conferência / baixa / monitoramento)
        │
        ▼
ibac_eventos_queue  (status=pendente)
        │
        ▼
Edge Function ibac-sync  (cron a cada 2 min)
        │
        ├─► IBAC API (POST evento)
        │
        ├─► ibac_log_envios  (auditoria de cada tentativa)
        │
        └─► ibac_alertas     (fila alta / taxa de erro)
```

Componentes:

| Componente | Função |
|---|---|
| `ibac_eventos_queue` | Fila de eventos a enviar |
| `ibac_de_para_eventos` | Mapeia evento_interno → codigo_ibac |
| `ibac_log_envios` | Log completo de cada tentativa (request/response) |
| `ibac_config_retry` | Política de retry (max_tentativas, backoff) |
| `ibac_config_alertas` | Limites para alertas automáticos |
| `ibac_alertas` | Alertas ativos não reconhecidos |
| Edge `ibac-sync` | Processa a fila e envia para a IBAC |
| Edge `ibac-backfill` | Enfileira eventos históricos para reenvio |
| Página `/integracao-ibac` | UI admin (Fila, Saúde, Alertas, Backfill, Retry) |

---

## 2. Configuração inicial (one-time)

### 2.1 Secrets obrigatórios

Em **Lovable Cloud → Secrets**, defina:

| Secret | Descrição | Quem fornece |
|---|---|---|
| `IBAC_API_URL` | Endpoint POST de eventos da IBAC | IBAC |
| `IBAC_API_KEY` | Bearer token de autenticação | IBAC |

> Enquanto não existirem, a edge function roda em modo "aguardando_configuracao" e a fila apenas acumula — sem perda.

### 2.2 De-para de eventos

Acesse `/integracao-ibac` → aba **De-Para** e preencha o `codigo_ibac` para cada `evento_interno` ativo. Eventos sem código mapeado vão direto para `status='erro'`.

### 2.3 Política de retry

Aba **Retry**:

- `max_tentativas`: padrão 5
- `backoff_base_segundos`: padrão 60s
- `backoff_max_segundos`: padrão 3600s (1h)
- `ativo`: liga/desliga backoff exponencial

Janelas resultantes (base=60s): 60s, 2min, 4min, 8min, 16min, ... até `max`.

### 2.4 Alertas

Aba **Alertas → Configuração**:

- `limite_pendentes`: dispara alerta se fila pendente ≥ N (padrão 100)
- `limite_erros_15min`: dispara alerta se ≥ N falhas em 15 min (padrão 10)
- `cooldown_minutos`: tempo mínimo entre alertas do mesmo tipo (padrão 30)

---

## 3. Homologação

Checklist antes de habilitar em produção:

1. [ ] IBAC forneceu URL + API Key de **homologação**
2. [ ] Secrets `IBAC_API_URL` / `IBAC_API_KEY` apontando para HOMOLOG
3. [ ] De-Para 100% preenchido para eventos ativos
4. [ ] Disparar 1 evento de cada tipo (conferência, baixa, etc.) e validar em `/integracao-ibac → Fila`
5. [ ] Verificar em `ibac_log_envios` que `response_status=200` e `sucesso=true`
6. [ ] IBAC confirma recebimento dos eventos de teste
7. [ ] Testar cenário de erro: revogar API Key temporariamente e validar retry + alerta
8. [ ] Validar reprocesso retroativo (aba **Retry** → janela 1 dia)

---

## 4. Go-live (produção)

1. [ ] IBAC entregou URL + Key de **produção**
2. [ ] Atualizar secrets `IBAC_API_URL` / `IBAC_API_KEY`
3. [ ] Confirmar cron `ibac-sync` agendado (a cada 2 min)
4. [ ] Validar primeiro batch real em **Saúde** (pendentes ↓, enviados ↑)
5. [ ] Monitorar **Alertas** nas primeiras 24h
6. [ ] Configurar política de retry conforme SLA acordado com a IBAC
7. [ ] Documentar contato técnico da IBAC (e-mail/telefone de plantão)

---

## 5. Operação diária

**Painel Saúde** mostra:
- Pendentes / Enviados / Erros (últimas 24h)
- Taxa de sucesso
- Tempo médio de envio
- Últimos erros

**Quando intervir:**

| Sinal | Ação |
|---|---|
| Pendentes crescendo > limite | Verificar se edge `ibac-sync` está rodando; checar logs |
| Taxa de erro > 10% | Inspecionar `ibac_log_envios` por padrão de erro |
| Alerta "erros_alta_taxa" repetindo | Provável indisponibilidade IBAC — abrir chamado |
| Evento específico em erro | Abrir detalhe (clicar na linha) → ver payload e response |

---

## 6. Troubleshooting

### 6.1 "aguardando_configuracao"
Secrets `IBAC_API_URL` ou `IBAC_API_KEY` não configurados. Defina em Cloud → Secrets.

### 6.2 Evento com erro "sem código IBAC mapeado"
Adicione/ative o evento na aba **De-Para**, depois use **Retry → Reprocessar** para reenfileirar.

### 6.3 HTTP 401/403
API Key inválida ou expirada. Solicitar nova à IBAC e atualizar secret.

### 6.4 HTTP 400 / 422
Payload rejeitado. Abrir detalhe do evento, copiar `request_body` e `response_body`, encaminhar à IBAC para análise de schema.

### 6.5 HTTP 5xx ou timeout
Indisponibilidade IBAC. O backoff exponencial cuida do reenvio automático até `max_tentativas`. Após esgotar, usar **Retry → Reprocessar retroativo** quando IBAC voltar.

### 6.6 Fila travada
1. Verificar logs da edge `ibac-sync` (Lovable Cloud → Functions)
2. Conferir se `ibac_config_retry.ativo = true`
3. Em último caso, executar manualmente: `curl -X POST <SUPABASE_URL>/functions/v1/ibac-sync`

### 6.7 Backfill histórico
Para popular eventos anteriores à integração:
- Aba **Backfill** → escolher janela de datas e tipo de evento → executar.
- Acompanhar progresso em **Fila** filtrando por `created_at`.

---

## 7. Contatos

| Papel | Contato |
|---|---|
| Owner técnico interno | _preencher_ |
| Contato IBAC (técnico) | _preencher_ |
| Contato IBAC (comercial) | _preencher_ |
| Plantão IBAC | _preencher_ |

---

## 8. Histórico de mudanças

| Data | Mudança | Responsável |
|---|---|---|
| 2026-05-27 | Versão inicial do runbook | — |
