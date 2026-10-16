import { describe, expect, it, vi } from 'vitest';
import { operatorAccessStatus } from '../../supabase/functions/_shared/approved-operator';

function client(ativo: boolean | null, user: { id: string } | null = { id: 'operator' }) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    from: vi.fn().mockReturnValue({ select: () => ({ eq: () => ({
      maybeSingle: async () => ({ data: ativo === null ? null : { ativo }, error: null }),
    }) }) }),
  };
}

describe('Consultas de coordenadas exigem aprovação', () => {
  it('bloqueia operador com ativo=false mesmo com sessão válida', async () => {
    expect(await operatorAccessStatus('Bearer valid-session', client(false))).toBe(403);
  });
  it('permite operador com ativo=true', async () => {
    expect(await operatorAccessStatus('Bearer valid-session', client(true))).toBeNull();
  });
  it('bloqueia usuário sem perfil aprovado', async () => {
    expect(await operatorAccessStatus('Bearer valid-session', client(null))).toBe(403);
  });
  it('bloqueia consulta sem sessão', async () => {
    expect(await operatorAccessStatus(null, client(true))).toBe(401);
  });
  it('bloqueia sessão inválida antes de consultar perfis', async () => {
    const api = client(true, null);
    expect(await operatorAccessStatus('Bearer invalid-session', api)).toBe(401);
    expect(api.from).not.toHaveBeenCalled();
  });
});