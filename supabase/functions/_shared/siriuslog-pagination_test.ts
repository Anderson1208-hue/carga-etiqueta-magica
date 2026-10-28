import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { carregarPaginasSirius } from './siriuslog-pagination.ts'

Deno.test('Sirius recupera todas as 1177 notas sem corte nas primeiras 1000', async () => {
  const origem = Array.from({ length: 1177 }, (_, id) => ({ id }))
  const resultado = await carregarPaginasSirius((inicio, fim) => Promise.resolve({
    data: origem.slice(inicio, fim + 1), error: null,
  }))
  assertEquals(resultado.length, 1177)
  assertEquals(resultado[1176].id, 1176)
})

Deno.test('Sirius recupera as 107 notas abertas mesmo depois da posição 1000', async () => {
  const origem = Array.from({ length: 1177 }, (_, id) => ({ id }))
  const alvo = new Set(origem.slice(1000, 1107).map(n => n.id))
  const resultado = await carregarPaginasSirius((inicio, fim) => Promise.resolve({
    data: origem.filter(n => alvo.has(n.id)).slice(inicio, fim + 1), error: null,
  }))
  assertEquals(resultado.length, 107)
  assertEquals(resultado[0].id, 1000)
  assertEquals(resultado[106].id, 1106)
})

Deno.test('Sirius interrompe a execução se uma página falhar', async () => {
  await assertRejects(() => carregarPaginasSirius(() => Promise.resolve({
    data: null, error: { message: 'pagina indisponivel' },
  })), Error, 'pagina indisponivel')
})