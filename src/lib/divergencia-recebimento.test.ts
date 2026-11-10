import { describe, it, expect } from "vitest";
import { dividirPacotes, linhasPlanilha, nomesFotos, turnoDe, type DivergenciaRow } from "./divergencia-recebimento";

const base: DivergenciaRow = { id: "1", numero_nf: "4400103", c_prod: "0001003489", x_prod: "PANETTONE", tipo: "avaria",
  quantidade: 2, observacao: null, fotos: ["c/n/a.jpeg", "c/n/b.png"], criado_em: "2026-11-10T13:00:00Z", criado_por_nome: "Gilson" };
const ctx = { numeroCarga: "226834", placa: "ABC1D23", emissaoPorNf: { "4400103": "2026-11-08" },
  itensPorNf: { "4400103": [{ c_prod: "001", x_prod: "A", q_com: 10 }, { c_prod: "002", x_prod: "B", q_com: 5 }] } };

describe("divergência de recebimento", () => {
  it("nomeia fotos com NF, código sem zeros, tipo e ordem", () => {
    expect(nomesFotos(base)).toEqual(["NF4400103_cProd1003489_avaria_1.jpeg", "NF4400103_cProd1003489_avaria_2.png"]);
  });
  it("avaria gera uma linha com quantidade e nomes das fotos", () => {
    const [l] = linhasPlanilha([base], ctx);
    expect(l[5]).toBe("1003489");
    expect(l[7]).toBe("2 - avaria");
    expect(l[8]).toBe("226834");
    expect(l[16]).toContain("NF4400103_cProd1003489_avaria_1.jpeg");
  });
  it("falta total abre todos os códigos da NF com o motivo de devolução", () => {
    const linhas = linhasPlanilha([{ ...base, tipo: "falta_total", c_prod: null, quantidade: 0 }], ctx);
    expect(linhas).toHaveLength(2);
    expect(linhas[0][7]).toBe("10 - falta total");
    expect(String(linhas[1][9])).toContain("Não veio produto — Falta oriunda da origem");
  });
  it("turno pelo horário de Brasília", () => {
    expect(turnoDe("2026-11-10T13:00:00Z")).toBe("1° TURNO"); // 10h
    expect(turnoDe("2026-11-10T20:00:00Z")).toBe("2° TURNO"); // 17h
    expect(turnoDe("2026-11-11T02:00:00Z")).toBe("3° TURNO"); // 23h
  });
  it("divide em pacotes de até 20 MB com a planilha no primeiro", () => {
    const MB = 1024 * 1024;
    const p = dividirPacotes({ size: 1 * MB }, [{ size: 12 * MB }, { size: 8 * MB }, { size: 3 * MB }]);
    expect(p.map((x) => x.length)).toEqual([2, 2]);
    expect(p[0][0].size).toBe(MB);
  });
});
