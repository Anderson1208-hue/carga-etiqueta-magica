// Sonda READ-ONLY do portal Sirius Log (Bauducco).
// Objetivo: validar login programático e leitura de UMA nota. Nada é gravado.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const SSO = 'https://sso.siriuslog.com'
const GATEWAY = 'https://siriuslog.com/gateway'
// Valores públicos, expostos no bundle do próprio portal:
const CLIENT_ID = 'TKwlKiwd1YHgKhqHxRbnECCRIZga'
const CLIENT_SECRET = 'vQMfgzLe2TIgnkPz39j9gr9h7gsa'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const out: Record<string, unknown> = { modo: 'somente-leitura' }
  const json = (status: number) =>
    new Response(JSON.stringify(out, null, 2), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  const user = Deno.env.get('SIRIUSLOG_USER')
  const pass = Deno.env.get('SIRIUSLOG_PASSWORD')
  if (!user || !pass) {
    out.erro = 'credenciais_ausentes'
    return json(200)
  }

  let nf = '758306'
  try {
    const body = await req.json()
    if (body?.nf) nf = String(body.nf)
  } catch { /* sem body */ }
  out.nf = nf

  // 1) token via password grant
  const basic = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)
  const tokenRes = await fetch(`${SSO}/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'password',
      username: user,
      password: pass,
      scope: 'openid',
    }),
  })
  const tokenTxt = await tokenRes.text()
  out.login_status = tokenRes.status
  if (!tokenRes.ok) {
    out.login_resposta = tokenTxt.slice(0, 600)
    return json(200)
  }
  const tok = JSON.parse(tokenTxt)
  out.login_ok = true
  out.token_tipo = tok.token_type
  out.token_expira_em = tok.expires_in
  const access = tok.access_token as string

  const headers = {
    Authorization: `Bearer ${access}`,
    'Content-Type': 'application/json',
  }

  // 2) leitura: busca a nota na visão de status de entrega
  const tentativas: Array<{ nome: string; url: string; init: RequestInit }> = [
    {
      nome: 'delivery-status-view',
      url: `${GATEWAY}/sirius-national-tracking-api/v1/trip/delivery/status/view`,
      init: {
        method: 'POST',
        headers,
        body: JSON.stringify({ page: 0, size: 5, invoiceNumber: nf }),
      },
    },
    {
      nome: 'invoice-status-all',
      url: `${GATEWAY}/sirius-national-tracking-api/v1/trip/status/all`,
      init: { method: 'GET', headers },
    },
    {
      nome: 'detailed-status-all',
      url: `${GATEWAY}/sirius-national-tracking-api/v1/trip/invoice/detailed-status/all`,
      init: { method: 'GET', headers },
    },
  ]

  const leituras: unknown[] = []
  for (const t of tentativas) {
    try {
      const r = await fetch(t.url, t.init)
      const txt = await r.text()
      leituras.push({ nome: t.nome, status: r.status, amostra: txt.slice(0, 800) })
    } catch (e) {
      leituras.push({ nome: t.nome, erro: String(e) })
    }
  }
  out.leituras = leituras
  return json(200)
})
