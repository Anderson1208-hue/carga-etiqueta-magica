// Parser for Brazilian NF-e XML files

export interface NFeParsed {
  numeroNf: string;
  chaveAcesso: string;
  razaoSocialEmitente: string;
  cnpjEmitente: string;
  cnpjDestinatario: string;
  dataEmissao: string | null;
  itens: ItemNFParsed[];
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

  // Extract emission date
  const dhEmi = xmlDoc.querySelector("ide dhEmi, dhEmi");
  const dEmi = xmlDoc.querySelector("ide dEmi, dEmi");
  let dataEmissao: string | null = null;

  if (dhEmi?.textContent) {
    dataEmissao = dhEmi.textContent.split("T")[0];
  } else if (dEmi?.textContent) {
    dataEmissao = dEmi.textContent;
  }

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
  };
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
