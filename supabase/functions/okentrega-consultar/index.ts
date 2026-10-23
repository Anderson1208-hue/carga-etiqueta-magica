import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { operatorAccessStatus } from '../_shared/approved-operator.ts';
import { portalDocumentId, portalValidationText, portalQueueStatus, latestPortalDelivery } from '../_shared/okentrega-portal-parser.ts';

const BASE = 'https://www.okentrega.com.br';
const schema = z.object({ data: z.literal('2026-10-22'), nf: z.string().regex(/^\d{1,9}$/).default('767250'), acao: z.enum(['diagnosticar', 'atualizar']).default('diagnosticar'), queue_id: z.string().uuid().optional() }).strict();
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
  const nf = input.data.nf;
  let queue: { id: string; nf_id: string; ocorrencia_entrega_id: string | null } | null = null;
  if (input.data.acao === 'atualizar') {
    if (!input.data.queue_id) return json({ erro: 'Informe o registro da fila' }, 400);
    const { data: item, error } = await db.from('okentrega_queue').select('id,nf_id,numero_nf,ocorrencia_entrega_id,ambiente').eq('id', input.data.queue_id).maybeSingle();
    if (error || !item || item.ambiente !== 'producao' || String(Number(item.numero_nf)) !== String(Number(nf)) || !item.ocorrencia_entrega_id) return json({ erro: 'Registro não elegível para consulta' }, 400);
    const { data: vinculo } = await db.from('veiculo_nfs').select('veiculos!inner(data),notas_fiscais!inner(cnpj_emitente)').eq('nf_id', item.nf_id).eq('veiculos.data', input.data.data).maybeSingle();
    const emitente = (vinculo?.notas_fiscais as unknown as { cnpj_emitente?: string })?.cnpj_emitente;
    if (!vinculo || !emitente?.replace(/\D/g, '').startsWith('70940994')) return json({ erro: 'NF fora da roteirização autorizada' }, 400);
    queue = item;
  }
  const login = Deno.env.get('OKENTREGA_PORTAL_LOGIN');
  const password = Deno.env.get('OKENTREGA_PORTAL_PASSWORD');
  if (!login || !password) return json({ erro: 'Credenciais do portal ausentes' }, 400);
  const jar = new Map<string, string>();
  async function request(path: string, fields?: Record<string, string>) {
    const target = new URL(path, BASE);
    if (target.origin !== BASE) throw new Error('destino_nao_permitido');
    const response = await fetch(target, {
      redirect: 'manual', signal: AbortSignal.timeout(20000),
      headers: { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...(fields ? { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest', Referer: `${BASE}/assets/application/cons.documento2.php8` } : {}) },
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
    const portalCode = (value: unknown) => JSON.stringify(value)?.match(/\b(?:SYS-AJAX|CONS-DOCUMENTO28)-\d{2,3}\b/)?.[0] ?? null;
    const rejection = (value: unknown) => {
      const text = JSON.stringify(value)?.toLowerCase() ?? '';
      if (/token/.test(text) && /inval|expir|espir/.test(text)) return 'token_invalido_ou_expirado';
      if (/meio de solicita/.test(text)) return 'meio_de_solicitacao_invalido';
      if (/acesso negado/.test(text)) return 'acesso_negado';
      if (/component/.test(text) && /inval|encontr/.test(text)) return 'componente_invalido';
      return 'nao_identificado';
    };
    const shape = (value: unknown) => value && typeof value === 'object' ? Object.keys(value).filter(k => /^[a-zA-Z_]{1,40}$/.test(k)) : [typeof value];
    const api = async (fields: Record<string, string>) => JSON.parse((await request('/assets/system/sys.ajax.php8', fields)).text);
    const inputValue = (id: string) => home.text.match(new RegExp(`<input[^>]*id=["']${id}["'][^>]*>`, 'i'))?.[0].match(/value=["']([^"']*)["']/i)?.[1] ?? '';
    const selected = (id: string) => {
      const block = home.text.match(new RegExp(`<select[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/select>`, 'i'))?.[1] ?? '';
      const options = [...block.matchAll(/<option\b([^>]*)>/gi)];
      const opt = options.find(o => /selected/i.test(o[1])) ?? options[0];
      return opt?.[1].match(/value=["']([^"']*)["']/i)?.[1] ?? '';
    };
    const filtro = await api({ component: 'sys.sys.busca2', action: 'reloadFieldFilters', acao: 'G', campDocumentos: nf, campTipoDoc: selected('campTipoDoc'), campSerieDocumentos: '', campEmissorDoc: '', usuarioClientes: '0', pagina: 'cons.documento2.php8' });
    const lista = await api({ component: 'sys.sys.listardocumento2', action: 'listardocumentos', usuarioClientes: '0', pagina: 'cons.documento2.php8', limitador: '10', get: inputValue('GET'), statusHandler: '' });
    const rows = lista?.resposta_dados?.lista;
    const plain = (v: unknown) => typeof v === 'string' ? v.replace(/<[^>]*>/g, '').trim().slice(0, 500) : null;
    if (!Array.isArray(rows)) return json({ etapa: 'lista_nf', nf, estrutura_filtro: shape(filtro), estrutura_lista: shape(lista), filtro_ok: filtro?.resposta_status?.status === 1, lista_ok: lista?.resposta_status?.status === 1, codigo_pagina: portalCode(home.text), codigo_filtro: portalCode(filtro), codigo_lista: portalCode(lista), rejeicao_filtro: rejection(filtro), rejeicao_lista: rejection(lista), campo_nf_presente: /id=["']campDocumentosfiltro["']/.test(home.text), pagina_http: home.response.status, pagina_login: /camp_identificacao|camp_senha/.test(home.text), duracao_ms: Date.now() - started, atualizado: false }, 502);
    const row = rows.find(r => new RegExp(`\\b${nf}\\b`).test(plain(r.NF) ?? ''));
    const docId = portalDocumentId(row?.Function);
    if (!docId) return json({ etapa: 'identificar_nf', nf, encontrado: Boolean(row), atualizado: false });
    const ocorr = await api({ component: 'app.cons.documento2', action: 'ocorrenciasEntrega', usuarioClientes: '0', pagina: 'cons.documento2.php8', doc_cli: docId });
    const entries = ocorr?.resposta_dados?.ocorrencias ?? {};
    if (queue) {
      const latest = latestPortalDelivery(entries, queue.ocorrencia_entrega_id ?? '');
      if (!latest) return json({ nf, atualizado: false, motivo: 'Ocorrência atual não identificada de forma segura', duracao_ms: Date.now() - started });
      const occurrence = latest.value;
      const status = portalQueueStatus(occurrence.RESULTADO_VALIDA);
      if (!status) return json({ nf, atualizado: false, status_portal: portalValidationText(occurrence.RESULTADO_VALIDA), motivo: 'Sem resultado definitivo reconhecido', duracao_ms: Date.now() - started });
      const motivo = status.status === 'recusado' ? plain(occurrence.INFO_ORI?.MOTIVORECUSA ?? occurrence.INFO_ORI?.MOTIVOOCORRENCIA ?? occurrence.INFO_ORI?.MOTIVO) : null;
      const { data: saved, error } = await db.from('okentrega_queue').update({ ...status, motivo_recusa: motivo, erro_mensagem: null, conciliado_em: new Date().toISOString() }).eq('id', queue.id).eq('ocorrencia_entrega_id', queue.ocorrencia_entrega_id).select('id,status,status_comprovante,motivo_recusa,conciliado_em').single();
      if (error || !saved) return json({ nf, atualizado: false, erro: 'Não foi possível salvar validação' }, 502);
      return json({ nf, atualizado: true, ...saved, ocorrencia_atual_portal: latest.id.replace(/^[A-Za-z]+/, ''), status_portal: portalValidationText(occurrence.RESULTADO_VALIDA), data_validacao_portal: plain(occurrence.INFO_ORI?.DTVALIDACAO), duracao_ms: Date.now() - started });
    }
    return json({ nf, etapa: 'ocorrencias', ocorrencias: Object.values(entries).map((v: any) => ({ tipo: plain(v.INFO_ORI?.TIPOOCORRENCIA), status: portalValidationText(v.RESULTADO_VALIDA), resultado_validacao: portalValidationText(v.RESULTADO_VALIDA), data_validacao: plain(v.INFO_ORI?.DTVALIDACAO), data_registro: plain(v.INFO_ORI?.DTREGISTRO), data_entrega: plain(v.INFO_ORI?.DTENTREGA), motivo: plain(v.INFO_ORI?.MOTIVORECUSA ?? v.INFO_ORI?.MOTIVOOCORRENCIA ?? v.INFO_ORI?.MOTIVO) })), duracao_ms: Date.now() - started, atualizado: false });
  } catch {
    return json({ erro: 'Não foi possível concluir a consulta segura do portal', duracao_ms: Date.now() - started, atualizado: false }, 502);
  }
});