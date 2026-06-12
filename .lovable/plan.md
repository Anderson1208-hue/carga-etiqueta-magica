## Objetivo

Na tela de **Agendamento**, criar um campo **Ocorrência** (separado do status) com as **10 opções** abaixo. Ao salvar, o evento é enviado automaticamente para a fila da Cacau (IBAC) com o código já mapeado.

No APK do motorista nada muda — continua só **Entregue** e **Reentrega**.

---

## Lista final de ocorrências (10)

| # | Ocorrência | Cód. IBAC |
|---|---|---|
| 1 | Entrega agendada | 91 |
| 2 | Carga aceita pela transportadora | 222 |
| 3 | Motorista iniciou a rota | 229 |
| 4 | Chegada no cliente | 245 |
| 5 | Entrega realizada com canhoto | 1 |
| 6 | Reentrega solicitada | 19 |
| 7 | Avaria | 79 |
| 8 | Recusa de entrega | 3 |
| 9 | Devolução | 101 |
| 10 | **Extravio ou Roubo** *(novo)* | **14** |

> As 9 primeiras já existem no de-para com a Cacau. A 10ª será criada nesta entrega.
> As que hoje também são geradas por triggers automáticos (carga aceita, início rota, chegada, entrega) continuam funcionando — o select serve para o operador registrar manualmente quando precisar (correção, lançamento retroativo, força bruta).

---

## Mudanças técnicas

### 1. Banco (migration)
- `INSERT` na `ibac_de_para_eventos`: `extravio_roubo` → código **14** ("Extravio de mercadoria").
- `ALTER TABLE agendamentos ADD COLUMN ocorrencia text` (nullable; validação no front).
- Novo trigger `fn_ibac_capturar_ocorrencia_agendamento` em `agendamentos`: quando `ocorrencia` for preenchida (ou alterada), enfileira o evento correspondente via `fn_ibac_enqueue`, com `nf_id`, `carga_id`, `chave_acesso` e payload da NF.

### 2. Frontend — `src/pages/Agendamento.tsx`
- Novo `Select` "Ocorrência" na linha, com as 10 opções acima + opção "—" para limpar.
- Persiste em `agendamentos.ocorrencia`.
- Badge visual quando há ocorrência preenchida.

### 3. Sem mudanças
- APK / `BaixaEntrega.tsx`: continua só Entregue/Reentrega.
- Edge `ibac-sync`: já consome a fila.
- Triggers automáticos existentes (carga, rota, chegada, baixa): permanecem.

---

## Fora de escopo (próximos tópicos)
- Canhoto em paisagem
- Critério de aprovação/rejeição do canhoto + reprocesso na Prestação de Contas
- Envio noturno em lote para a Cacau
- Desfazer baixas das NFs específicas para reteste

---

**Confirma para eu implementar?** Em particular: ok deixar "Extravio ou Roubo" como **uma única opção** mapeada ao código IBAC 14, ou prefere separar em duas (Extravio = 14, Roubo = 23)?