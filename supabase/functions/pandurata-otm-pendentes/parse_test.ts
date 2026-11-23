import { assertEquals } from 'jsr:@std/assert@1';
import { chaveDt, dataOtm, extrairSaida, numeroBR } from './parse.ts';
Deno.test('numero BR do portal', () => { assertEquals(numeroBR('9.631,35'), 9631.35); assertEquals(numeroBR('81,84'), 81.84); assertEquals(numeroBR('268403.41'), 268403.41); assertEquals(numeroBR(''), null); });
Deno.test('DT do portal casa com numero_carga sem zeros', () => { assertEquals(chaveDt('0001812103'), '1812103'); });
Deno.test('data do portal em horario de Brasilia', () => { assertEquals(dataOtm('17/11/2026 06:00:00'), '2026-11-17T06:00:00-03:00'); });
Deno.test('extrai saida do robo', () => { assertEquals(extrairSaida('<html><body><pre id="lovout">{&quot;ok&quot;:true}</pre></body></html>'), { ok: true }); });
