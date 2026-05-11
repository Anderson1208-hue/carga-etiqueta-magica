# Plano Técnico — Conciliação de Pré-Fatura do Cliente

## 1. Princípio central

O sistema confronta **3 fontes de verdade**:

```text
   ┌──────────────────────┐      ┌──────────────────────────┐
   │ XML da NF (oficial   │      │ CT-e / Minuta (oficial   │
   │ fiscal)              │      │ operacional/transporte)  │
   └─────────┬────────────┘      └────────────┬─────────────┘
             │                                │
             └──────────┬─────────────────────┘
                        ▼
           "Verdade Expresso Ebenezer"
                        ▲
                        │  (confronta)
                        │
             ┌──────────┴───────────┐
             │ Pré-fatura do cliente│
             │ (a ser conferida)    │
             └──────────────────────┘
```

A pré-fatura **nunca** sobrescreve dado interno. Ela é apenas comparada.

---

## 2. Quais dados vêm de cada fonte

### 2.1 Do XML da NF (fonte fiscal oficial)
Já existe no parser (`src/lib/xml-parser.ts`) e/ou pode ser extraído sem retrabalho:

| Campo | Origem no XML | Já salvo hoje? |
|---|---|---|
| chave_acesso (44 dígitos) | `infNFe/@Id` | Sim |
| numero_nf | `ide/nNF` | Sim |
| **serie** | `ide/serie` | **Não — adicionar** |
| cnpj_emitente | `emit/CNPJ` | Sim |
| razao_social_emitente | `emit/xNome` | Sim |
| cnpj_destinatario | `dest/CNPJ` | Sim |
| dest_razao_social, endereço completo | `dest/...` | Sim |
| **valor_nf (vNF)** | `total/ICMSTot/vNF` | **Não — adicionar** |
| peso_bruto / peso_liquido | `transp/vol/pesoB/pesoL` | Sim |
| volume_m3 | `transp/vol` | Sim |
| qtd_volumes | `transp/vol/qVol` | Parcial — verificar |
| data_emissao | `ide/dhEmi` | Sim |
| itens (cProd, qCom, vProd) | `det/prod/...` | Sim em `itens_nf`, **adicionar `valor_unit` e `valor_total`** se necessário |

### 2.2 Do CT-e / Minuta (fonte operacional oficial)
Já existe na tabela `ctes`:

| Campo | Uso na conciliação |
|---|---|
| numero_cte / numero_minuta | Número do documento de transporte que aparece na pré-fatura |
| chave_cte (ou identificador interno MIN-...) | Match alternativo |
| chave_nf_referenciada | Vínculo NF↔CT-e |
| **valor_frete** | Comparado com valor de frete da pré-fatura |
| data_emissao | Comparado com data da pré-fatura |
| carga_id | Agrupamento operacional |
| tipo_documento (CTE/MINUTA) | Exibição |

Nada novo a persistir aqui.

### 2.3 Da Pré-fatura do cliente (a ser conferida)
Vem em planilha/arquivo enviado pelo cliente. Cada linha traz tipicamente:
- chave de acesso da NF (ou número + série + CNPJ emitente)
- número do documento de transporte (CT-e / minuta) que o cliente reconheceu
- valor da NF segundo o cliente
- valor do frete segundo o cliente
- peso, volumes, data, observações
- referência interna do cliente (nº pedido, OC, fatura)

Esses dados vão para tabelas novas (`prefaturas` / `prefatura_itens`) **sem alterar nada do sistema operacional**.

---

## 3. Campos a persistir em `notas_fiscais`

Adicionar **2 colunas** (nada mais):

```sql
ALTER TABLE public.notas_fiscais
  ADD COLUMN serie text,
  ADD COLUMN valor_nf numeric(14,2);
```

E uma migração de **backfill**: reler XMLs já importados (quando arquivo ainda existir) **OU** aceitar que NFs antigas terão `valor_nf` NULL até serem reimportadas. Para todo XML novo, o parser passa a popular automaticamente.

Opcional (recomendado quando a conciliação fina por item for ativada):
```sql
ALTER TABLE public.itens_nf
  ADD COLUMN v_un_com numeric(14,4),
  ADD COLUMN v_prod numeric(14,2);
```

