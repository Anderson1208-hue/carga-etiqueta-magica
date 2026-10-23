export function prepararReenvio(item: { status: string; payload: Record<string, unknown> }, queueId: string) {
  if (item.status !== "recusado") throw new Error("Somente notas recusadas podem receber este reenvio.");
  const nova = item.payload.nova_foto_path;
  if (typeof nova !== "string" || !nova.startsWith(`okentrega-correcoes/${queueId}/`) || nova.includes("..")) {
    throw new Error("Anexe uma nova foto antes de reenviar.");
  }
  if (nova === item.payload.foto_path) throw new Error("O reenvio exige uma nova imagem.");
  const { nova_foto_path: _nova, ...payload } = item.payload;
  return { ...payload, foto_path: nova };
}