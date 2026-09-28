import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

// Acompanhamento temporário (28/09 a 30/09/2026): verifica banco e GPS e
// envia e-mail (destinatário fixo no template) se houver problema.
// Só lê dados; não altera nada.
const FIM = Date.parse('2026-09-30T21:00:00Z')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (d: unknown, status = 200) =>
    new Response(JSON.stringify(d), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  if (Date.now() > FIM) return json({ situacao: 'acompanhamento encerrado' })

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const agora = Date.now()
  const hoje = new Date(agora - 3 * 3600e3).toISOString().slice(0, 10)
  const horaBR = new Date(agora - 3 * 3600e3).getUTCHours()
  const problemas: string[] = []
  const detalhes: string[] = []

  const t0 = Date.now()
  const { data: rotas, error } = await sb
    .from('monitoramento_rotas').select('placa, ultima_atualizacao')
    .eq('data', hoje).eq('status', 'ativa')
  const ms = Date.now() - t0
  if (error) problemas.push(`Banco com erro ao responder: ${error.message}`)
  else if (ms > 8000) problemas.push(`Banco lento: uma consulta simples levou ${Math.round(ms / 1000)} segundos`)

  if (rotas && horaBR >= 6 && horaBR < 21) {
    const idade = (r: { ultima_atualizacao: string | null }) =>
      r.ultima_atualizacao ? (agora - Date.parse(r.ultima_atualizacao)) / 60000 : Infinity
    const comGps = rotas.filter((r) => r.ultima_atualizacao)
    if (comGps.length >= 2) {
      const maisRecente = Math.min(...comGps.map(idade))
      if (maisRecente > 20) {
        problemas.push(`Nenhum GPS recebido há ${Math.round(maisRecente)} minutos, com ${rotas.length} rotas ativas hoje`)
      }
      const mudas = comGps.filter((r) => idade(r) > 45)
      if (mudas.length >= 5 && mudas.length >= comGps.length / 2) {
        problemas.push(`${mudas.length} de ${comGps.length} rotas ativas sem GPS há mais de 45 minutos`)
        mudas.forEach((r) => detalhes.push(`${r.placa} — sem GPS há ${Math.round(idade(r))} min`))
      }
    }
  }

  if (!problemas.length) return json({ ok: true, rotas_ativas: rotas?.length ?? 0, ms })

  // No máximo 1 e-mail a cada 2 horas por tipo de problema.
  const janela = Math.floor(agora / (2 * 3600e3))
  const tipo = problemas.map((p) => p.split(' ')[0]).join('-')
  const { error: e2 } = await sb.functions.invoke('send-transactional-email', {
    body: {
      templateName: 'alerta-saude-gps',
      idempotencyKey: `alerta-saude-${tipo}-${janela}`,
      templateData: {
        verificadoEm: new Date(agora).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        problemas, detalhes: detalhes.slice(0, 30),
      },
    },
  })
  if (e2) console.error('envio falhou', e2)
  return json({ enviado: !e2, problemas })
})
