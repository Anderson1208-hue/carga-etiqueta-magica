export function validarEdicao(quantidade: string, motivo: string, inteira: boolean, total: boolean) {
  if (!motivo.trim()) return "Informe o motivo da alteração";
  const q = Number(quantidade);
  if (!total && (!quantidade.trim() || !Number.isFinite(q) || q <= 0 || (inteira && !Number.isInteger(q)))) return "Informe uma quantidade válida";
  return null;
}