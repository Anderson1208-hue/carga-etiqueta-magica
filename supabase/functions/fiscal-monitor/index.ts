import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { generateResponse, GatewayError } from 'npm:@lovable.dev/ai-gateway@0.1.11';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const ESCOPO = `Regras do escopo de emissão própria da Expresso Ebenezer (transportadora RJ):
- CT-e: CFOP 5353/6932 etc., CST ICMS 40/90, isenção Pandurata MG→RJ (RICMS/MG 2023 Anexo X item 162), campos IBS/CBS da reforma.
- MDF-e: emissão no fim do carregamento, encerramento, obrigatoriedade dentro do RJ.
- CIOT: autônomo e agregado (Resolução ANTT 6.078/26), pagamento eletrônico de frete/Pix.
- Vale-pedágio obrigatório: código registrado no MDF-e.
- ICMS RJ e convênios CONFAZ aplicáveis ao transporte rodoviário de carga.`;

function textoDaPagina(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|p|div|li|tr|h\d)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 2)
    .join('\n').slice(0, 60000);
}

async function sha256(t: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function linhasNovas(antigo: string, novo: string) {
  const velhas = new Set(antigo.split('\n'));
  return novo.split('\n').filter((l) => !velhas.has(l)).join('\n').slice(0, 8000);
}

const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['relevante', 'titulo', 'resumo', 'impacto', 'regras_afetadas', 'relevancia'],
  properties: {
    relevante: { type: 'boolean' },
    titulo: { type: 'string' },
    resumo: { type: 'string' },
    impacto: { type: 'string' },
    regras_afetadas: { type: 'array', items: { type: 'string' } },
    relevancia: { type: 'string', enum: ['alta', 'media', 'baixa'] },
  },
} as const;

async function analisar(fonte: { nome: string; tema: string; url: string }, trecho: string) {
  const r = await generateResponse({
    model: 'openai/gpt-6-astra',
    reasoning: { effort: 'low' },
    max_output_tokens: 1200,
    instructions: `Você é um analista fiscal de transporte rodoviário de carga no Brasil. Recebe o texto NOVO que apareceu numa página oficial e decide se é uma mudança normativa relevante para o escopo abaixo. Ignore mudanças de menu, datas de acesso, notícias genéricas e textos sem relação. Responda em português simples para um gestor de logística, sem inventar fatos que não estejam no trecho.\n\n${ESCOPO}`,
    input: `Fonte: ${fonte.nome} (${fonte.tema})\nURL: ${fonte.url}\n\nTexto novo na página:\n${trecho}`,
    text: { format: { type: 'json_schema', name: 'alerta_fiscal', strict: true, schema: SCHEMA } },
  });
  const texto = r.output.filter((i) => i.type === 'message').flatMap((i) => i.content)
    .map((p) => (p.type === 'output_text' ? p.text : '')).join('');
  return JSON.parse(texto) as { relevante: boolean; titulo: string; resumo: string; impacto: string; regras_afetadas: string[]; relevancia: string };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ erro: 'Método não permitido' }, 405);
  const url = Deno.env.get('SUPABASE_URL'); const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json({ erro: 'Configuração ausente' }, 500);
  const db = createClient(url, key);

  const cronToken = req.headers.get('x-fiscal-cron');
  let cron = false;
  if (cronToken) {
    const { data } = await db.from('fiscal_monitor_cron_auth').select('token').eq('id', true).maybeSingle();
    cron = !!data && data.token === cronToken;
  }
  if (!cron) {
    const token = req.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return json({ erro: 'Acesso não autorizado' }, 401);
    const { data: u } = await db.auth.getUser(token);
    if (!u.user) return json({ erro: 'Acesso não autorizado' }, 401);
    const { data: admin } = await db.rpc('is_admin', { _user_id: u.user.id });
    if (admin !== true) return json({ erro: 'Somente administradores' }, 403);
  } else {
    const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
    const { data: util } = await db.rpc('tracking_pandurata_e_dia_util', { p_data: hoje });
    if (util === false) return json({ situacao: 'fora_de_dia_util' });
  }

  const { data: fontes, error } = await db.from('fiscal_monitor_fontes')
    .select('id,nome,tema,url,ultimo_hash,ultimo_texto').eq('ativo', true).order('nome').limit(30);
  if (error) return json({ erro: error.message }, 500);

  const resultado = { verificadas: 0, mudancas: 0, alertas: 0, erros: 0, pausado: null as string | null };
  for (const f of fontes ?? []) {
    resultado.verificadas++;
    const agora = new Date().toISOString();
    try {
      const resp = await fetch(f.url, { headers: { 'User-Agent': 'Mozilla/5.0 (TLM monitor fiscal)' }, signal: AbortSignal.timeout(20000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const texto = textoDaPagina(await resp.text());
      if (texto.length < 200) throw new Error('Página sem conteúdo legível (pode exigir navegador)');
      const hash = await sha256(texto);
      if (!f.ultimo_hash) {
        await db.from('fiscal_monitor_fontes').update({ ultimo_hash: hash, ultimo_texto: texto, ultima_verificacao: agora, ultimo_erro: null }).eq('id', f.id);
        continue;
      }
      if (hash === f.ultimo_hash) {
        await db.from('fiscal_monitor_fontes').update({ ultima_verificacao: agora, ultimo_erro: null }).eq('id', f.id);
        continue;
      }
      resultado.mudancas++;
      const trecho = linhasNovas(f.ultimo_texto ?? '', texto);
      if (trecho.trim().length > 30 && !resultado.pausado) {
        const a = await analisar(f, trecho);
        if (a.relevante) {
          await db.from('fiscal_monitor_alertas').insert({
            fonte_id: f.id, titulo: a.titulo, resumo: a.resumo, impacto: a.impacto,
            regras_afetadas: a.regras_afetadas, relevancia: a.relevancia, trecho: trecho.slice(0, 4000),
          });
          resultado.alertas++;
        }
      }
      await db.from('fiscal_monitor_fontes').update({ ultimo_hash: hash, ultimo_texto: texto, ultima_verificacao: agora, ultima_mudanca: agora, ultimo_erro: null }).eq('id', f.id);
    } catch (e) {
      resultado.erros++;
      let msg = e instanceof Error ? e.message : String(e);
      if (e instanceof GatewayError) {
        msg = `IA: ${e.code ?? e.httpStatus}`;
        if (e.httpStatus === 402 || e.httpStatus === 403 || e.httpStatus === 429) resultado.pausado = msg;
      }
      // Sem gravar o novo hash: a mudança será reavaliada na próxima rodada.
      await db.from('fiscal_monitor_fontes').update({ ultima_verificacao: agora, ultimo_erro: msg.slice(0, 300) }).eq('id', f.id);
    }
  }
  return json(resultado);
});
