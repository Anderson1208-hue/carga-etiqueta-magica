// Parser for Brazilian NF-e XML files

export interface DestinatarioEndereco {
  razaoSocial: string;
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
}

export interface NFeParsed {
  numeroNf: string;
  chaveAcesso: string;
  razaoSocialEmitente: string;
  cnpjEmitente: string;
  cnpjDestinatario: string;
  dataEmissao: string | null;
  itens: ItemNFParsed[];
  destinatario?: DestinatarioEndereco;
  pesoBruto: number;
  pesoLiquido: number;
  volumeM3: number;
}

export interface ItemNFParsed {
  cProd: string;
  xProd: string;
  qCom: number;
  uCom: string;
}

export function parseNFeXML(xmlString: string): NFeParsed {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");

  // Check for parsing errors
  const parserError = xmlDoc.querySelector("parsererror");
  if (parserError) {
    throw new Error("XML inválido: " + parserError.textContent);
  }

  // Get the root NFe element (handles namespace)
  const nfeProc = xmlDoc.querySelector("nfeProc, NFe");
  if (!nfeProc) {
    throw new Error("Arquivo não é uma NF-e válida");
  }

  // Extract access key from infNFe id or protNFe
  let chaveAcesso = "";
  const infNFe = xmlDoc.querySelector("infNFe");
  if (infNFe) {
    const id = infNFe.getAttribute("Id");
    if (id) {
      // Format: NFe + 44 digits
      chaveAcesso = id.replace("NFe", "");
    }
  }

  // Fallback: try protNFe
  if (!chaveAcesso) {
    const chNFe = xmlDoc.querySelector("protNFe chNFe, chNFe");
    if (chNFe) {
      chaveAcesso = chNFe.textContent || "";
    }
  }

  if (!chaveAcesso) {
    throw new Error("Chave de acesso não encontrada no XML");
  }

  // Extract NF number
  const nNF = xmlDoc.querySelector("ide nNF, nNF");
  const numeroNf = nNF?.textContent || "";

  if (!numeroNf) {
    throw new Error("Número da NF não encontrado");
  }

  // Extract issuer data (emitente)
  const emit = xmlDoc.querySelector("emit");
  const xNome = emit?.querySelector("xNome");
  const CNPJ = emit?.querySelector("CNPJ");

  const razaoSocialEmitente = xNome?.textContent || "Emitente não identificado";
  const cnpjEmitente = CNPJ?.textContent || "";

  // Format CNPJ emitente
  const cnpjEmitenteFormatted = formatCNPJ(cnpjEmitente);

  // Extract recipient data (destinatário)
  const dest = xmlDoc.querySelector("dest");
  const destCNPJ = dest?.querySelector("CNPJ");
  const cnpjDestinatario = destCNPJ?.textContent || "";
  const cnpjDestinatarioFormatted = formatCNPJ(cnpjDestinatario);

  // Extract recipient address (endereço do destinatário)
  let destinatario: DestinatarioEndereco | undefined;
  if (dest) {
    const destNome = dest.querySelector("xNome");
    const enderDest = dest.querySelector("enderDest");
    
    if (enderDest) {
      destinatario = {
        razaoSocial: destNome?.textContent || "",
        logradouro: enderDest.querySelector("xLgr")?.textContent || "",
        numero: enderDest.querySelector("nro")?.textContent || "",
        bairro: enderDest.querySelector("xBairro")?.textContent || "",
        cidade: enderDest.querySelector("xMun")?.textContent || "",
        uf: enderDest.querySelector("UF")?.textContent || "",
        cep: enderDest.querySelector("CEP")?.textContent || "",
      };
    }
  }

  // Extract emission date
  const dhEmi = xmlDoc.querySelector("ide dhEmi, dhEmi");
  const dEmi = xmlDoc.querySelector("ide dEmi, dEmi");
  let dataEmissao: string | null = null;

  if (dhEmi?.textContent) {
    dataEmissao = dhEmi.textContent.split("T")[0];
  } else if (dEmi?.textContent) {
    dataEmissao = dEmi.textContent;
  }

  // Extract transport weight from transp/vol (total NF weight)
  const transp = xmlDoc.querySelector("transp");
  const vol = transp?.querySelector("vol");
  const pesoBrutoStr = vol?.querySelector("pesoB")?.textContent || "0";
  const pesoLiquidoStr = vol?.querySelector("pesoL")?.textContent || "0";
  const pesoBruto = parseFloat(pesoBrutoStr) || 0;
  const pesoLiquido = parseFloat(pesoLiquidoStr) || 0;

  // Extract cubic volume (m³) — not a native NF-e field; clients like Pandurata
  // commonly put it in <vol><esp> ("CUBAGEM 0,025"), <infCpl> or <infAdProd>.
  const volumeM3 = extractVolumeM3(xmlDoc);

  // Extract items (det elements)
  const detElements = xmlDoc.querySelectorAll("det");
  const itens: ItemNFParsed[] = [];

  detElements.forEach((det) => {
    const prod = det.querySelector("prod");
    if (prod) {
      const cProd = prod.querySelector("cProd")?.textContent || "";
      const xProd = prod.querySelector("xProd")?.textContent || "";
      const qComStr = prod.querySelector("qCom")?.textContent || "0";
      const uCom = prod.querySelector("uCom")?.textContent || "UN";

      const qCom = parseFloat(qComStr);

      if (cProd && xProd && qCom > 0) {
        itens.push({
          cProd,
          xProd,
          qCom,
          uCom,
        });
      }
    }
  });

  if (itens.length === 0) {
    throw new Error("Nenhum item encontrado na NF-e");
  }

  return {
    numeroNf,
    chaveAcesso,
    razaoSocialEmitente,
    cnpjEmitente: cnpjEmitenteFormatted,
    cnpjDestinatario: cnpjDestinatarioFormatted,
    dataEmissao,
    itens,
    destinatario,
    pesoBruto,
    pesoLiquido,
    volumeM3,
  };
}

