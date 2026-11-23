import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { operatorAccessStatus } from '../_shared/approved-operator.ts';
import { montarScriptOtm } from './otm-script.ts';
import { chaveDt, dataOtm, extrairSaida, inteiro, numeroBR } from './parse.ts';

const OTM_URL = 'https://otmgtm-bauducco.otmgtm.us-phoenix-1.ocs.oraclecloud.com/GC3/glog.webserver.home.HomeServlet?ojr=maincontent';
const GATEWAY = 'https://connector-gateway.lovable.dev/firecrawl/v2';
const MAX_DETALHES = 25;

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function lerTodos(sb: ReturnType<typeof createClient>, tabela: string, colunas: string, filtro?: (q: any) => any) {
  const out: any[] = [];
  for (let de = 0; de < 20000; de += 1000) {
    let q = sb.from(tabela).select(colunas).order('id').range(de, de + 999);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    if (error) throw new Error(`${tabela}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const acesso = await operatorAccessStatus(req.headers.get('Authorization'), sb as any);
  if (acesso) return json({ error: acesso === 401 ? 'Não autenticado' : 'Acesso não aprovado' }, acesso);
  const { data: u } = await sb.auth.getUser(req.headers.get('Authorization')!.replace(/^Bearer\s+/i, ''));

  const usuario = Deno.env.get('PANDURATA_OTM_USUARIO');
  const senha = Deno.env.get('PANDURATA_OTM_SENHA');
  const lovKey = Deno.env.get('LOVABLE_API_KEY');
  const fcKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!usuario || !senha || !lovKey || !fcKey) return json({ error: 'Configuração do robô incompleta' }, 500);

  const { data: exec } = await sb.from('pandurata_otm_execucoes').insert({ iniciado_por: u.user?.id ?? null }).select('id').single();
  const fim = async (campos: Record<string, unknown>) => { if (exec) await sb.from('pandurata_otm_execucoes').update({ concluido_em: new Date().toISOString(), ...campos }).eq('id', exec.id); };

  try {
    // Already in our system: captured shipments, cargas (DT = numero_carga), and ordens de coleta.
    const desde = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    const [cap, cargas, ordens] = await Promise.all([
      lerTodos(sb, 'pandurata_otm_cargas', 'id, shipment_id, numero_dt'),
      lerTodos(sb, 'cargas', 'id, numero_carga', (q) => q.gte('data', desde).not('numero_carga', 'is', null)),
      lerTodos(sb, 'ordens_coleta', 'id, codigo_otm, numero_roteiro'),
    ]);
    const conhecidos = new Set<string>();
    for (const c of cap) { conhecidos.add(c.shipment_id); if (c.numero_dt) conhecidos.add('DT:' + chaveDt(c.numero_dt)); }
    for (const c of cargas) for (const p of String(c.numero_carga).split(/[^0-9]+/)) { const k = chaveDt(p); if (k.length >= 6) conhecidos.add('DT:' + k); }
    for (const o of ordens) {
      if (o.codigo_otm) { const k = chaveDt(o.codigo_otm); if (k) conhecidos.add('BAU.' + String(o.codigo_otm).replace(/^BAU\./i, '').trim()); }
      if (o.numero_roteiro) { const k = chaveDt(o.numero_roteiro); if (k) conhecidos.add('DT:' + k); }
    }

    const body = {
      url: OTM_URL,
      formats: ['rawHtml'],
      onlyMainContent: false,
      timeout: 170000,
      maxAge: 0,
      actions: [
        { type: 'wait', selector: '#idcs-signin-basic-signin-form-username' },
        { type: 'click', selector: '#idcs-signin-basic-signin-form-username' },
        { type: 'write', text: usuario },
        { type: 'click', selector: 'input[type=password]' },
        { type: 'write', text: senha },
        { type: 'press', key: 'Enter' },
        { type: 'wait', milliseconds: 15000 },
        { type: 'executeJavascript', script: montarScriptOtm([...conhecidos], MAX_DETALHES) },
        { type: 'wait', selector: '#lovout' },
      ],
    };
    const r = await fetch(`${GATEWAY}/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lovKey}`, 'X-Connection-Api-Key': fcKey },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const t = await r.text();
      console.error(`Firecrawl [${r.status}]: ${t.slice(0, 500)}`);
      await fim({ sucesso: false, erro: `Robô [${r.status}]: ${t.slice(0, 300)}` });
      return json({ error: 'Falha no robô de leitura', status: r.status, details: t.slice(0, 500) }, 502);
    }
    const fc = await r.json();
    const creditos = fc?.data?.metadata?.creditsUsed ?? fc?.creditsUsed ?? null;
    const saida: any = extrairSaida(String(fc?.data?.rawHtml ?? ''));
    if (!saida?.ok) {
      const erro = saida?.erro ?? 'Não foi possível entrar no portal ou ler a lista';
      await fim({ sucesso: false, erro, creditos_firecrawl: creditos });
      return json({ error: erro, creditos, campos: saida?.campos }, 502);
    }

    const det = new Map<string, any>((saida.detalhes ?? []).map((d: any) => [d.shipment_id, d]));
    const linhas = (saida.lista ?? []).filter((l: any) => det.get(l.shipment_id) && !det.get(l.shipment_id).erro).map((l: any) => {
      const d = det.get(l.shipment_id);
      return {
        shipment_id: l.shipment_id,
        remessa_id: d.remessa_id ?? l.shipment_id.replace(/^BAU\./, ''),
        numero_dt: l.numero_dt || null,
        status_tender: l.status_tender || null,
        status_agendamento: l.status_agendamento || null,
        inicio_viagem: dataOtm(l.inicio_viagem),
        fim_viagem: dataOtm(l.fim_viagem),
        tipo_equipamento: l.tipo_equipamento || null,
        tipo_carga: l.tipo_carga || null,
        qtd_pallets: inteiro(l.qtd_pallets),
        qtd_caixas: inteiro(l.qtd_caixas),
        cliente: l.cliente || null,
        cidade_destino: l.cidade_destino || null,
        uf_destino: l.uf_destino || null,
        valor_mercadoria: numeroBR(l.valor_mercadoria),
        num_paradas: inteiro(l.num_paradas),
        numero_ordens: inteiro(d.numero_ordens),
        peso_liquido_kg: numeroBR(d.peso_liquido),
        peso_bruto_kg: numeroBR(d.peso_bruto),
        volume_liquido_m3: numeroBR(d.volume_liquido),
        volume_bruto_m3: numeroBR(d.volume_bruto),
        custo_frete: numeroBR(d.custo_total),
        remessas: d.remessas ?? [],
        paradas: d.paradas ?? [],
      };
    });
    let gravadas = 0;
    if (linhas.length) {
      const { data, error } = await sb.from('pandurata_otm_cargas').upsert(linhas, { onConflict: 'shipment_id', ignoreDuplicates: true }).select('id');
      if (error) throw new Error(error.message);
      gravadas = data?.length ?? 0;
    }
    const falhas = (saida.detalhes ?? []).filter((d: any) => d.erro).length;
    await fim({ sucesso: true, total_sem_veiculo: saida.total, novas: saida.novas, gravadas, restantes: saida.restantes, creditos_firecrawl: creditos, erro: falhas ? `${falhas} carga(s) sem detalhe` : null });
    return json({ ok: true, total_portal: saida.total_portal, lidas: saida.lidas, diag: saida.diag, total_sem_veiculo: saida.total, novas: saida.novas, gravadas, restantes: saida.restantes, falhas, creditos });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('pandurata-otm-pendentes', msg);
    await fim({ sucesso: false, erro: msg.slice(0, 300) });
    return json({ error: msg }, 500);
  }
});
