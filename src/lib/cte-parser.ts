// Parser for Brazilian CT-e (Conhecimento de Transporte Eletrônico) XML files

export interface CTeParsed {
  chaveCte: string;
  numeroCte: string;
  cnpjEmitente: string;
  razaoSocialEmitente: string;
  chaveNfReferenciada: string; // primeira NF (compat)
  chavesNfReferenciadas: string[]; // todas as NFs do CT-e
  valorFrete: number;
  volumeM3: number;
  dataEmissao: string | null; // <ide><dhEmi> (YYYY-MM-DD)
}

export function parseCTeXML(xmlString: string): CTeParsed {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");

  const parserError = xmlDoc.querySelector("parsererror");
  if (parserError) {
    throw new Error("XML inválido: " + parserError.textContent);
  }

  // Get root CT-e element
  const cteProc = xmlDoc.querySelector("cteProc, CTe");
  if (!cteProc) {
    throw new Error("Arquivo não é um CT-e válido");
  }

  // Extract CT-e access key from infCte Id attribute
  let chaveCte = "";
  const infCte = xmlDoc.querySelector("infCte");
  if (infCte) {
    const id = infCte.getAttribute("Id");
    if (id) {
      chaveCte = id.replace("CTe", "");
    }
  }

  // Fallback: try protCTe
  if (!chaveCte) {
    const chCTe = xmlDoc.querySelector("protCTe chCTe, chCTe");
    if (chCTe) {
      chaveCte = chCTe.textContent || "";
    }
  }

  if (!chaveCte) {
    throw new Error("Chave do CT-e não encontrada no XML");
  }

  // Extract CT-e number
  const nCT = xmlDoc.querySelector("ide nCT, nCT");
  const numeroCte = nCT?.textContent || "";

  // Extract emission date: <ide><dhEmi> (v3/v4) ou <dEmi> (legado)
  const dhEmi = xmlDoc.querySelector("ide dhEmi, dhEmi, ide dEmi, dEmi");
  const dataEmissao = dhEmi?.textContent ? dhEmi.textContent.split("T")[0] : null;

  if (!numeroCte) {
    throw new Error("Número do CT-e não encontrado");
  }

  // Extract issuer (emitente)
  const emit = xmlDoc.querySelector("emit");
  const xNome = emit?.querySelector("xNome");
  const CNPJ = emit?.querySelector("CNPJ");
  const razaoSocialEmitente = xNome?.textContent || "Emitente não identificado";
  const cnpjEmitente = CNPJ?.textContent || "";

  // Extract ALL referenced NF-e keys (CT-e pode agrupar várias NFs)
  const chavesNfReferenciadas: string[] = [];
  const infNFeNodes = Array.from(xmlDoc.querySelectorAll("infDoc infNFe, infNFe"));
  for (const node of infNFeNodes) {
    const chave = node.querySelector("chave")?.textContent?.trim();
    if (chave && chave.length === 44 && !chavesNfReferenciadas.includes(chave)) {
      chavesNfReferenciadas.push(chave);
    }
  }
  // Fallback: chNFe diretos
  if (chavesNfReferenciadas.length === 0) {
    const chNFes = Array.from(xmlDoc.querySelectorAll("chNFe"));
    for (const el of chNFes) {
      const chave = el.textContent?.trim();
      if (chave && chave.length === 44 && !chavesNfReferenciadas.includes(chave)) {
        chavesNfReferenciadas.push(chave);
      }
    }
  }
  if (chavesNfReferenciadas.length === 0) {
    throw new Error("Nenhuma chave de NF-e referenciada encontrada no CT-e");
  }
  const chaveNfReferenciada = chavesNfReferenciadas[0];

  // Extract freight value (valor do frete)
  const vTPrest = xmlDoc.querySelector("vTPrest vTPrest, vTPrest");
  const vRec = xmlDoc.querySelector("vPrest vRec, vRec");
  const valorStr = vTPrest?.textContent || vRec?.textContent || "0";
  const valorFrete = parseFloat(valorStr) || 0;

  // Extract cubic volume (m3) — tries multiple known CT-e tags
  let volumeM3 = 0;

  // 1) <infQ> with cUnid=00 (M3) and tpMed indicating cubagem/volume
  const infQNodes = Array.from(xmlDoc.querySelectorAll("infQ"));
  for (const node of infQNodes) {
    const cUnid = node.querySelector("cUnid")?.textContent?.trim() || "";
    const tpMed = (node.querySelector("tpMed")?.textContent || "").toUpperCase();
    const qCarga = parseFloat(node.querySelector("qCarga")?.textContent || "0") || 0;
    if (qCarga <= 0) continue;
    // cUnid 00 = M3; tpMed often "CUBAGEM" / "M3" / "VOLUME"
    if (cUnid === "00" || /CUB|M3|M\u00b3|VOLUME/.test(tpMed)) {
      volumeM3 = qCarga;
      break;
    }
  }

  // 2) Fallback: any tag literally named volume / vol / cubagem / m3
  if (volumeM3 <= 0) {
    const candidates = ["cubagem", "Cubagem", "CUBAGEM", "volume", "Volume", "vol", "m3", "M3"];
    for (const tag of candidates) {
      const el = xmlDoc.getElementsByTagName(tag)[0];
      const v = parseFloat(el?.textContent || "0") || 0;
      if (v > 0) { volumeM3 = v; break; }
    }
  }

  return {
    chaveCte,
    numeroCte,
    cnpjEmitente,
    razaoSocialEmitente,
    chaveNfReferenciada,
    chavesNfReferenciadas,
    valorFrete,
    volumeM3,
    dataEmissao,
  };
}
