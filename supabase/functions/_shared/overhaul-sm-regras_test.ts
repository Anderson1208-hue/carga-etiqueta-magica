import { assert, assertEquals } from 'jsr:@std/assert@1';
import { PLACAS_RASTREADAS, placaRastreada, motoristaConfere, conferirRota, locaisDaRota } from './overhaul-sm-regras.ts';

Deno.test('somente as 39 placas rastreadas, hífen ignorado e LKU2A09 corrigida', () => {
  assertEquals(PLACAS_RASTREADAS.length, 39);
  assert(placaRastreada('LLT-4F19'));
  assert(placaRastreada('LKU2A09'));
  assert(!placaRastreada('LKU2A9'));
  assert(!placaRastreada('ABC1234'));
});

Deno.test('motorista abreviado confere com nome completo do portal', () => {
  assert(motoristaConfere('Antonio Benedito', 'ANTONIO BENEDITO DE SOUZA'));
  assert(!motoristaConfere('Antonio Benedito', 'JOSE MARCIO FERNANDES MAGALHAES'));
});

const p = (seq: number, refe: number, tpar: number) => ({ rponSequencia: seq, refeId: refe, refeDescricao: 'x', refeRaio: 300, tparId: tpar, tparDescricao: '', areaId: null, areaDescricao: null, rponLatitude: 0, rponLongitude: 0 });

Deno.test('rota: origem, paradas na ordem e última entrega como destino', () => {
  const pontos = [p(1, 10, 4), p(2, 1, 3), p(3, 2, 3), p(99999, 3, 5)];
  assertEquals(conferirRota(pontos, 10, [1, 2, 3]), null);
  assertEquals(conferirRota(pontos, 10, [2, 1, 3]), 'paradas da rota fora da ordem da roteirização');
  assertEquals(locaisDaRota(pontos).map((l) => l[1]), [1, 2]);
});
