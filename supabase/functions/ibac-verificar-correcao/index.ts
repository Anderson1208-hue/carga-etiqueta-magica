import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { operatorAccessStatus } from '../_shared/approved-operator.ts';
import { abrirPortal, normalizarImagem, possuiImagem } from '../_shared/ibac-portal.ts';
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok',{headers:corsHeaders});
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const access=await operatorAccessStatus(req.headers.get('Authorization'),admin as any);
  if(access) return new Response('{}',{status:access,headers:corsHeaders});
  const {data:rows}=await admin.from('ibac_portal_validacao').select('*').in('numero_nf',['4399919','4400119','4400145','4400214']);
  const portal=await abrirPortal(); const out=[];
  for(const row of rows ?? []) {
    try {
      const p=await portal.localizar(row.chave);
      const {data:file}=await admin.storage.from('comprovantes').download(row.nova_foto_path);
      const bytes=new Uint8Array(await file.arrayBuffer()); let bin=''; for(let i=0;i<bytes.length;i+=8192) bin+=String.fromCharCode(...bytes.subarray(i,i+8192));
      const image=normalizarImagem(p.base64);
      out.push({nf:row.numero_nf,status:p.status,validacao:p.statusValidacaoIA,imagem:possuiImagem(p),mesma:image===btoa(bin),tamanhoPortal:image.length,tamanhoNova:btoa(bin).length});
      await new Promise(r=>setTimeout(r,2000));
    }catch(e){out.push({nf:row.numero_nf,erro:e instanceof Error?e.message:'Falha'});break;}
  }
  return new Response(JSON.stringify(out),{headers:{...corsHeaders,'Content-Type':'application/json'}});
});