## Objetivo

Todos os dias às **23:00 (horário do servidor / UTC-3 → cron 02:00 UTC)**, enviar para a IBAC as fotos de canhoto (`baixas_entrega.foto_path`) de NFs da **Cacau Show** que ainda não foram enviadas. Eventuais correções (qualidade ruim, NF divergente) continuam tratadas manualmente na Prestação de Contas — o cron não filtra por score.

Padrão de mercado adotado para idempotência: **coluna de timestamp de envio** + **dedupe na fila** + **status de erro com retry** (mesmo modelo do `ibac-sync` atual).

---

## 1. Schema (migration)

**`baixas_entrega`** — novas colunas:
- `imagem_ibac_enviada_em timestamptz` — preenchido quando a IBAC confirma recebimento (HTTP 2xx).
- `imagem_ibac_tentativas int default 0`
- `imagem_ibac_ultimo_erro text`
- `imagem_ibac_queue_id uuid` — referência à última entrada em `ibac_eventos_queue` (para auditoria).

Índice parcial para o cron varrer rápido:
```sql
CREATE INDEX idx_baixas_pendente_envio_imagem
  ON baixas_entrega (registrado_em)
  WHERE foto_path IS NOT NULL AND imagem_ibac_enviada_em IS NULL;
```

**`ibac_de_para_eventos`** — semear linha:
- `evento_interno = 'envio_canhoto'`, `codigo_ibac = NULL`, `ativo = true`, descrição "Envio de imagem do canhoto (assíncrono, separado do evento 1)".
> Fica sem código IBAC até a IBAC confirmar o endpoint/código. Enquanto isso, o `ibac-sync` já marca como erro "sem código mapeado" — comportamento conhecido, sem perda. Quando a IBAC responder, basta preencher o `codigo_ibac` e usar **Retry → Reprocessar**.

**`cnpj_envio_canhoto_auto`** — nova tabela de configuração (substitui hardcode "Cacau"):
- `cnpj text PK` (somente dígitos)
- `descricao text`
- `ativo boolean default true`
- Seed: CNPJ raiz Cacau Show `51825331` (matching por `LIKE '51825331%'`).
- Grants: `SELECT` para `authenticated`, `ALL` para `service_role`. RLS: admin gerencia.

---

## 2. Edge function `ibac-enfileirar-canhotos` (nova)

Roda **uma vez por execução** (chamada pelo cron). Não envia para a IBAC diretamente — apenas **enfileira** em `ibac_eventos_queue`. O `ibac-sync` (que já roda a cada 2 min) faz o POST real, respeitando retry/backoff/alertas existentes.

Lógica:
1. Lista CNPJs ativos em `cnpj_envio_canhoto_auto`.
2. Busca em lotes (`limit 500`) `baixas_entrega` onde:
   - `foto_path IS NOT NULL`
   - `imagem_ibac_enviada_em IS NULL`
   - `imagem_ibac_tentativas < 5` (cap de segurança; reset manual via UI)
   - `notas_fiscais.cnpj_destinatario` casa com algum CNPJ ativo
3. Para cada baixa:
   - Gera **signed URL** do `comprovantes` (validade 7 dias — IBAC consome assincronamente).
   - Monta payload com `nf_id`, `numero_nf`, `chave_acesso`, `cnpj_destinatario`, `recebedor_nome`, `registrado_em`, `validacao_status`, `foto_url`, `foto_path`.
   - Chama `fn_ibac_enqueue('envio_canhoto', nf_id, carga_id, baixa_id, chave_acesso, payload)` — só insere se o de-para estiver ativo (já é o comportamento da função).
   - Atualiza `baixas_entrega.imagem_ibac_queue_id = <novo id>`, incrementa `imagem_ibac_tentativas`.
4. Retorna `{ candidatos, enfileirados, sem_destinatario_mapeado, ja_enviadas_ignoradas }`.

`verify_jwt = false` (chamada via cron service-role). Usa `SERVICE_ROLE` no client.

---

## 3. Confirmação de envio (mudança no `ibac-sync`)

No bloco que atualiza `ibac_eventos_queue` após sucesso, adicionar: se `evento_interno = 'envio_canhoto'` e `sucesso = true`, fazer:
```sql
UPDATE baixas_entrega
   SET imagem_ibac_enviada_em = now(),
       imagem_ibac_ultimo_erro = NULL
 WHERE id = <baixa_id>;
```
Em erro terminal (`tentativas >= max`): gravar `imagem_ibac_ultimo_erro` na baixa para visibilidade.

---

## 4. Cron (pg_cron + pg_net)

```sql
SELECT cron.schedule(
  'ibac-enfileirar-canhotos-diario',
  '0 2 * * *',           -- 02:00 UTC = 23:00 BRT
  $$
  SELECT net.http_post(
    url := 'https://<projeto>.supabase.co/functions/v1/ibac-enfileirar-canhotos',
    headers := jsonb_build_object('Content-Type','application/json','apikey','<anon>'),
    body := '{}'::jsonb
  );
  $$
);
```
(Insertion via insert tool — não migration — por conter chave anon específica do projeto.)

---

## 5. UI — Painel IBAC (mínimo)

Em `/integracao-ibac`, adicionar aba **Canhotos**:
- KPIs: pendentes (foto sem envio), enviados últimos 7d, falhas com `imagem_ibac_ultimo_erro`.
- Botão **"Disparar agora"** chama a edge function manualmente.
- Sub-aba **CNPJs autorizados** (CRUD simples em `cnpj_envio_canhoto_auto`) — admin only.

---

## 6. Fora de escopo (deixar explícito)

- Não muda o fluxo do **evento 1** (entrega/ocorrência continua em tempo real via `fn_ibac_capturar_baixa`).
- Não muda a validação IA da Prestação de Contas — score continua sendo só sinal humano.
- Endpoint/contrato exato da IBAC para imagem fica pendente do retorno deles; estrutura já suporta sem mudança de código (basta preencher `codigo_ibac` no de-para).

---

## Detalhes técnicos

- Signed URL 7d para a IBAC ter folga em reprocesso. Bucket `comprovantes` permanece privado.
- Cap `imagem_ibac_tentativas < 5` evita laço se a foto sumir do storage.
- Cron 1x/dia + `ibac-sync` cada 2 min → janela máx de envio efetivo ≈ 2 min após 23h.
- Dedupe natural pela coluna `imagem_ibac_enviada_em` (NOT NULL = nunca reenfileirar).
