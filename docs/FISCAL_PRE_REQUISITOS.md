# TMS Fiscal — Pré-requisitos por Etapa

Documento de checklist para destravar cada fase do projeto de emissão fiscal (CT-e + MDF-e). Cada item marcado como:
- **[BLOQUEANTE]** — sem isso a fase não começa.
- **[PARALELO]** — pode ser feito enquanto a fase anterior roda.
- **[INTERNO]** — resolvemos aqui no Lovable / código.
- **[EXTERNO]** — depende do cliente, contador ou fornecedor.

---

## Fase 0 — Fundação Fiscal (antes de escrever qualquer código)

Objetivo: garantir que temos identidade fiscal, emissor homologado e regras claras.

- [BLOQUEANTE][EXTERNO] **Certificado Digital A1** (PFX + senha) do CNPJ emitente. A1 (arquivo), não A3 (token) — precisa rodar em servidor.
- [BLOQUEANTE][EXTERNO] **Definição do emissor / API fiscal**:
  - Opções: PlugNotas (recomendado), Focus NFe, Migrate, TecnoSpeed.
  - Necessário: contrato assinado, credenciais de **homologação** + **produção**, ambiente de sandbox liberado.
- [BLOQUEANTE][EXTERNO] **Contador responsável** com quem alinhar:
  - Regime tributário do emitente (Simples / Lucro Presumido / Lucro Real).
  - CST/CSOSN padrão de serviço de transporte.
  - CFOPs autorizados (5.351/5.352/5.353/5.359/6.351 etc.).
  - Município e código IBGE do emitente.
  - Inscrição Estadual (IE) do emitente + IE de Substituto Tributário se aplicável.
  - Alíquotas de ICMS por UF de destino.
- [BLOQUEANTE][EXTERNO] **Cadastro na SEFAZ** para emissão de CT-e e MDF-e (autorização já ativa).
- [PARALELO][EXTERNO] **Série e numeração inicial** do CT-e e do MDF-e (definir com contador; normalmente série 1, número 1 em homologação).
- [PARALELO][EXTERNO] **Tomador padrão** definido (quem paga o frete por default — embarcador, destinatário ou terceiro?).
- [INTERNO] Criar `docs/FISCAL_RUNBOOK.md` com todos esses valores centralizados.

---

## Fase 1 — Cadastros Fiscais (embarcadores / destinatários / emitente)

Objetivo: completar cadastros mestres com campos fiscais obrigatórios.

- [BLOQUEANTE][EXTERNO] **Lista atualizada de IE / IE ST / regime tributário** de todos os embarcadores e destinatários ativos (planilha do cliente).
- [BLOQUEANTE][EXTERNO] Confirmação de quais destinatários são **contribuintes de ICMS**, **não contribuintes** ou **isentos**.
- [PARALELO][EXTERNO] Lista de CNPJs que devem ser tratados como **órgão público** (impacta CST).
- [INTERNO] Migration para adicionar colunas em `embarcadores` e `destinatarios`: `ie`, `ie_st`, `regime_tributario`, `indicador_ie`, `suframa` (opcional).
- [INTERNO] Nova tabela `configuracao_fiscal_emitente` (uma linha por CNPJ emitente) — série CT-e, série MDF-e, próximo número, ambiente (homolog/prod), tomador padrão, RNTRC.
- [INTERNO] Tela `/fiscal/configuracao` (admin) para editar essa configuração sem migration.

---

## Fase 2 — Tabelas de Frete

Objetivo: calcular valor do frete e componentes antes de emitir CT-e.

- [BLOQUEANTE][EXTERNO] **Tabelas de frete negociadas** por embarcador ou por rota (planilha Excel do comercial):
  - Por peso, por valor da mercadoria, por m³, por CTRC.
  - Componentes: GRIS (%), TAS (fixo), TDE (taxa de entrega), pedágio, ad valorem.
- [BLOQUEANTE][EXTERNO] Regras de **piso mínimo ANTT** vigente (tabela oficial atualizada).
- [PARALELO][EXTERNO] Definição de **quem pega qual tabela** — por embarcador, por UF destino, por tipo de veículo.
- [INTERNO] Tabelas: `tabelas_frete` + `componentes_frete` + `tabelas_frete_vigencia`.
- [INTERNO] Simulador na tela de Preparação: mostra valor calculado antes de fechar carga.

---

## Fase 3 — Integração com Emissor (PlugNotas ou equivalente)

Objetivo: infra de comunicação com a API fiscal.

