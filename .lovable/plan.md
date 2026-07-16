# Torre de Controle — Análise e Proposta

## 1. Diagnóstico do que existe hoje

**Fluxo atual (Monitoramento Rotas / Torre):**
- Operador clica em "Iniciar Monitoramento" → abre `IniciarDialog` com lista de veículos elegíveis (`veiculos.status ∈ {pendente, em_rota}` **da data selecionada**, sem prestação de contas, sem rota ativa já existente).
- Para cada placa, cria manualmente uma `monitoramento_rotas` (uma por vez ou "Iniciar Todos").
- A criação faz JOIN pesado: `veiculo_nfs → notas_fiscais → roteirizacao_paradas` para montar paradas e ordem.
- Torre de Controle (`/torre-controle`) só **exibe** rotas já criadas; ela não cria.

**Problemas reais confirmados no código:**
| # | Problema | Causa |
|---|---|---|
| 1 | "Iniciar Todos" é lento | Serial por veículo, cada um faz 3-4 queries + insert + insert de paradas |
| 2 | Placas na Torre ≠ placas da Roteirização | Torre lista `monitoramento_rotas` (só as já iniciadas); a Roteirização usa `veiculos` do dia. Só coincidem se alguém já apertou "Iniciar" |
| 3 | Operador precisa lembrar de iniciar | Fricção manual — se esquece, veículo some da Torre |
| 4 | Sem "seletor de placa" na visão macro | Torre já tem mapa geral, mas selecionar um veículo obriga sair para `/monitoramento-rotas` |
| 5 | Visualização "ruim" | Marcadores 🚛 iguais para todos, sem filtro por status/atraso/alerta, sem foco rápido em uma placa |

## 2. Comparando as três abordagens

### Sua sugestão
> Todo veículo da roteirização do dia já aparece pronto na Torre; operador só escolhe qual placa observar; visão macro com todos + mapa.

**Prós:** elimina fricção, alinha 1:1 com roteirização, é como funcionam torres de mercado (Cargo42, Trackage, Sascar).
**Contra:** se criar `monitoramento_rotas` para todos preventivamente, gera lixo quando o veículo não sai (feriado, quebra). Precisa de estado "aguardando".

### Sugestão anterior do Lovable
Manteve o modelo manual e apenas adicionou "Iniciar Todos" no diálogo.

**Contra:** não resolve raiz — continua sendo ação manual pontual, ainda cria N linhas em série, e a Torre continua descolada da Roteirização até alguém clicar.

### Prática de mercado (torres de controle logístico)
1. **Provisionamento automático**: assim que a roteirização é publicada, o veículo já "existe" na torre em estado *Aguardando saída*.
2. **Estados claros do ciclo**: `Aguardando → Em rota (com GPS) → Sem sinal → Em parada → Finalizada → Baixada`.
3. **Visão macro sempre-ligada**: mapa único com todos os caminhões, filtros (status, atraso, alertas, região), *cluster* quando muitos, ficha lateral ao clicar no ícone.
4. **Drill-down sem trocar de tela**: seleção de placa abre painel lateral com paradas/timeline/alertas — sem navegar.
5. **KPIs no topo**: em rota, sem sinal >X min, atrasados, concluídos, alertas abertos.

## 3. Proposta recomendada (híbrida)

Combina sua ideia + práticas de mercado, **sem** mexer em Roteirização, Cargas, Preparação, Baixa ou nos módulos operacionais.

### 3.1 Provisionamento automático (backend leve)
- Ao final da roteirização (quando o veículo tem paradas e `veiculos.data = hoje/amanhã`), criar `monitoramento_rotas` com **novo status `aguardando`** (adicionar ao enum atual `ativa|pausada|finalizada`).
- Implementação: **trigger** em `roteirizacao_paradas` após confirmação da roteirização, OU um botão único "Provisionar dia" na Torre que roda em lote via RPC (uma transação, não N inserts do frontend).
- Uma linha `aguardando` **não** dispara alertas, não conta como "sem sinal", não polui KPIs — só reserva o slot.
- Quando chega o primeiro ping GPS da placa → trigger promove `aguardando → ativa` automaticamente.

### 3.2 Torre de Controle repaginada (só frontend)
Layout em 3 zonas, tudo em uma tela:

```text
┌─ KPIs (Aguardando | Em rota | Sem sinal | Atrasadas | Alertas) ─┐
├─ Mapa grande (70% largura) ──────┬─ Painel lateral (30%) ───────┤
│  • Todos os veículos do dia      │  Sem seleção:                │
│  • Ícone colorido por status     │   • Lista compacta de placas │
│  • Badge com nº de alertas       │   • Busca por placa/motor.   │
│  • Cluster quando >20            │  Com placa selecionada:      │
│  • Clique → seleciona no painel  │   • Ficha + progresso        │
│                                  │   • Próximas paradas         │
│                                  │   • Últimos alertas          │
│                                  │   • Botão "Abrir detalhe"    │
└──────────────────────────────────┴──────────────────────────────┘
```

- Filtros rápidos acima do mapa: `Todos | Aguardando | Em rota | Sem sinal | Alertas`.
- Auto-refresh já existe (60 s) + realtime já ligado — mantido.
- Marcador do veículo selecionado destacado (borda, zoom, "voa" até ele).

### 3.3 O que muda no botão "Iniciar Monitoramento"
- **Renomeado** para "Provisionar dia" (ou desaparece se o trigger automático estiver ativo).
- Continua existindo como *fallback* manual para veículos que entraram fora do fluxo (roteirização tardia, avulso).
- Executa 1 RPC no banco em vez de N inserts — resolve a lentidão.

## 4. Comparativo final

| Critério | Hoje | "Iniciar Todos" do Lovable | Proposta híbrida |
|---|---|---|---|
| Placas Torre = Roteirização do dia | Não | Só após clicar | **Sim, automático** |
| Fricção do operador | Alta | Média | **Nenhuma** |
| Performance do bulk | Ruim (serial) | Ruim | **Boa (1 RPC)** |
| Seleção de placa sem trocar tela | Não | Não | **Sim (painel lateral)** |
| Alinhado com mercado | Não | Não | **Sim** |
| Risco em outros módulos | — | Baixo | Baixo (só adiciona status novo e trigger) |

## 5. Riscos e mitigações
- **Enum `status`**: adicionar `aguardando` é migration de 1 linha; não quebra código atual que já usa `ativa/pausada/finalizada` (novo valor só aparece onde a UI decidir mostrar).
- **Trigger de provisionamento**: idempotente (checar se já existe rota para o `veiculo_id` do dia antes de inserir).
- **Não mexer** em: Cargas (regra `status manual`), Preparação, Roteirização (algoritmo/UX), Baixa, Conferência, ERP Praxio, IBAC.

## 6. O que decidir antes de implementar
1. Provisionamento **automático via trigger** ou **botão "Provisionar dia"** manual?
2. Aceita adicionar o status `aguardando` ao enum, ou prefere um campo `provisionada boolean` separado?
3. O redesenho da Torre (mapa + painel lateral + filtros) substitui a página atual `/torre-controle`, ou vira uma nova rota (ex.: `/torre-controle-v2`) para rodar em paralelo?
4. Manter também a página `/monitoramento-rotas` (detalhe profundo) ou fundir tudo na Torre?

Responda esses 4 pontos e eu monto o plano de implementação detalhado.
