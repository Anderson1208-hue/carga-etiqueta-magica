import { supabase } from "@/integrations/supabase/client";
import { isNfCesta } from "./cesta-natalina";
import type { NFeParsed } from "./xml-parser";

/** Grava o total de volumes (<qVol>) das NFs de cesta natalina após a importação. */
export async function salvarQtdVolumesCesta(nfs: NFeParsed[]): Promise<void> {
  const alvo = nfs.filter((n) => (n.qtdVolumes ?? 0) > 0 && isNfCesta(n.itens.map((i) => i.xProd)));
  for (const n of alvo) {
    await supabase.from("notas_fiscais").update({ qtd_volumes: n.qtdVolumes }).eq("chave_acesso", n.chaveAcesso);
  }
}
