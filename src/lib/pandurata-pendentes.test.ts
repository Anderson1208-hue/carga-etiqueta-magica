import { describe, expect, it } from "vitest";
import { coletaDePendentePandurata, localDaParada, type CargaPendentePandurata } from "./pandurata-pendentes";

const carga = {
  id: "c1", shipment_id: "BAU.732930", remessa_id: "732930", numero_dt: "0001812103",
  inicio_viagem: "2026-11-17T09:00:00+00:00", qtd_pallets: 38, peso_bruto_kg: 9631.35, peso_liquido_kg: 9631.35,
  volume_bruto_m3: 88.68, volume_liquido_m3: 81.84, remessas: ["880878942"], tipo_carga: "SECA", tipo_equipamento: "CARRETA_FRAC",
  paradas: [{ seq: 1, tipo: "COLETA", local: "C1043 PANDURATA ALIMENTOS LTDA EXTREMA MG 37640000", nome: "PANDURATA ALIMENTOS LTDA" }],
} as unknown as CargaPendentePandurata;

describe("ordem de coleta a partir do portal Pandurata", () => {
  it("leva volume líquido e bruto como no portal", () => {
    const f = coletaDePendentePandurata(carga, { id: "e1", nome: "PANDURATA" });
    expect(f.cubagem_m3).toBe("88.68");
    expect(f.volume_liquido_m3).toBe("81.84");
  });
  it("usa ID da remessa como código OTM e DT como roteiro", () => {
    const f = coletaDePendentePandurata(carga, null);
    expect(f.codigo_otm).toBe("732930");
    expect(f.numero_roteiro).toBe("0001812103");
  });
  it("data e hora da coleta em Brasília", () => {
    const f = coletaDePendentePandurata(carga, null);
    expect(f.data_coleta).toBe("2026-11-17");
    expect(f.hora_prevista).toBe("06:00");
  });
  it("cidade e UF da parada de coleta", () => {
    expect(localDaParada("C1043 PANDURATA ALIMENTOS LTDA EXTREMA MG 37640000", "PANDURATA ALIMENTOS LTDA")).toEqual({ cidade: "EXTREMA", uf: "MG", cep: "37640000" });
  });
});
