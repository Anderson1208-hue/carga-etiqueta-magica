import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { operatorAccessStatus } from '../_shared/approved-operator.ts';

const BASE = 'https://www.okentrega.com.br';
const schema = z.object({ data: z.literal('2026-10-22'), acao: z.literal('diagnosticar').default('diagnosticar') }).strict();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ erro: 'Método não permitido' }, 405);
  const started = Date.now();
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json({ erro: 'Configuração ausente' }, 500);
  const db = createClient(url, key);
  const access = await operatorAccessStatus(req.headers.get('authorization'), db);
  if (access) return json({ erro: 'Acesso não autorizado' }, access);
  const input = schema.safeParse(await req.json().catch(() => null));
  if (!input.success) return json({ erro: 'Informe a data 2026-10-22 para o teste autorizado' }, 400);
  const login = Deno.env.get('OKENTREGA_PORTAL_LOGIN');
  const password = Deno.env.get('OKENTREGA_PORTAL_PASSWORD');
  if (!login || !password) return json({ erro: 'Credenciais do portal ausentes' }, 400);
  const jar = new Map<string, string>();
  async function request(path: string, fields?: Record<string, string>) {
    const target = new URL(path, BASE);
    if (target.origin !== BASE) throw new Error('destino_nao_permitido');
    const response = await fetch(target, {
      redirect: 'manual', signal: AbortSignal.timeout(20000),
      headers: { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...(fields ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      method: fields ? 'POST' : 'GET', ...(fields ? { body: new URLSearchParams(fields) } : {}),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const match = cookie.match(/^([^=]+)=([^;]*)/);
      if (match) jar.set(match[1], match[2]);
    }
    const text = await response.text();
    if (text.length > 3_000_000) throw new Error('resposta_excessiva');
    return { response, text };
  }
  async function action(action: string, fields: Record<string, string>) {
    const { text } = await request('/assets/system/sys.ajax.php', { component: 'sys.sys.login', action, ...fields });
    return JSON.parse(text);
  }
  try {
    await request('/login2.php');
    const config = await request('/assets/system/sys.config.json.php?page=sys.login');
    const typePath = JSON.parse(config.text)?.resposta_dados?.ajaxTipoAcesso;
    if (typeof typePath !== 'string') throw new Error('config_invalida');
    const types = JSON.parse((await request(typePath, { email: login })).text);
    const options = types?.resposta_dados?.dados;
    const option = Array.isArray(options) ? options[0] : null;
    const type = typeof option === 'string' ? option.match(/value\s*=\s*(?:["']([^"']+)["']|([^\s>]+))/i)?.slice(1).find(Boolean) : null;
    if (!type) return json({ etapa: 'tipo_acesso', login_ok: false, resposta_aceita: types?.resposta_status?.status === 1, lista_disponivel: Array.isArray(options), duracao_ms: Date.now() - started }, 502);
    const result = await action('RedirecionarLogin', { email: login, password, pgredirect: '', cliente_id: '', elemento: '', tipoacesso: type });
    if (result?.resposta_status?.status !== 1 || !result?.resposta_dados?.dados?.id) return json({ etapa: 'login', login_ok: false, duracao_ms: Date.now() - started }, 502);
    const redirect = result.resposta_dados.redirect ?? {};
    const fields: Record<string, string> = { id: String(result.resposta_dados.dados.id), camp_acesso_tipo: type };
    for (const [from, to] of [['cliente_id', 'cliente_id'], ['id_elemento', 'elemento_id'], ['user_id', 'user_id']]) {
      if (redirect[from]) fields[to] = String(redirect[from]);
    }
    const destination = redirect.page_direciona || '/assets/application/hom.cockpit2.php8';
    let home = await request(destination, fields);
    for (let i = 0; i < 4 && home.response.headers.has('location'); i++) home = await request(home.response.headers.get('location') ?? '/login.php8');
    home = await request('/assets/application/cons.documento2.php8');
    const api = async (fields: Record<string, string>) => JSON.parse((await request('/assets/system/sys.ajax.php8', fields)).text);
    const inputValue = (id: string) => home.text.match(new RegExp(`<input[^>]*id=["']${id}["'][^>]*>`, 'i'))?.[0].match(/value=["']([^"']*)["']/i)?.[1] ?? '';
    const selected = (id: string) => {
      const block = home.text.match(new RegExp(`<select[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/select>`, 'i'))?.[1] ?? '';
      const options = [...block.matchAll(/<option\b([^>]*)>/gi)];
      const opt = options.find(o => /selected/i.test(o[1])) ?? options[0];
      return opt?.[1].match(/value=["']([^"']*)["']/i)?.[1] ?? '';
    };
    const filtro = await api({ component: 'sys.sys.busca2', action: 'reloadFieldFilters', acao: 'G', campDocumentos: '767250', campTipoDoc: selected('campTipoDoc'), campSerieDocumentos: '20', campEmissorDoc: '70940994008277', usuarioClientes: '0', pagina: 'cons.documento2.php8' });
    const lista = await api({ component: 'sys.sys.listardocumento2', action: 'listardocumentos', usuarioClientes: '0', pagina: 'cons.documento2.php8', limitador: '10', get: inputValue('GET'), statusHandler: '' });
    const rows = lista?.resposta_dados?.lista;
    const plain = (v: unknown) => typeof v === 'string' ? v.replace(/<[^>]*>/g, '').trim().slice(0, 500) : null;
    if (!Array.isArray(rows)) return json({ etapa: 'lista_nf', nf: '767250', lista_ok: lista?.resposta_status?.status === 1, atualizado: false }, 502);
    const row = rows.find(r => /\b767250\b/.test(plain(r.NF) ?? ''));
    const docId = typeof row?.Function === 'string' ? row.Function.match(/abrirDocumento\(\s*["']?(\d+)/)?.[1] : undefined;
    if (!docId) return json({ etapa: 'identificar_nf', nf: '767250', notas: rows.map(r => ({ nf: plain(r.NF), campos: Object.keys(r) })), atualizado: false });
    const ocorr = await api({ component: 'app.cons.documento2', action: 'ocorrenciasEntrega', usuarioClientes: '0', pagina: 'cons.documento2.php8', doc_cli: docId });
    const entries = ocorr?.resposta_dados?.ocorrencias ?? {};
    return json({ nf: '767250', etapa: 'ocorrencias', ocorrencias: Object.values(entries).map((v: any) => ({ tipo: plain(v.INFO_ORI?.TIPOOCORRENCIA), status: plain(v.INFO_ORI?.STATUS), resultado_validacao: plain(v.RESULTADO_VALIDA), data_validacao: plain(v.INFO_ORI?.DTVALIDACAO), data_registro: plain(v.INFO_ORI?.DTREGISTRO), data_entrega: plain(v.INFO_ORI?.DTENTREGA), motivo: plain(v.INFO_ORI?.MOTIVORECUSA ?? v.INFO_ORI?.MOTIVOOCORRENCIA ?? v.INFO_ORI?.MOTIVO) })), duracao_ms: Date.now() - started, atualizado: false });
  } catch {
    return json({ erro: 'Não foi possível concluir a consulta segura do portal', duracao_ms: Date.now() - started, atualizado: false }, 502);
  }
});