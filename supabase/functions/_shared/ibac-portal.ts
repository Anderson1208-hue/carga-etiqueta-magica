import { combinarCanhoto } from './ibac-portal-parser.ts';
const BASE = 'https://cacaushow.mosistemas.com/app/api/transportador/canhotos';
export const normalizarImagem = (s: unknown) => typeof s === 'string' ? s.replace(/^data:[^,]*,/, '').replace(/\s/g, '') : '';
export const possuiImagem = (p: any) => Boolean(normalizarImagem(p?.base64)) || p?.possuiImagem === 'Sim' || p?.possuiImagem === true;

export async function abrirPortal() {
  const login = await fetch('https://cacaushow.mosistemas.com/app/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'sigla-sistema': 'APP' },
    body: JSON.stringify({ email: Deno.env.get('IBAC_PORTAL_USUARIO'), senha: Deno.env.get('IBAC_PORTAL_SENHA'), empresa: null, siglaSistema: 'APP' }),
    signal: AbortSignal.timeout(15000),
  });
  const l = await login.json().catch(() => null);
  if (!login.ok || !l?.id) throw new Error('Não foi possível acessar o portal Cacau Show.');
  const headers = { 'auth-token': String(l.id), 'sigla-sistema': String(l.produto ?? 'APP'), Cookie: `auth-token=${l.id}; timezone-offset=180`, 'Content-Type': 'application/json', Accept: 'application/json' };
  const request = async (path: string, body?: unknown) => {
    const r = await fetch(BASE + path, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`Portal Cacau Show respondeu ${r.status}.`);
    return r.json().catch(() => null);
  };
  return {
    async localizar(chave: string, oid?: string | null) {
      const inicio = Date.now();
      let encontrado: any = null;
      for (let pagina = 0; pagina < 30; pagina++) {
        if (Date.now() - inicio > 90000) throw new Error('Consulta excedeu o tempo seguro; nenhuma imagem foi excluída.');
        const p = await request(`?limit=200&offset=${pagina * 200}`);
        if (!Array.isArray(p?.data)) throw new Error('Resposta de consulta não reconhecida.');
        const matches = p.data.filter((r: any) => r.chave === chave);
        if (matches.length > 1 || (encontrado && matches.length)) throw new Error('Mais de uma imagem identificada para esta nota; substituição bloqueada.');
        if (matches.length) encontrado = matches[0];
        if (p.data.length < 200 || (Number.isFinite(Number(p.total)) && (pagina + 1) * 200 >= Number(p.total))) {
          if (!encontrado?.oid) throw new Error('Nota não identificada inequivocamente no portal.');
          if (oid && String(encontrado.oid) !== oid) throw new Error('A identificação da imagem mudou no portal; substituição bloqueada.');
          const detalhe = await request('/' + encodeURIComponent(String(encontrado.oid)));
          return combinarCanhoto(encontrado, detalhe, chave);
        }
      }
      throw new Error('Consulta incompleta; nenhuma imagem foi excluída.');
    },
    excluir: (oid: string) => request('/excluir-imagem/' + encodeURIComponent(oid)),
    enviar: (oid: string, base64: string, nomeImagem: string) => request('/salvar-imagem', { oid, base64, nomeImagem }),
  };
}