Sem mais alterações em tabelas existentes.

---

## 4. Tabelas novas para conciliação

### 4.1 `prefaturas` — cabeçalho do arquivo recebido
```text
id, cliente_cnpj, cliente_nome, periodo_inicio, periodo_fim,
numero_prefatura_cliente, data_recebimento, arquivo_origem_nome,
import_batch_id (UNIQUE), total_itens, total_valor_nf_cliente,
total_valor_frete_cliente, status (importada|conciliando|conciliada|fechada),
criado_por, created_at, updated_at
```

### 4.2 `prefatura_itens` — linhas da pré-fatura (dados crus do cliente, **imutáveis**)
```text
id, prefatura_id, linha_arquivo (int),
chave_acesso_cliente, numero_nf_cliente, serie_cliente,
cnpj_emitente_cliente, cnpj_destinatario_cliente,
documento_transporte_cliente (texto - nº CT-e/minuta no arquivo),
valor_nf_cliente, valor_frete_cliente,
peso_cliente, volumes_cliente, data_emissao_cliente,
referencia_interna_cliente, raw_jsonb (linha original completa)
```

### 4.3 `prefatura_conciliacao` — resultado por item (1:1 com `prefatura_itens`)
```text
id, prefatura_item_id (UNIQUE),
nf_id (FK lógico -> notas_fiscais), cte_id (FK lógico -> ctes),
matched_by ('chave_acesso' | 'numero_serie_cnpj' | 'numero' | 'manual' | 'sem_match'),
status_conciliacao ('ok' | 'divergente' | 'sem_nf' | 'sem_cte' | 'duplicado_pre' | 'manual_ok'),
divergencias jsonb,  -- {valor_nf:{esperado,recebido,diff}, frete:{...}, peso:{...}, volumes:{...}}
tolerancia_aplicada jsonb,
conferido_por, conferido_em, observacao_manual,
created_at, updated_at
```

`divergencias` é jsonb estruturado para não exigir colunas novas a cada novo critério.

### 4.4 `prefatura_auditoria` — log de ações
```text
id, prefatura_id, prefatura_item_id (null), acao
('importacao'|'reprocessamento'|'aceite_manual'|'rejeicao'|'export_retorno'),
detalhes jsonb, user_id, user_email, created_at
```

### 4.5 `prefatura_tolerancias` (opcional, 1 linha por cliente)
Tolerância configurável (ex.: ±R$ 0,02 valor, ±0,1 kg peso, ±1% frete).

**Total: 4 tabelas obrigatórias + 1 opcional. Tudo aditivo.**

---

## 5. Estratégia de match (cascata)

Para cada `prefatura_item`:

```text
1) chave_acesso_cliente == notas_fiscais.chave_acesso  → match forte
2) (numero_nf + serie + cnpj_emitente) == NF interna   → match médio
3) numero_nf isolado (com aviso de risco)              → match fraco
4) sem_match                                           → exige tratamento manual
```

Após achar a NF: localizar CT-e/minuta via `ctes.chave_nf_referenciada` ou `ctes.nf_id`. Se a pré-fatura traz `documento_transporte_cliente`, comparar com `numero_cte` para validar que cliente e Expresso falam do mesmo documento.

Comparar então:
- `valor_nf_cliente` × `notas_fiscais.valor_nf` (do XML)
- `valor_frete_cliente` × `ctes.valor_frete`
- `peso_cliente` × `notas_fiscais.peso_bruto`
- `volumes_cliente` × volumes do XML
- `data_emissao_cliente` × `notas_fiscais.data_emissao`

Cada divergência fora da tolerância vira entrada no jsonb `divergencias`.

---

## 6. Arquivo de retorno (semelhante ao Praxio)

### 6.1 Estrutura padrão (gerada pelo nosso sistema)
Um único export, formato a definir com cliente. Sugestão default — Excel com 3 abas + TXT espelho:

**Aba 1 — Conciliados (status=ok)**
`chave_acesso | numero_nf | serie | cnpj_emit | cte_numero | valor_nf_xml | valor_frete_cte | peso | volumes | data_emissao | status=OK`

**Aba 2 — Divergências**
Mesmas colunas + `campo_divergente | valor_cliente | valor_expresso | diferenca | motivo`

