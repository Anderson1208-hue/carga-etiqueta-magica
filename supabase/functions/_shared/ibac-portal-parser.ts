// The list carries validation; image detail identifies its NF inside documentoIndustria.
export function combinarCanhoto(lista: any, detalhe: any, chave: string) {
  if (lista?.chave !== chave || String(lista?.oid ?? '') !== String(detalhe?.oid ?? '') ||
      (detalhe?.chave ?? detalhe?.documentoIndustria?.chaveDoc) !== chave) {
    throw new Error('A imagem do portal não corresponde à nota.');
  }
  return { ...lista, ...detalhe, chave, statusValidacaoIA: detalhe.statusValidacaoIA ?? lista.statusValidacaoIA ?? null, detalhePortal: detalhe };
}

export function payloadImagem(detalhe: any, oid: string, base64: string, nomeImagem: string) {
  if (detalhe?.oid !== oid || !detalhe?.documentoIndustria?.chaveDoc) throw new Error('Documento da imagem não identificado.');
  // Mirror the portal UI: save the complete detail DTO with only the image replaced.
  return { ...detalhe, base64, nomeImagem };
}