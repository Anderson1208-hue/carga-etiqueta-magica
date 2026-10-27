// The list carries validation; image detail identifies its NF inside documentoIndustria.
export function combinarCanhoto(lista: any, detalhe: any, chave: string) {
  if (lista?.chave !== chave || String(lista?.oid ?? '') !== String(detalhe?.oid ?? '') ||
      (detalhe?.chave ?? detalhe?.documentoIndustria?.chaveDoc) !== chave) {
    throw new Error('A imagem do portal não corresponde à nota.');
  }
  return { ...lista, ...detalhe, chave, statusValidacaoIA: detalhe.statusValidacaoIA ?? lista.statusValidacaoIA ?? null };
}