**Aba 3 — Resumo**
Totais por status, totais financeiros (cliente vs Expresso), %.

**TXT (layout posicional, similar ao Praxio)** — pode ser implementado como writer dedicado lendo o mesmo dataset, com cabeçalho/detalhe/trailer de tamanho fixo. Layout exato deverá ser fornecido pelo cliente ou copiado do retorno Praxio atual.

### 6.2 Geração
- Botão "Gerar retorno" na tela de conciliação.
- Lê `prefatura_conciliacao + prefatura_itens + notas_fiscais + ctes`.
- Sempre baseado nos **dados do nosso sistema** (XML+CT-e), não nos do cliente — é exatamente esse o ponto.
- Versiona arquivo gerado em `prefatura_auditoria` (acao='export_retorno').

---

## 7. Reprocessamento

Reprocessar uma pré-fatura = **apagar `prefatura_conciliacao`** dessa pré-fatura e rodar o match novamente.
`prefatura_itens` (dados do cliente) são **imutáveis** — nunca recriados.
Útil quando: NF nova é importada depois, CT-e foi vinculado depois, tolerância mudou, valor de frete corrigido.

---

## 8. Tela de conferência (resumo, sem implementar)

Rota `/conciliacao`:
- Lista pré-faturas (cliente, período, totais, status, % conciliação).
- Detalhe: filtros (status, divergência por campo, sem CT-e, sem NF), tabela de itens com cores por status, drawer com comparação lado a lado (Cliente | Expresso XML+CT-e | Diferença).
- Ações por item: aceitar manualmente, rejeitar, anexar observação.
- Botões globais: reprocessar, exportar retorno, fechar pré-fatura.

---

## 9. Impacto em código existente

| Área | Impacto |
|---|---|
| `xml-parser.ts` | Adicionar extração de `serie` e `vNF` (e opcionalmente `vProd`/`vUnCom` por item). Baixo risco. |
| `notas_fiscais` (tabela) | +2 colunas nullable. Sem efeito em queries existentes. |
| RPC `adicionar_nfs_carga` | Aceitar e gravar `serie` e `valor_nf`. |
| `itens_nf` (tabela) | +2 colunas opcionais (apenas se conciliação por item entrar). |
| `ctes` | Nenhuma alteração. |
| `cargas` | Nenhuma alteração. |
| Operação (Preparação, Roteirização, Conferência, Monitoramento) | **Zero impacto.** Módulo é puramente aditivo. |

---

## 10. Riscos e premissas

1. **NFs antigas** (anteriores à migration) ficarão sem `valor_nf`/`serie` até reimportar XML. Solução: aceitar NULL e exibir "sem dado fiscal" na conciliação até que NF seja reimportada.
2. **Layout da pré-fatura varia por cliente** — parser por cliente (ou template Excel padronizado).
3. **Layout do TXT de retorno** precisa ser definido junto com cliente (ou capturado de exemplo Praxio).
4. **Tolerância** deve ser configurável por cliente; default conservador (R$ 0,01).
5. **Duplicidade de pré-fatura** evitada por `import_batch_id UNIQUE`.
6. **Encoding** de arquivos do cliente (Latin-1/UTF-8) tratado na importação.
7. **NFs sem CT-e/minuta** vinculado: sinalizar como `sem_cte`, não como divergência financeira.
8. **A "verdade" é sempre Expresso** (XML + CT-e). Pré-fatura nunca grava em `notas_fiscais` ou `ctes`.

---

## 11. Fora do escopo desta análise

- Cálculo de frete / tabela de frete.
- Emissão de documento fiscal a partir da conciliação.
- Importar arquivo de retorno do Praxio (objetivo é justamente substituir).
- Integração ativa com Praxio.

---

## 12. Resumo

- **2 colunas novas** em `notas_fiscais` (serie, valor_nf), populadas pelo parser do XML.
- **2 colunas opcionais** em `itens_nf` (caso conciliação por item).
- **4 tabelas novas** para o módulo de conciliação.
- **1 RPC** de match + reprocessamento.
- **1 módulo de UI** isolado em `/conciliacao`.
- **0 alteração** no fluxo operacional atual.

Aguardando OK para detalhar implementação (parser, migration, RPC, UI) em fases.
