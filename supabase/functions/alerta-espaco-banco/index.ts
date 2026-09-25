import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

// Envia um e-mail (destinatário fixo no template) quando a última medição
// diária de espaço tem algum alerta. Não recebe dados do chamador.
const fmt = (b: number) =>
  b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2).replace('.', ',')} GB` : `${Math.round(b / 1024 ** 2)} MB`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (d: unknown, status = 200) =>
    new Response(JSON.stringify(d), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: ult } = await supabase
      .from('monitor_espaco_tabelas').select('medido_em').order('medido_em', { ascending: false }).limit(1)
    if (!ult?.length) return json({ enviado: false, motivo: 'sem medição' })
    const medidoEm = ult[0].medido_em as string
    const { data: linhas, error } = await supabase
      .from('monitor_espaco_tabelas').select('tabela, bytes, alerta, motivo').eq('medido_em', medidoEm)
    if (error) throw error
    const alertas = (linhas ?? []).filter((l) => l.alerta)
    if (!alertas.length) return json({ enviado: false, motivo: 'sem alerta' })
    const total = (linhas ?? []).find((l) => l.tabela === '_banco_total')
    const { error: e2 } = await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'alerta-espaco-banco',
        idempotencyKey: `alerta-espaco-${medidoEm}`,
        templateData: {
          medidoEm: new Date(medidoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
          bancoTotal: total ? fmt(Number(total.bytes)) : '',
          itens: alertas.map((a) => ({ tabela: a.tabela, tamanho: fmt(Number(a.bytes)), motivo: a.motivo ?? '' })),
        },
      },
    })
    if (e2) throw e2
    return json({ enviado: true, alertas: alertas.length })
  } catch (e) {
    console.error('alerta-espaco-banco falhou:', e)
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
