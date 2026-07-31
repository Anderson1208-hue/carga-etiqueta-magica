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
  serie: string | null;
  chaveAcesso: string;
  razaoSocialEmitente: string;
  cnpjEmitente: string;
  cnpjDestinatario: string;
  dataEmissao: string | null;
  valorNf: number | null;
  itens: ItemNFParsed[];
  destinatario?: DestinatarioEndereco;
  pesoBruto: number;
  pesoLiquido: number;
  volumeM3: number;
  // Campos fiscais (Fase 1 fiscal) — opcionais, usados para enriquecer cadastros
  ieEmitente?: string | null;
  crtEmitente?: number | null;      // 1=Simples, 2=Simples excesso, 3=Regime normal, 4=MEI
  ufEmitente?: string | null;
  municipioEmitente?: string | null;
  codigoMunicipioIbgeEmitente?: string | null;
  ieDestinatario?: string | null;
  indicadorIeDestinatario?: number | null; // 1=contrib, 2=isento, 9=não contrib
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

  // Extract NF serie (optional)
  const serieNode = xmlDoc.querySelector("ide serie, serie");
  const serie = serieNode?.textContent?.trim() || null;

  // Extract NF total value (vNF) from total/ICMSTot/vNF
  const vNFNode = xmlDoc.querySelector("ICMSTot vNF, vNF");
  const vNFParsed = vNFNode?.textContent ? parseFloat(vNFNode.textContent) : NaN;
  const valorNf = !isNaN(vNFParsed) && vNFParsed >= 0 ? vNFParsed : null;

  // Extract issuer data (emitente)
  const emit = xmlDoc.querySelector("emit");
  const xNome = emit?.querySelector("xNome");
  const CNPJ = emit?.querySelector("CNPJ");

  const razaoSocialEmitente = xNome?.textContent || "Emitente não identificado";
  const cnpjEmitente = CNPJ?.textContent || "";

  // Format CNPJ emitente
  const cnpjEmitenteFormatted = formatCNPJ(cnpjEmitente);

  // Dados fiscais do emitente (Fase 1 fiscal)
  const ieEmitenteRaw = emit?.querySelector("IE")?.textContent?.trim() || null;
  const ieEmitente = ieEmitenteRaw && ieEmitenteRaw.toUpperCase() !== "ISENTO" ? ieEmitenteRaw : ieEmitenteRaw;
  const crtEmitenteStr = emit?.querySelector("CRT")?.textContent?.trim();
  const crtEmitente = crtEmitenteStr ? parseInt(crtEmitenteStr, 10) : null;
  const enderEmit = emit?.querySelector("enderEmit");
  const ufEmitente = enderEmit?.querySelector("UF")?.textContent?.trim() || null;
  const municipioEmitente = enderEmit?.querySelector("xMun")?.textContent?.trim() || null;
  const codigoMunicipioIbgeEmitente = enderEmit?.querySelector("cMun")?.textContent?.trim() || null;

  // Extract recipient data (destinatário) — pode ser CNPJ (PJ) ou CPF (PF)
  const dest = xmlDoc.querySelector("dest");
  const destCNPJ = dest?.querySelector("CNPJ");
  const destCPF = dest?.querySelector("CPF");
  const cnpjDestinatario = destCNPJ?.textContent || "";
  const cpfDestinatario = destCPF?.textContent || "";
  const cnpjDestinatarioFormatted = cnpjDestinatario
    ? formatCNPJ(cnpjDestinatario)
    : formatCPF(cpfDestinatario);

  // Dados fiscais do destinatário
  const ieDestinatario = dest?.querySelector("IE")?.textContent?.trim() || null;
  const indIeStr = dest?.querySelector("indIEDest")?.textContent?.trim();
  const indicadorIeDestinatario = indIeStr ? parseInt(indIeStr, 10) : null;

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
  // commonly put it em <vol><esp> ("CUBAGEM 0,025"), <infCpl>, <infAdProd>
  // ou usam <vol><nVol> com o valor da cubagem (Pandurata).
  const volumeM3 = extractVolumeM3(xmlDoc, razaoSocialEmitente);

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
    serie,
    chaveAcesso,
    razaoSocialEmitente,
    cnpjEmitente: cnpjEmitenteFormatted,
    cnpjDestinatario: cnpjDestinatarioFormatted,
    dataEmissao,
    valorNf,
    itens,
    destinatario,
    pesoBruto,
    pesoLiquido,
    volumeM3,
    ieEmitente,
    crtEmitente,
    ufEmitente,
    municipioEmitente,
    codigoMunicipioIbgeEmitente,
    ieDestinatario,
    indicadorIeDestinatario,
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
function extractVolumeM3(xmlDoc: Document, emitente: string = ""): number {
  const getLocalName = (node: Element) =>
    ((node.localName || node.nodeName || "").split(":").pop() || "").toLowerCase();

  const getElementsByNames = (root: ParentNode, names: string[]) =>
    Array.from(root.querySelectorAll("*")).filter((el) =>
      names.includes(getLocalName(el))
    );

  const parseNumericText = (text: string | null | undefined): number => {
    if (!text) return 0;
    const value = parseFloat(text.trim().replace(",", "."));
    return !isNaN(value) && value > 0 && value < 1000 ? value : 0;
  };

  const volumeBlocks = getElementsByNames(xmlDoc, ["vol", "volume", "volumes"]);

  // REGRA DE m³ POR EMITENTE (31/07/2026):
  //  - Pandurata/Bauducco: m³ vem do XML (<vol><nVol>, posição fixa no layout).
  //  - IBAC, Docile, Arcor: m³ vem de planilha/arquivo importado depois.
  //  - Mars e demais: m³ vem do cadastro de produtos (itens × cubagem da caixa).
  // Qualquer outro emitente retorna 0 aqui para não gerar valores falsos
  // (ex.: nVol = 4 volumes lido como 4 m³).
  if (isPandurataXml(xmlDoc, emitente, getElementsByNames)) {
    for (const volBlock of volumeBlocks) {
      const nVolNode = Array.from(volBlock.querySelectorAll("*")).find(
        (el) => getLocalName(el) === "nvol"
      );
      const value = parseNumericText(nVolNode?.textContent);
      if (value > 0) return value;
    }
  }

  return 0;
}


