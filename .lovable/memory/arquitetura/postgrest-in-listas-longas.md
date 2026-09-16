---
name: PostgREST .in() com listas longas volta vazio
description: Consultas .in() com centenas/milhares de IDs estouram a URL do PostgREST e retornam vazio — sempre fatiar em lotes de 100
type: constraint
---

Nunca passar listas longas (>~200 itens) para `.in()` em edge functions: a URL do PostgREST
estoura e a resposta volta **vazia sem erro**, o que faz filtros em memória reprovarem tudo.

Caso real (16/09/2026, `ibac-sync`): a fila tinha ~1.000 canhotos pendentes e nada era enviado.
Causa: `veiculo_nfs.in("nf_id", [1734 ids])` voltava vazio → todos os itens caíam como
`fora_do_piloto`; e `veiculo_nfs.in("veiculo_id", [373 ids])` voltava vazio → pré-filtro
`nf_id in (…)` zerava a fila.

Regra: usar o helper `buscarEmFatias()` (fatias de 100) e, quando o pré-filtro no banco
tiver lista grande, abandonar o pré-filtro e ampliar a janela, filtrando em memória.

Encadeamento de lotes: `setTimeout` solto morre com o worker ao devolver a resposta.
Usar `EdgeRuntime.waitUntil(promessa)` para o próximo salto realmente acontecer.
