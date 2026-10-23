export function portalDocumentId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.match(/abrirDocumento\(\s*["']?(\d+)/)?.[1]
    ?? value.match(/\bid\s*=\s*["']?(\d+)/)?.[1];
}

export function portalValidationText(value: unknown): string | null {
  const text = Array.isArray(value) ? value[0] : value;
  return typeof text === 'string' ? text.replace(/<[^>]*>/g, '').trim().slice(0, 500) : null;
}

export function portalQueueStatus(value: unknown) {
  const text = portalValidationText(value)?.toLowerCase();
  if (text === 'registrado') return { status: 'aprovado', status_comprovante: '1' };
  if (text === 'recusado') return { status: 'recusado', status_comprovante: '2' };
  return null;
}