import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Package, Plus, Pencil, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { ImportarProdutosDialog } from "@/components/produtos/ImportarProdutosDialog";

type Produto = {
  id?: string;
  embarcador_id: string | null;
  cnpj_embarcador: string | null;
  codigo: string;
  codigo_alternativo: string | null;
  descricao: string;
  unidade: string | null;
  marca: string | null;
  segmento: string | null;
  categoria: string | null;
  hierarquia_produto: string | null;
  ncm: string | null;
  cest: string | null;
  ean_tdu: string | null;
  ean_mcu: string | null;
  ean_rsu: string | null;
  dun14: string | null;
  qtd_mcu_por_tdu: number | null;
  qtd_rsu_por_tdu: number | null;
  peso_bruto_cx_kg: number | null;
  peso_liquido_cx_kg: number | null;
  peso_bruto_un_kg: number | null;
  largura_mm: number | null;
  comprimento_mm: number | null;
  altura_mm: number | null;
  volume_m3: number | null;
  volume_calculado?: boolean;
  lastro: number | null;
  camadas: number | null;
  caixas_por_pallet: number | null;
  tipo_pallet: string | null;
  altura_pallet_mm: number | null;
  peso_pallet_kg: number | null;
  empilhamento_max: number | null;
  controla_lote: boolean;
  controla_validade: boolean;
  shelf_life_dias: number | null;
  shelf_life_min_recebimento_dias: number | null;
  shelf_life_min_expedicao_dias: number | null;
  regra_giro: string;
  temperatura_min_c: number | null;
  temperatura_max_c: number | null;
  faixa_temperatura: string;
  fragil: boolean;
  empilhavel: boolean;
  produto_perigoso: boolean;
  onu_numero: string | null;
  classe_risco: string | null;
  sensivel_furto: boolean;
  valor_unitario_ref: number | null;
  status_comercial: string | null;
  ativo: boolean;
  rascunho?: boolean;
  observacao: string | null;
};

const empty: Partial<Produto> = {
  codigo: "",
  descricao: "",
  unidade: "CX",
  tipo_pallet: "PBR",
  regra_giro: "FEFO",
  faixa_temperatura: "ambiente",
  controla_lote: true,
  controla_validade: true,
  empilhavel: true,
  fragil: false,
  produto_perigoso: false,
  sensivel_furto: false,
  ativo: true,
};

const num = (v: string) => (v === "" ? null : Number(v.replace(",", ".")));

