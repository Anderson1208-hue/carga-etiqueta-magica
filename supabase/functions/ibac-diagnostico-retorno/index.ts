import { createClient } from 'npm:@supabase/supabase-js@2';
import { operatorAccessStatus } from '../_shared/approved-operator.ts';
Deno.serve(async req => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const access = await operatorAccessStatus(req.headers.get('Authorization'), admin as any);
  if (access) return new Response('{}', { status: access });
  const base = 'https://cacaushow.mosistemas.com/app/api/';
  const r = await fetch(base + 'login', { method:'POST', headers:{'Content-Type':'application/json','sigla-sistema':'APP'}, body: JSON.stringify({ email:Deno.env.get('IBAC_PORTAL_USUARIO'), senha:Deno.env.get('IBAC_PORTAL_SENHA'), empresa:null, siglaSistema:'APP' }) });
  const l = await r.json();
  if (!l?.id) return new Response('{}', {status:502});
  const headers = {'auth-token':String(l.id),'sigla-sistema':String(l.produto ?? 'APP'),Accept:'application/json'};
  const wanted = ['4400103','4400119','4400214','4400145','4399919'];
  const found = [];
  for (let offset=0; offset<6000; offset+=200) {
    const p = await (await fetch(base+`transportador/canhotos?limit=200&offset=${offset}`,{headers})).json();
    for (const row of p.data ?? []) if (wanted.includes(String(row.numero))) {
      const d = await (await fetch(base+'transportador/canhotos/'+encodeURIComponent(row.oid),{headers})).json();
      const safe = (v:any) => ({oid:v?.oid,chave:v?.chave,numero:v?.numero,status:v?.status,statusValidacaoIA:v?.statusValidacaoIA,possuiImagem:v?.possuiImagem,hasBase64:typeof v?.base64==='string' && v.base64.length>0});
      found.push({list:safe(row),detail:safe(d),documento:safe(d?.documentoIndustria),documentoKeys:Object.keys(d?.documentoIndustria ?? {}),keys:Object.keys(d ?? {})});
    }
    if ((p.data?.length ?? 0)<200 || offset+200>=p.total) break;
  }
  return new Response(JSON.stringify(found),{headers:{'Content-Type':'application/json'}});
});