import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Save, Lock, Unlock, Send, ShieldAlert } from "lucide-react";

export function IbacEnvioPanel() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    envio_ativo: false,
    modo_imagem: "url" as "url" | "base64",
    codigo_evento_entrega: "01",
    max_imagem_kb: 1024,
    data_piloto: "",
    canhoto_apos_prestacao: true,
  });
  const [whitelistTexto, setWhitelistTexto] = useState("");
  const [placasTexto, setPlacasTexto] = useState("");

  const { data: cfg } = useQuery({
    queryKey: ["ibac-config-envio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ibac_config_envio")
        .select("*")
        .eq("id", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (cfg) {
      setForm({
        envio_ativo: cfg.envio_ativo,
        modo_imagem: (cfg.modo_imagem as "url" | "base64") ?? "url",
        codigo_evento_entrega: cfg.codigo_evento_entrega ?? "01",
        max_imagem_kb: cfg.max_imagem_kb ?? 1024,
        data_piloto: (cfg as any).data_piloto ?? "",
        canhoto_apos_prestacao: (cfg as any).canhoto_apos_prestacao ?? true,
      });
      setWhitelistTexto((cfg.whitelist_nfs ?? []).join("\n"));
      setPlacasTexto(((cfg as any).placas_piloto ?? []).join(" "));
    }
  }, [cfg]);

  const whitelist = whitelistTexto
    .split(/[\s,;]+/)
    .map((v) => v.trim())
    .filter(Boolean);

  const placas = placasTexto
    .split(/[\s,;]+/)
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean);

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("ibac_config_envio")
        .update({
          ...form,
          data_piloto: form.data_piloto || null,
          placas_piloto: placas,
          whitelist_nfs: whitelist,
        } as any)
        .eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configuração de envio salva");
      qc.invalidateQueries({ queryKey: ["ibac-config-envio"] });
    },
    onError: (e: any) => toast.error(`Erro: ${e.message}`),
  });

  const rodarSync = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ibac-sync");
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      if (d?.status === "envio_bloqueado") {
        toast.info(`Envio bloqueado — ${d.pendentes_na_fila ?? 0} eventos aguardando na fila.`);
      } else if (d?.status === "aguardando_configuracao") {
        toast.warning("Secrets IBAC_API_URL / IBAC_API_KEY ainda não configurados.");
      } else {
        toast.success(
          `Processados ${d?.processados ?? 0} · sucessos ${d?.sucessos ?? 0} · fora da whitelist ${d?.fora_da_whitelist ?? 0}`,
        );
      }
      qc.invalidateQueries({ queryKey: ["ibac-fila"] });
    },
    onError: (e: any) => toast.error(`Erro: ${e.message}`),
  });

  return (
    <div className="space-y-6">
      <Card className={form.envio_ativo ? "border-green-600/50" : "border-destructive/50"}>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              {form.envio_ativo ? <Unlock className="w-5 h-5 text-green-600" /> : <Lock className="w-5 h-5 text-destructive" />}
              Envio para a IBAC
            </CardTitle>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Com o envio <strong>bloqueado</strong>, a fila continua sendo alimentada normalmente e nada é postado à IBAC —
              sem perda de eventos. Libere apenas no momento do teste.
            </p>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Badge variant={form.envio_ativo ? "default" : "destructive"}>
              {form.envio_ativo ? "LIBERADO" : "BLOQUEADO"}
            </Badge>
            <Switch
              checked={form.envio_ativo}
              onCheckedChange={(v) => setForm((f) => ({ ...f, envio_ativo: v }))}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Formato da imagem do canhoto</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={form.modo_imagem === "url" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setForm((f) => ({ ...f, modo_imagem: "url" }))}
                >
                  Link (URL 7 dias)
                </Button>
                <Button
                  type="button"
                  variant={form.modo_imagem === "base64" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setForm((f) => ({ ...f, modo_imagem: "base64" }))}
                >
                  Base64
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Código do evento de entrega (com imagem)</Label>
              <Input
                value={form.codigo_evento_entrega}
                onChange={(e) => setForm((f) => ({ ...f, codigo_evento_entrega: e.target.value }))}
                placeholder="01"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tamanho máx. da imagem (KB)</Label>
              <Input
                type="number"
                value={form.max_imagem_kb}
                onChange={(e) => setForm((f) => ({ ...f, max_imagem_kb: Number(e.target.value) }))}
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-3 rounded-md border p-3 bg-muted/30">
            <Label className="text-sm font-semibold">Piloto controlado por veículo</Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs">Placas do piloto (separadas por espaço/vírgula)</Label>
                <Input
                  value={placasTexto}
                  onChange={(e) => setPlacasTexto(e.target.value)}
                  placeholder="LNA5B11 DTB9J73"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Data da roteirização</Label>
                <Input
                  type="date"
                  value={form.data_piloto}
                  onChange={(e) => setForm((f) => ({ ...f, data_piloto: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-xs">Enviar imagem do canhoto só após encerrar a Prestação de Contas</Label>
                <p className="text-xs text-muted-foreground">
                  A ocorrência de entrega segue em tempo real (na sincronização da baixa); a imagem aguarda o encerramento do veículo.
                </p>
              </div>
              <Switch
                checked={form.canhoto_apos_prestacao}
                onCheckedChange={(v) => setForm((f) => ({ ...f, canhoto_apos_prestacao: v }))}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {placas.length > 0
                ? `Somente as notas dos veículos ${placas.join(", ")}${form.data_piloto ? ` na data ${form.data_piloto}` : ""} são enviadas.`
                : "Vazio = sem restrição por veículo."}
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" />
              Whitelist de notas para teste (uma por linha — número da NF ou chave de acesso)
            </Label>
            <Textarea
              rows={5}
              value={whitelistTexto}
              onChange={(e) => setWhitelistTexto(e.target.value)}
              placeholder={"3897274\n749344"}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {whitelist.length > 0
                ? `Somente ${whitelist.length} nota(s) serão enviadas. Todo o resto fica na fila.`
                : "Vazio = sem restrição por nota (envia tudo que estiver pendente quando liberado)."}
            </p>
          </div>


          <div className="flex gap-2">
            <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
              <Save className="w-4 h-4 mr-2" /> Salvar configuração
            </Button>
            <Button variant="outline" onClick={() => rodarSync.mutate()} disabled={rodarSync.isPending}>
              <Send className="w-4 h-4 mr-2" /> Rodar sync agora
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
