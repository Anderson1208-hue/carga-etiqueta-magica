interface NotaBuscavel {
  numero_nf: string;
  cnpj_destinatario: string;
  dest_razao_social: string;
  dest_bairro: string;
  dest_cidade?: string;
}

export function correspondeBuscaPreparacao(nf: NotaBuscavel, busca: string): boolean {
  const termo = busca.trim().toLowerCase();
  if (!termo) return true;
  const campos = [nf.numero_nf, nf.dest_razao_social, nf.dest_bairro, nf.dest_cidade ?? ""];
  if (campos.some((campo) => campo.toLowerCase().includes(termo))) return true;

  // Accept formatted or unformatted CNPJ, including partial searches and leading zeros.
  const digitos = termo.replace(/\D/g, "");
  return /^[\d.\/\-\s]+$/.test(termo) && digitos.length > 0 &&
    nf.cnpj_destinatario.replace(/\D/g, "").includes(digitos);
}