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

export function portalConsultationStatus(value: unknown) {
  return portalQueueStatus(value) ?? (portalValidationText(value)?.toLowerCase() === 'em análise'
    ? { status: 'aguardando_aprovacao', status_comprovante: null } : null);
}

type PortalOccurrence = { RESULTADO_VALIDA?: unknown; INFO_ORI?: Record<string, unknown> };

function portalDateOrder(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})(?::(\d{2}))?$/);
  return m ? Number(`${m[3]}${m[2]}${m[1]}${m[4]}${m[5]}${m[6] ?? '00'}`) : null;
}

export function latestPortalDelivery(entries: Record<string, PortalOccurrence>, originalId: string) {
  const all = Object.entries(entries);
  if (!all.some(([id]) => id.replace(/^[A-Za-z]+/, '') === originalId)) return null;
  const deliveries = all.filter(([, v]) => portalValidationText(v.INFO_ORI?.TIPOOCORRENCIA)?.toLowerCase() === 'entrega');
  if (!deliveries.length) return null;
  const dated = deliveries.map(([id, value]) => ({ id, value, order: portalDateOrder(value.INFO_ORI?.DTREGISTRO) }));
  if (dated.some(v => v.order === null)) return null;
  dated.sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
  if (dated.length > 1 && dated[0].order === dated[1].order) return null;
  return dated[0];
}