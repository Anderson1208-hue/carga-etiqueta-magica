# Plano de Implementação — Torre de Controle Unificada

Baseado nas suas 4 respostas:
1. Criar rotas na Torre **automaticamente**.
2. Liberar **todos os veículos** da roteirização do dia (o que não sair some junto com a roteirização).
3. **Substituir** a Torre atual (`/torre-controle`).
4. **Opção B** — juntar tudo em uma tela (Torre + detalhe da rota).

Nada muda em Cargas, Preparação, Roteirização, Baixa, Conferência, IBAC, ERP.

---

## 1. Backend (mínimo necessário)

### 1.1 Novo status `aguardando`
Migration:
- `ALTER TYPE` do enum de `monitoramento_rotas.status` adicionando `aguardando`.
- Valor só aparece para rotas provisionadas que ainda não receberam ping GPS.
- Não dispara alerta, não conta como "sem sinal", não vira "atraso".

### 1.2 Provisionamento automático
Trigger em `roteirizacao_paradas` (AFTER INSERT/UPDATE):
- Quando um veículo tem paradas confirmadas para uma data, cria 1 linha em `monitoramento_rotas` com `status='aguardando'`, copiando placa, motorista, paradas e ordem — **idempotente** (checa se já existe rota para `veiculo_id + data`).
- Ao chegar o primeiro `posicoes_gps` da placa → trigger promove `aguardando → ativa`.
- Se a roteirização for desfeita/veículo removido → rota `aguardando` correspondente é apagada (não afeta `ativa`/`finalizada`).

### 1.3 RPC de fallback manual
`provisionar_torre_dia(data)` — 1 transação que roda o mesmo provisionamento em lote, caso o trigger falhe ou o operador queira forçar.

---

## 2. Frontend — Torre Unificada (`/torre-controle`)

Substitui a tela atual. Layout em 3 zonas fixas:

```text
┌─ KPIs: Aguardando | Em rota | Sem sinal | Atrasadas | Alertas ─┐
├─ Filtros: [Todos][Aguardando][Em rota][Sem sinal][Alertas] 🔍 ─┤
├─ Mapa (65%) ─────────────────┬─ Painel lateral (35%) ─────────┤
│  Todos os veículos do dia    │ SEM seleção:                   │
│  Ícone colorido por status   │  Lista compacta (placa/status/ │
│  Badge de alertas            │  progresso/alertas)            │
│  Cluster >20                 │ COM seleção (Opção B):         │
│  Clique → seleciona          │  Tabs: Paradas | Alertas |     │
│                              │        Auditoria | Ações       │
│                              │  Reaproveita componentes já    │
│                              │  existentes de /monitoramento- │
│                              │  rotas (ParadasTable,          │
│                              │  AlertasPanel, RotaDetail-     │
│                              │  Header, AuditoriaPercurso)    │
└──────────────────────────────┴────────────────────────────────┘
```

- Realtime + auto-refresh 60s (já existe).
- Seletor de data no topo (já existe).
- Botão "Provisionar dia" (fallback) — chama a RPC.
- `/monitoramento-rotas` é **removido do menu** mas mantido acessível por link direto por 1-2 semanas para rollback rápido, depois deletado.

---

## 3. Performance (Opção B exige cuidado)

Para o painel lateral não travar quando o operador clicar em placas rápido:
- Componentes das abas são **lazy** (`React.lazy`) — só carregam quando a aba é aberta.
- Dados da rota selecionada em query separada com `staleTime: 30s`.
- Mapa não re-renderiza ao trocar de placa (só destaca o marcador).

---

## 4. Ordem de entrega (2 passos)

**Passo 1 — Backend + provisionamento** (1 migration)
- Adiciona enum `aguardando`, trigger de provisionamento, trigger de promoção por GPS, RPC de fallback.
- Torre atual continua funcionando: já vai começar a mostrar as rotas `aguardando` automaticamente.

**Passo 2 — Torre unificada** (frontend)
- Nova UI substitui `TorreControle.tsx`.
- Painel lateral com abas reaproveita componentes de `MonitoramentoRotas.tsx`.
- Remove link do menu para `/monitoramento-rotas`.

---

## 5. Riscos e mitigações
- **Enum novo**: só adiciona valor, código atual não quebra.
- **Trigger idempotente**: reexecuções não duplicam rotas.
- **Rollback rápido**: `/monitoramento-rotas` fica acessível 1-2 semanas.
- **Não toca em**: Cargas (status manual), Roteirização, Preparação, Baixa, IBAC, Praxio.

---

## 6. Detalhes técnicos (para referência)
- Enum: `ALTER TYPE monitoramento_status_enum ADD VALUE 'aguardando';`
- Trigger `provisionar_rota_torre()` em `roteirizacao_paradas` verificando `EXISTS` antes do INSERT.
- Trigger `promover_rota_ativa()` em `posicoes_gps` (`UPDATE ... WHERE status='aguardando'`).
- Painel lateral: `<Tabs>` do shadcn com `TabsContent` envolvendo `<Suspense>` + `React.lazy`.
- Marcador destacado: prop `selectedRotaId` no `<MapaGeral>` — troca `iconSize` e adiciona borda no ícone selecionado.

Confirma este plano para eu começar pelo Passo 1 (backend + provisionamento)?