function isPandurataXml(
  xmlDoc: Document,
  emitente: string,
  getElementsByNames: (root: ParentNode, names: string[]) => Element[]
): boolean {
  const textos = [emitente];

  getElementsByNames(xmlDoc, ["marca", "xmarca", "xnome"]).forEach((node) => {
    if (node.textContent) textos.push(node.textContent);
  });

  return textos.some((texto) => /pandur(?:ata)?/i.test(texto));
}

function isIbacXml(
  xmlDoc: Document,
  emitente: string,
  getElementsByNames: (root: ParentNode, names: string[]) => Element[]
): boolean {
  const textos = [emitente];
  getElementsByNames(xmlDoc, ["marca", "xmarca", "xnome", "xfant"]).forEach((node) => {
    if (node.textContent) textos.push(node.textContent);
  });
  // Bate por razão social / marca "IBAC" ou pela raiz do CNPJ 61.472.205
  const emit = xmlDoc.querySelector("emit");
  const cnpj = emit?.querySelector("CNPJ")?.textContent?.replace(/\D/g, "") ?? "";
  if (cnpj.startsWith("61472205")) return true;
  return textos.some((t) => /\bibac\b/i.test(t));
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

function formatCPF(cpf: string): string {
  const cleaned = cpf.replace(/\D/g, "");
  if (cleaned.length !== 11) return cpf;
  return cleaned.replace(
    /^(\d{3})(\d{3})(\d{3})(\d{2})$/,
    "$1.$2.$3-$4"
  );
}

export function calculateBoxes(qCom: number): number {
  return Math.ceil(qCom);
}
