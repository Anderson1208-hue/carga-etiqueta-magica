export interface FotoCorretivaIbac {
  nova_foto_path: string | null;
  nova_foto_enviada_em: string | null;
  correcao_estado: string | null;
}

export function fotoCorretivaConfirmada(foto: FotoCorretivaIbac | null | undefined): string | null {
  if (!foto?.nova_foto_path || !foto.nova_foto_enviada_em) return null;
  // O teste anterior ao fluxo durável registrava apenas a data de envio.
  if (foto.correcao_estado !== null && foto.correcao_estado !== 'enviado') return null;
  return foto.nova_foto_path;
}