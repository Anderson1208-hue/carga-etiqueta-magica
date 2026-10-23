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
    // Return only static module paths, never HTML, user identifiers, cookies or authentication payloads.
    const paths = [...home.text.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)]
      .map(m => { try { const u = new URL(m[1], new URL('/assets/application/cons.documento2.php8', BASE)); return u.origin === BASE ? u.pathname : ''; } catch { return ''; } })
      .filter(p => /^\/assets\/(application|js\/system)\/[\w./-]+\.(php8?|js)$/.test(p));
    const campos = [...home.text.matchAll(/<(?:input|select)[^>]*>/gi)].map(m => ({ id: m[0].match(/\bid=["']([\w-]+)["']/i)?.[1], nome: m[0].match(/\bname=["']([\w-]+)["']/i)?.[1] })).filter(c => c.id || c.nome);
    const scripts = [...home.text.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
    const pagina = scripts.join('\n').match(/pagina_filtro\s*=\s*["']([\w.]+)["']/)?.[1];
    return json({ login_ok: paths.length > 0, pagina, campos, etapa: 'descobrir_consulta', caminhos: [...new Set(paths)], duracao_ms: Date.now() - started, atualizado: false });
  } catch {
    return json({ erro: 'Não foi possível concluir a consulta segura do portal', duracao_ms: Date.now() - started, atualizado: false }, 502);
  }
});