- [BLOQUEANTE][EXTERNO] Credenciais **homologação** entregues (X-API-KEY, empresa cadastrada no painel do emissor, certificado A1 carregado lá).
- [BLOQUEANTE][EXTERNO] Documentação da API (webhook de retorno, endpoints de emissão/cancelamento/CC-e).
- [BLOQUEANTE][INTERNO] Secret no Lovable: `PLUGNOTAS_API_KEY_HOMOLOG` e `PLUGNOTAS_API_KEY_PROD`.
- [INTERNO] Edge functions: `emitir-cte`, `cancelar-cte`, `cce-cte`, `emitir-mdfe`, `encerrar-mdfe`, `incluir-condutor-mdfe`, `webhook-fiscal`.
- [INTERNO] Tabelas: `ctes_emitidos`, `mdfes_emitidos`, `eventos_fiscais`, `fila_emissao_fiscal` (com retry/backoff igual `ibac_eventos_queue`).
- [INTERNO] Painel `/fiscal/monitor` com status por documento.

---

## Fase 4 — Emissão de CT-e por Carga

Objetivo: gerar CT-e a partir das NFs já conferidas.

- [BLOQUEANTE][EXTERNO] **Fase 1, 2 e 3 concluídas.**
- [BLOQUEANTE][EXTERNO] Confirmação do contador sobre **agrupamento de NFs em CT-e**: 1 CT-e por NF, 1 por destinatário/dia, ou 1 por carga.
- [PARALELO][EXTERNO] Layout do **DACTE** aprovado (logo, dados do emitente, observações padrão).
- [INTERNO] Botão "Emitir CT-e" na tela de Cargas / Preparação.
- [INTERNO] Geração de DACTE em PDF (PlugNotas retorna URL, salvamos no storage).
- [INTERNO] Fluxo de cancelamento (janela 7 dias) e CC-e (Carta de Correção).

---

## Fase 5 — MDF-e por Veículo/Viagem

Objetivo: manifesto eletrônico ao fechar carga com placa + motorista.

- [BLOQUEANTE][EXTERNO] **Fase 4 concluída** (MDF-e referencia CT-es já emitidos).
- [BLOQUEANTE][EXTERNO] **RNTRC ativo** do transportador e de cada motorista (validar na ANTT).
- [BLOQUEANTE][EXTERNO] Cadastro completo dos **veículos**: placa, RENAVAM, tara, capacidade (kg/m³), tipo de rodado, tipo de carroceria, UF.
- [BLOQUEANTE][EXTERNO] Cadastro completo dos **motoristas**: CPF, nome, CNH (opcional mas recomendado).
- [PARALELO][EXTERNO] Definição de rota padrão (UFs percorridas) — hoje temos apenas UF origem/destino.
- [INTERNO] Migration para completar tabelas `veiculos` e `motoristas` com campos faltantes.
- [INTERNO] Trigger: ao mudar status da carga para "EM ROTA", enfileira MDF-e.
- [INTERNO] DAMDFe disponível no APK do motorista (offline).

---

## Fase 6 — Contingência e Monitoramento Fiscal

Objetivo: operar em produção com segurança.

- [PARALELO][EXTERNO] Definição de quem recebe **alerta de rejeição SEFAZ** (e-mail/WhatsApp do fiscal).
- [PARALELO][EXTERNO] Procedimento com contador para **SPED Fiscal / EFD** mensal.
- [INTERNO] Painel `/fiscal` com KPIs (autorizados, rejeitados, pendentes, cancelados últimos 30d).
- [INTERNO] Botão de reprocesso manual por documento.
- [INTERNO] Export SPED / relatório mensal.
- [INTERNO] Conferência CT-e emitido × CT-e recebido (já temos tela `PreCte.tsx` — reaproveitar).

---

## Fase 7 — Cutover com Praxio

Objetivo: substituir o Praxio sem perder faturamento.

- [BLOQUEANTE][EXTERNO] Cliente aprovar **período de operação paralela** (30–60 dias sugerido).
- [BLOQUEANTE][EXTERNO] Contador validar CT-es emitidos pelo Lovable **em homologação** antes de virar chave.
- [BLOQUEANTE][EXTERNO] Comunicação formal com embarcadores sobre mudança de emissor (número de série muda).
- [PARALELO][INTERNO] Congelar integração de saída Praxio, manter só recebimento de retorno (canhoto/status).
- [INTERNO] Migration final: desligar `push_praxio` para status já cobertos pelo fiscal próprio.

---

## Resumo do que precisamos AGORA para começar Fase 1

Ordem prática de captura junto ao cliente/contador:

1. **Certificado A1** (arquivo .pfx + senha).
2. **Contrato PlugNotas** (ou decisão de emissor alternativo).
3. **Contador definido** e disponível para 2–3 reuniões.
4. **Planilha atualizada** de IE / regime tributário de embarcadores e destinatários.
5. **Tabela de frete vigente** de pelo menos 1 embarcador piloto (ex.: Cacau Show).
6. **Definição do CNPJ emitente piloto** (se houver mais de um, escolher um).

Com esses 6 itens em mãos, a Fase 1 pode arrancar no mesmo dia.
