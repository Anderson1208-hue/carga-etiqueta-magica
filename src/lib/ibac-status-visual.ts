export interface RetornoIbac {
  status_portal?: string | null;
  status_validacao?: string | null;
}

export function validadoIbac(portal?: RetornoIbac | null): boolean {
  return portal?.status_portal?.trim().toUpperCase() === 'APROVADO'
    || ['VALIDO', 'VÁLIDO'].includes(portal?.status_validacao?.trim().toUpperCase() ?? '');
}

export function statusVisualIbac(status: string, portal?: RetornoIbac | null): string {
  return status === 'erro' && validadoIbac(portal) ? 'validado' : status;
}