import { describe, expect, it, vi } from "vitest";
import { atualizarResultadosOkEntrega, INICIO_CONSULTA_OKENTREGA, STATUS_CONSULTA_OKENTREGA } from "./okentrega-atualizar";

const nota = (id: string) => ({ id, nf_id: id, numero_nf: `77${id}` });
describe("atualização manual OK Entrega", () => {
  it("seleciona somente enviadas em análise desde 22/10/2026", () => {
    expect(INICIO_CONSULTA_OKENTREGA).toBe("2026-10-22");
    expect(STATUS_CONSULTA_OKENTREGA).toEqual(["aguardando_aprovacao", "enviado"]);
  });
  it("percorre todas as páginas, consulta a data da nota e não presume aprovação de resultado desconhecido", async () => {
    const pagina = vi.fn().mockResolvedValueOnce([nota("1"), nota("2")]).mockResolvedValueOnce([nota("3")]).mockResolvedValueOnce([]);
    const consultar = vi.fn().mockResolvedValueOnce({ atualizado: true, status: "aprovado" }).mockResolvedValueOnce({ atualizado: false });
    const resultado = await atualizarResultadosOkEntrega({ pagina,
      datas: async () => new Map([["1", "2026-11-16"], ["2", "2026-11-13"]]), consultar, pausa: async () => {},
    });
    expect(pagina.mock.calls).toEqual([[undefined], ["2"], ["3"]]);
    expect(consultar).toHaveBeenCalledWith(nota("2"), "2026-11-13");
    expect(resultado).toMatchObject({ consultadas: 2, atualizadas: 1, aprovadas: 1, semResultado: 1, foraPeriodo: 1, incompleta: false });
  });
  it("preserva falhas individuais e indica quando a leitura do restante falhou", async () => {
    const resultado = await atualizarResultadosOkEntrega({
      pagina: vi.fn().mockResolvedValueOnce([nota("1"), nota("2")]).mockRejectedValueOnce(new Error("offline")),
      datas: async () => new Map([["1", "2026-11-16"], ["2", "2026-11-16"]]),
      consultar: vi.fn().mockRejectedValueOnce(new Error("portal indisponível")).mockResolvedValueOnce({ atualizado: true, status: "aguardando_aprovacao" }),
      pausa: async () => {},
    });
    expect(resultado).toMatchObject({ falhas: 1, emAnalise: 1, aprovadas: 0, incompleta: true });
  });
});