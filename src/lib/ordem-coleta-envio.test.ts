import { describe, expect, it } from 'vitest';
import { autorizarEnvioSap, compararFrota, validarFrota } from '../../supabase/functions/pandurata-otm-enviar/frota';

const ordem = { status: 'pendente', codigo_otm: '737681', numero_roteiro: '0001813327', motorista: 'IVAN EMIDIO ROZA', cpf_motorista: '12345678901', placa: 'CUC6D38', placa_carreta: 'ARM8143' };
const vinculo = { shipment_id: 'BAU.737681', numero_dt: '0001813327' };
describe('Envio manual da frota Pandurata', () => {
  it('envia somente a carga vinculada à ordem', () => {
    expect(validarFrota(ordem, vinculo).shipment_id).toBe('BAU.737681');
    expect(() => validarFrota({ ...ordem, codigo_otm: '737680' }, vinculo)).toThrow();
    expect(() => validarFrota({ ...ordem, numero_roteiro: '1813320' }, vinculo)).toThrow();
  });
  it('não envia ordem cancelada', () => expect(() => validarFrota({ ...ordem, status: 'cancelada' }, vinculo)).toThrow());
  it('exige os quatro dados apenas para transmitir', () => {
    for (const field of ['motorista','cpf_motorista','placa','placa_carreta']) expect(() => validarFrota({ ...ordem, [field]: '' }, vinculo)).toThrow();
  });
  it('não sobrescreve frota diferente do portal', () => expect(compararFrota(['OUTRO MOTORISTA','','',''], [ordem.motorista,ordem.cpf_motorista,ordem.placa,ordem.placa_carreta])).toBe('conflito'));
  it('reconhece dados iguais sem repetir gravação', () => expect(compararFrota([ordem.motorista,'123.456.789-01',ordem.placa,ordem.placa_carreta],[ordem.motorista,ordem.cpf_motorista,ordem.placa,ordem.placa_carreta])).toBe('igual'));
  it('permite completar campos vazios sem alterar os já iguais', () => expect(compararFrota([ordem.motorista,'','',''],[ordem.motorista,ordem.cpf_motorista,ordem.placa,ordem.placa_carreta])).toBe('preencher'));
  it('aciona o SAP somente após frota confirmada e confirmação explícita', () => {
    expect(autorizarEnvioSap(true, true)).toBe(true);
    expect(autorizarEnvioSap(true, false)).toBe(false);
  });
  it('nunca aciona o SAP durante uma consulta somente leitura', () => {
    expect(autorizarEnvioSap(false, true)).toBe(false);
    expect(autorizarEnvioSap(false, false)).toBe(false);
  });
});