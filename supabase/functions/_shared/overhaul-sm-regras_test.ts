import { assert, assertEquals } from 'jsr:@std/assert@1';
import { PLACAS_RASTREADAS, placaRastreada, motoristaConfere, conferirRota, locaisDaRota, similaridadeNome, melhorMotorista, termosBuscaMotorista } from './overhaul-sm-regras.ts';

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

Deno.test('similaridadeNome: idêntico = 1, ignora acentos e caixa', () => {
  assertEquals(similaridadeNome('João Silva', 'JOAO SILVA'), 1);
  assertEquals(similaridadeNome('', 'X'), 0);
});

Deno.test('melhorMotorista: escolhe o mais próximo', () => {
  const candidatos = [
    { nome: 'MOACIR FERREIRA DA SILVA' },
    { nome: 'MOACIR F SILVA' },
    { nome: 'PEDRO SANTOS' },
  ];
  const r = melhorMotorista('MOACIR FERREIRA SILVA', candidatos);
  assertEquals(r.escolhido?.nome, 'MOACIR FERREIRA DA SILVA');
  assertEquals(r.ambiguos, []);
});

Deno.test('LQG1H40: Maximiliano encontra MAXMILIANO abreviado sem mínimo de similaridade', () => {
  assertEquals(termosBuscaMotorista('Maximiliano'), ['MAX']);
  const r = melhorMotorista('Maximiliano', [{ nome: 'MAXMILIANO SOARES DE AZEVEDO' }, { nome: 'MAXWELL DOS SANTOS' }]);
  assertEquals(r.escolhido?.nome, 'MAXMILIANO SOARES DE AZEVEDO');
  assert(r.similaridade < 0.8);
});

Deno.test('melhorMotorista: empate não bloqueia revisão pelo operador', () => {
  const r = melhorMotorista('JOSE SILVA', [{ nome: 'JOSE SILVA' }, { nome: 'JOSE SILVA' }]);
  assertEquals(r.escolhido?.nome, 'JOSE SILVA');
  assertEquals(r.ambiguos.length, 1);
});

Deno.test('motorista ausente não inventa cadastro', () => {
  assertEquals(melhorMotorista('Maximiliano', []).escolhido, null);
  assertEquals(melhorMotorista('', [{ nome: 'MAXMILIANO' }]).escolhido, null);
});
