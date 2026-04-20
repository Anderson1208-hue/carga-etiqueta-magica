---
name: feriados-rj-dias-uteis
description: Liberação de NFs agendadas considera próximo dia útil RJ (exclui sáb/dom + feriados nacionais e estaduais via src/lib/feriados-rj.ts).
type: feature
---
A liberação de NFs com agendamento na Programação usa `proximoDiaUtilApos(hoje)` de `src/lib/feriados-rj.ts`, que pula sábados, domingos e feriados nacionais + estaduais RJ (incl. São Jorge 23/04, Carnaval, Sexta Santa, Corpus Christi, Tiradentes, Consciência Negra etc., calculados dinamicamente por ano via algoritmo de Páscoa). Assim, se amanhã é feriado, NFs agendadas para o próximo dia útil são liberadas hoje.
