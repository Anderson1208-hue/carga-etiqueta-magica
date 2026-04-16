import { describe, expect, it } from "vitest";

import { parseNFeVolumeXML } from "@/lib/xml-volume-parser";

describe("parseNFeVolumeXML", () => {
  it("extrai o m³ do nVol quando o emitente é Pandurata", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <nfeProc>
        <NFe>
          <infNFe Id="NFe31260270940994008277550200007228751489934707">
            <ide><nNF>722875</nNF></ide>
            <emit>
              <xNome>PANDURATA ALIMENTOS LTDA</xNome>
              <CNPJ>70940994008277</CNPJ>
            </emit>
            <transp>
              <vol>
                <marca>PANDUR</marca>
                <nVol>3.918</nVol>
                <pesoL>492.282</pesoL>
                <pesoB>614.448</pesoB>
              </vol>
            </transp>
          </infNFe>
        </NFe>
      </nfeProc>`;

    const parsed = parseNFeVolumeXML(xml);

    expect(parsed.fornecedor).toContain("PANDURATA");
    expect(parsed.chaveAcesso).toBe("31260270940994008277550200007228751489934707");
    expect(parsed.volumeM3).toBeCloseTo(3.918, 3);
  });

  it("normaliza chave mesmo com caracteres extras", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <nfeProc>
        <NFe>
          <infNFe Id="NFe 31260270940994008277550200007228751489934707 ">
            <ide><nNF>722875</nNF></ide>
            <emit><xNome>PANDURATA</xNome></emit>
            <transp><vol><nVol>3.918</nVol></vol></transp>
          </infNFe>
        </NFe>
      </nfeProc>`;

    const parsed = parseNFeVolumeXML(xml);

    expect(parsed.chaveAcesso).toBe("31260270940994008277550200007228751489934707");
    expect(parsed.volumeM3).toBeCloseTo(3.918, 3);
  });
});