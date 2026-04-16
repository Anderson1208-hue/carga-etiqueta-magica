import { describe, expect, it } from "vitest";

import { parseNFeXML } from "@/lib/xml-parser";

describe("parseNFeXML - cubagem Pandur", () => {
  it("lê o m³ do nVol quando o XML identifica o fornecedor por marca PANDUR", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <nfeProc>
        <NFe>
          <infNFe Id="NFe31260270940994008277550200007228751489934707">
            <ide>
              <nNF>722875</nNF>
            </ide>
            <emit>
              <xNome>FORNECEDOR XPTO</xNome>
              <CNPJ>70940994008277</CNPJ>
            </emit>
            <dest>
              <xNome>CLIENTE TESTE</xNome>
              <CNPJ>12345678000199</CNPJ>
              <enderDest>
                <xLgr>Rua Teste</xLgr>
                <nro>100</nro>
                <xBairro>Centro</xBairro>
                <xMun>Belo Horizonte</xMun>
                <UF>MG</UF>
                <CEP>30100000</CEP>
              </enderDest>
            </dest>
            <transp>
              <vol>
                <marca>PANDUR</marca>
                <nVol>3.918</nVol>
                <pesoL>492.282</pesoL>
                <pesoB>614.448</pesoB>
              </vol>
            </transp>
            <det nItem="1">
              <prod>
                <cProd>1</cProd>
                <xProd>Produto Teste</xProd>
                <qCom>1</qCom>
                <uCom>UN</uCom>
              </prod>
            </det>
          </infNFe>
        </NFe>
      </nfeProc>`;

    const parsed = parseNFeXML(xml);

    expect(parsed.volumeM3).toBeCloseTo(3.918, 3);
  });

  it("não usa nVol como m³ para XML comum sem identificação Pandur", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <nfeProc>
        <NFe>
          <infNFe Id="NFe31260270940994008277550200007228751489934708">
            <ide>
              <nNF>722876</nNF>
            </ide>
            <emit>
              <xNome>FORNECEDOR COMUM</xNome>
              <CNPJ>70940994008277</CNPJ>
            </emit>
            <dest>
              <xNome>CLIENTE TESTE</xNome>
              <CNPJ>12345678000199</CNPJ>
              <enderDest>
                <xLgr>Rua Teste</xLgr>
                <nro>100</nro>
                <xBairro>Centro</xBairro>
                <xMun>Belo Horizonte</xMun>
                <UF>MG</UF>
                <CEP>30100000</CEP>
              </enderDest>
            </dest>
            <transp>
              <vol>
                <marca>OUTRA</marca>
                <nVol>3.918</nVol>
              </vol>
            </transp>
            <det nItem="1">
              <prod>
                <cProd>1</cProd>
                <xProd>Produto Teste</xProd>
                <qCom>1</qCom>
                <uCom>UN</uCom>
              </prod>
            </det>
          </infNFe>
        </NFe>
      </nfeProc>`;

    const parsed = parseNFeXML(xml);

    expect(parsed.volumeM3).toBe(0);
  });
});