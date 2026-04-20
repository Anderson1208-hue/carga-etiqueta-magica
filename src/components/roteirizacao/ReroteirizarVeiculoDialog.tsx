import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin, Save, Route, AlertCircle } from "lucide-react";
import { ListaParadas } from "./ListaParadas";
import { getMacroRegiao } from "@/lib/macro-regioes";
import { calculateBoxes } from "@/lib/xml-parser";

interface ReroteirizarVeiculoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  veiculo: {
    id: string;
    placa: string;
    motorista: string | null;
  } | null;
  onCompleted?: () => void;
}

interface Entrega {
  cep: string;
  cnpjDestinatario: string;
  razaoSocial: string;
  enderecoCompleto: string;
  bairro: string;
  cidade: string;
  uf: string;
  logradouro: string;
  macroRegiao: number;
  latitude: number | null;
  longitude: number | null;
  totalNfs: number;
  totalCaixas: number;
  pesoTotalKg: number;
  volumeTotalM3: number;
  nfs: string[];
  nfIds: string[];
  cargaIds: string[];
  ordem?: number;
}

const CD_LAT = -22.8783;
const CD_LNG = -43.3367;

// ===== Geocoding helpers (same logic as Roteirizacao.tsx) =====
async function geocodeViaCep(cep: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length !== 8) return null;
    const response = await fetch(`https://brasilapi.com.br/api/cep/v2/${cleanCep}`);
    if (!response.ok) return null;
    const data = await response.json();
    if (data.location?.coordinates?.longitude && data.location?.coordinates?.latitude) {
      return {
        lat: Number(data.location.coordinates.latitude),
        lng: Number(data.location.coordinates.longitude),
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function geocodeViaNominatim(query: string, retries = 2): Promise<{ lat: number; lng: number } | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=br`,
        { headers: { Accept: "application/json" } }
      );
      if (!response.ok) {
        if ((response.status === 429 || response.status === 503) && attempt < retries) {
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
          continue;
        }
        return null;
      }
      const data = await response.json();
      if (data.length > 0) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      }
      return null;
    } catch {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      return null;
    }
  }
  return null;
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function detectClusterRadius(points: Entrega[]): number {
  if (points.length < 2) return 6;
  let totalDist = 0;
  let count = 0;
  const sampleSize = Math.min(points.length, 30);
  for (let i = 0; i < sampleSize; i++) {
    for (let j = i + 1; j < sampleSize; j++) {
      totalDist += haversineDistance(
        points[i].latitude!,
        points[i].longitude!,
        points[j].latitude!,
        points[j].longitude!
      );
      count++;
    }
  }
  const avgDist = totalDist / count;
  if (avgDist < 10) return 6;
  return 17;
}

function clusterAndSort(list: Entrega[], startLat: number, startLng: number): Entrega[] {
  const geocoded = list.filter((e) => e.latitude && e.longitude);
  const notGeocoded = list.filter((e) => !e.latitude || !e.longitude);
  if (geocoded.length === 0) return list;

  const clusterRadius = detectClusterRadius(geocoded);
  const clusters: Entrega[][] = [];
  const unassigned = [...geocoded];

  while (unassigned.length > 0) {
    const refLat =
      clusters.length === 0
        ? startLat
        : clusters[clusters.length - 1].reduce((s, e) => s + e.latitude!, 0) /
          clusters[clusters.length - 1].length;
    const refLng =
      clusters.length === 0
        ? startLng
        : clusters[clusters.length - 1].reduce((s, e) => s + e.longitude!, 0) /
          clusters[clusters.length - 1].length;

    let seedIdx = 0;
    let seedDist = Infinity;
    for (let i = 0; i < unassigned.length; i++) {
      const d = haversineDistance(refLat, refLng, unassigned[i].latitude!, unassigned[i].longitude!);
      if (d < seedDist) {
        seedDist = d;
        seedIdx = i;
      }
    }

    const seed = unassigned.splice(seedIdx, 1)[0];
    const cluster: Entrega[] = [seed];
    let centroidLat = seed.latitude!;
    let centroidLng = seed.longitude!;

    let changed = true;
    while (changed) {
      changed = false;
      for (let i = unassigned.length - 1; i >= 0; i--) {
        const d = haversineDistance(centroidLat, centroidLng, unassigned[i].latitude!, unassigned[i].longitude!);
        if (d <= clusterRadius) {
          cluster.push(unassigned.splice(i, 1)[0]);
          centroidLat = cluster.reduce((s, e) => s + e.latitude!, 0) / cluster.length;
          centroidLng = cluster.reduce((s, e) => s + e.longitude!, 0) / cluster.length;
          changed = true;
        }
      }
    }
    clusters.push(cluster);
  }

  const orderedClusters: Entrega[][] = [];
  const remainingClusters = [...clusters];
  let curLat = startLat;
  let curLng = startLng;

  while (remainingClusters.length > 0) {
    let nearestClusterIdx = 0;
    let nearestClusterDist = Infinity;
    for (let i = 0; i < remainingClusters.length; i++) {
      const cLat = remainingClusters[i].reduce((s, e) => s + e.latitude!, 0) / remainingClusters[i].length;
      const cLng = remainingClusters[i].reduce((s, e) => s + e.longitude!, 0) / remainingClusters[i].length;
      const d = haversineDistance(curLat, curLng, cLat, cLng);
      if (d < nearestClusterDist) {
        nearestClusterDist = d;
        nearestClusterIdx = i;
      }
    }
    const chosen = remainingClusters.splice(nearestClusterIdx, 1)[0];
    orderedClusters.push(chosen);
    const cLat = chosen.reduce((s, e) => s + e.latitude!, 0) / chosen.length;
    const cLng = chosen.reduce((s, e) => s + e.longitude!, 0) / chosen.length;
    curLat = cLat;
    curLng = cLng;
  }

  const result: Entrega[] = [];
  let nnLat = startLat;
  let nnLng = startLng;
  for (const cluster of orderedClusters) {
    const remaining = [...cluster];
    while (remaining.length > 0) {
      let nearestIdx = 0;
      let nearestDist = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const d = haversineDistance(nnLat, nnLng, remaining[i].latitude!, remaining[i].longitude!);
        if (d < nearestDist) {
          nearestDist = d;
          nearestIdx = i;
        }
      }
      const nearest = remaining.splice(nearestIdx, 1)[0];
      result.push(nearest);
      nnLat = nearest.latitude!;
      nnLng = nearest.longitude!;
    }
  }

  const sortedNotGeocoded = notGeocoded.sort((a, b) => {
    const cnpjA = parseInt((a.cnpjDestinatario || "0").replace(/\D/g, ""), 10);
    const cnpjB = parseInt((b.cnpjDestinatario || "0").replace(/\D/g, ""), 10);
    return cnpjA - cnpjB;
  });

  return [...result, ...sortedNotGeocoded];
}

export function ReroteirizarVeiculoDialog({
  open,
  onOpenChange,
  veiculo,
  onCompleted,
}: ReroteirizarVeiculoDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [stage, setStage] = useState<"loading" | "ready" | "saving">("loading");
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [primaryCargaId, setPrimaryCargaId] = useState<string | null>(null);
  const [stats, setStats] = useState({ geocoded: 0, failed: [] as string[] });
  const [orderChanged, setOrderChanged] = useState(false);

  useEffect(() => {
    if (open && veiculo) {
      loadAndGeocode(veiculo.id);
    } else {
      setEntregas([]);
      setStage("loading");
      setOrderChanged(false);
      setStats({ geocoded: 0, failed: [] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, veiculo?.id]);

  async function loadAndGeocode(veiculoId: string) {
    setStage("loading");
    try {
      // 1. Load all NFs linked to this veiculo
      const { data: vnfs, error } = await supabase
        .from("veiculo_nfs")
        .select(`
          id, nf_id, carga_origem_id,
          notas_fiscais!inner(
            id, numero_nf, cnpj_destinatario, dest_razao_social,
            dest_logradouro, dest_numero, dest_bairro, dest_cidade, dest_uf, dest_cep,
            peso_bruto, volume_m3,
            itens_nf(q_com)
          )
        `)
        .eq("veiculo_id", veiculoId);

      if (error) throw error;
      if (!vnfs || vnfs.length === 0) {
        toast({
          title: "Nenhuma NF",
          description: "Este veículo não tem NFs vinculadas.",
          variant: "destructive",
        });
        onOpenChange(false);
        return;
      }

      // Determine primary carga (first carga_origem_id)
      const primary = vnfs[0].carga_origem_id;
      setPrimaryCargaId(primary);

      // 2. Group by CNPJ destinatário (entrega)
      const entregaMap = new Map<string, Entrega>();
      for (const vnf of vnfs as any[]) {
        const nf = vnf.notas_fiscais;
        const cnpj = nf.cnpj_destinatario || `SEM_CNPJ_${nf.id}`;
        const endereco = [nf.dest_logradouro, nf.dest_numero, nf.dest_bairro, nf.dest_cidade, nf.dest_uf, nf.dest_cep]
          .filter(Boolean)
          .join(", ");
        const caixas = (nf.itens_nf || []).reduce(
          (s: number, it: any) => s + calculateBoxes(Number(it.q_com)),
          0
        );

        if (!entregaMap.has(cnpj)) {
          entregaMap.set(cnpj, {
            cep: nf.dest_cep || "SEM_CEP",
            cnpjDestinatario: cnpj,
            razaoSocial: nf.dest_razao_social || "Cliente não identificado",
            enderecoCompleto: endereco || "Endereço não informado",
            bairro: nf.dest_bairro || "",
            cidade: nf.dest_cidade || "Rio de Janeiro",
            uf: nf.dest_uf || "RJ",
            logradouro: nf.dest_logradouro || "",
            macroRegiao: getMacroRegiao(nf.dest_bairro || ""),
            latitude: null,
            longitude: null,
            totalNfs: 0,
            totalCaixas: 0,
            pesoTotalKg: 0,
            volumeTotalM3: 0,
            nfs: [],
            nfIds: [],
            cargaIds: [],
          });
        }
        const e = entregaMap.get(cnpj)!;
        e.totalNfs += 1;
        e.totalCaixas += caixas;
        e.pesoTotalKg += Number(nf.peso_bruto || 0);
        e.volumeTotalM3 += Number(nf.volume_m3 || 0);
        e.nfs.push(nf.numero_nf);
        e.nfIds.push(nf.id);
        e.cargaIds.push(vnf.carga_origem_id);
      }

      let list = Array.from(entregaMap.values());

      // 3. Try to reuse existing coords AND ordem from roteirizacao_paradas of THIS veiculo's primary carga
      // Preserves manual ordering set by the operator (modo manual / drag-and-drop).
      const cnpjs = list.map((e) => e.cnpjDestinatario).filter((c) => !c.startsWith("SEM_CNPJ"));
      const ordemPrevia = new Map<string, number>();

      if (primary) {
        // Buscar paradas da roteirização atual desta carga (mantém ordem manual)
        const { data: rotAtual } = await supabase
          .from("roteirizacoes")
          .select("id")
          .eq("carga_id", primary)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (rotAtual?.id) {
          const { data: paradasAtuais } = await supabase
            .from("roteirizacao_paradas")
            .select("cnpj_destinatario, ordem, latitude, longitude")
            .eq("roteirizacao_id", rotAtual.id);

          (paradasAtuais || []).forEach((p: any) => {
            ordemPrevia.set(p.cnpj_destinatario, p.ordem);
            if (p.latitude && p.longitude) {
              // hidrata coords desta carga primeiro
              const idx = list.findIndex((e) => e.cnpjDestinatario === p.cnpj_destinatario);
              if (idx >= 0 && !list[idx].latitude) {
                list[idx] = { ...list[idx], latitude: Number(p.latitude), longitude: Number(p.longitude) };
              }
            }
          });
        }
      }

      // Fallback: completar coords faltantes a partir de QUALQUER roteirização anterior com mesmo CNPJ
      const semCoords = list.filter((e) => !e.latitude || !e.longitude).map((e) => e.cnpjDestinatario);
      if (semCoords.length > 0) {
        const { data: existing } = await supabase
          .from("roteirizacao_paradas")
          .select("cnpj_destinatario, latitude, longitude")
          .in("cnpj_destinatario", semCoords)
          .not("latitude", "is", null);
        const cache = new Map<string, { lat: number; lng: number }>();
        (existing || []).forEach((p: any) => {
          if (!cache.has(p.cnpj_destinatario)) {
            cache.set(p.cnpj_destinatario, { lat: Number(p.latitude), lng: Number(p.longitude) });
          }
        });
        list = list.map((e) => {
          if (e.latitude && e.longitude) return e;
          const c = cache.get(e.cnpjDestinatario);
          return c ? { ...e, latitude: c.lat, longitude: c.lng } : e;
        });
      }

      // 4. Geocode missing
      const failed: string[] = [];
      let geoCount = list.filter((e) => e.latitude && e.longitude).length;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.latitude && e.longitude) continue;
        if (e.enderecoCompleto === "Endereço não informado") continue;

        let coords: { lat: number; lng: number } | null = null;
        if (e.cep && e.cep !== "SEM_CEP") {
          coords = await geocodeViaCep(e.cep);
          await new Promise((r) => setTimeout(r, 300));
        }
        const cidade = e.cidade || "Rio de Janeiro";
        const uf = e.uf || "RJ";
        if (!coords && e.logradouro && e.bairro) {
          coords = await geocodeViaNominatim(`${e.logradouro}, ${e.bairro}, ${cidade}, ${uf}`);
          await new Promise((r) => setTimeout(r, 1100));
        }
        if (!coords && e.bairro) {
          coords = await geocodeViaNominatim(`${e.bairro}, ${cidade}, ${uf}`);
          await new Promise((r) => setTimeout(r, 1100));
        }
        if (!coords && e.logradouro) {
          coords = await geocodeViaNominatim(`${e.logradouro}, ${cidade}, ${uf}`);
          await new Promise((r) => setTimeout(r, 1100));
        }
        if (!coords && e.cidade) {
          coords = await geocodeViaNominatim(`${cidade}, ${uf}`);
          await new Promise((r) => setTimeout(r, 1100));
        }
        if (coords) {
          list[i] = { ...e, latitude: coords.lat, longitude: coords.lng };
          geoCount++;
        } else {
          failed.push(e.razaoSocial);
        }
      }

      // 5. Preservar ordem manual prévia quando existir; só usa cluster+sort para CNPJs novos
      let sorted: Entrega[];
      const comOrdemPrevia = list.filter((e) => ordemPrevia.has(e.cnpjDestinatario));
      const semOrdemPrevia = list.filter((e) => !ordemPrevia.has(e.cnpjDestinatario));

      if (comOrdemPrevia.length > 0) {
        comOrdemPrevia.sort(
          (a, b) => (ordemPrevia.get(a.cnpjDestinatario) ?? 0) - (ordemPrevia.get(b.cnpjDestinatario) ?? 0)
        );
        const novosOrdenados =
          semOrdemPrevia.length > 0
            ? clusterAndSort(
                semOrdemPrevia,
                comOrdemPrevia[comOrdemPrevia.length - 1].latitude ?? CD_LAT,
                comOrdemPrevia[comOrdemPrevia.length - 1].longitude ?? CD_LNG
              )
            : [];
        sorted = [...comOrdemPrevia, ...novosOrdenados].map((e, i) => ({ ...e, ordem: i + 1 }));
      } else {
        sorted = clusterAndSort(list, CD_LAT, CD_LNG).map((e, i) => ({ ...e, ordem: i + 1 }));
      }

      setEntregas(sorted);
      setStats({ geocoded: geoCount, failed });
      setStage("ready");
    } catch (err) {
      console.error("Reroteirizar error:", err);
      toast({
        title: "Erro",
        description: "Não foi possível reroteirizar o veículo.",
        variant: "destructive",
      });
      onOpenChange(false);
    }
  }

  function handleReorder(reordered: Entrega[]) {
    const withOrdem = reordered.map((e, i) => ({ ...e, ordem: i + 1 }));
    setEntregas(withOrdem);
    setOrderChanged(true);
  }

  async function handleSave() {
    if (!veiculo || !primaryCargaId) return;
    setStage("saving");
    try {
      // Find or create roteirizacao for primary carga
      let { data: rot } = await supabase
        .from("roteirizacoes")
        .select("id")
        .eq("carga_id", primaryCargaId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let rotId = rot?.id as string | undefined;
      const pesoTotal = entregas.reduce((s, e) => s + e.pesoTotalKg, 0);
      const volumeTotal = entregas.reduce((s, e) => s + e.volumeTotalM3, 0);

      if (!rotId) {
        const { data: newRot, error: newRotErr } = await supabase
          .from("roteirizacoes")
          .insert({
            carga_id: primaryCargaId,
            created_by: user?.id,
            ponto_inicial_lat: CD_LAT,
            ponto_inicial_lng: CD_LNG,
            ponto_inicial_nome: "CD - Rua da Regeneração, 235",
            peso_total_kg: pesoTotal,
            volume_total_m3: volumeTotal,
            status: "concluida",
          })
          .select("id")
          .single();
        if (newRotErr) throw newRotErr;
        rotId = newRot.id;
      } else {
        await supabase
          .from("roteirizacoes")
          .update({ peso_total_kg: pesoTotal, volume_total_m3: volumeTotal })
          .eq("id", rotId);
      }

      // Replace all paradas
      await supabase.from("roteirizacao_paradas").delete().eq("roteirizacao_id", rotId);

      const paradasInsert = entregas.map((e, idx) => ({
        roteirizacao_id: rotId!,
        cnpj_destinatario: e.cnpjDestinatario,
        razao_social: e.razaoSocial,
        endereco_completo: e.enderecoCompleto,
        latitude: e.latitude,
        longitude: e.longitude,
        ordem: e.ordem || idx + 1,
        total_nfs: e.totalNfs,
        total_caixas: e.totalCaixas,
        peso_total_kg: e.pesoTotalKg,
        volume_total_m3: e.volumeTotalM3,
      }));

      const { error: insErr } = await supabase.from("roteirizacao_paradas").insert(paradasInsert);
      if (insErr) throw insErr;

      toast({
        title: "Rota atualizada!",
        description: `${entregas.length} paradas reordenadas para o veículo ${veiculo.placa}.`,
      });
      onCompleted?.();
      onOpenChange(false);
    } catch (err) {
      console.error("Save reroteirizacao error:", err);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar a nova ordem.",
        variant: "destructive",
      });
      setStage("ready");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Route className="w-5 h-5" />
            Reroteirizar Veículo {veiculo?.placa}
          </DialogTitle>
          <DialogDescription>
            Preserva a ordem manual definida anteriormente. Novos CNPJs são acrescentados ao
            final por proximidade. Você pode arrastar para ajustar antes de salvar.
          </DialogDescription>
        </DialogHeader>

        {stage === "loading" ? (
          <div className="py-16 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Carregando NFs, geocodificando endereços e calculando rota...
            </p>
            <p className="text-xs text-muted-foreground">
              Isso pode levar alguns segundos por endereço.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/50 border">
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="w-4 h-4 text-primary" />
                <span className="font-medium">{stats.geocoded}</span>
                <span className="text-muted-foreground">de {entregas.length} paradas geocodificadas</span>
              </div>
              {stats.failed.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-destructive">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Falha: {stats.failed.join(", ")}</span>
                </div>
              )}
            </div>

            <div className="mt-3">
              <ListaParadas entregas={entregas} onReorder={handleReorder} />
            </div>

            <div className="flex items-center justify-between pt-4 border-t mt-4">
              <p className="text-xs text-muted-foreground">
                {orderChanged
                  ? "Ordem manual aplicada. Clique em Salvar para gravar."
                  : "Ordem calculada automaticamente. Arraste para ajustar."}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={stage === "saving"}>
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={stage === "saving" || entregas.length === 0}>
                  {stage === "saving" ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Salvar Nova Ordem
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
