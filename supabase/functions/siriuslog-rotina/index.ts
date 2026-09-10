// Rotina diaria de atualizacao do tracking Pandurata no portal Sirius Log.
// Regras:
//  - considera apenas notas a partir de config.data_inicial (01/09/2026);
//  - notas concluidas (entregues/finais) saem da fila e nunca sao reenviadas;
//  - so grava no portal quando config.ativo = true; caso contrario roda em SIMULACAO;
//  - roda apenas em dia util (RJ) quando chamada pelo agendador;
//  - execucao unica por vez (trava no banco) e limite de notas por rodada.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const hojeBR = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)

// Situacoes devolvidas pelo siriuslog-lote que encerram a nota na fila.
const CONCLUI = new Set([
  'status_final_no_portal',
  'nao_encontrada_no_portal',
])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const forcarSimulacao = body.simular === true
  const ignorarDiaUtil = body.ignorar_dia_util === true

  const out: Record<string, unknown> = {}
  const json = (s = 200) =>
    new Response(JSON.stringify(out, null, 2), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: cfg, error: eCfg } = await sb
    .from('config_tracking_pandurata')
    .select('*')
    .eq('id', true)
    .maybeSingle()
  if (eCfg || !cfg) { out.erro = eCfg?.message ?? 'config_ausente'; return json(500) }

  if (cfg.pausado_motivo) {
    out.situacao = 'pausado'
    out.motivo = cfg.pausado_motivo
    return json()
  }

  const hoje = hojeBR()
  if (!ignorarDiaUtil) {
    const { data: diaUtil } = await sb.rpc('tracking_pandurata_e_dia_util', { p_data: hoje })
    if (diaUtil === false) { out.situacao = 'fora_de_dia_util'; out.data = hoje; return json() }
  }

  const gravar = cfg.ativo === true && !forcarSimulacao
  const modo = gravar ? 'gravacao' : 'simulacao'

  // Trava: uma rodada por vez.
  const { data: rodadaId, error: eLock } = await sb.rpc('tracking_pandurata_iniciar_rodada', { p_modo: modo })
  if (eLock) { out.erro = eLock.message; return json(500) }
  if (!rodadaId) { out.situacao = 'rodada_em_andamento'; return json() }

  const encerrar = async (patch: Record<string, unknown>) => {
    await sb.from('execucoes_tracking_pandurata')
      .update({ em_execucao: false, finalizado_em: new Date().toISOString(), ...patch })
      .eq('id', rodadaId)
  }

  try {
    // 1) Plano de notas a partir da data inicial.
    const { data: plano, error: ePlano } = await sb.rpc('siriuslog_plano', {
      p_de: cfg.data_inicial, p_ate: hoje,
    })
    if (ePlano) throw new Error(`plano: ${ePlano.message}`)
    const todas = ((plano ?? []) as Record<string, string | null>[]).map((l) => String(l.numero_nf))

    // 2) Remove notas ja concluidas e as que estouraram o limite de tentativas.
    const { data: fila } = await sb
      .from('fila_tracking_pandurata')
      .select('numero_nf, concluido_em, tentativas, ultima_tentativa_em')
    const filaMap = new Map((fila ?? []).map((f) => [String(f.numero_nf), f]))
    const pendentes = todas.filter((nf) => {
      const f = filaMap.get(nf)
      if (!f) return true
      if (f.concluido_em) return false
      return (f.tentativas ?? 0) < (cfg.max_tentativas ?? 3)
    })

    // 3) Garante linha na fila para toda nota nova.
    const novas = pendentes.filter((nf) => !filaMap.has(nf)).map((nf) => ({ numero_nf: nf }))
    if (novas.length) {
      await sb.from('fila_tracking_pandurata').upsert(novas, { onConflict: 'numero_nf' })
    }

    // Rotaciona: notas nunca tentadas primeiro, depois as mais antigas.
    // Assim o limite por rodada nao trava sempre nas mesmas notas.
    pendentes.sort((a, b) => {
      const ta = filaMap.get(a)?.ultima_tentativa_em ?? ''
      const tb = filaMap.get(b)?.ultima_tentativa_em ?? ''
      if (ta === tb) return a.localeCompare(b)
      return ta < tb ? -1 : 1
    })

    const lote = pendentes.slice(0, cfg.limite_por_rodada ?? 40)
    out.modo = modo
    out.data_inicial = cfg.data_inicial
    out.total_no_periodo = todas.length
    out.pendentes = pendentes.length
    out.processadas_nesta_rodada = lote.length
    out.restantes_na_fila = Math.max(0, pendentes.length - lote.length)

    if (!lote.length) {
      await encerrar({ processadas: 0, concluidas: 0, recusadas: 0 })
      out.situacao = 'fila_vazia'
      return json()
    }

    // 4) Executa o lote (siriuslog-lote cuida do login e da cadeia de status).
    const resp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/siriuslog-lote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        de: cfg.data_inicial,
        ate: hoje,
        nfs: lote,
        limite: lote.length,
        dry_run: !gravar,
        confirmar: gravar ? 'SIM' : undefined,
      }),
    })
    const texto = await resp.text()
    let dados: Record<string, unknown>
    try { dados = JSON.parse(texto) } catch { throw new Error(`lote_resposta_invalida: ${texto.slice(0, 300)}`) }
    if (dados.erro) throw new Error(`lote: ${String(dados.erro)}`)

    // 5) Atualiza a fila com o resultado nota a nota.
    const resultados = (dados.resultados ?? []) as Record<string, unknown>[]
    let concluidas = 0
    let recusadas = 0
    const agora = new Date().toISOString()

    for (const r of resultados) {
      const nf = String(r.nf)
      const passos = (r.passos ?? []) as Record<string, unknown>[]
      const httpErro = passos.find((p) => typeof p.http === 'number' && (p.http as number) >= 300)
      const ultimoOk = [...passos].reverse().find((p) => p.http === 204)
      const situacao = String(r.situacao ?? '')
      const statusPortal = (r.status_portal as string | null) ?? null
      const alvo = String(r.status_alvo ?? '')

      const alcancouEntrega =
        (gravar && !httpErro && alvo.toLowerCase().startsWith('entrega realizada')) ||
        (situacao === 'ja_atualizado' && (statusPortal ?? '').toLowerCase().startsWith('entrega realizada'))

      const concluir = CONCLUI.has(situacao) || alcancouEntrega
      if (concluir) concluidas++
      if (httpErro) recusadas++

      const patch: Record<string, unknown> = {
        numero_nf: nf,
        invoice_detail_id: (r.invoiceDetailId as number) ?? null,
        trip_id: (r.viagem as number) ?? null,
        status_portal: statusPortal,
        ultima_tentativa_em: agora,
        ultimo_erro: httpErro ? String(httpErro.resposta ?? httpErro.http) : null,
      }
      if (gravar && ultimoOk) patch.status_enviado = String(ultimoOk.status_destino ?? '')
      if (concluir) {
        patch.concluido_em = agora
        patch.motivo_conclusao = alcancouEntrega ? 'entrega_informada' : situacao
      }

      const anterior = filaMap.get(nf)
      const { error: eUp } = await sb.from('fila_tracking_pandurata')
        .upsert({ ...patch, tentativas: (anterior?.tentativas ?? 0) + (gravar ? 1 : 0) }, { onConflict: 'numero_nf' })
      if (eUp) out.aviso_fila = eUp.message
    }

    out.concluidas = concluidas
    out.recusadas = recusadas
    out.resultados = resultados
    await encerrar({ processadas: resultados.length, concluidas, recusadas, detalhe: { resumo: dados.modo } })
    out.situacao = gravar ? 'processado' : 'simulado (nada foi enviado)'
    return json()
  } catch (e) {
    await encerrar({ erro: String(e) })
    out.erro = String(e)
    return json(500)
  }
})
