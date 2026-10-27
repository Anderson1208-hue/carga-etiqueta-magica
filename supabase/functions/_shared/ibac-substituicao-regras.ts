export function fotoInvalida(p: { status?: unknown; statusValidacaoIA?: unknown }) {
  const status = String(p.status ?? '').toUpperCase();
  return !status.includes('APROV') && (String(p.statusValidacaoIA ?? '').toUpperCase().includes('INVALID') || status.includes('REPROV'));
}

export function proximaEtapa(estado: string, possuiImagem: boolean, mesmaFoto: boolean): 'excluir' | 'enviar' | 'concluido' | 'bloquear' {
  if (estado === 'enviado') return 'concluido';
  if (['exclusao_iniciada', 'removida', 'envio_iniciado', 'falha_envio'].includes(estado)) {
    if (!possuiImagem) return 'enviar';
    return mesmaFoto ? 'concluido' : 'bloquear';
  }
  return possuiImagem ? 'excluir' : 'bloquear';
}