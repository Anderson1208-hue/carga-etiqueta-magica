---
name: dia-do-comercio-rj
description: Dia do Comércio RJ (3ª segunda-feira de outubro, ex. 19/10/2026) tratado como feriado/não dia útil no sistema e no banco.
type: feature
---
Anderson determinou que o Dia do Comércio no RJ (3ª segunda-feira de outubro — em 2026, 19/10) NÃO é dia útil. Implementado em dois lugares:
1. `src/lib/feriados-rj.ts`: `getFeriadosRJ` inclui a 3ª segunda-feira de outubro (afeta liberação de NFs agendadas na Programação).
2. Banco: funções `feriados_rj(ano)`, `e_dia_util_rj(data)` e `add_dias_uteis` recriadas com feriados fixos + móveis (Páscoa) + São Jorge + Dia do Comércio; `tracking_pandurata_e_dia_util` agora delega para `e_dia_util_rj` (antes só excluía sáb/dom). Afeta a rotina diária de tracking Pandurata/Sirius Log.
