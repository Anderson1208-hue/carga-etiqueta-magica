import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PackagePlus, Search, Ruler, Calculator, ArrowLeft, CheckCircle2, AlertTriangle, Edit } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

type Pendente = {
  cnpj_emitente: string;
  razao_social_emitente: string | null;
  c_prod: string;
  x_prod: string | null;
  u_com: string | null;
  ocorrencias: number;
  qtd_total: number | null;
  ultima_data: string | null;
};

type Alerta = {
  produto_id: string;
  cnpj_embarcador: string;
  razao_social_embarcador: string | null;
  codigo: string;
  descricao: string;
  unidade: string | null;
  volume_m3: number | null;
  volume_calculado: boolean;
  origem_cadastro: string | null;
  motivo: "sem_cubagem" | "cubagem_calculada";
  ocorrencias: number;
  qtd_total: number | null;
  ultima_data: string | null;
};

const isAlerta = (s: Pendente | Alerta | null): s is Alerta => !!s && "produto_id" in s;
const codigoSel = (s: Pendente | Alerta | null) => (isAlerta(s) ? s.codigo : s?.c_prod ?? "");
const descricaoSel = (s: Pendente | Alerta | null) =>
  isAlerta(s) ? s.descricao : s?.x_prod ?? "";
const razaoSocialSel = (s: Pendente | Alerta | null) =>
  isAlerta(s) ? s.razao_social_embarcador : s?.razao_social_emitente ?? "";
const cnpjSel = (s: Pendente | Alerta | null) =>
  isAlerta(s) ? s.cnpj_embarcador : s?.cnpj_emitente ?? "";

const num = (v: string) => (v === "" ? null : Number(v.replace(",", ".")));
const fmtCnpj = (c: string) =>
  c?.length === 14
    ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
    : c;

type Form = {
  descricao: string;
  unidade: string;
  qtd_rsu_por_tdu: string;
  peso_bruto_cx_kg: string;
  peso_liquido_cx_kg: string;
  comprimento_mm: string;
  largura_mm: string;
  altura_mm: string;
  volume_m3: string;
  lastro: string;
  camadas: string;
  tipo_pallet: string;
  ean_tdu: string;
  ean_rsu: string;
  ncm: string;
  shelf_life_dias: string;
  faixa_temperatura: string;
  empilhavel: boolean;
  fragil: boolean;
  sensivel_furto: boolean;
  observacao: string;
};

const emptyForm: Form = {
  descricao: "",
  unidade: "CX",
  qtd_rsu_por_tdu: "",
  peso_bruto_cx_kg: "",
  peso_liquido_cx_kg: "",
  comprimento_mm: "",
  largura_mm: "",
  altura_mm: "",
  volume_m3: "",
  lastro: "",
  camadas: "",
  tipo_pallet: "PBR",
  ean_tdu: "",
  ean_rsu: "",
  ncm: "",
  shelf_life_dias: "",
  faixa_temperatura: "ambiente",
  empilhavel: true,
  fragil: false,
  sensivel_furto: false,
  observacao: "",
};

