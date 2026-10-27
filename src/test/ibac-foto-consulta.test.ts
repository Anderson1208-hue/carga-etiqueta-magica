import { describe, expect, it } from 'vitest';
import { fotoCorretivaConfirmada } from '../lib/ibac-foto-consulta';

describe('foto corretiva na consulta sem alterar o original', () => {
  const foto = { nova_foto_path: 'ibac-correcoes/4400103/nova.jpg', nova_foto_enviada_em: '2026-10-27T15:18:38.002Z', correcao_estado: null };
  it('exibe a correção enviada da NF 4400103 pelo fluxo anterior', () => {
    expect(fotoCorretivaConfirmada(foto)).toBe(foto.nova_foto_path);
  });
  it('exibe substituições confirmadas pelo fluxo atual', () => {
    expect(fotoCorretivaConfirmada({ ...foto, correcao_estado: 'enviado' })).toBe(foto.nova_foto_path);
  });
  it('não apresenta anexo sem envio ou tentativa falha como foto enviada', () => {
    expect(fotoCorretivaConfirmada({ ...foto, nova_foto_enviada_em: null })).toBeNull();
    expect(fotoCorretivaConfirmada({ ...foto, correcao_estado: 'falha_envio' })).toBeNull();
    expect(fotoCorretivaConfirmada(null)).toBeNull();
  });
});