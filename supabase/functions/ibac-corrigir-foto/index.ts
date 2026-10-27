// Explicit photo replacement; never use the automatic transmission queue.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { operatorAccessStatus } from '../_shared/approved-operator.ts';
import { abrirPortal, normalizarImagem, possuiImagem } from '../_shared/ibac-portal.ts';
import { fotoInvalida, proximaEtapa } from '../_shared/ibac-substituicao-regras.ts';

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const Body = z.object({ acao: z.enum(['anexar', 'reenviar']), chave: z.string().regex(/^\d{44}$/), nova_foto_path: z.string().regex(/^ibac-correcoes\/\d{44}\/[0-9a-f-]{36}\.(jpg|png)$/i).optional() });
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ mensagem: 'Método não permitido' }, 405);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const access = await operatorAccessStatus(req.headers.get('Authorization'), admin as any);
  if (access) return json({ mensagem: access === 401 ? 'Não autenticado' : 'Operador não aprovado' }, access);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ mensagem: 'Dados inválidos' }, 400);
  const { acao, chave, nova_foto_path } = parsed.data;
  const token = crypto.randomUUID();
  const { data: reservado, error: lockError } = await admin.rpc('ibac_reservar_correcao', { p_chave: chave, p_token: token });
  if (lockError) return json({ mensagem: 'Não foi possível reservar a substituição.' }, 503);
  if (!reservado) return json({ mensagem: 'Nota não encontrada ou substituição em andamento por outro operador.' }, 409);
  let operacao: any = null;
  let estado = 'preparada';
  const patchPortal = async (valores: Record<string, unknown>) => {
    const { data, error } = await admin.from('ibac_portal_validacao').update(valores).eq('chave', chave).eq('correcao_lock', token).select('chave').maybeSingle();
    if (error || !data) throw new Error('Não foi possível registrar a substituição com segurança.');
  };
  const registrar = async (novoEstado: string, valores: Record<string, unknown> = {}) => {
    if (!operacao) throw new Error('Operação não registrada.');
    const { error } = await admin.from('ibac_foto_substituicoes').update({ estado: novoEstado, updated_at: new Date().toISOString(), ...valores }).eq('id', operacao.id);
    if (error) throw new Error('Não foi possível preservar o histórico da substituição.');
    estado = novoEstado;
    await patchPortal({ correcao_estado: estado });
  };
  try {
    const { data: linha, error } = await admin.from('ibac_portal_validacao').select('*').eq('chave', chave).single();
    if (error || !linha) throw new Error('Nota não encontrada.');
    if (acao === 'anexar') {
      if (!fotoInvalida({ status: linha.status_portal, statusValidacaoIA: linha.status_validacao })) return json({ mensagem: 'Somente notas reprovadas podem receber foto corretiva.' }, 409);
      if (linha.correcao_estado && !['enviado', 'preparada', 'falha_preparo'].includes(linha.correcao_estado)) return json({ mensagem: 'Retome a substituição em andamento antes de anexar outra foto.' }, 409);
      if (!nova_foto_path?.includes(`/${chave}/`)) return json({ mensagem: 'Foto inválida.' }, 400);
      const { data: file, error: fe } = await admin.storage.from('comprovantes').download(nova_foto_path);
      if (fe || !file || file.size === 0 || file.size > 5 * 1024 * 1024) return json({ mensagem: 'Foto ausente ou maior que 5 MB.' }, 400);
      await patchPortal({ nova_foto_path, nova_foto_anexada_em: new Date().toISOString(), nova_foto_enviada_em: null, nova_foto_queue_id: null, nova_foto_resultado: null, correcao_estado: 'preparada' });
      return json({ status: 'foto_anexada' });
    }
    if (!linha.nova_foto_path) return json({ mensagem: 'Anexe uma nova foto antes de reenviar.' }, 409);
    if (linha.nova_foto_enviada_em) return json({ mensagem: 'Esta foto já foi enviada. Consulte a validação do portal.' }, 409);
    const { data: file, error: fe } = await admin.storage.from('comprovantes').download(linha.nova_foto_path);
    if (fe || !file || file.size === 0 || file.size > 5 * 1024 * 1024) throw new Error('Nova foto indisponível ou maior que 5 MB. Nenhuma exclusão realizada.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
    if (!jpeg && !png) throw new Error('O arquivo não é uma foto JPEG ou PNG válida.');
    let bin = ''; for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const base64 = btoa(bin);
    const { data: existente, error: oe } = await admin.from('ibac_foto_substituicoes').select('*').eq('nova_foto_path', linha.nova_foto_path).maybeSingle();
    if (oe) throw new Error('Não foi possível consultar o histórico.');
    operacao = existente;
    if (!operacao) {
      const { data: criada, error: ce } = await admin.from('ibac_foto_substituicoes').insert({ chave, nova_foto_path: linha.nova_foto_path }).select('*').single();
      if (ce || !criada) throw new Error('Não foi possível criar o histórico da substituição.');
      operacao = criada;
    }
    estado = operacao.estado;
    const portal = await abrirPortal();
    let atual = await portal.localizar(chave, operacao.portal_oid);
    const oid = String(atual.oid ?? operacao.portal_oid ?? '');
    if (!oid) throw new Error('Imagem sem identificação segura no portal.');
    const espelhar = async (p: any) => patchPortal({ status_portal: p.status ?? null, status_validacao: p.statusValidacaoIA ?? null, possui_imagem: possuiImagem(p) ? 'Sim' : 'Não', justificativa: typeof p.justificativa === 'string' ? p.justificativa : null, consultado_em: new Date().toISOString() });
    await espelhar(atual);
    const etapa = proximaEtapa(estado, possuiImagem(atual), normalizarImagem(atual.base64) === base64);
    if (etapa === 'bloquear') throw new Error('Imagem atual diferente ou situação incerta. Nenhuma nova exclusão realizada; confira o portal.');
    if (etapa === 'excluir') {
      if (!fotoInvalida(atual)) throw new Error('O portal não informa reprovação atual. Nenhuma imagem excluída.');
      const anterior = normalizarImagem(atual.base64);
      if (!anterior) throw new Error('Não foi possível preservar a imagem anterior. Nenhuma exclusão realizada.');
      const backup = `ibac-correcoes/${chave}/historico/${operacao.id}.json`;
      const snapshot = JSON.stringify({ chave, oid, base64: atual.base64, nomeImagem: atual.nomeImagem ?? null, status: atual.status, statusValidacaoIA: atual.statusValidacaoIA, preservada_em: new Date().toISOString() });
      if (!operacao.backup_path) {
        const { error: be } = await admin.storage.from('comprovantes').upload(backup, new Blob([snapshot], { type: 'application/json' }), { upsert: false });
        // A previous interrupted request may already have saved this immutable object.
        // Never overwrite it; the read-back comparison below decides whether it is safe.
        if (be && !['409', 'Duplicate'].includes(String((be as any).statusCode ?? be.name))) throw new Error('Falha ao preservar a foto anterior. Nenhuma exclusão realizada.');
      }
      const { data: copia, error: de } = await admin.storage.from('comprovantes').download(operacao.backup_path ?? backup);
      if (de || !copia || normalizarImagem(JSON.parse(await copia.text()).base64) !== anterior) throw new Error('Cópia histórica não confirmada. Nenhuma exclusão realizada.');
      await registrar('preparada', { backup_path: operacao.backup_path ?? backup, portal_oid: oid });
      atual = await portal.localizar(chave, oid);
      if (!fotoInvalida(atual) || normalizarImagem(atual.base64) !== anterior) throw new Error('A imagem ou validação mudou no portal. Nenhuma exclusão realizada.');
      await registrar('exclusao_iniciada');
      await portal.excluir(oid);
      atual = await portal.localizar(chave, oid);
      await espelhar(atual);
      if (possuiImagem(atual)) throw new Error('A remoção não foi confirmada. Confira o portal antes de retomar.');
      await registrar('removida', { imagem_removida_em: new Date().toISOString() });
    }
    if (etapa !== 'concluido') {
      // On recovery, recheck immediately before sending; never delete again.
      atual = await portal.localizar(chave, oid);
      if (possuiImagem(atual) || String(atual.status).toUpperCase().includes('APROV')) throw new Error('Portal mudou antes do envio; operação interrompida sem nova exclusão.');
      await registrar('envio_iniciado');
      await portal.enviar(oid, base64, jpeg ? 'canhoto.jpg' : 'canhoto.png', atual.detalhePortal);
      atual = await portal.localizar(chave, oid);
      if (!possuiImagem(atual) || normalizarImagem(atual.base64) !== base64) throw new Error('Envio sem confirmação inequívoca da nova foto. Consulte o portal antes de retomar.');
      await espelhar(atual);
    }
    await espelhar(atual);
    const enviada = new Date().toISOString();
    await registrar('enviado', { enviada_em: enviada, resultado: 'Nova imagem confirmada no portal; validação depende da Cacau Show.' });
    await patchPortal({ nova_foto_enviada_em: enviada, nova_foto_resultado: 'Nova imagem confirmada no portal; aguardando validação do cliente.' });
    return json({ status: 'enviado', mensagem: 'Nova imagem confirmada no portal. A validação depende da Cacau Show.' });
  } catch (e) {
    const detalhe = e instanceof Error ? e.message : 'Falha na substituição.';
    const interrompida = ['exclusao_iniciada', 'removida', 'envio_iniciado', 'falha_envio'].includes(estado);
    const mensagem = estado === 'removida' ? `Imagem removida; envio da substituta falhou. Retome somente o envio. ${detalhe}` : interrompida ? `Substituição interrompida; verifique o portal e use Retomar envio. ${detalhe}` : detalhe;
    if (operacao && estado !== 'enviado') {
      if (estado === 'removida' || estado === 'envio_iniciado') estado = 'falha_envio';
      await admin.from('ibac_foto_substituicoes').update({ estado, resultado: mensagem, updated_at: new Date().toISOString() }).eq('id', operacao.id);
    }
    await patchPortal({ correcao_estado: estado, nova_foto_resultado: mensagem }).catch(() => null);
    return json({ status: 'interrompido', mensagem }, 409);
  } finally {
    await admin.from('ibac_portal_validacao').update({ correcao_lock: null, correcao_lock_em: null }).eq('chave', chave).eq('correcao_lock', token);
  }
});
