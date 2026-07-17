## Diagnóstico

O Dashboard atual foi feito quando o sistema era só recebimento de XML + etiquetas. Hoje o Orkestria é um TMS/3PL completo com Roteirização, Torre de Controle, GPS, Baixas com POD, Agendamento, IBAC, Prefatura e Cadastros mestres. As 4 métricas atuais (Cargas Abertas, NFs, Etiquetas Pendentes, Conferidas) não refletem o que um operador/gestor precisa ver ao abrir o sistema.

## Princípios de design

- **Foco em "o que exige ação agora"** (alertas, filas presas, entregas do dia) em vez de contadores históricos.
- **Estrutura por macrofase do fluxo**, espelhando a operação real: Recebimento → Preparação → Rota → Entrega → Integração.
- **Hoje vs. Estoque**: separa métricas do dia (fluxo) das métricas acumuladas (estoque de trabalho).
- **Drill-down**: cada card leva à tela operacional correspondente.

## Nova estrutura

### 1. Faixa de saúde do sistema (topo, condicional)
Só aparece quando há problema. Banner âmbar/vermelho com:
- Alertas de monitoramento não lidos (`alertas_monitoramento.lido = false`)
- IBAC fila com erro (`ibac_eventos_queue.status = 'erro'`)
- Baixas com validação IA reprovada últimas 24h

### 2. Operação do dia (4 cards principais)
Substitui a grade atual:

| Card | Métrica principal | Subtexto | Link |
|---|---|---|---|
| **Entregas de hoje** | Entregues / Total planejado (baixas_entrega + monitoramento_paradas hoje) | X ocorrências | `/torre-controle` |
| **Rotas em campo** | Rotas ativas | Y paradas pendentes · Z veículos | `/monitoramento` |
| **Agendamentos hoje** | agendamentos data=hoje | Confirmados vs. pendentes | `/agendamento` |
| **NFs recebidas hoje** | notas_fiscais created_at=hoje | + cargas abertas em preparação | `/cargas` |

### 3. Funil operacional (card único horizontal)
Barra de progresso segmentada mostrando onde estão as NFs do dia:
`Recebida → Conferida → Em rota → Entregue`
Com contagem em cada etapa. Ajuda a identificar gargalos.

### 4. Alertas & Integrações (2 cards)
- **Torre de Controle**: alertas não lidos por tipo (atraso, fora de rota, geofence)
- **IBAC**: fila pendente + últimos erros + taxa de sucesso 24h

### 5. Ações rápidas (grid compacto no rodapé)
Mantém como está mas expande para 6 atalhos alinhados aos perfis:
Nova Carga · Roteirizar · Torre · Baixas Pendentes · Relatório do Dia · Cadastros

## Escopo técnico

- Reescrever `src/pages/Dashboard.tsx` mantendo `MainLayout`.
- Criar um único RPC ou 1 query paralela consolidada (`Promise.all`) para buscar todas as métricas em uma passada — evita 8+ round-trips.
- Auto-refresh a cada 60s via `useQuery` com `refetchInterval` (trocar `useEffect` por React Query, já usado no resto do app).
- Componentes reutilizáveis novos em `src/components/dashboard/`: `KpiCard`, `HealthBanner`, `FunilOperacional`, `AlertasResumo`, `IbacResumo`.
- Sem mudanças de schema, sem novas edge functions.
- Respeitar tokens semânticos (`text-success`, `text-destructive`, `bg-warning/10`, etc.) — nada hardcoded.
- Mobile continua sendo redirecionado pelo `MobileRedirect` (não afeta motorista).

## Fora de escopo

- Gráficos históricos (linha do tempo de entregas dos últimos 7 dias) — proposta para v2 se o gestor pedir análise.
- Personalização por usuário/perfil.
- Widgets de prefatura/financeiro — merecem tela própria.

## Prévia visual (ASCII)

```text
┌─ [banner vermelho só se algo pegando fogo] ────────────────┐

┌─ Entregas hoje ─┬─ Rotas em campo ─┬─ Agendam. hoje ─┬─ NFs hoje ─┐
│  42/60          │  8 ativas         │  60             │  0        │
│  3 ocorrências  │  12 paradas pend. │  55 confirm.    │  325 abt. │
└─────────────────┴───────────────────┴─────────────────┴───────────┘

┌─ Funil do dia ──────────────────────────────────────────────┐
│  Recebida ▓▓▓▓▓ 120  →  Conferida ▓▓▓ 80  →  Rota ▓▓ 60    │
│  →  Entregue ▓ 42                                            │
└──────────────────────────────────────────────────────────────┘

┌─ Alertas Torre ────────┬─ IBAC ────────────────────┐
│  585 não lidos          │  Fila: 0  Erros: 0        │
│  • atraso: 320          │  Sucesso 24h: 98%         │
│  • geofence: 180        │                            │
└─────────────────────────┴────────────────────────────┘

┌─ Ações: Nova Carga · Roteirizar · Torre · Baixas · Rel · Cad ┐
```

Ao aprovar, implemento direto. Sem migrações, sem quebrar rotas existentes.