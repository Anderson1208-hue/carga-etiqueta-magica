import { test, expect } from "vitest";
import { linhasModeloCacau } from "@/lib/divergencia-recebimento";
test("modelo cacau", () => {
  const l = linhasModeloCacau([{ id:"1", numero_nf:"10", c_prod:"001001113", x_prod:"X", tipo:"falta_parcial", quantidade:15, observacao:null, fotos:[], criado_em:"2026-11-17T18:00:00Z", criado_por_nome:"Gessica" }],
    { numeroCarga:"256053", placa:"ABC1D23", emissaoPorNf:{ "10":"2026-11-16" }, itensPorNf:{} });
  expect(l[0].length).toBe(13);
  expect(l[0][5]).toBe(1001113); expect(l[0][7]).toBe("15 - falta"); expect(l[0][8]).toBe(256053);
  expect(l[0][9]).toBe("NF'S SEGUIRAM PARA AS ENTREGAS COM FALTA");
});
