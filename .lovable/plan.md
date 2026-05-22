# Plano: Evolução para WMS Completo

Transformar o sistema atual (WMS leve baseado em NF) em um WMS de mercado, em **7 fases incrementais**. Cada fase entrega valor isolado e pode ir pra produção sem depender da próxima.

---

## Fase 1 — Cadastros Mestres (Embarcador + Destinatário)

**Objetivo:** sair da dependência da NF como fonte única. Ter cliente cadastrado antes de receber a primeira nota.

- Tabela `embarcadores`: CNPJ, razão social, nome fantasia, contato, SLA padrão (h), tabela de frete vinculada, centro de custo, observações operacionais, ativo.
- Tabela `destinatarios`: CNPJ/CPF, razão social, múltiplos endereços (tabela filha `destinatario_enderecos`), janela de entrega (dias semana + hora início/fim), restrições (altura veículo, agendamento obrigatório, exige escolta, etc), documentos exigidos no canhoto.
- Tela CRUD para ambos com busca, filtros, importação CSV.
- **Vínculo automático**: ao importar XML, casar `cnpj_emitente` → embarcador e `cnpj_destinatario` → destinatário. Se não existir, criar rascunho pra revisão.
- Auto-preencher janela de entrega e restrições no agendamento/roteirização.

---

## Fase 2 — Cadastro de Produto com Paletização

**Objetivo:** habilitar cubagem real, paletização e endereçamento por SKU. Sem isso o WMS continua "chutando" volume.

- Tabela `produtos`: código interno (SKU), `c_prod` do embarcador, EAN-13, DUN-14, descrição, embarcador_id, NCM, unidade base.
- **Dados físicos da caixa**: altura, largura, profundidade (cm), peso bruto, peso líquido (kg), volume m³ calculado.
- **Paletização**: caixas por lastro, lastros por pallet, total caixas por pallet, tipo de pallet (PBR/Chep/descartável), altura máxima empilhamento.
- **Atributos logísticos**: curva ABC, temperatura (seco/refrigerado/congelado), fragilidade, perecível (sim/não), validade controlada, lote controlado.
- Tela CRUD + importação Excel + foto do produto.
- **Vínculo automático**: cruzar `itens_nf.c_prod` + `cnpj_emitente` com `produtos`. Quando bater, usar volume/peso reais ao invés do estimado.
- Recalcular `calculateBoxes` opcionalmente usando paletização real (mantém regra atual como fallback).

---

## Fase 3 — Estrutura de Armazém (Endereçamento Hierárquico)

**Objetivo:** transformar `nf_enderecamento` (texto livre) em estrutura real de WMS.

- Tabelas: `armazens`, `ruas`, `colunas`, `niveis`, `posicoes`.
- Cada `posicao` tem: código (ex `A-01-03-B`), tipo (picking/pulmão/bloqueada/avaria), capacidade (pallets ou caixas), peso máx, altura máx, restrições (temperatura, embarcador exclusivo), status (livre/ocupada/bloqueada).
- Mapa visual 2D do armazém por rua.
- Migração: converter posições atuais (texto) em posições estruturadas.
- API de **sugestão de posição** baseada em curva ABC + peso + temperatura.

---

## Fase 4 — Recebimento (ASN + Putaway Dirigido)

**Objetivo:** processo formal de entrada da mercadoria no CD.

- Tabela `recebimentos`: nf_id, status (agendado/em conferência/conferido/divergente), conferente, hora início/fim.
- Tela mobile de conferência cega ou declarada (config por embarcador): bipa EAN/DUN → confirma quantidade.
- Registro de divergências (falta/sobra/avaria) com foto.
- **Putaway dirigido**: após conferir, sistema sugere posição (Fase 3) e mobile guia operador até a posição. Confirma com bipa da posição.
- Cross-docking: marca NF como "não estoca" → vai direto pra expedição.

---

## Fase 5 — Picking Dirigido (Onda de Separação)

**Objetivo:** separar cargas com produtividade e zero erro, usando endereço.

- Tabela `ondas_separacao`: agrupa cargas/rotas pra separação simultânea.
- Estratégias: por pedido, por onda (consolidado), por zona.
- Tela mobile guia separador na sequência ótima de posições (caminho mínimo).
- Bipa posição + bipa produto + confirma quantidade.
- **Reposição automática**: quando posição de picking fica abaixo do mínimo, gera tarefa de reposição do pulmão.
- Integra com etiquetas atuais (etiqueta sai já com posição de origem).

---

## Fase 6 — Inventário Rotativo

**Objetivo:** acuracidade contínua sem parar operação.

- Tabela `inventarios` + `inventario_contagens`.
- Geração automática de tarefas por curva ABC (A semanal, B quinzenal, C mensal).
- Tela mobile: bipa posição → conta → confirma. 2ª contagem cega se divergir.
- Ajuste com motivo + aprovação supervisor.
- Dashboard de acuracidade por rua/curva/operador.

---

## Fase 7 — KPIs / BI Operacional

**Objetivo:** dashboard executivo com indicadores de mercado.

- **OTIF** (On Time In Full) por embarcador e período
- **Acuracidade de inventário** %
- **Produtividade** caixas/hora por operador (recebimento, picking, conferência)
- **Ocupação de armazém** % por rua/zona
- **SLA de entrega** vs janela contratada
- **Taxa de divergência** recebimento / picking / canhoto
- **Tempo médio** de putaway, picking, conferência, carregamento
- Filtros: período, embarcador, operador, curva.
- Export Excel/PDF.

---

## Fora de escopo (futuro)

- Faturamento logístico (tabela de preços por embarcador, fatura mensal de armazenagem + movimentação + entrega)
- Logística reversa (devolução, troca)
- EDI/integrações com marketplace e transportadoras externas
- Picking por voz / pick-to-light (hardware específico)

---

## Ordem sugerida de execução

```text
Fase 1 (Cadastros)  ──┐
Fase 2 (Produto)    ──┼─► destrava cubagem real
Fase 3 (Endereço)   ──┘
        │
        ▼
Fase 4 (Recebimento + Putaway)
        │
        ▼
Fase 5 (Picking dirigido)
        │
        ▼
Fase 6 (Inventário)
        │
        ▼
Fase 7 (KPIs)
```

**Estimativa por fase:** ~80–150 créditos cada (Fase 1 e 2 são as menores; Fase 4 e 5 as maiores por envolverem mobile + workflow).

---

## Decisões pendentes pra você

1. **Começar por qual fase?** Recomendo Fase 1 (Embarcador + Destinatário) — é a base e é a mais rápida.
2. **Migração dos dados atuais?** Auto-criar embarcador/destinatário/produto a partir das NFs já importadas, ou começar do zero?
3. **Multi-embarcador no mesmo CD?** Vai operar mais de um cliente no mesmo armazém (3PL real) ou é monoempresa?
