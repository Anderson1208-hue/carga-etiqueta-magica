// Keep pages below the Data API row cap; targeted filters belong on each query.
export async function carregarPaginasSirius<T>(
  consultar: (inicio: number, fim: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const tamanho = 500
  const linhas: T[] = []
  for (let inicio = 0; ; inicio += tamanho) {
    const { data, error } = await consultar(inicio, inicio + tamanho - 1)
    if (error) throw new Error(error.message)
    const pagina = data ?? []
    linhas.push(...pagina)
    if (pagina.length < tamanho) return linhas
  }
}