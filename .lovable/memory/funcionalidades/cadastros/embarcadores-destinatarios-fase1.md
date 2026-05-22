---
name: Cadastros Fase 1 (Embarcadores + Destinatários)
description: Tabelas mestres 3PL. Trigger fn_auto_link_cadastros_nf cria rascunhos automaticamente em cada INSERT em notas_fiscais.
type: feature
---

# Fase 1 — Cadastros Mestres (3PL)

**Modelo:** multi-embarcador. Mesmo CD opera para vários clientes.

## Tabelas
- `embarcadores` (cnpj UNIQUE) — clientes que enviam carga
- `destinatarios` (cnpj_cpf UNIQUE) — clientes que recebem
- `destinatario_enderecos` — múltiplos endereços por destinatário, com flag `principal`
- `destinatario_restricoes` — 1:1 com destinatário. dias_semana int[] (0=dom..6=sáb), hora_inicio/fim, altura_max, agendamento_obrigatorio, exige_escolta, documentos_canhoto text[]

## Auto-vínculo
Trigger **`trg_auto_link_cadastros_nf`** AFTER INSERT em `notas_fiscais` → `fn_auto_link_cadastros_nf()`:
- Normaliza CNPJ (só dígitos) e faz upsert em embarcadores/destinatarios com `rascunho=true`.
- ON CONFLICT DO NOTHING — não sobrescreve cadastros revisados.

## Rascunhos
- Toda criação automática vem com `rascunho=true`.
- UI mostra contagem de rascunhos no header com aviso âmbar.
- Ao salvar manualmente pela tela, vira `rascunho=false`.

## Rotas
- `/embarcadores`
- `/destinatarios`

## Sidebar
Novo grupo **"Cadastros"** (ícone Building2) acima de Depósito.

## Próximas fases (não implementar até pedido)
Fase 2 = Produtos com paletização. Fase 3 = Endereçamento hierárquico. Plano completo em `.lovable/plan.md`.
