// Sonda do portal Sirius Log (Bauducco).
// Por padrao SOMENTE LEITURA. Gravacao ocorre apenas com
// { acao: "gravar-uma", confirmar: "SIM" } e sempre em UMA unica nota.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const SSO = 'https://sso.siriuslog.com'
const GATEWAY = 'https://portal.siriuslog.com'
const CLIENT_ID = 'TKwlKiwd1YHgKhqHxRbnECCRIZga'
const CLIENT_SECRET = 'vQMfgzLe2TIgnkPz39j9gr9h7gsa'
const REDIRECT = 'https://bauducco.siriuslog.com/#/login'
const TENANT = 'bauducco.siriuslog.com'
const TRACK = `${GATEWAY}/sirius-national-tracking-api/v1`

type Jar = Record<string, string>

function saveCookies(res: Response, jar: Jar) {
  for (const [k, v] of res.headers.entries()) {
    if (k.toLowerCase() !== 'set-cookie') continue
    for (const part of v.split(/,(?=[^;]+=)/)) {
      const m = part.trim().match(/^([^=]+)=([^;]*)/)
      if (m) jar[m[1]] = m[2]
    }
  }
}
const cookieHeader = (jar: Jar) =>
  Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')

async function login(user: string, pass: string) {
  const jar: Jar = {}
  const authUrl = `${SSO}/oauth2/authorize?` + new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    scope: 'openid',
  })
  let res = await fetch(authUrl, { redirect: 'manual' })
  saveCookies(res, jar)
  let loc = res.headers.get('location')
  let sessionDataKey: string | null = null
  if (loc) {
    const abs = loc.startsWith('http') ? loc : `${SSO}${loc}`
    sessionDataKey = new URL(abs).searchParams.get('sessionDataKey')
    if (!sessionDataKey) {
      res = await fetch(abs, { redirect: 'manual', headers: { cookie: cookieHeader(jar) } })
      saveCookies(res, jar)
      const html = await res.text()
      sessionDataKey = html.match(/sessionDataKey["'\s=:]+([\w-]+)/)?.[1] ?? null
    }
  }
  if (!sessionDataKey) throw new Error('sessionDataKey_nao_encontrada')

  res = await fetch(`${SSO}/commonauth`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      cookie: cookieHeader(jar),
    },
    body: new URLSearchParams({
      username: user,
      password: pass,
      sessionDataKey,
      tocommonauth: 'true',
    }),
  })
  saveCookies(res, jar)
  loc = res.headers.get('location')
  let code: string | null = null
  let hops = 0
  while (loc && hops < 6) {
    hops++
    const abs = loc.startsWith('http') ? loc : `${SSO}${loc}`
    code = new URL(abs.replace('/#/', '/')).searchParams.get('code')
    if (code) break
    if (abs.startsWith('https://bauducco.siriuslog.com')) break
    const r = await fetch(abs, { redirect: 'manual', headers: { cookie: cookieHeader(jar) } })
    saveCookies(r, jar)
    loc = r.headers.get('location')
  }
  if (!code) throw new Error('authorization_code_nao_obtido')

  res = await fetch(`${SSO}/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT,
    }),
  })
  if (!res.ok) throw new Error(`token_${res.status}: ${(await res.text()).slice(0, 300)}`)
  const tok = await res.json()
  return tok.access_token as string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const out: Record<string, unknown> = {}
  const json = (status = 200) =>
    new Response(JSON.stringify(out, null, 2), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  const user = Deno.env.get('SIRIUSLOG_USER')
  const pass = Deno.env.get('SIRIUSLOG_PASSWORD')
  if (!user || !pass) {
    out.erro = 'credenciais_ausentes'
    return json()
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* sem body */ }
  const acao = String(body.acao ?? 'consultar')
  const nf = String(body.nf ?? '758306')
  const confirmar = String(body.confirmar ?? '')
  const campo = String(body.campo ?? '')
  const valor = String(body.valor ?? '')
  out.acao = acao
  out.nf = nf
  out.modo = acao === 'gravar-uma' && confirmar === 'SIM' ? 'GRAVACAO-UMA-NOTA' : 'somente-leitura'

  let access: string
  try {
    access = await login(user, pass)
  } catch (e) {
    out.erro = String(e)
    return json()
  }
  const headers = {
    Authorization: `Bearer ${access}`,
    'Content-Type': 'application/json',
    tenant: TENANT,
  }
  out.login_ok = true

  const call = async (nome: string, url: string, method = 'GET', payload?: unknown, ms = 25000) => {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), ms)
    try {
      const r = await fetch(url, {
        method,
        headers,
        signal: ctl.signal,
        ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
      })
      const txt = await r.text()
      return { nome, status: r.status, corpo: txt.slice(0, 4000), _full: txt }
    } catch (e) {
      return { nome, erro: String(e) }
    } finally {
      clearTimeout(t)
    }
  }

  // status detalhados disponiveis (catalogo)
  if (acao === 'status-catalogo') {
    out.catalogo = await call('detailed-status/all', `${TRACK}/trip/invoice/detailed-status/all`)
    return json()
  }

  // localizar a nota
  const nfe = await call('nfe', `${GATEWAY}/sirius-load-composition-api/nfe?number=${nf}&size=5`)
  out.busca_nf = nfe
  let ids: number[] = []
  try {
    const b = JSON.parse((nfe as { corpo?: string }).corpo ?? '{}')
    const arr = b.content ?? b
    if (Array.isArray(arr)) ids = arr.map((x: { id: number }) => x.id).filter(Boolean)
  } catch { /* corpo truncado */ }
  out.invoice_ids = ids
  if (!ids.length) {
    out.erro = 'nf_nao_encontrada'
    return json()
  }

  const view = await call(
    'status/view',
    `${TRACK}/trip/delivery/status/view?page=0&size=5&invoiceIds=${ids.join(',')}`,
  )
  out.registro = view

  let reg: Record<string, unknown> | null = null
  try {
    const b = JSON.parse((view as { corpo?: string }).corpo ?? '{}')
    const arr = b.content ?? b
    if (Array.isArray(arr) && arr.length) reg = arr[0]
  } catch { /* truncado */ }

  const tripId = (reg?.id as number | undefined) ?? null
  out.tripId = tripId

  // detalhe da viagem -> lista de notas com seu invoiceDetailId
  let detailId: number | null = null
  if (tripId) {
    const det = await call('status/detail', `${TRACK}/trip/delivery/status/detail/${tripId}`)
    out.detalhe_viagem = det
    try {
      const b = JSON.parse((det as { corpo?: string }).corpo ?? '{}')
      const invs = b.invoices ?? b.deliveryInvoiceDetails ?? b.content ?? []
      if (Array.isArray(invs)) {
        out.notas_da_viagem = invs.map((x: Record<string, unknown>) => ({
          numero: x.invoiceNumber ?? x.number,
          invoiceDetailId: x.invoiceDetailId ?? x.id,
          statusDetalhado: (x.tripInvoiceDetailedStatus as { name?: string } | undefined)?.name ?? null,
          deliveryDate: x.deliveryDate ?? null,
          branchArrivalDate: x.branchArrivalDate ?? null,
        }))
        const hit = invs.find((x: Record<string, unknown>) =>
          String(x.invoiceNumber ?? x.number ?? '') === nf)
        detailId = (hit?.invoiceDetailId ?? hit?.id ?? null) as number | null
      }
    } catch { /* truncado */ }
  }
  out.invoice_detail_id = detailId

  if (acao !== 'gravar-uma') return json()
  if (confirmar !== 'SIM') {
    out.erro = 'gravacao_nao_confirmada'
    return json()
  }
  if (!detailId) {
    out.erro = 'invoice_detail_id_nao_encontrado'
    return json()
  }
  const CAMPOS = [
    'scheduleRequestDate',
    'deliverySchedulingDate',
    'estimatedDeliveryDate',
    'customerArrivalDate',
    'deliveryDate',
    'branchEstimatedArrivalDate',
    'branchArrivalDate',
    'branchDepartureDate',
  ]
  const statusId = Number(body.statusId ?? 0)

  // Modo A: mudar status detalhado (opcionalmente com uma data) - PATCH no recurso
  if (statusId) {
    const dataExtra = campo && valor && CAMPOS.includes(campo) ? { [campo]: valor } : {}
    const tentativas: unknown[] = []
    const payloads: Record<string, unknown>[] = [
      { tripInvoiceDetailedStatusId: statusId, ...dataExtra },
      { tripInvoiceDetailedStatus: { id: statusId }, ...dataExtra },
      { detailedStatusId: statusId, ...dataExtra },
    ]
    for (const p of payloads) {
      const r = await call('patch detalhe', `${TRACK}/delivery-invoice-detail/${detailId}`, 'PATCH', p)
      tentativas.push({ enviado: p, ...r })
      if ((r as { status?: number }).status && (r as { status: number }).status < 300) break
    }
    out.gravacao_status = tentativas
  } else {
    if (!CAMPOS.includes(campo) || !valor) {
      out.erro = 'campo_ou_valor_invalido'
      out.campos_aceitos = CAMPOS
      return json()
    }
    // Gravacao de UMA data, sem alterar status (modo "current-status" do portal)
    out.gravacao = await call(
      'patch current-status',
      `${TRACK}/delivery-invoice-detail/${detailId}/current-status`,
      'PATCH',
      { [campo]: valor },
    )
  }


  // reler para confirmar
  out.conferencia = await call(
    'reler status/view',
    `${TRACK}/trip/delivery/status/view?page=0&size=5&invoiceIds=${ids.join(',')}`,
  )
  return json()
})
