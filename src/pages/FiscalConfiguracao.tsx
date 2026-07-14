import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, ShieldAlert } from "lucide-react";

type Emitente = {
  id?: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string | null;
  ie: string;
  ie_st?: string | null;
  regime_tributario: string;
  cnae?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cep?: string | null;
  municipio: string;
  codigo_municipio_ibge: string;
  uf: string;
  telefone?: string | null;
  email?: string | null;
  rntrc?: string | null;
  ambiente: string;
  emissor_api: string;
  serie_cte: number;
  proximo_numero_cte: number;
  serie_mdfe: number;
  proximo_numero_mdfe: number;
  tomador_padrao?: string | null;
  observacao_padrao?: string | null;
  ativo: boolean;
};

const empty: Emitente = {
  cnpj: "",
  razao_social: "",
  ie: "",
  regime_tributario: "lucro_presumido",
  municipio: "",
  codigo_municipio_ibge: "",
  uf: "",
  ambiente: "homologacao",
  emissor_api: "plugnotas",
  serie_cte: 1,
  proximo_numero_cte: 1,
  serie_mdfe: 1,
  proximo_numero_mdfe: 1,
  ativo: true,
};

export default function FiscalConfiguracao() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Emitente>(empty);

  const bloqueiaEdicao = !isAdmin;

  const patch = (p: Partial<Emitente>) => setForm((s) => ({ ...s, ...p }));

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("configuracao_fiscal_emitente")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) {
        toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
      } else if (data) {
        setForm(data as Emitente);
      }
      setLoading(false);
    })();
  }, []);

  const validar = (): string | null => {
    const digits = form.cnpj.replace(/\D/g, "");
    if (digits.length !== 14) return "CNPJ inválido (14 dígitos)";
    if (!form.razao_social.trim()) return "Razão social obrigatória";
    if (!form.ie.trim()) return "Inscrição Estadual obrigatória";
    if (!form.municipio.trim()) return "Município obrigatório";
    if (!/^\d{7}$/.test(form.codigo_municipio_ibge)) return "Código IBGE inválido (7 dígitos)";
    if (!/^[A-Z]{2}$/.test(form.uf)) return "UF inválida";
    return null;
  };

  const salvar = async () => {
    const erro = validar();
    if (erro) {
      toast({ title: "Confira os campos", description: erro, variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload: Emitente = {
      ...form,
      cnpj: form.cnpj.replace(/\D/g, ""),
      uf: form.uf.toUpperCase(),
    };
    const { data, error } = form.id
      ? await supabase
          .from("configuracao_fiscal_emitente")
          .update(payload)
          .eq("id", form.id)
          .select()
          .maybeSingle()
      : await supabase
          .from("configuracao_fiscal_emitente")
          .insert(payload)
          .select()
          .maybeSingle();
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    if (data) setForm(data as Emitente);
    toast({ title: "Configuração fiscal salva" });
  };

  const ambienteBadge = useMemo(
    () =>
      form.ambiente === "producao" ? (
        <Badge className="bg-red-600 hover:bg-red-600">PRODUÇÃO</Badge>
      ) : (
        <Badge variant="secondary">HOMOLOGAÇÃO</Badge>
      ),
    [form.ambiente]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Configuração Fiscal do Emitente</h1>
          <p className="text-sm text-muted-foreground">
            Dados do CNPJ que emitirá CT-e e MDF-e. {ambienteBadge}
          </p>
        </div>
        <Button onClick={salvar} disabled={saving || bloqueiaEdicao}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar
        </Button>
      </div>

      {bloqueiaEdicao && (
        <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
          <ShieldAlert className="w-4 h-4 mt-0.5" />
          Somente administradores podem alterar a configuração fiscal. Você está em modo consulta.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Identificação</CardTitle>
          <CardDescription>CNPJ, razão social e inscrições</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="CNPJ *">
            <Input
              value={form.cnpj}
              onChange={(e) => patch({ cnpj: e.target.value })}
              placeholder="00000000000000"
              disabled={bloqueiaEdicao}
            />
          </Field>
          <Field label="Razão Social *" className="md:col-span-2">
            <Input
              value={form.razao_social}
              onChange={(e) => patch({ razao_social: e.target.value })}
              disabled={bloqueiaEdicao}
            />
          </Field>
          <Field label="Nome Fantasia">
            <Input
              value={form.nome_fantasia ?? ""}
              onChange={(e) => patch({ nome_fantasia: e.target.value })}
              disabled={bloqueiaEdicao}
            />
          </Field>
          <Field label="Inscrição Estadual *">
            <Input
              value={form.ie}
              onChange={(e) => patch({ ie: e.target.value })}
              disabled={bloqueiaEdicao}
            />
          </Field>
          <Field label="IE Substituto Tributário">
            <Input
              value={form.ie_st ?? ""}
              onChange={(e) => patch({ ie_st: e.target.value })}
              disabled={bloqueiaEdicao}
            />
          </Field>
          <Field label="Regime Tributário *">
            <Select
              value={form.regime_tributario}
              onValueChange={(v) => patch({ regime_tributario: v })}
              disabled={bloqueiaEdicao}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="simples">Simples Nacional</SelectItem>
                <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
                <SelectItem value="lucro_real">Lucro Real</SelectItem>
                <SelectItem value="mei">MEI</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="CNAE">
            <Input
              value={form.cnae ?? ""}
              onChange={(e) => patch({ cnae: e.target.value })}
              disabled={bloqueiaEdicao}
            />
          </Field>
          <Field label="RNTRC (ANTT)">
            <Input
              value={form.rntrc ?? ""}
              onChange={(e) => patch({ rntrc: e.target.value })}
              disabled={bloqueiaEdicao}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Endereço</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Field label="Logradouro" className="md:col-span-2">
            <Input
              value={form.logradouro ?? ""}
              onChange={(e) => patch({ logradouro: e.target.value })}
              disabled={bloqueiaEdicao}
            />
          </Field>
          <Field label="Número">
            <Input
              value={form.numero ?? ""}
              onChange={(e) => patch({ numero: e.target.value })}
              disabled={bloqueiaEdicao}
            />
          </Field>
          <Field label="Complemento">
            <Input
              value={form.complemento ?? ""}
              onChange={(e) => patch({ complemento: e.target.value })}
              disabled={bloqueiaEdicao}
            />
          </Field>
          <Field label="Bairro">
            <Input
              value={form.bairro ?? ""}
              onChange={(e) => patch({ bairro: e.target.value })}
              disabled={bloqueiaEdicao}
            />
          </Field>
          <Field label="CEP">
            <Input
              value={form.cep ?? ""}
              onChange={(e) => patch({ cep: e.target.value })}
              disabled={bloqueiaEdicao}
            />
          </Field>
          <Field label="Município *">
            <Input
              value={form.municipio}
              onChange={(e) => patch({ municipio: e.target.value })}
              disabled={bloqueiaEdicao}
            />
          </Field>
          <Field label="Cód. IBGE * (7 dígitos)">
            <Input
              value={form.codigo_municipio_ibge}
              onChange={(e) => patch({ codigo_municipio_ibge: e.target.value })}
              disabled={bloqueiaEdicao}
              placeholder="3304557"
            />
          </Field>
          <Field label="UF *">
            <Input
              value={form.uf}
              onChange={(e) => patch({ uf: e.target.value.toUpperCase().slice(0, 2) })}
              disabled={bloqueiaEdicao}
              maxLength={2}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contato</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Telefone">
            <Input
              value={form.telefone ?? ""}
              onChange={(e) => patch({ telefone: e.target.value })}
              disabled={bloqueiaEdicao}
            />
          </Field>
          <Field label="E-mail">
            <Input
              value={form.email ?? ""}
              onChange={(e) => patch({ email: e.target.value })}
              disabled={bloqueiaEdicao}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Emissão de Documentos</CardTitle>
          <CardDescription>
            Séries, numeração e ambiente do CT-e e MDF-e
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Ambiente *">
            <Select
              value={form.ambiente}
              onValueChange={(v) => patch({ ambiente: v })}
              disabled={bloqueiaEdicao}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="homologacao">Homologação</SelectItem>
                <SelectItem value="producao">Produção</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="API Emissora *">
            <Select
              value={form.emissor_api}
              onValueChange={(v) => patch({ emissor_api: v })}
              disabled={bloqueiaEdicao}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="plugnotas">PlugNotas</SelectItem>
                <SelectItem value="focus">Focus NFe</SelectItem>
                <SelectItem value="migrate">Migrate</SelectItem>
                <SelectItem value="outros">Outros</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Tomador padrão">
            <Select
              value={form.tomador_padrao ?? ""}
              onValueChange={(v) => patch({ tomador_padrao: v })}
              disabled={bloqueiaEdicao}
            >
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="emitente">Emitente</SelectItem>
                <SelectItem value="expedidor">Expedidor</SelectItem>
                <SelectItem value="recebedor">Recebedor</SelectItem>
                <SelectItem value="destinatario">Destinatário</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Série CT-e">
            <Input
              type="number"
              value={form.serie_cte}
              onChange={(e) => patch({ serie_cte: Number(e.target.value) || 0 })}
              disabled={bloqueiaEdicao}
            />
          </Field>
          <Field label="Próximo nº CT-e">
            <Input
              type="number"
              value={form.proximo_numero_cte}
              onChange={(e) => patch({ proximo_numero_cte: Number(e.target.value) || 0 })}
              disabled={bloqueiaEdicao}
            />
          </Field>
          <div />

          <Field label="Série MDF-e">
            <Input
              type="number"
              value={form.serie_mdfe}
              onChange={(e) => patch({ serie_mdfe: Number(e.target.value) || 0 })}
              disabled={bloqueiaEdicao}
            />
          </Field>
          <Field label="Próximo nº MDF-e">
            <Input
              type="number"
              value={form.proximo_numero_mdfe}
              onChange={(e) => patch({ proximo_numero_mdfe: Number(e.target.value) || 0 })}
              disabled={bloqueiaEdicao}
            />
          </Field>
          <div className="flex items-end gap-3">
            <Switch
              id="ativo"
              checked={form.ativo}
              onCheckedChange={(v) => patch({ ativo: v })}
              disabled={bloqueiaEdicao}
            />
            <Label htmlFor="ativo">Configuração ativa</Label>
          </div>

          <div className="md:col-span-3">
            <Label>Observação padrão (irá no CT-e)</Label>
            <Textarea
              className="mt-1"
              rows={3}
              value={form.observacao_padrao ?? ""}
              onChange={(e) => patch({ observacao_padrao: e.target.value })}
              disabled={bloqueiaEdicao}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
