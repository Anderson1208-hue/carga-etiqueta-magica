import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { operatorAccessStatus } from '../_shared/approved-operator.ts';
import { validarFrota, type Frota } from './frota.ts';
import { montarScriptEnvio } from './portal-script.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const mensagens: Record<string,string> = {
  frota_divergente: 'O portal já tem frota diferente ou a carga não está aceita. Nada foi substituído.',
  nao_confirmado: 'A gravação ainda não foi confirmada. Consulte novamente; não será repetido o envio.',
  consulta_incompleta: 'Não foi possível concluir a consulta. Verifique o resultado antes de qualquer novo envio.',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  const url = Deno.env.get('SUPABASE_URL'); const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json({ error: 'Serviço indisponível' }, 500);
  const sb = createClient(url, key);
  const authorization = req.headers.get('Authorization');
  const acesso = await operatorAccessStatus(authorization, sb);
  if (acesso) return json({ error: 'Operador não autenticado ou não aprovado' }, acesso);
  const body = await req.json().catch(() => null);
  if (!body || Object.keys(body).some((k) => !['ordem_id','confirmar','consultar'].includes(k)) || !/^[0-9a-f-]{36}$/i.test(body.ordem_id ?? '') || body.confirmar !== true || (body.consultar !== undefined && typeof body.consultar !== 'boolean')) return json({ error: 'Confirme a ordem antes de continuar.' }, 400);
  const usuario = Deno.env.get('PANDURATA_OTM_USUARIO'); const senha = Deno.env.get('PANDURATA_OTM_SENHA');
  const lovKey = Deno.env.get('LOVABLE_API_KEY'); const fcKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!usuario || !senha || !lovKey || !fcKey) return json({ error: 'Configuração do portal incompleta' }, 500);
  let envioId: string | undefined;
  let iniciouConsulta = false;
  try {
    const { data: ordem, error: oe } = await sb.from('ordens_coleta').select('*').eq('id', body.ordem_id).single();
    const { data: vinculo, error: ve } = await sb.from('pandurata_otm_cargas').select('shipment_id,numero_dt').eq('ordem_coleta_id', body.ordem_id).single();
    if (oe || ve || !ordem || !vinculo) return json({ error: 'A ordem precisa estar vinculada a uma carga capturada da Pandurata.' }, 400);
    let dados: Frota;
    try { dados = validarFrota(ordem, vinculo); } catch (e) { return json({ error: e instanceof Error ? e.message : 'Dados inválidos' }, 400); }
    const { data: aberto, error: ae } = await sb.from('pandurata_otm_envios').select('id,status,iniciado_em,dados').eq('shipment_id', vinculo.shipment_id).in('status', ['em_andamento','incerto']).maybeSingle();
    if (ae) throw new Error('Não foi possível verificar a reserva da carga.');
    if (aberto) {
      if (!body.consultar) return json({ error: 'Há uma tentativa pendente de confirmação. Use Verificar portal; o envio não será repetido.' }, 409);
      if (aberto.status === 'em_andamento' && Date.now() - new Date(aberto.iniciado_em).getTime() < 180000) return json({ error: 'A consulta ainda está em andamento. Aguarde alguns minutos.' }, 409);
      if (JSON.stringify(aberto.dados) !== JSON.stringify(dados)) {
        // Compare properties individually: JSONB does not preserve property order.
        if (Object.entries(dados).some(([k,v]) => aberto.dados[k] !== v)) return json({ error: 'A ordem foi alterada após a tentativa. Confira os dados anteriores antes de prosseguir.' }, 409);
      }
      envioId = aberto.id;
    } else {
      const { data: user } = await sb.auth.getUser((authorization ?? '').replace(/^Bearer\s+/i, ''));
      if (!user.user) return json({ error: 'Sessão inválida' }, 401);
      const { data: novo, error: ne } = await sb.from('pandurata_otm_envios').insert({ ordem_coleta_id: ordem.id, shipment_id: vinculo.shipment_id, iniciado_por: user.user.id, dados }).select('id').single();
      if (ne || !novo) return json({ error: 'Outra tentativa está em andamento para esta carga.' }, 409);
      envioId = novo.id;
    }
    iniciouConsulta = true;
    const r = await fetch('https://connector-gateway.lovable.dev/firecrawl/v2/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lovKey}`, 'X-Connection-Api-Key': fcKey },
      body: JSON.stringify({
        url: 'https://otmgtm-bauducco.otmgtm.us-phoenix-1.ocs.oraclecloud.com/GC3/glog.webserver.home.HomeServlet?ojr=maincontent',
        formats: ['rawHtml'], onlyMainContent: false, timeout: 170000, maxAge: 0,
        actions: [
          { type: 'wait', selector: '#idcs-signin-basic-signin-form-username' },
          { type: 'click', selector: '#idcs-signin-basic-signin-form-username' }, { type: 'write', text: usuario },
          { type: 'click', selector: 'input[type=password]' }, { type: 'write', text: senha },
          { type: 'press', key: 'Enter' }, { type: 'wait', milliseconds: 15000 },
          { type: 'executeJavascript', script: montarScriptEnvio(dados, !body.consultar) },
          { type: 'wait', milliseconds: 30000 }, { type: 'wait', selector: '#lovenvio' },
        ],
      }),
    });
    if (!r.ok) {
      // Never return provider bodies: they may contain the submitted login or CPF.
      const failure = await r.text();
      const limite = /Credit limit reached|Not enough credits|payment_required/i.test(failure);
      const msg = limite ? 'O limite de créditos impediu a consulta ao portal.' : `A consulta ao portal falhou (${r.status}). Verifique antes de repetir.`;
      await sb.from('pandurata_otm_envios').update({ status: 'incerto', mensagem: msg, concluido_em: new Date().toISOString() }).eq('id', envioId);
      return json({ error: msg, status: r.status }, 502);
    }
    const fc = await r.json();
    const credits = fc?.data?.metadata?.creditsUsed ?? fc?.creditsUsed ?? null;
    const raw = String(fc?.data?.rawHtml ?? '');
    const match = raw.match(/<pre[^>]*id=["']lovenvio["'][^>]*>([\s\S]*?)<\/pre>/i);
    let saida: { ok?: boolean; codigo?: string; status_portal?: string; gravou?: boolean } = {};
    if (match) try { saida = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')); } catch { /* uncertain, never replay */ }
    const status = saida.ok === true ? 'confirmado' : saida.codigo === 'frota_divergente' && !saida.gravou ? 'erro' : 'incerto';
    const mensagem = status === 'confirmado' ? 'Motorista, CPF e placas conferidos no portal.' : mensagens[saida.codigo ?? 'consulta_incompleta'] ?? mensagens.consulta_incompleta;
    const { error: saveError } = await sb.from('pandurata_otm_envios').update({ status, mensagem, status_portal: saida.status_portal ?? null, creditos_firecrawl: credits, creditos_lovable: credits === null ? null : Number(credits) * 0.004, concluido_em: new Date().toISOString() }).eq('id', envioId);
    if (saveError) throw new Error('O portal foi consultado, mas o histórico não pôde ser confirmado.');
    return json({ ok: status === 'confirmado', status, mensagem, status_portal: saida.status_portal, creditos_lovable: credits === null ? null : Number(credits) * 0.004 });
  } catch {
    const msg = iniciouConsulta ? 'Resultado incerto. Use Verificar portal; não repita o envio.' : 'Não foi possível preparar o envio ao portal.';
    if (envioId) await sb.from('pandurata_otm_envios').update({ status: 'incerto', mensagem: msg, concluido_em: new Date().toISOString() }).eq('id', envioId);
    return json({ error: msg }, 502);
  }
});