export default function Produtos() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [embFilter, setEmbFilter] = useState("todos");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Partial<Produto> | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const { data: embarcadores = [] } = useQuery({
    queryKey: ["embarcadores-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("embarcadores")
        .select("id, cnpj, razao_social")
        .eq("ativo", true)
        .order("razao_social");
      if (error) throw error;
      return data;
    },
  });

  const { data: produtos = [], isLoading } = useQuery({
    queryKey: ["produtos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select("*")
        .order("descricao")
        .limit(5000);
      if (error) throw error;
      return data as unknown as Produto[];
    },
  });

  const save = useMutation({
    mutationFn: async (p: Partial<Produto>) => {
      if (!p.codigo?.trim()) throw new Error("Código do produto é obrigatório");
      if (!p.descricao?.trim()) throw new Error("Descrição é obrigatória");
      const emb = embarcadores.find((e) => e.id === p.embarcador_id);
      const payload = {
        ...p,
        codigo: p.codigo.trim(),
        descricao: p.descricao.trim(),
        embarcador_id: p.embarcador_id || null,
        cnpj_embarcador: emb?.cnpj ?? null,
        rascunho: false,
      } as never;
      if (p.id) {
        const { error } = await supabase.from("produtos").update(payload).eq("id", p.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("produtos").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Produto salvo");
      qc.invalidateQueries({ queryKey: ["produtos"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return produtos.filter((p) => {
      if (!showInactive && !p.ativo) return false;
      if (embFilter !== "todos" && p.embarcador_id !== embFilter) return false;
      if (!q) return true;
      return (
        p.codigo?.toLowerCase().includes(q) ||
        p.descricao?.toLowerCase().includes(q) ||
        p.ean_tdu?.includes(q) ||
        p.marca?.toLowerCase().includes(q)
      );
    });
  }, [produtos, search, embFilter, showInactive]);

  const semCubagem = produtos.filter((p) => p.ativo && !p.volume_m3).length;
  const semPaletizacao = produtos.filter((p) => p.ativo && !p.caixas_por_pallet).length;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Package className="w-7 h-7" /> Produtos
            </h1>
            <p className="text-sm text-muted-foreground">
              Cadastro mestre por embarcador — dimensões, cubagem e paletização para cross-docking e armazenagem.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="w-4 h-4 mr-2" /> Importar planilha
            </Button>
            <Button onClick={() => setEditing(empty)}>
              <Plus className="w-4 h-4 mr-2" /> Novo Produto
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Produtos ativos</p>
            <p className="text-2xl font-bold">{produtos.filter((p) => p.ativo).length}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Sem cubagem (m³)</p>
            <p className="text-2xl font-bold text-amber-600">{semCubagem}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Sem paletização</p>
            <p className="text-2xl font-bold text-amber-600">{semPaletizacao}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por código, descrição, EAN ou marca..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={embFilter} onValueChange={setEmbFilter}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os embarcadores</SelectItem>
              {embarcadores.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.razao_social}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={showInactive} onCheckedChange={setShowInactive} />
            Inativos
          </label>
        </div>

        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Marca</TableHead>
                <TableHead className="text-center">Un/CX</TableHead>
                <TableHead className="text-right">Peso CX</TableHead>
                <TableHead className="text-center">Dim. (mm)</TableHead>
                <TableHead className="text-right">m³/CX</TableHead>
                <TableHead className="text-center">CX/Pallet</TableHead>
                <TableHead className="text-center">Val.</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Nenhum produto encontrado</TableCell></TableRow>
              ) : filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.codigo}</TableCell>
                  <TableCell className="font-medium max-w-72 truncate">{p.descricao}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{p.marca || "—"}</TableCell>
                  <TableCell className="text-center text-sm">{p.qtd_rsu_por_tdu ?? "—"}</TableCell>
                  <TableCell className="text-right text-sm">{p.peso_bruto_cx_kg ? `${p.peso_bruto_cx_kg} kg` : "—"}</TableCell>
                  <TableCell className="text-center text-xs font-mono">
                    {p.largura_mm && p.comprimento_mm && p.altura_mm
                      ? `${p.largura_mm}×${p.comprimento_mm}×${p.altura_mm}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {p.volume_m3 ? (
                      <span className={p.volume_calculado ? "text-amber-600" : ""}>
                        {Number(p.volume_m3).toFixed(4)}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-center text-sm">{p.caixas_por_pallet ?? "—"}</TableCell>
                  <TableCell className="text-center text-sm">{p.shelf_life_dias ? `${p.shelf_life_dias}d` : "—"}</TableCell>
                  <TableCell>
                    {p.ativo ? <Badge>Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => setEditing(p)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <ProdutoDialog
          editing={editing}
          setEditing={setEditing}
          embarcadores={embarcadores}
          onSave={(p) => save.mutate(p)}
          saving={save.isPending}
        />

        <ImportarProdutosDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          embarcadores={embarcadores}
          onDone={() => qc.invalidateQueries({ queryKey: ["produtos"] })}
        />
      </div>
    </MainLayout>
  );
}

function ProdutoDialog({
  editing, setEditing, embarcadores, onSave, saving,
}: {
  editing: Partial<Produto> | null;
  setEditing: (p: Partial<Produto> | null) => void;
  embarcadores: { id: string; cnpj: string; razao_social: string }[];
  onSave: (p: Partial<Produto>) => void;
  saving: boolean;
}) {
  const up = (patch: Partial<Produto>) => setEditing({ ...editing, ...patch });
  if (!editing) return null;

  const cubagemPrevista =
    editing.largura_mm && editing.comprimento_mm && editing.altura_mm
      ? (Number(editing.largura_mm) * Number(editing.comprimento_mm) * Number(editing.altura_mm)) / 1e9
      : null;

  return (
    <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing.id ? "Editar Produto" : "Novo Produto"}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="identificacao">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="identificacao">Identificação</TabsTrigger>
            <TabsTrigger value="logistica">Logística</TabsTrigger>
            <TabsTrigger value="armazenagem">Armazenagem</TabsTrigger>
            <TabsTrigger value="fiscal">Fiscal / Riscos</TabsTrigger>
          </TabsList>

          <TabsContent value="identificacao" className="grid grid-cols-2 gap-4 pt-4">
            <div className="col-span-2 space-y-2">
              <Label>Embarcador</Label>
              <Select
                value={editing.embarcador_id || ""}
                onValueChange={(v) => up({ embarcador_id: v })}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {embarcadores.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.razao_social}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Código (cProd) *</Label>
              <Input value={editing.codigo || ""} onChange={(e) => up({ codigo: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Código alternativo</Label>
              <Input value={editing.codigo_alternativo || ""} onChange={(e) => up({ codigo_alternativo: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Descrição *</Label>
              <Input value={editing.descricao || ""} onChange={(e) => up({ descricao: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Unidade</Label>
              <Input value={editing.unidade || ""} onChange={(e) => up({ unidade: e.target.value })} placeholder="CX" />
            </div>
            <div className="space-y-2">
              <Label>Marca</Label>
              <Input value={editing.marca || ""} onChange={(e) => up({ marca: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Segmento</Label>
              <Input value={editing.segmento || ""} onChange={(e) => up({ segmento: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Input value={editing.categoria || ""} onChange={(e) => up({ categoria: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>EAN caixa (TDU)</Label>
              <Input value={editing.ean_tdu || ""} onChange={(e) => up({ ean_tdu: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>EAN pack (MCU)</Label>
              <Input value={editing.ean_mcu || ""} onChange={(e) => up({ ean_mcu: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>EAN unidade (RSU)</Label>
              <Input value={editing.ean_rsu || ""} onChange={(e) => up({ ean_rsu: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>DUN-14</Label>
              <Input value={editing.dun14 || ""} onChange={(e) => up({ dun14: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 col-span-2 text-sm">
              <Switch checked={editing.ativo ?? true} onCheckedChange={(v) => up({ ativo: v })} />
              Ativo
            </label>
          </TabsContent>

          <TabsContent value="logistica" className="grid grid-cols-3 gap-4 pt-4">
            <div className="space-y-2">
              <Label>Un. por caixa (RSU/TDU)</Label>
              <Input type="number" value={editing.qtd_rsu_por_tdu ?? ""} onChange={(e) => up({ qtd_rsu_por_tdu: num(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Packs por caixa (MCU/TDU)</Label>
              <Input type="number" value={editing.qtd_mcu_por_tdu ?? ""} onChange={(e) => up({ qtd_mcu_por_tdu: num(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Peso bruto un. (kg)</Label>
              <Input type="number" step="0.001" value={editing.peso_bruto_un_kg ?? ""} onChange={(e) => up({ peso_bruto_un_kg: num(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Peso bruto CX (kg)</Label>
              <Input type="number" step="0.001" value={editing.peso_bruto_cx_kg ?? ""} onChange={(e) => up({ peso_bruto_cx_kg: num(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Peso líquido CX (kg)</Label>
              <Input type="number" step="0.001" value={editing.peso_liquido_cx_kg ?? ""} onChange={(e) => up({ peso_liquido_cx_kg: num(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Valor unitário ref. (R$)</Label>
              <Input type="number" step="0.01" value={editing.valor_unitario_ref ?? ""} onChange={(e) => up({ valor_unitario_ref: num(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Largura (mm)</Label>
              <Input type="number" value={editing.largura_mm ?? ""} onChange={(e) => up({ largura_mm: num(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Comprimento (mm)</Label>
              <Input type="number" value={editing.comprimento_mm ?? ""} onChange={(e) => up({ comprimento_mm: num(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Altura (mm)</Label>
              <Input type="number" value={editing.altura_mm ?? ""} onChange={(e) => up({ altura_mm: num(e.target.value) })} />
            </div>
            <div className="col-span-3 space-y-2">
              <Label>Cubagem da caixa (m³)</Label>
              <Input type="number" step="0.000001" value={editing.volume_m3 ?? ""} onChange={(e) => up({ volume_m3: num(e.target.value) })} />
              {cubagemPrevista !== null && (
                <p className="text-xs text-muted-foreground">
                  Calculado pelas dimensões: <strong>{cubagemPrevista.toFixed(6)} m³</strong>
                  {" "}— se deixar em branco, o sistema grava esse valor automaticamente.
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="armazenagem" className="grid grid-cols-3 gap-4 pt-4">
            <div className="space-y-2">
              <Label>Lastro (CX/camada)</Label>
              <Input type="number" value={editing.lastro ?? ""} onChange={(e) => up({ lastro: num(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Camadas (LAY)</Label>
              <Input type="number" value={editing.camadas ?? ""} onChange={(e) => up({ camadas: num(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>CX por pallet</Label>
              <Input type="number" value={editing.caixas_por_pallet ?? ""} onChange={(e) => up({ caixas_por_pallet: num(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Tipo de pallet</Label>
              <Input value={editing.tipo_pallet || ""} onChange={(e) => up({ tipo_pallet: e.target.value })} placeholder="PBR" />
            </div>
            <div className="space-y-2">
              <Label>Altura do pallet (mm)</Label>
              <Input type="number" value={editing.altura_pallet_mm ?? ""} onChange={(e) => up({ altura_pallet_mm: num(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Peso do pallet (kg)</Label>
              <Input type="number" step="0.01" value={editing.peso_pallet_kg ?? ""} onChange={(e) => up({ peso_pallet_kg: num(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Empilhamento máx. (pallets)</Label>
              <Input type="number" value={editing.empilhamento_max ?? ""} onChange={(e) => up({ empilhamento_max: num(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Regra de giro</Label>
              <Select value={editing.regra_giro || "FEFO"} onValueChange={(v) => up({ regra_giro: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FEFO">FEFO (vence primeiro, sai primeiro)</SelectItem>
                  <SelectItem value="FIFO">FIFO</SelectItem>
                  <SelectItem value="LIFO">LIFO</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Faixa de temperatura</Label>
              <Select value={editing.faixa_temperatura || "ambiente"} onValueChange={(v) => up({ faixa_temperatura: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ambiente">Ambiente</SelectItem>
                  <SelectItem value="climatizado">Climatizado</SelectItem>
                  <SelectItem value="refrigerado">Refrigerado</SelectItem>
                  <SelectItem value="congelado">Congelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Shelf life total (dias)</Label>
              <Input type="number" value={editing.shelf_life_dias ?? ""} onChange={(e) => up({ shelf_life_dias: num(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Mín. no recebimento (dias)</Label>
              <Input type="number" value={editing.shelf_life_min_recebimento_dias ?? ""} onChange={(e) => up({ shelf_life_min_recebimento_dias: num(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Mín. na expedição (dias)</Label>
              <Input type="number" value={editing.shelf_life_min_expedicao_dias ?? ""} onChange={(e) => up({ shelf_life_min_expedicao_dias: num(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Temp. mín. (°C)</Label>
              <Input type="number" step="0.1" value={editing.temperatura_min_c ?? ""} onChange={(e) => up({ temperatura_min_c: num(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Temp. máx. (°C)</Label>
              <Input type="number" step="0.1" value={editing.temperatura_max_c ?? ""} onChange={(e) => up({ temperatura_max_c: num(e.target.value) })} />
            </div>
            <div className="col-span-3 grid grid-cols-2 gap-3 pt-2">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={editing.controla_lote ?? true} onCheckedChange={(v) => up({ controla_lote: v })} />
                Controla lote
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={editing.controla_validade ?? true} onCheckedChange={(v) => up({ controla_validade: v })} />
                Controla validade
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={editing.empilhavel ?? true} onCheckedChange={(v) => up({ empilhavel: v })} />
                Empilhável
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={editing.fragil ?? false} onCheckedChange={(v) => up({ fragil: v })} />
                Frágil
              </label>
            </div>
          </TabsContent>

          <TabsContent value="fiscal" className="grid grid-cols-2 gap-4 pt-4">
            <div className="space-y-2">
              <Label>NCM</Label>
              <Input value={editing.ncm || ""} onChange={(e) => up({ ncm: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>CEST</Label>
              <Input value={editing.cest || ""} onChange={(e) => up({ cest: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Hierarquia de produto</Label>
              <Input value={editing.hierarquia_produto || ""} onChange={(e) => up({ hierarquia_produto: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Nº ONU</Label>
              <Input value={editing.onu_numero || ""} onChange={(e) => up({ onu_numero: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Classe de risco</Label>
              <Input value={editing.classe_risco || ""} onChange={(e) => up({ classe_risco: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={editing.produto_perigoso ?? false} onCheckedChange={(v) => up({ produto_perigoso: v })} />
              Produto perigoso
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={editing.sensivel_furto ?? false} onCheckedChange={(v) => up({ sensivel_furto: v })} />
              Sensível a furto
            </label>
            <div className="col-span-2 space-y-2">
              <Label>Observação</Label>
              <Textarea rows={3} value={editing.observacao || ""} onChange={(e) => up({ observacao: e.target.value })} />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
          <Button onClick={() => onSave(editing)} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
