export const correcaoPendente = (estado?: string | null) => Boolean(estado && !['enviado', 'preparada', 'falha_preparo'].includes(estado));
export const confirmacaoSubstituicao = (estado?: string | null) => correcaoPendente(estado)
  ? 'Retomar a substituição da foto? O sistema verificará o portal e não repetirá uma exclusão já realizada.'
  : 'Excluir a imagem inválida do portal Cacau Show e enviar a nova? A foto anterior ficará preservada no Orkestria. Isso não significa aprovação do canhoto.';