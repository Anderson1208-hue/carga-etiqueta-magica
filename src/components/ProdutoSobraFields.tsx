import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Search, Loader2 } from "lucide-react";
import { normalizarCodigoSobra, produtosDaSobra } from "@/lib/produto-sobra";

export function ProdutoSobraFields({ codigo, descricao, embarcador, onChange }: { codigo: string; descricao: string; embarcador: string; onChange: (codigo: string, descricao: string) => void }) {
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState("");
  const versao = useRef(0);
  async function buscar() {
    const n = normalizarCodigoSobra(codigo);
    if (!n) return;
    const atual = ++versao.current;
    setBuscando(true); setErro(""); onChange(codigo, "");
    try {
      if (!/^[A-Z0-9_-]+$/.test(n)) throw new Error("Informe um código válido do cadastro.");
      const { data, error } = await supabase.from("produtos")
        .select("id, codigo, codigo_alternativo, descricao, cnpj_embarcador")
        .eq("ativo", true).or(`codigo.ilike.%${n},codigo_alternativo.ilike.%${n}`).order("id").limit(101);
      if (error) throw error;
      if ((data ?? []).length > 100) throw new Error("Busca com muitos resultados; confira o código completo.");
      const encontrados = produtosDaSobra(data ?? [], n, embarcador);
      if (!encontrados.length) throw new Error("Produto não encontrado no cadastro deste embarcador.");
      if (new Set(encontrados.map((p) => p.descricao)).size > 1) throw new Error("Código com descrições diferentes no cadastro; confira o cadastro de produtos.");
      if (atual === versao.current) onChange(codigo, encontrados[0].descricao);
    } catch (e) { if (atual === versao.current) setErro(e instanceof Error ? e.message : "Falha ao consultar o produto."); }
    finally { if (atual === versao.current) setBuscando(false); }
  }
  return <>
    <div className="space-y-1">
      <Label>Código do produto</Label>
      <div className="flex gap-2">
        <Input aria-label="Código do produto de sobra" value={codigo} onChange={(e) => { versao.current++; setBuscando(false); setErro(""); onChange(e.target.value, ""); }} onBlur={buscar} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscar(); } }} />
        <Button type="button" variant="outline" size="icon" title="Buscar produto" aria-label="Buscar produto" disabled={buscando || !codigo.trim()} onClick={buscar}>
          {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
    </div>
    <div className="space-y-1"><Label>Descrição</Label><Input aria-label="Descrição do produto de sobra" value={descricao} readOnly placeholder={buscando ? "Buscando…" : "Descrição do cadastro"} /></div>
  </>;
}