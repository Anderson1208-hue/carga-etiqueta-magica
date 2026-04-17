// Parser for Brazilian CT-e (Conhecimento de Transporte Eletrônico) XML files

export interface CTeParsed {
  chaveCte: string;
  numeroCte: string;
  cnpjEmitente: string;
  razaoSocialEmitente: string;
  chaveNfReferenciada: string;
  valorFrete: number;
  volumeM3: number;
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

  if (!numeroCte) {
    throw new Error("Número do CT-e não encontrado");
  }

  // Extract issuer (emitente)
  const emit = xmlDoc.querySelector("emit");
  const xNome = emit?.querySelector("xNome");
  const CNPJ = emit?.querySelector("CNPJ");
  const razaoSocialEmitente = xNome?.textContent || "Emitente não identificado";
  const cnpjEmitente = CNPJ?.textContent || "";

  // Extract referenced NF-e key (chave da NF referenciada)
  // CT-e references NFs in infNFe > chave or infDoc > infNFe > chave
  let chaveNfReferenciada = "";
  
  const infNFe = xmlDoc.querySelector("infDoc infNFe, infNFe");
  if (infNFe) {
    const chave = infNFe.querySelector("chave");
    if (chave) {
      chaveNfReferenciada = chave.textContent || "";
    }
  }

  // Fallback: try chNFe directly
  if (!chaveNfReferenciada) {
    const chNFe = xmlDoc.querySelector("chNFe");
    if (chNFe) {
      chaveNfReferenciada = chNFe.textContent || "";
    }
  }

  if (!chaveNfReferenciada) {
    throw new Error("Chave da NF-e referenciada não encontrada no CT-e");
  }

  // Extract freight value (valor do frete)
  const vTPrest = xmlDoc.querySelector("vTPrest vTPrest, vTPrest");
  const vRec = xmlDoc.querySelector("vPrest vRec, vRec");
  const valorStr = vTPrest?.textContent || vRec?.textContent || "0";
  const valorFrete = parseFloat(valorStr) || 0;

  return {
    chaveCte,
    numeroCte,
    cnpjEmitente,
    razaoSocialEmitente,
    chaveNfReferenciada,
    valorFrete,
  };
}
