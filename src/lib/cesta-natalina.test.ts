import { describe, it, expect } from "vitest";
import { itensConferencia, itensNotaDeCarga } from "./cesta-natalina";

const x = (i: { x: string; q: number }) => i.x;
const q = (i: { x: string; q: number }) => i.q;

describe("cesta natalina", () => {
  const cesta = [
    { x: "Emb. Cesta Bauducco 15 Itens", q: 150 },
    { x: "Panettone B. 400g", q: 150 },
    { x: "Cookies", q: 150 },
  ];
  it("NF de cesta mantém só a embalagem", () => {
    expect(itensConferencia(cesta, x)).toEqual([cesta[0]]);
  });
  it("NF 766962: cesta com 25 volumes sai 25 caixas", () => {
    const r = itensNotaDeCarga(cesta, x, q, 25);
    expect(r).toHaveLength(1);
    expect(r[0].qtdCaixas).toBe(25);
  });
  it("NF normal mantém todos os itens e quantidades", () => {
    const r = itensNotaDeCarga([{ x: "Panettone", q: 10 }, { x: "Cookies", q: 5 }], x, q, 3);
    expect(r.map((i) => i.qtdCaixas)).toEqual([10, 5]);
  });
});

import { caixasNf as _caixasNf } from "./cesta-natalina";
import { it as _it, expect as _expect } from "vitest";
_it("NF de cesta conta o total de caixas da nota no resumo (NF 767027 = 18)", () => {
  const itens = [{ q_com: 108, x_prod: "EMB. CESTA BAUDUCCO 15 ITENS" }, ...Array.from({ length: 7 }, () => ({ q_com: 108, x_prod: "PANETTONE" }))];
  _expect(_caixasNf({ itens_nf: itens, qtd_volumes: 18 })).toBe(18);
  _expect(_caixasNf({ itens_nf: [{ q_com: 5, x_prod: "WAFER" }], qtd_volumes: 2 })).toBe(5);
});
