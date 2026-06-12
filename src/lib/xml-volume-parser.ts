export interface NFeVolumeParsed {
  chaveAcesso: string;
  numeroNf: string;
  volumeM3: number;
  fornecedor: string;
}

export function parseNFeVolumeXML(xmlString: string): NFeVolumeParsed {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");

  const parserError = xmlDoc.querySelector("parsererror");
  if (parserError) {
    throw new Error("XML inválido");
  }

  const chaveAcesso = extractChaveAcesso(xmlDoc);
  if (!chaveAcesso) {
    throw new Error("Chave de acesso não encontrada no XML");
  }

  const numeroNf = getFirstTagText(xmlDoc, ["nNF", "nnf"]);
  const fornecedor = extractEmitenteNome(xmlDoc);

  return {
    chaveAcesso,
    numeroNf,
    fornecedor,
    volumeM3: extractVolumeM3(xmlDoc, fornecedor),
  };
}

function extractChaveAcesso(xmlDoc: Document): string {
  const infNFe = xmlDoc.querySelector("infNFe");
  const id = infNFe?.getAttribute("Id") ?? "";
  const chaveFromId = id.replace(/^NFe/i, "");

  if (normalizeDigits(chaveFromId).length === 44) {
    return normalizeDigits(chaveFromId);
  }

  const chaveFallback = getFirstTagText(xmlDoc, ["chNFe", "chnfe"]);
  return normalizeDigits(chaveFallback);
}

function extractVolumeM3(xmlDoc: Document, fornecedor: string): number {
  const isPandur = /pandur(?:ata)?/i.test(fornecedor);
  const volNodes = getElementsByLocalName(xmlDoc, ["vol", "volume", "volumes"]);

  // Pandurata: <vol><nVol> SEMPRE é a cubagem m³ no layout da Pandurata,
  // independente do valor ser inteiro ou decimal. Confirmado pelo cliente:
  // a posição no XML é sempre a mesma.

  // Detecta Pandurata também via <marca>/<xMarca> dentro de <vol>
  let isPandurataXml = isPandur;
  if (!isPandurataXml) {
    for (const volNode of volNodes) {
      const marca = getChildByLocalName(volNode, ["marca", "xmarca"])
        ?.textContent?.trim() ?? "";
      if (/pandur(?:ata)?/i.test(marca)) {
        isPandurataXml = true;
        break;
      }
    }
  }

  if (isPandurataXml) {
    // Pandurata: só aceita <nVol> DECIMAL como m³. Inteiro = caixas → ignora.
    // NUNCA cair no fallback de texto: ele captura "M3" de descrição de item
    // e pega número errado adiante (ex: nVol=216 acaba virando volume=216).
    const nVolNodes = getElementsByLocalName(xmlDoc, ["nvol"]);
    for (const nVolNode of nVolNodes) {
      const value = tryPandurNVol(nVolNode?.textContent);
      if (value > 0) return value;
    }
    return 0;
  }

  const textScopes = [xmlDoc.documentElement, ...volNodes];
  for (const scope of textScopes) {
    const value = parseM3FromText(scope.textContent);
    if (value > 0) return value;
  }

  return 0;
}

function extractEmitenteNome(xmlDoc: Document): string {
  const emitNode = getElementsByLocalName(xmlDoc, ["emit"])[0];
  if (!emitNode) return "";

  const razaoSocial = getFirstTagText(emitNode, ["xnome"]);
  const nomeFantasia = getFirstTagText(emitNode, ["xfant", "xfantasia"]);

  return [razaoSocial, nomeFantasia].filter(Boolean).join(" ").trim();
}

function getFirstTagText(root: ParentNode, tagNames: string[]): string {
  const node = getElementsByLocalName(root, tagNames.map((name) => name.toLowerCase()))[0];
  return node?.textContent?.trim() ?? "";
}

function getElementsByLocalName(root: ParentNode, tagNames: string[]): Element[] {
  return Array.from(root.querySelectorAll("*")).filter((element) => {
    const localName = (element.localName || element.nodeName || "")
      .split(":")
      .pop()
      ?.toLowerCase();

    return !!localName && tagNames.includes(localName);
  });
}

function getChildByLocalName(root: Element, tagNames: string[]): Element | undefined {
  return getElementsByLocalName(root, tagNames)[0];
}

function parseVolumeNumber(value: string | null | undefined): number {
  if (!value) return 0;

  const raw = value.trim().replace(/\s+/g, "");
  if (!raw) return 0;

  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(",", ".");

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseM3FromText(text: string | null | undefined): number {
  if (!text) return 0;

  const normalized = text.toUpperCase().replace(/\s+/g, " ");
  const patterns = [
    /CUBAGEM[^0-9-]*([0-9]+[.,]?[0-9]*)/,
    /VOL(?:UME)?[\s.]*C[ÚU]BICO[^0-9-]*([0-9]+[.,]?[0-9]*)/,
    /([0-9]+[.,]?[0-9]*)\s*M\s*[³3]/,
    /M\s*[³3][^0-9-]*([0-9]+[.,]?[0-9]*)/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      const value = parseVolumeNumber(match[1]);
      if (value > 0) return value;
    }
  }

  return 0;
}

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, "");
}