export default function ProdutosChegada() {
  const qc = useQueryClient();
  const [dias, setDias] = useState("30");
  const [search, setSearch] = useState("");
  const [cnpjFilter, setCnpjFilter] = useState("todos");
  const [sel, setSel] = useState<Pendente | Alerta | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);

  const { data: pendentes = [], isLoading } = useQuery({
    queryKey: ["produtos-pendentes", dias],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("produtos_pendentes_cadastro" as never, {
        p_dias: Number(dias),
      } as never);
      if (error) throw error;
      return (data ?? []) as unknown as Pendente[];
    },
  });

  const emitentes = useMemo(() => {
    const m = new Map<string, string>();
    pendentes.forEach((p) =>
      m.set(p.cnpj_emitente, p.razao_social_emitente || p.cnpj_emitente)
    );
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [pendentes]);

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    return pendentes.filter((p) => {
      if (cnpjFilter !== "todos" && p.cnpj_emitente !== cnpjFilter) return false;
      if (!t) return true;
      return (
        p.c_prod.toLowerCase().includes(t) ||
        (p.x_prod || "").toLowerCase().includes(t)
      );
    });
  }, [pendentes, search, cnpjFilter]);

  const { data: alertas = [] } = useQuery({
    queryKey: ["produtos-alerta-m3", dias, cnpjFilter],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("produtos_alerta_m3_confiavel" as never, {
        p_dias: Number(dias),
        p_cnpj: cnpjFilter === "todos" ? null : cnpjFilter,
      } as never);
      if (error) throw error;
      return (data ?? []) as unknown as Alerta[];
    },
  });

  const { data: produtoEditando } = useQuery({
    queryKey: ["produto", editId],
    queryFn: async () => {
      const { data, error } = await supabase.from("produtos").select("*").eq("id", editId!).single();
      if (error) throw error;
      return data as Record<string, unknown>;
    },
    enabled: !!editId,
  });

  useEffect(() => {
    if (!editId || !produtoEditando) return;
    setForm({
      descricao: String(produtoEditando.descricao || ""),
      unidade: String(produtoEditando.unidade || "CX"),
      qtd_rsu_por_tdu: produtoEditando.qtd_rsu_por_tdu ? String(produtoEditando.qtd_rsu_por_tdu) : "",
      peso_bruto_cx_kg: produtoEditando.peso_bruto_cx_kg ? String(produtoEditando.peso_bruto_cx_kg) : "",
      peso_liquido_cx_kg: produtoEditando.peso_liquido_cx_kg ? String(produtoEditando.peso_liquido_cx_kg) : "",
      comprimento_mm: produtoEditando.comprimento_mm ? String(produtoEditando.comprimento_mm) : "",
      largura_mm: produtoEditando.largura_mm ? String(produtoEditando.largura_mm) : "",
      altura_mm: produtoEditando.altura_mm ? String(produtoEditando.altura_mm) : "",
      volume_m3: produtoEditando.volume_m3 ? String(produtoEditando.volume_m3) : "",
      lastro: produtoEditando.lastro ? String(produtoEditando.lastro) : "",
      camadas: produtoEditando.camadas ? String(produtoEditando.camadas) : "",
      tipo_pallet: String(produtoEditando.tipo_pallet || "PBR"),
      ean_tdu: String(produtoEditando.ean_tdu || ""),
      ean_rsu: String(produtoEditando.ean_rsu || ""),
      ncm: String(produtoEditando.ncm || ""),
      shelf_life_dias: produtoEditando.shelf_life_dias ? String(produtoEditando.shelf_life_dias) : "",
      faixa_temperatura: String(produtoEditando.faixa_temperatura || "ambiente"),
      empilhavel: Boolean(produtoEditando.empilhavel ?? true),
      fragil: Boolean(produtoEditando.fragil ?? false),
      sensivel_furto: Boolean(produtoEditando.sensivel_furto ?? false),
      observacao: String(produtoEditando.observacao || ""),
    });
  }, [editId, produtoEditando]);

  const volumeCalc = useMemo(() => {
    const c = num(form.comprimento_mm);
    const l = num(form.largura_mm);
    const a = num(form.altura_mm);
    if (!c || !l || !a) return null;
    return (c * l * a) / 1_000_000_000;
  }, [form.comprimento_mm, form.largura_mm, form.altura_mm]);

  const cxPallet = useMemo(() => {
    const la = num(form.lastro);
    const ca = num(form.camadas);
    if (!la || !ca) return null;
    return la * ca;
  }, [form.lastro, form.camadas]);

  function selecionar(p: Pendente | Alerta) {
    setSel(p);
    if (isAlerta(p)) {
      setEditId(p.produto_id);
    } else {
      setEditId(null);
      setForm({
        ...emptyForm,
        descricao: p.x_prod || "",
        unidade: p.u_com || "CX",
      });
    }
  }

  const salvar = useMutation({
    mutationFn: async () => {
      if (!sel) throw new Error("Nenhum produto selecionado");
      if (!form.descricao.trim()) throw new Error("Descrição é obrigatória");

      const cnpj = cnpjSel(sel);
      const { data: emb } = await supabase
        .from("embarcadores")
        .select("id")
        .eq("cnpj", cnpj)
        .maybeSingle();

      const payload = {
        embarcador_id: emb?.id ?? null,
        cnpj_embarcador: cnpj,
        codigo: codigoSel(sel).trim(),
        descricao: form.descricao.trim(),
        unidade: form.unidade || null,
        qtd_rsu_por_tdu: num(form.qtd_rsu_por_tdu),
        peso_bruto_cx_kg: num(form.peso_bruto_cx_kg),
        peso_liquido_cx_kg: num(form.peso_liquido_cx_kg),
        comprimento_mm: num(form.comprimento_mm),
        largura_mm: num(form.largura_mm),
        altura_mm: num(form.altura_mm),
        volume_m3: num(form.volume_m3),
        lastro: num(form.lastro),
        camadas: num(form.camadas),
        tipo_pallet: form.tipo_pallet || null,
        ean_tdu: form.ean_tdu.trim() || null,
        ean_rsu: form.ean_rsu.trim() || null,
        ncm: form.ncm.replace(/\D/g, "") || null,
        shelf_life_dias: num(form.shelf_life_dias),
        faixa_temperatura: form.faixa_temperatura,
        empilhavel: form.empilhavel,
        fragil: form.fragil,
        sensivel_furto: form.sensivel_furto,
        observacao: form.observacao.trim() || null,
        origem_cadastro: isAlerta(sel) ? "chegada_correcao" : "chegada_manual",
        regra_giro: "FEFO",
        controla_lote: true,
        controla_validade: true,
        ativo: true,
        rascunho: false,
      };

      if (isAlerta(sel)) {
        const { error } = await supabase.from("produtos").update(payload as never).eq("id", sel.produto_id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("produtos").insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      const label = codigoSel(sel);
      toast.success(isAlerta(sel!) ? `Produto ${label} atualizado` : `Produto ${label} cadastrado`);
      setSel(null);
      setEditId(null);
      setForm(emptyForm);
      qc.invalidateQueries({ queryKey: ["produtos-pendentes"] });
      qc.invalidateQueries({ queryKey: ["produtos-alerta-m3"] });
      qc.invalidateQueries({ queryKey: ["produtos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cubagem = useMutation({
    mutationFn: async (simular: boolean) => {
      const { data, error } = await supabase.rpc("aplicar_cubagem_produtos_nf" as never, {
        p_dias: Number(dias),
        p_simular: simular,
      } as never);
      if (error) throw error;
      return data as unknown as {
        simulacao: boolean;
        nfs_sem_cubagem: number;
        elegiveis: number;
        pendentes_cadastro: number;
        atualizadas: number;
      };
    },
    onSuccess: (r) => {
      if (r.simulacao) {
        toast.info(
          `Simulação: ${r.nfs_sem_cubagem} NFs sem cubagem — ${r.elegiveis} podem ser preenchidas agora, ${r.pendentes_cadastro} dependem de cadastro de produto.`,
          { duration: 8000 }
        );
      } else {
        toast.success(`${r.atualizadas} NFs atualizadas com peso e cubagem do cadastro.`);
        qc.invalidateQueries({ queryKey: ["produtos-pendentes"] });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <PackagePlus className="w-6 h-6" /> Cadastro na Chegada
            </h1>
            <p className="text-sm text-muted-foreground">
              Produtos que já entraram em NFs e ainda não têm cadastro — capture dimensões e
              paletização no momento do recebimento.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/produtos">
                <ArrowLeft className="w-4 h-4 mr-2" /> Cadastro completo
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => cubagem.mutate(true)}
              disabled={cubagem.isPending}
            >
              <Calculator className="w-4 h-4 mr-2" /> Simular cubagem nas NFs
            </Button>
            <Button onClick={() => cubagem.mutate(false)} disabled={cubagem.isPending}>
              <CheckCircle2 className="w-4 h-4 mr-2" /> Aplicar nas NFs
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por código ou descrição..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={cnpjFilter} onValueChange={setCnpjFilter}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Embarcador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os embarcadores</SelectItem>
              {emitentes.map(([cnpj, nome]) => (
                <SelectItem key={cnpj} value={cnpj}>
                  {nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={dias} onValueChange={setDias}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
              <SelectItem value="365">Últimos 12 meses</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="outline" className="h-9 px-3 flex items-center">
            {filtered.length} pendentes
          </Badge>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Fila de captura</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[560px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Embarcador</TableHead>
                      <TableHead className="text-right">NFs</TableHead>
                      <TableHead className="text-right">Última</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          Carregando...
                        </TableCell>
                      </TableRow>
                    )}
                    {!isLoading && filtered.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          Nenhum produto pendente no período.
                        </TableCell>
                      </TableRow>
                    )}
                    {filtered.map((p) => (
                      <TableRow
                        key={`${p.cnpj_emitente}-${p.c_prod}`}
                        className={
                          !isAlerta(sel) &&
                          sel?.c_prod === p.c_prod &&
                          sel?.cnpj_emitente === p.cnpj_emitente
                            ? "bg-accent"
                            : "cursor-pointer"
                        }
                        onClick={() => selecionar(p)}
                      >
                        <TableCell className="font-mono text-xs">
                          {p.c_prod.replace(/^0+/, "") || p.c_prod}
                        </TableCell>
                        <TableCell className="max-w-[260px] truncate">{p.x_prod}</TableCell>
                        <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground">
                          {p.razao_social_emitente}
                        </TableCell>
                        <TableCell className="text-right">{p.ocorrencias}</TableCell>
                        <TableCell className="text-right text-xs">
                          {p.ultima_data
                            ? new Date(`${p.ultima_data}T00:00:00`).toLocaleDateString("pt-BR")
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" onClick={() => selecionar(p)}>
                            Capturar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                {isAlerta(sel) ? (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-600" /> Correção de cubagem
                  </>
                ) : (
                  <>
                    <Ruler className="w-4 h-4" /> Captura rápida
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!sel && (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Selecione um produto da fila para capturar os dados, ou um item do alerta de cubagem
                  para corrigir.
                </p>
              )}
              {sel && (
                <>
                  <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
                    <p className="font-mono font-semibold">{codigoSel(sel)}</p>
                    <p className="text-muted-foreground truncate">{razaoSocialSel(sel)}</p>
                    <p className="text-xs text-muted-foreground">
                      CNPJ {fmtCnpj(cnpjSel(sel))}
                    </p>
                    {isAlerta(sel) && (
                      <p className="text-xs font-medium text-amber-600">
                        {sel.motivo === "sem_cubagem"
                          ? "⚠ Cubagem ausente — medir e salvar"
                          : "⚠ Cubagem calculada — conferir medição"}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label>Descrição *</Label>
                    <Input
                      value={form.descricao}
                      onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Unidade</Label>
                      <Input
                        value={form.unidade}
                        onChange={(e) => setForm({ ...form, unidade: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Un. por caixa</Label>
                      <Input
                        inputMode="decimal"
                        value={form.qtd_rsu_por_tdu}
                        onChange={(e) => setForm({ ...form, qtd_rsu_por_tdu: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Compr. (mm)</Label>
                      <Input
                        inputMode="decimal"
                        value={form.comprimento_mm}
                        onChange={(e) => setForm({ ...form, comprimento_mm: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Larg. (mm)</Label>
                      <Input
                        inputMode="decimal"
                        value={form.largura_mm}
                        onChange={(e) => setForm({ ...form, largura_mm: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Alt. (mm)</Label>
                      <Input
                        inputMode="decimal"
                        value={form.altura_mm}
                        onChange={(e) => setForm({ ...form, altura_mm: e.target.value })}
                      />
                    </div>
                  </div>

                  {volumeCalc !== null && (
                    <p className="text-xs text-muted-foreground">
                      Cubagem calculada: <strong>{volumeCalc.toFixed(4)} m³</strong> por caixa
                      {form.volume_m3 === "" && " (será gravada automaticamente)"}
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Peso bruto CX (kg)</Label>
                      <Input
                        inputMode="decimal"
                        value={form.peso_bruto_cx_kg}
                        onChange={(e) => setForm({ ...form, peso_bruto_cx_kg: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Peso líq. CX (kg)</Label>
                      <Input
                        inputMode="decimal"
                        value={form.peso_liquido_cx_kg}
                        onChange={(e) => setForm({ ...form, peso_liquido_cx_kg: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Lastro</Label>
                      <Input
                        inputMode="numeric"
                        value={form.lastro}
                        onChange={(e) => setForm({ ...form, lastro: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Camadas</Label>
                      <Input
                        inputMode="numeric"
                        value={form.camadas}
                        onChange={(e) => setForm({ ...form, camadas: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Pallet</Label>
                      <Input
                        value={form.tipo_pallet}
                        onChange={(e) => setForm({ ...form, tipo_pallet: e.target.value })}
                      />
                    </div>
                  </div>

                  {cxPallet !== null && (
                    <p className="text-xs text-muted-foreground">
                      Caixas por pallet: <strong>{cxPallet}</strong>
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>EAN caixa</Label>
                      <Input
                        value={form.ean_tdu}
                        onChange={(e) => setForm({ ...form, ean_tdu: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>EAN unidade</Label>
                      <Input
                        value={form.ean_rsu}
                        onChange={(e) => setForm({ ...form, ean_rsu: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>NCM</Label>
                      <Input
                        value={form.ncm}
                        onChange={(e) => setForm({ ...form, ncm: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Shelf life (dias)</Label>
                      <Input
                        inputMode="numeric"
                        value={form.shelf_life_dias}
                        onChange={(e) => setForm({ ...form, shelf_life_dias: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Temperatura</Label>
                    <Select
                      value={form.faixa_temperatura}
                      onValueChange={(v) => setForm({ ...form, faixa_temperatura: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ambiente">Ambiente</SelectItem>
                        <SelectItem value="climatizado">Climatizado</SelectItem>
                        <SelectItem value="refrigerado">Refrigerado</SelectItem>
                        <SelectItem value="congelado">Congelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Empilhável</Label>
                      <Switch
                        checked={form.empilhavel}
                        onCheckedChange={(v) => setForm({ ...form, empilhavel: v })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Frágil</Label>
                      <Switch
                        checked={form.fragil}
                        onCheckedChange={(v) => setForm({ ...form, fragil: v })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Sensível a furto</Label>
                      <Switch
                        checked={form.sensivel_furto}
                        onCheckedChange={(v) => setForm({ ...form, sensivel_furto: v })}
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Observação</Label>
                    <Input
                      value={form.observacao}
                      onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" className="flex-1" onClick={() => setSel(null)}>
                      Cancelar
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={() => salvar.mutate()}
                      disabled={salvar.isPending}
                    >
                      {salvar.isPending ? "Salvando..." : "Salvar e próximo"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
