// A successful request is not proof of downstream SAP processing or email delivery.
export function interpretarRespostaSap(texto: string) {
  const norm = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  if (!/PROCESS BAU_SH_ENVIA_FROTA_SAP INITIATED\b/.test(norm)) return 'pendente';
  if (/\b(ERRO|ERROR|FALHA|FAILED)\b/.test(norm)) return 'erro';
  return /\bACAO REQUISITADA COM SUCESSO\b/.test(norm) ? 'requisitado' : 'pendente';
}