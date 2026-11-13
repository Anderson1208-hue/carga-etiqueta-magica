import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { operatorAccessStatus } from '../_shared/approved-operator.ts';
import { portalDocumentId, portalValidationText, portalConsultationStatus, latestPortalDelivery } from '../_shared/okentrega-portal-parser.ts';
import { CONSULTA_INICIO, AUTOMACAO_INICIO, dataBrasilia, dataConsultaPermitida } from '../_shared/okentrega-consulta-regras.ts';

const BASE = 'https://www.okentrega.com.br';
const schema = z.object({ data: z.string().refine(v => dataConsultaPermitida(v)).optional(), nf: z.string().regex(/^\d{1,9}$/).default('767250'), acao: z.enum(['diagnosticar', 'atualizar', 'lote']).default('diagnosticar'), queue_id: z.string().uuid().optional(), cursor: z.string().uuid().optional(), inicio: z.string().datetime().optional() }).strict();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ erro: 'Método não permitido' }, 405);
  const started = Date.now();
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json({ erro: 'Configuração ausente' }, 500);
  const db = createClient(url, key);
  const internal = req.headers.get('authorization') === `Bearer ${key}`;
  const cronToken = req.headers.get('x-okentrega-cron');
  const cron = cronToken ? (await db.rpc('okentrega_validar_cron', { p_token: cronToken })).data === true : false;
  if (!internal && !cron) {
    const access = await operatorAccessStatus(req.headers.get('authorization'), db);
    if (access) return json({ erro: 'Acesso não autorizado' }, access);
  }
  const input = schema.safeParse(await req.json().catch(() => null));
  if (!input.success) return json({ erro: 'Informe uma data válida desde 22/10/2026 até hoje' }, 400);
  if (input.data.acao === 'lote') {
    const hoje = dataBrasilia();
    if (cron && hoje < AUTOMACAO_INICIO) return json({ status: 'aguardando_inicio', inicio: AUTOMACAO_INICIO });
    // Rodada: notas já consultadas depois de `inicio` são puladas, então qualquer nova rodada (retry) retoma de onde parou.
    const inicio = input.data.inicio ?? new Date(Date.now() - 60 * 60 * 1000).toISOString();
    // Seleciona direto as notas OK Entrega enviadas e ainda sem resultado final (blocos de 15, cursor por id).
    let pending = db.from('okentrega_queue').select('id,numero_nf,nf_id').eq('ambiente', 'producao').not('ocorrencia_entrega_id', 'is', null).in('status', ['aguardando_aprovacao', 'enviado']).gte('enviado_em', `${CONSULTA_INICIO}T03:00:00Z`).or(`conciliado_em.is.null,conciliado_em.lt.${inicio}`).order('id').limit(15);
    if (input.data.cursor) pending = pending.gt('id', input.data.cursor);
    const { data: items, error } = await pending;
    if (error) return json({ erro: 'Falha ao selecionar fila' }, 502);
    const dates = new Map<string, string>();
    const nfIds = [...new Set((items ?? []).map(i => i.nf_id))];
    if (nfIds.length) {
      const { data: links, error: linkError } = await db.from('veiculo_nfs').select('nf_id,veiculos!inner(data)').in('nf_id', nfIds).gte('veiculos.data', input.data.data ?? CONSULTA_INICIO).lte('veiculos.data', input.data.data ?? hoje);
      if (linkError) return json({ erro: 'Falha ao selecionar roteirizações' }, 502);
      for (const l of links ?? []) {
        const d = (l.veiculos as unknown as { data: string }).data;
        if (!dates.has(l.nf_id) || d > dates.get(l.nf_id)!) dates.set(l.nf_id, d);
      }
    }
    const all = items ?? [];
    const work = all.filter(i => dates.has(i.nf_id));
    // Orçamento de tempo: o processo em segundo plano é encerrado pelo runtime se demorar demais,
    // o que quebrava o encadeamento. Paramos antes e continuamos do último id realmente percorrido.
    const run = async () => {
      let lastIdx = -1;
      try {
        for (let i = 0; i < all.length; i += 3) {
          if (Date.now() - started > 90000) break;
          const group = all.slice(i, i + 3);
          await Promise.all(group.filter(it => dates.has(it.nf_id)).map(async item => {
            try {
              const response = await fetch(`${url}/functions/v1/okentrega-consultar`, { method: 'POST', signal: AbortSignal.timeout(30000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ acao: 'atualizar', data: dates.get(item.nf_id), nf: item.numero_nf, queue_id: item.id }) });
              const result = await response.json().catch(() => ({}));
              console.log(JSON.stringify({ consulta_nf: item.numero_nf, atualizado: result.atualizado === true, status_http: response.status }));
            } catch {
              console.log(JSON.stringify({ consulta_nf: item.numero_nf, atualizado: false, erro: 'consulta_indisponivel' }));
            }
          }));
          lastIdx = i + group.length - 1;
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } finally {
        const fullBlock = all.length === 15;
        const cutShort = lastIdx < all.length - 1;
        const cursor = lastIdx >= 0 ? all[lastIdx].id : input.data.cursor;
        if ((fullBlock || cutShort) && (lastIdx >= 0)) {
          // Encadeia o próximo bloco com até 3 tentativas; se todas falharem, arma a repetição do guardião (10 min),
          // que retoma só as notas ainda não consultadas nesta rodada.
          let encadeado = false;
          for (let t = 0; t < 3 && !encadeado; t++) {
            if (t) await new Promise(r => setTimeout(r, 3000 * t));
            try {
              const r = await fetch(`${url}/functions/v1/okentrega-consultar`, { method: 'POST', signal: AbortSignal.timeout(60000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ acao: 'lote', data: input.data.data, cursor, inicio }) });
              encadeado = r.ok;
              await r.body?.cancel();
            } catch { /* nova tentativa */ }
          }
          if (!encadeado) {
            console.log(JSON.stringify({ erro: 'encadeamento_falhou', cursor }));
            if (!input.data.data) {
              const desde = new Date(); desde.setUTCHours(0, 0, 0, 0);
              const { count } = await db.from('integracao_tentativas').select('id', { count: 'exact', head: true }).eq('integracao', 'okentrega').gte('created_at', desde.toISOString());
              await db.rpc('integracao_retry_agendar', { p_integracao: 'okentrega', p_tentativa: Math.min((count ?? 0) + 1, 5) });
            }
          }
        }
      }
    };
    EdgeRuntime.waitUntil(run());
    return json({ status: 'consulta_iniciada', selecionadas: work.length, desde: input.data.data ?? CONSULTA_INICIO, ate: input.data.data ?? hoje });
  }
  if (!input.data.data) return json({ erro: 'Informe a data da roteirização' }, 400);
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
  async function request(path: string, fields?: Record<string, string>, referer = `${BASE}/assets/application/cons.documento2.php8`) {
    const target = new URL(path, BASE);
    if (target.origin !== BASE) throw new Error('destino_nao_permitido');
    const response = await fetch(target, {
      redirect: 'manual', signal: AbortSignal.timeout(20000),
      headers: { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...(fields ? { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest', Referer: referer, Origin: BASE, Accept: 'application/json, text/javascript, */*; q=0.01', 'User-Agent': 'Mozilla/5.0' } : {}) },
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
    const { text } = await request('/assets/system/sys.ajax.php8', { component: 'sys.sys.login2', action, ...fields }, `${BASE}/login.php8`);
    return JSON.parse(text);
  }
  try {
    // Portal migrou para login.php8 / sys.sys.login2 (nov/2026).
    await request('/login.php8');
    const types = await action('tipoacesso', { email: login });
    const options = types?.resposta_dados?.dados;
    const option = Array.isArray(options) ? options[0] : null;
    const type = typeof option === 'string' ? option.match(/value\s*=\s*(?:["']([^"']+)["']|([^\s>]+))/i)?.slice(1).find(Boolean) : null;
    if (!type) return json({ etapa: 'tipo_acesso', login_ok: false, resposta_aceita: types?.resposta_status?.status === 1, lista_disponivel: Array.isArray(options), duracao_ms: Date.now() - started }, 502);
    const result = await action('RedirecionarLogin', { email: login, password, pgredirect: '', cliente_id: '', elemento: '', tipoacesso: type });
    if (result?.resposta_status?.status !== 1 || !result?.resposta_dados?.dados?.id) return json({ etapa: 'login', login_ok: false, duracao_ms: Date.now() - started }, 502);
    const redirect = result.resposta_dados.redirect ?? {};
    const fields: Record<string, string> = { id: String(result.resposta_dados.dados.id), camp_acesso_tipo: type, email: login, senha: password };
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
      const status = portalConsultationStatus(occurrence.RESULTADO_VALIDA);
      if (!status) return json({ nf, atualizado: false, status_portal: portalValidationText(occurrence.RESULTADO_VALIDA), motivo: 'Sem resultado definitivo reconhecido', duracao_ms: Date.now() - started });
      const motivo = status.status === 'recusado' ? plain(occurrence.INFO_ORI?.MOTIVORECUSA ?? occurrence.INFO_ORI?.MOTIVOOCORRENCIA ?? occurrence.INFO_ORI?.MOTIVO) : null;
      const { data: saved, error } = await db.from('okentrega_queue').update({ ...status, motivo_recusa: motivo, erro_mensagem: null, conciliado_em: new Date().toISOString() }).eq('id', queue.id).eq('ocorrencia_entrega_id', queue.ocorrencia_entrega_id).neq('status', 'processando').select('id,status,status_comprovante,motivo_recusa,conciliado_em').single();
      if (error || !saved) return json({ nf, atualizado: false, erro: 'Não foi possível salvar validação' }, 502);
      return json({ nf, atualizado: true, ...saved, ocorrencia_atual_portal: latest.id.replace(/^[A-Za-z]+/, ''), status_portal: portalValidationText(occurrence.RESULTADO_VALIDA), data_validacao_portal: plain(occurrence.INFO_ORI?.DTVALIDACAO), duracao_ms: Date.now() - started });
    }
    return json({ nf, etapa: 'ocorrencias', ocorrencias: Object.values(entries).map((v: any) => ({ tipo: plain(v.INFO_ORI?.TIPOOCORRENCIA), status: portalValidationText(v.RESULTADO_VALIDA), resultado_validacao: portalValidationText(v.RESULTADO_VALIDA), data_validacao: plain(v.INFO_ORI?.DTVALIDACAO), data_registro: plain(v.INFO_ORI?.DTREGISTRO), data_entrega: plain(v.INFO_ORI?.DTENTREGA), motivo: plain(v.INFO_ORI?.MOTIVORECUSA ?? v.INFO_ORI?.MOTIVOOCORRENCIA ?? v.INFO_ORI?.MOTIVO) })), duracao_ms: Date.now() - started, atualizado: false });
  } catch (e) {
    console.warn('[okentrega-consultar] falha', String((e as Error)?.message ?? e).slice(0, 200));
    return json({ erro: 'Não foi possível concluir a consulta segura do portal', duracao_ms: Date.now() - started, atualizado: false }, 502);
  }
});