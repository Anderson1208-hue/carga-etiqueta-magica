import { describe, it, expect } from "vitest";
import { FATOR_CUBAGEM_IBAC } from "./notfis-cubagem-parser";
describe("fator cubagem EDI Cacau", () => {
  it("usa 250 kg/m³", () => { expect(FATOR_CUBAGEM_IBAC).toBe(250); expect(+(253 / FATOR_CUBAGEM_IBAC).toFixed(3)).toBe(1.012); });
});
