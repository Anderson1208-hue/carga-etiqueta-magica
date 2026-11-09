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
  /** Componentes do frete e dados fiscais, guardados à parte (cte_detalhes). */
  detalhes: {
    cfop: string | null;
    municipio_inicio: string | null;
    uf_inicio: string | null;
    municipio_fim: string | null;
    uf_fim: string | null;
    valor_total_prestacao: number | null;
    valor_receber: number | null;
    componentes: Array<{ nome: string; valor: number }>;
    quantidades: Array<{ unidade: string; tipo: string; quantidade: number }>;
    icms: Record<string, string> | null;
    valor_carga: number | null;
  };
  xmlOriginal: string;
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

  // Extract cubic volume (m3) — APENAS quando cUnid="00" (M3).
  // NUNCA aceitar por tpMed sozinho: tpMed="VOLUMES" + cUnid="03" (UNIDADE)
  // = quantidade de caixas, não cubagem. Aceitar isso vira bug clássico
  // que sobrescreve volume_m3 com 191/4137/etc em NFs Pandurata.
  // Também NÃO usar fallback de tags genéricas pelo mesmo motivo: <vol>
  // costuma ser quantidade. Se o CT-e não declarar M3 explícito, volume
  // fica 0 e operador atualiza via Excel/TXT/dialog.
  let volumeM3 = 0;
  const infQNodes = Array.from(xmlDoc.querySelectorAll("infQ"));
  for (const node of infQNodes) {
    const cUnid = node.querySelector("cUnid")?.textContent?.trim() || "";
    if (cUnid !== "00") continue; // 00 = M3 (única unidade aceita)
    const qCarga = parseFloat(node.querySelector("qCarga")?.textContent || "0") || 0;
    if (qCarga > 0) {
      volumeM3 = qCarga;
      break;
    }
  }

  const txt = (sel: string) => xmlDoc.querySelector(sel)?.textContent?.trim() || null;
  const num = (v: string | null | undefined) => (v == null || v === "" ? null : parseFloat(v));
  const componentes = Array.from(xmlDoc.querySelectorAll("vPrest Comp")).map((c) => ({
    nome: c.querySelector("xNome")?.textContent?.trim() || "",
    valor: num(c.querySelector("vComp")?.textContent) ?? 0,
  }));
  const quantidades = infQNodes.map((n) => ({
    unidade: n.querySelector("cUnid")?.textContent?.trim() || "",
    tipo: n.querySelector("tpMed")?.textContent?.trim() || "",
    quantidade: num(n.querySelector("qCarga")?.textContent) ?? 0,
  }));
  const icmsNode = xmlDoc.querySelector("imp ICMS");
  const icmsGrupo = icmsNode?.firstElementChild;
  const icms = icmsGrupo
    ? Object.fromEntries(Array.from(icmsGrupo.children).map((e) => [e.localName, e.textContent?.trim() || ""]).concat([["grupo", icmsGrupo.localName]]))
    : null;
  const detalhes = {
    cfop: txt("ide CFOP"),
    municipio_inicio: txt("ide xMunIni"),
    uf_inicio: txt("ide UFIni"),
    municipio_fim: txt("ide xMunFim"),
    uf_fim: txt("ide UFFim"),
    valor_total_prestacao: num(vTPrest?.textContent),
    valor_receber: num(vRec?.textContent),
    componentes,
    quantidades,
    icms,
    valor_carga: num(txt("infCarga vCarga")),
  };

  return {
    detalhes,
    xmlOriginal: xmlString,
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
