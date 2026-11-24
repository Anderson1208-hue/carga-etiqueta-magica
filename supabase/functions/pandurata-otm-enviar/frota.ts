export type Frota = { shipment_id: string; numero_dt: string; motorista: string; cpf_motorista: string; placa: string; placa_carreta: string };

export function validarFrota(o: { status: string; codigo_otm: string | null; numero_roteiro: string | null; motorista: string | null; cpf_motorista: string | null; placa: string | null; placa_carreta: string | null }, vinculo: { shipment_id: string; numero_dt: string | null }): Frota {
  if (o.status === 'cancelada') throw new Error('Ordem cancelada não pode ser enviada.');
  const shipment = `BAU.${(o.codigo_otm ?? '').replace(/^BAU\./i, '').trim()}`;
  const dt = (s: string) => s.replace(/\D/g, '').replace(/^0+/, '');
  if (shipment !== vinculo.shipment_id || !o.numero_roteiro || !vinculo.numero_dt || dt(o.numero_roteiro) !== dt(vinculo.numero_dt)) throw new Error('Código OTM e roteiro devem corresponder à carga vinculada.');
  if (!o.motorista?.trim() || !/^\d{11}$/.test(o.cpf_motorista ?? '') || !/^[A-Z0-9]{7}$/.test(o.placa ?? '') || !/^[A-Z0-9]{7}$/.test(o.placa_carreta ?? '')) throw new Error('Preencha motorista, CPF com 11 números e as duas placas antes do envio.');
  return { shipment_id: shipment, numero_dt: vinculo.numero_dt, motorista: o.motorista.trim(), cpf_motorista: o.cpf_motorista ?? '', placa: o.placa ?? '', placa_carreta: o.placa_carreta ?? '' };
}

export function compararFrota(atual: string[], esperada: string[]) {
  const norm = (s: string, i: number) => i === 1 ? s.replace(/\D/g, '') : s.replace(/\s+/g, ' ').trim().toUpperCase();
  if (atual.length !== 4 || esperada.length !== 4) return 'conflito';
  if (atual.every((s, i) => norm(s, i) === norm(esperada[i], i))) return 'igual';
  return atual.some((s, i) => s.trim() && norm(s, i) !== norm(esperada[i], i)) ? 'conflito' : 'preencher';
}