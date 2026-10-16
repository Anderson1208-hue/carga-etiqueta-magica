import { describe, it, expect } from "vitest";
import { itensConferencia } from "./cesta-natalina";

const x = (i: { x: string }) => i.x;

describe("cesta natalina", () => {
  it("NF de cesta mantém só a embalagem", () => {
    const r = itensConferencia([{ x: "Emb. Cesta Bauducco 15 Itens" }, { x: "Panettone B. 400g" }, { x: "Cookies" }], x);
    expect(r).toEqual([{ x: "Emb. Cesta Bauducco 15 Itens" }]);
  });
  it("NF normal mantém todos os itens", () => {
    expect(itensConferencia([{ x: "Panettone B. 400g" }, { x: "Cookies" }], x)).toHaveLength(2);
  });
});