/**
 * Extracts cubic volume (m³) from non-standard NF-e fields.
 * Tries, in order:
 *  1) <transp><vol><esp> — common for Pandurata ("CUBAGEM 0,025 M3")
 *  2) Any text node within <vol> matching a m³/cubagem pattern
 *  3) <infAdic><infCpl>
 *  4) Sum of <infAdProd> per item
 * Returns 0 when nothing is found.
 */
function extractVolumeM3(xmlDoc: Document): number {
  const transp = xmlDoc.querySelector("transp");
  const vol = transp?.querySelector("vol");

  // 0) Pandurata: <vol><NUMERO>0,025</NUMERO> (ao lado dos pesos)
  // Também aceita variações de caixa (numero/Numero) e tags similares.
  if (vol) {
    const candidatos = vol.querySelectorAll(
      "NUMERO, numero, Numero, nVol, qVol, cubagem, CUBAGEM, m3, M3"
    );
    for (const node of Array.from(candidatos)) {
      const raw = (node.textContent || "").trim().replace(",", ".");
      const v = parseFloat(raw);
      if (!isNaN(v) && v > 0 && v < 1000) {
        return v;
      }
    }
  }

  // 1) <vol><esp>
  const esp = vol?.querySelector("esp")?.textContent;
  const fromEsp = parseM3FromText(esp);
  if (fromEsp > 0) return fromEsp;

  // 2) Any text inside <vol> (marca, nVol, etc.)
  if (vol) {
    const fromVol = parseM3FromText(vol.textContent);
    if (fromVol > 0) return fromVol;
  }

  // 3) <infCpl>
  const infCpl = xmlDoc.querySelector("infAdic infCpl, infCpl")?.textContent;
  const fromCpl = parseM3FromText(infCpl);
  if (fromCpl > 0) return fromCpl;

  // 4) Sum from per-item <infAdProd>
  const detList = xmlDoc.querySelectorAll("det");
  let totalFromItems = 0;
  detList.forEach((det) => {
    const infAdProd = det.querySelector("infAdProd")?.textContent;
    totalFromItems += parseM3FromText(infAdProd);
  });
  return totalFromItems;
}

/**
 * Parses a cubic-meter value from free text. Handles BR/EN decimal separators
 * and patterns like "CUBAGEM: 0,025", "0.5 M3", "VOL CUBICO 1,2M³".
 */
function parseM3FromText(text: string | null | undefined): number {
  if (!text) return 0;
  const normalized = text.toUpperCase().replace(/\s+/g, " ");

  // Pattern A: explicit m3/m³/MC/CUBAGEM markers
  const patterns = [
    /CUBAGEM[^0-9-]*([0-9]+[.,]?[0-9]*)/,
    /VOL(?:UME)?[\s.]*C[ÚU]BICO[^0-9-]*([0-9]+[.,]?[0-9]*)/,
    /([0-9]+[.,]?[0-9]*)\s*M\s*[³3]/,
    /M\s*[³3][^0-9-]*([0-9]+[.,]?[0-9]*)/,
  ];
  for (const re of patterns) {
    const m = normalized.match(re);
    if (m && m[1]) {
      const v = parseFloat(m[1].replace(",", "."));
      if (!isNaN(v) && v > 0) return v;
    }
  }
  return 0;
}

function formatCNPJ(cnpj: string): string {
  const cleaned = cnpj.replace(/\D/g, "");
  if (cleaned.length !== 14) return cnpj;
  return cleaned.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    "$1.$2.$3/$4-$5"
  );
}

export function calculateBoxes(qCom: number): number {
  return Math.ceil(qCom);
}
