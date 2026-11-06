import {
  placaRastreada,
  normalizarPlaca,
  conferirRota,
  locaisDaRota,
  valorBR,
  dataBR,
  similaridadeNome,
  melhorMotorista,
} from './overhaul-sm-regras.ts';
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

Deno.test('placaRastreada: aceita placas da lista rastreada', () => {
  assertEquals(placaRastreada('LLJ6E62'), true);
  assertEquals(placaRastreada('llj-6e62'), true);
  assertEquals(placaRastreada('RVB0H48'), true);
});

Deno.test('placaRastreada: rejeita placa fora da lista', () => {
  assertEquals(placaRastreada('ABC1234'), false);
  assertEquals(placaRastreada(''), false);
  assertEquals(placaRastreada(null), false);
});

Deno.test('normalizarPlaca: remove hífen e espaços, maiúsculas', () => {
  assertEquals(normalizarPlaca('llj-6e62'), 'LLJ6E62');
  assertEquals(normalizarPlaca(' rvb 0h48 '), 'RVB0H48');
});

Deno.test('conferirRota: ok quando conjuntos batem', () => {
  const r = conferirRota(['57.867.373/0001-80', '61099008000141'], ['61099008000141', '57867373000180']);
  assertEquals(r.ok, true);
});

Deno.test('conferirRota: aponta faltando e sobrando', () => {
  const r = conferirRota(['111', '222'], ['222', '333']);
  assertEquals(r.ok, false);
  assertEquals(r.faltando, ['111']);
  assertEquals(r.sobrando, ['333']);
});

Deno.test('locaisDaRota: dedup por CNPJ mantendo ordem, seq começa em 2', () => {
  const locais = locaisDaRota(4943370, [
    { refId: 6085641, cnpj: '57.867.373/0001-80' },
    { refId: 6085730, cnpj: '61.099.008/0001-41' },
    { refId: 6085641, cnpj: '57867373000180' }, // duplicado
    { refId: 7335752, cnpj: '43.470.988/0001-65' },
  ]);
  assertEquals(locais, [
    { refId: 6085641, tipo: 'ENTREGA', seq: 2 },
    { refId: 6085730, tipo: 'ENTREGA', seq: 3 },
    { refId: 7335752, tipo: 'ENTREGA', seq: 4 },
  ]);
});

Deno.test('valorBR: formato brasileiro com vírgula', () => {
  assertEquals(valorBR(5), '5,00');
  assertEquals(valorBR(1234.5), '1234,50');
});

Deno.test('dataBR: converte ISO para dd/mm/aaaa', () => {
  assertEquals(dataBR('2026-11-06'), '06/11/2026');
});

Deno.test('similaridadeNome: idêntico = 1, ignora acentos e caixa', () => {
  assertEquals(similaridadeNome('João Silva', 'JOAO SILVA'), 1);
  assertEquals(similaridadeNome('', 'X'), 0);
});

Deno.test('melhorMotorista: escolhe o mais próximo acima do mínimo', () => {
  const candidatos = [
    { nome: 'MOACIR FERREIRA DA SILVA' },
    { nome: 'MOACIR F SILVA' },
    { nome: 'PEDRO SANTOS' },
  ];
  const r = melhorMotorista('MOACIR FERREIRA SILVA', candidatos);
  assertEquals(r.escolhido?.nome, 'MOACIR FERREIRA DA SILVA');
  assertEquals(r.ambiguos, []);
});

Deno.test('melhorMotorista: rejeita quando nenhum alcança o mínimo', () => {
  const r = melhorMotorista('CARLOS ALBERTO', [{ nome: 'PEDRO SANTOS' }]);
  assertEquals(r.escolhido, null);
});

Deno.test('melhorMotorista: rejeita empate ambíguo', () => {
  const r = melhorMotorista('JOSE SILVA', [{ nome: 'JOSE SILVA' }, { nome: 'JOSE SILVA' }]);
  assertEquals(r.escolhido, null);
  assertEquals(r.ambiguos.length, 2);
});
