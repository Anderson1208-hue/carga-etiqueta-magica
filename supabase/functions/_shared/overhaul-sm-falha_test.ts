import { assertEquals } from 'jsr:@std/assert@1';

Deno.test('falha de SM permanece registrada e retorna ao operador sem enviar email', async () => {
  const source = await Deno.readTextFile(new URL('../overhaul-gerar-sm/index.ts', import.meta.url));
  const start = source.lastIndexOf('} catch (e) {');
  const end = source.lastIndexOf('\n  }');
  if (start < 0 || end <= start) throw new Error('Tratamento de falha não encontrado');
  const body = source.slice(start + '} catch (e) {'.length, end);
  const registros: unknown[] = [];
  let emails = 0;
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const tratarFalha = new AsyncFunction('e', 'finalizar', 'detalhes', 'json', 'admin', 'reg', 'placa', 'dataBR', 'veic', 'EMAIL_FALHA', body);
  const retorno = await tratarFalha(
    new Error('Portal não confirmou a SM'),
    async (registro: unknown) => { registros.push(registro); },
    { rota_id: 244332 },
    (valor: unknown) => valor,
    { functions: { invoke: async () => { emails++; return {}; } } },
    { id: 'teste' }, 'LKU2A09', () => '06/11/2026', { data: '2026-11-06' }, 'teste@example.com',
  );
  assertEquals(emails, 0);
  assertEquals(registros, [{ status: 'falha', erro: 'Portal não confirmou a SM', rota_portal_id: '244332' }]);
  assertEquals(retorno, { status: 'falha', erro: 'Portal não confirmou a SM' });
});