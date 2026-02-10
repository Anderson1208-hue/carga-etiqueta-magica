import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  MapPin,
  Route,
  Loader2,
  Download,
  Navigation,
  Clock,
  Package,
  FileText,
  Weight,
  Box,
  Filter,
  ChevronDown,
  X,
} from "lucide-react";
import { calculateBoxes } from "@/lib/xml-parser";
import { format } from "date-fns";
import { MapaRoteirizacao } from "@/components/roteirizacao/MapaRoteirizacao";
import { ListaParadas } from "@/components/roteirizacao/ListaParadas";
import { generateRoteirizacaoPDF } from "@/lib/roteirizacao-pdf";
import {
  getMacroRegiao,
  getMacroRegiaoLabel,
  getAllMacroRegioes,
} from "@/lib/macro-regioes";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Carga {
  id: string;
  data: string;
  placa: string;
  motorista: string;
}

interface Entrega {
  cep: string;
  cnpjDestinatario: string;
  razaoSocial: string;
  enderecoCompleto: string;
  bairro: string;
  macroRegiao: number;
  latitude: number | null;
  longitude: number | null;
  totalNfs: number;
  totalCaixas: number;
  pesoTotalKg: number;
  volumeTotalM3: number;
  nfs: string[];
  ordem?: number;
}

interface RoteirizacaoData {
  id: string;
  distanciaTotalKm: number;
  tempoEstimadoMin: number;
  pesoTotalKg: number;
  volumeTotalM3: number;
  paradas: Entrega[];
}

export default function Roteirizacao() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [cargas, setCargas] = useState<Carga[]>([]);
  const [selectedCargaIds, setSelectedCargaIds] = useState<string[]>([]);
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [roteirizacao, setRoteirizacao] = useState<RoteirizacaoData | null>(null);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [filtroMacroRegiao, setFiltroMacroRegiao] = useState<string>("todas");
  const [cargaSearchTerm, setCargaSearchTerm] = useState("");

  // CD coordinates (default: São Paulo)
  const [cdLat, setCdLat] = useState<string>("-23.5505");
  const [cdLng, setCdLng] = useState<string>("-46.6333");
  const [cdNome, setCdNome] = useState<string>("Centro de Distribuição");

  const selectedCargas = cargas.filter((c) => selectedCargaIds.includes(c.id));

  useEffect(() => {
    loadCargas();
  }, []);

  useEffect(() => {
    if (selectedCargaIds.length > 0) {
      loadEntregas(selectedCargaIds);
    } else {
      setEntregas([]);
      setRoteirizacao(null);
    }
  }, [selectedCargaIds]);

  async function loadCargas() {
    const { data } = await supabase
      .from("cargas")
      .select("id, data, placa, motorista")
      .order("created_at", { ascending: false });

    setCargas(data || []);
  }

  function toggleCarga(cargaId: string) {
    setSelectedCargaIds((prev) =>
      prev.includes(cargaId)
        ? prev.filter((id) => id !== cargaId)
        : [...prev, cargaId]
    );
  }

  async function loadEntregas(cargaIds: string[]) {
    setLoading(true);
    setRoteirizacao(null);
    setFiltroMacroRegiao("todas");
    try {
      // Fetch NFs from all selected cargas
      const { data: nfsData } = await supabase
        .from("notas_fiscais")
        .select(`
          id,
          numero_nf,
          cnpj_destinatario,
          dest_razao_social,
          dest_logradouro,
          dest_numero,
          dest_bairro,
          dest_cidade,
          dest_uf,
          dest_cep,
          peso_bruto,
          peso_liquido,
          itens_nf(q_com)
        `)
        .in("carga_id", cargaIds);

      // Group by CNPJ — cada CNPJ é uma parada única
      const entregasMap = new Map<string, Entrega>();

      (nfsData || []).forEach((nf) => {
        const cnpj = nf.cnpj_destinatario || "SEM_CNPJ";
        const chave = cnpj;

        if (!entregasMap.has(chave)) {
          const bairro = nf.dest_bairro || "";
          const endereco = [
            nf.dest_logradouro,
            nf.dest_numero,
            nf.dest_bairro,
            nf.dest_cidade,
            nf.dest_uf,
            nf.dest_cep,
          ]
            .filter(Boolean)
            .join(", ");

          entregasMap.set(chave, {
            cep: nf.dest_cep || "SEM_CEP",
            cnpjDestinatario: cnpj,
            razaoSocial: nf.dest_razao_social || "Cliente não identificado",
            enderecoCompleto: endereco || "Endereço não informado",
            bairro,
            macroRegiao: getMacroRegiao(bairro),
            latitude: null,
            longitude: null,
            totalNfs: 0,
            totalCaixas: 0,
            pesoTotalKg: 0,
            volumeTotalM3: 0,
            nfs: [],
          });
        }

        const entrega = entregasMap.get(chave)!;
        entrega.totalNfs++;
        entrega.nfs.push(nf.numero_nf);

        entrega.pesoTotalKg += Number(nf.peso_bruto) || 0;

        const nfItems = (nf.itens_nf || []) as { q_com: number }[];
        nfItems.forEach((item) => {
          entrega.totalCaixas += calculateBoxes(Number(item.q_com));
        });
      });

      // Ordenação: macroRegião crescente → bairro A-Z → razão social A-Z
      const entregasList = sortByMacroRegiao(Array.from(entregasMap.values()));
      setEntregas(entregasList);
    } catch (error) {
      console.error("Error loading entregas:", error);
      toast({
        title: "Erro",
        description: "Erro ao carregar entregas",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  function sortByMacroRegiao(list: Entrega[]): Entrega[] {
    return list
      .sort((a, b) => {
        if (a.macroRegiao !== b.macroRegiao) {
          return a.macroRegiao - b.macroRegiao;
        }
        const bairroComp = (a.bairro || "").localeCompare(b.bairro || "", "pt-BR");
        if (bairroComp !== 0) return bairroComp;
        return (a.razaoSocial || "").localeCompare(b.razaoSocial || "", "pt-BR");
      })
      .map((e, i) => ({ ...e, ordem: i + 1 }));
  }

  async function geocodeAddresses() {
    setGeocoding(true);
    const updatedEntregas = [...entregas];

    for (let i = 0; i < updatedEntregas.length; i++) {
      const entrega = updatedEntregas[i];
      if (entrega.latitude && entrega.longitude) continue;
      if (entrega.enderecoCompleto === "Endereço não informado") continue;

      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            entrega.enderecoCompleto + ", Brasil"
          )}&limit=1`,
          {
            headers: {
              "User-Agent": "WMS-Recebimento/1.0",
            },
          }
        );

        const data = await response.json();
        if (data.length > 0) {
          updatedEntregas[i] = {
            ...entrega,
            latitude: parseFloat(data[0].lat),
            longitude: parseFloat(data[0].lon),
          };
        }

        await new Promise((r) => setTimeout(r, 1100));
      } catch (error) {
        console.error("Geocoding error:", error);
      }
    }

    setEntregas(updatedEntregas);
    setGeocoding(false);
    toast({
      title: "Geocodificação concluída",
      description: `${updatedEntregas.filter((e) => e.latitude).length} de ${
        updatedEntregas.length
      } endereços localizados`,
    });
  }

  function haversineDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ) {
    const toRad = (v: number) => (v * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) ** 2;
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
          points[i].latitude!, points[i].longitude!,
          points[j].latitude!, points[j].longitude!
        );
        count++;
      }
    }

    const avgDist = totalDist / count;
    if (avgDist < 10) return 6;
    return 17;
  }

  function clusterAndSort(
    list: Entrega[],
    startLat: number,
    startLng: number
  ): Entrega[] {
    const geocoded = list.filter((e) => e.latitude && e.longitude);
    const notGeocoded = list.filter((e) => !e.latitude || !e.longitude);

    if (geocoded.length === 0) return list;

    const clusterRadius = detectClusterRadius(geocoded);
    const clusters: Entrega[][] = [];
    const unassigned = [...geocoded];

    while (unassigned.length > 0) {
      const refLat = clusters.length === 0
        ? startLat
        : clusters[clusters.length - 1].reduce((s, e) => s + e.latitude!, 0) /
          clusters[clusters.length - 1].length;
      const refLng = clusters.length === 0
        ? startLng
        : clusters[clusters.length - 1].reduce((s, e) => s + e.longitude!, 0) /
          clusters[clusters.length - 1].length;

      let seedIdx = 0;
      let seedDist = Infinity;
      for (let i = 0; i < unassigned.length; i++) {
        const d = haversineDistance(refLat, refLng, unassigned[i].latitude!, unassigned[i].longitude!);
        if (d < seedDist) { seedDist = d; seedIdx = i; }
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
        if (d < nearestClusterDist) { nearestClusterDist = d; nearestClusterIdx = i; }
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
          if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
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

  async function calculateRoute() {
    setCalculating(true);
    try {
      const validEntregas = entregas.filter(
        (e) => e.latitude && e.longitude
      );

      if (validEntregas.length === 0) {
        toast({
          title: "Erro",
          description: "Nenhum endereço geocodificado. Execute a geocodificação primeiro.",
          variant: "destructive",
        });
        return;
      }

      const cdLatNum = parseFloat(cdLat);
      const cdLngNum = parseFloat(cdLng);

      if (isNaN(cdLatNum) || isNaN(cdLngNum)) {
        toast({
          title: "Erro",
          description: "Coordenadas do CD inválidas",
          variant: "destructive",
        });
        return;
      }

      const coordinates = [
        [cdLngNum, cdLatNum],
        ...validEntregas.map((e) => [e.longitude!, e.latitude!]),
      ];

      const coordStr = coordinates.map((c) => c.join(",")).join(";");
      const response = await fetch(
        `https://router.project-osrm.org/trip/v1/driving/${coordStr}?overview=full&geometries=geojson&roundtrip=false&source=first`
      );

      const data = await response.json();

      if (data.code !== "Ok" || !data.trips || data.trips.length === 0) {
        throw new Error("Erro ao calcular rota");
      }

      const trip = data.trips[0];
      const waypoints = data.waypoints;

      const deliveryWaypoints = waypoints
        .slice(1)
        .map((wp: any, inputIdx: number) => ({
          entrega: validEntregas[inputIdx],
          tripOrder: wp.waypoint_index,
        }));

      deliveryWaypoints.sort(
        (a: { tripOrder: number }, b: { tripOrder: number }) =>
          a.tripOrder - b.tripOrder
      );

      const orderedEntregas: Entrega[] = deliveryWaypoints.map(
        (dw: { entrega: Entrega; tripOrder: number }, i: number) => ({
          ...dw.entrega,
          ordem: i + 1,
        })
      );

      if (orderedEntregas.length === 0) {
        validEntregas.forEach((e, i) => {
          orderedEntregas.push({ ...e, ordem: i + 1 });
        });
      }

      const distanciaKm = trip.distance / 1000;
      const tempoMin = Math.round(trip.duration / 60);

      // Save roteirizacao using the first selected carga
      const { data: rotData, error: rotError } = await supabase
        .from("roteirizacoes")
        .insert({
          carga_id: selectedCargaIds[0],
          created_by: user?.id,
          ponto_inicial_lat: cdLatNum,
          ponto_inicial_lng: cdLngNum,
          ponto_inicial_nome: cdNome,
          distancia_total_km: distanciaKm,
          tempo_estimado_min: tempoMin,
          status: "concluida",
        })
        .select()
        .single();

      if (rotError) throw rotError;

      const pesoTotal = orderedEntregas.reduce((sum, e) => sum + e.pesoTotalKg, 0);
      const volumeTotal = orderedEntregas.reduce((sum, e) => sum + e.volumeTotalM3, 0);

      await supabase
        .from("roteirizacoes")
        .update({
          peso_total_kg: pesoTotal,
          volume_total_m3: volumeTotal,
        })
        .eq("id", rotData.id);

      const paradasInsert = orderedEntregas.map((e, index) => ({
        roteirizacao_id: rotData.id,
        cnpj_destinatario: e.cnpjDestinatario,
        razao_social: e.razaoSocial,
        endereco_completo: e.enderecoCompleto,
        latitude: e.latitude,
        longitude: e.longitude,
        ordem: e.ordem || index + 1,
        total_nfs: e.totalNfs,
        total_caixas: e.totalCaixas,
        peso_total_kg: e.pesoTotalKg,
        volume_total_m3: e.volumeTotalM3,
      }));

      await supabase.from("roteirizacao_paradas").insert(paradasInsert);

      setRoteirizacao({
        id: rotData.id,
        distanciaTotalKm: distanciaKm,
        tempoEstimadoMin: tempoMin,
        pesoTotalKg: pesoTotal,
        volumeTotalM3: volumeTotal,
        paradas: orderedEntregas,
      });

      setEntregas(orderedEntregas);

      toast({
        title: "Rota calculada!",
        description: `${orderedEntregas.length} paradas - ${distanciaKm.toFixed(
          1
        )} km - ${tempoMin} min`,
      });
    } catch (error) {
      console.error("Route calculation error:", error);
      toast({
        title: "Erro ao calcular rota",
        description: "Tente novamente ou verifique os endereços",
        variant: "destructive",
      });
    } finally {
      setCalculating(false);
    }
  }

  async function exportPDF() {
    if (!roteirizacao || selectedCargas.length === 0) return;

    try {
      const cargaLabel = selectedCargas.length === 1
        ? selectedCargas[0]
        : {
            id: selectedCargas[0].id,
            data: selectedCargas[0].data,
            placa: selectedCargas.map((c) => c.placa).join(" / "),
            motorista: selectedCargas.map((c) => c.motorista).join(" / "),
          };

      const blob = await generateRoteirizacaoPDF({
        carga: cargaLabel,
        cdNome,
        cdLat: parseFloat(cdLat),
        cdLng: parseFloat(cdLng),
        distanciaTotalKm: roteirizacao.distanciaTotalKm,
        tempoEstimadoMin: roteirizacao.tempoEstimadoMin,
        pesoTotalKg: roteirizacao.pesoTotalKg,
        volumeTotalM3: roteirizacao.volumeTotalM3,
        paradas: roteirizacao.paradas,
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const placas = selectedCargas.map((c) => c.placa).join("_");
      link.download = `roteirizacao_${placas}_${format(
        new Date(selectedCargas[0].data),
        "yyyy-MM-dd"
      )}.pdf`;
      link.click();
      URL.revokeObjectURL(url);

      toast({
        title: "PDF gerado",
        description: "Roteirização exportada com sucesso",
      });
    } catch (error) {
      console.error("PDF export error:", error);
      toast({
        title: "Erro",
        description: "Erro ao gerar PDF",
        variant: "destructive",
      });
    }
  }

  function exportCSV() {
    if (selectedCargas.length === 0) return;

    const dataToExport = filteredEntregas;
    const header = [
      "Seq",
      "Macro Região",
      "Bairro",
      "Destinatário",
      "CNPJ",
      "CEP",
      "Endereço",
      "Total NFs",
      "Total Caixas",
      "Peso (kg)",
      "Volume (m³)",
      "Lista NFs",
    ].join(";");

    const rows = dataToExport.map((e, i) =>
      [
        i + 1,
        `MR ${e.macroRegiao}`,
        `"${e.bairro}"`,
        `"${e.razaoSocial}"`,
        e.cnpjDestinatario,
        e.cep,
        `"${e.enderecoCompleto}"`,
        e.totalNfs,
        e.totalCaixas,
        e.pesoTotalKg.toFixed(1),
        e.volumeTotalM3.toFixed(2),
        `"${e.nfs.join(", ")}"`,
      ].join(";")
    );

    const csvContent = "\uFEFF" + [header, ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const placas = selectedCargas.map((c) => c.placa).join("_");
    link.download = `rota_sugerida_${placas}_${format(
      new Date(selectedCargas[0].data),
      "yyyy-MM-dd"
    )}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast({
      title: "CSV exportado",
      description: "Rota sugerida exportada com sucesso",
    });
  }

  // Filtered entregas based on macro region filter
  const filteredEntregas =
    filtroMacroRegiao === "todas"
      ? entregas
      : entregas.filter((e) => e.macroRegiao === parseInt(filtroMacroRegiao));

  // Macro regiões presentes na carga (para exibir badges)
  const macroRegioesPresentes = [...new Set(entregas.map((e) => e.macroRegiao))].sort(
    (a, b) => a - b
  );

  const totalCaixas = filteredEntregas.reduce((sum, e) => sum + e.totalCaixas, 0);
  const totalNfs = filteredEntregas.reduce((sum, e) => sum + e.totalNfs, 0);
  const totalPeso = filteredEntregas.reduce((sum, e) => sum + e.pesoTotalKg, 0);
  const totalVolume = filteredEntregas.reduce((sum, e) => sum + e.volumeTotalM3, 0);

  const filteredCargas = cargaSearchTerm
    ? cargas.filter(
        (c) =>
          c.placa.toLowerCase().includes(cargaSearchTerm.toLowerCase()) ||
          c.motorista.toLowerCase().includes(cargaSearchTerm.toLowerCase())
      )
    : cargas;

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Route className="w-6 h-6" />
            Roteirização de Entregas
          </h1>
          <p className="text-muted-foreground">
            Rota sugerida por Macro Região – agrupamento por CNPJ do destinatário
          </p>
        </div>

        {/* Multi-Carga Selector */}
        <div className="wms-card p-4">
          <div className="space-y-3">
            <Label className="text-sm font-medium">Selecione uma ou mais cargas</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between min-h-[40px] h-auto"
                >
                  <span className="text-left truncate">
                    {selectedCargaIds.length === 0
                      ? "Selecione as cargas..."
                      : `${selectedCargaIds.length} carga(s) selecionada(s)`}
                  </span>
                  <ChevronDown className="w-4 h-4 shrink-0 ml-2 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[460px] p-0" align="start">
                <div className="p-3 border-b">
                  <Input
                    placeholder="Buscar por placa ou motorista..."
                    value={cargaSearchTerm}
                    onChange={(e) => setCargaSearchTerm(e.target.value)}
                    className="h-8"
                  />
                </div>
                <div className="max-h-[280px] overflow-y-auto p-2 space-y-1">
                  {filteredCargas.map((carga) => {
                    const isSelected = selectedCargaIds.includes(carga.id);
                    return (
                      <label
                        key={carga.id}
                        className={`flex items-center gap-3 p-2 rounded-md cursor-pointer hover:bg-accent transition-colors ${
                          isSelected ? "bg-accent/50" : ""
                        }`}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleCarga(carga.id)}
                        />
                        <span className="text-sm">
                          <span className="font-medium">{carga.placa}</span>
                          {" - "}
                          {format(new Date(carga.data), "dd/MM/yyyy")}
                          {" - "}
                          {carga.motorista}
                        </span>
                      </label>
                    );
                  })}
                  {filteredCargas.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhuma carga encontrada
                    </p>
                  )}
                </div>
                {selectedCargaIds.length > 0 && (
                  <div className="p-2 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => setSelectedCargaIds([])}
                    >
                      Limpar seleção
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>

            {/* Selected cargas badges */}
            {selectedCargas.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedCargas.map((carga) => (
                  <Badge
                    key={carga.id}
                    variant="secondary"
                    className="gap-1 pr-1"
                  >
                    {carga.placa} - {carga.motorista}
                    <button
                      onClick={() => toggleCarga(carga.id)}
                      className="ml-1 rounded-full hover:bg-muted p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        {selectedCargas.length > 0 && (
          <>
            {/* CD Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Navigation className="w-4 h-4" />
                  Ponto de Partida (CD)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-4">
                  <div>
                    <Label>Nome</Label>
                    <Input
                      value={cdNome}
                      onChange={(e) => setCdNome(e.target.value)}
                      placeholder="Centro de Distribuição"
                    />
                  </div>
                  <div>
                    <Label>Latitude</Label>
                    <Input
                      value={cdLat}
                      onChange={(e) => setCdLat(e.target.value)}
                      placeholder="-23.5505"
                    />
                  </div>
                  <div>
                    <Label>Longitude</Label>
                    <Input
                      value={cdLng}
                      onChange={(e) => setCdLng(e.target.value)}
                      placeholder="-46.6333"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Filtro por Macro Região */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Filter className="w-4 h-4" />
                  Filtro por Macro Região
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Select value={filtroMacroRegiao} onValueChange={setFiltroMacroRegiao}>
                    <SelectTrigger className="max-w-sm">
                      <SelectValue placeholder="Todas as macro regiões" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas as macro regiões</SelectItem>
                      {getAllMacroRegioes().map((mr) => {
                        const count = entregas.filter(
                          (e) => e.macroRegiao === mr.value
                        ).length;
                        if (count === 0) return null;
                        return (
                          <SelectItem key={mr.value} value={String(mr.value)}>
                            {mr.label} ({count} paradas)
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>

                  {/* Badges das macro regiões presentes */}
                  <div className="flex flex-wrap gap-2">
                    {macroRegioesPresentes.map((mr) => {
                      const count = entregas.filter(
                        (e) => e.macroRegiao === mr
                      ).length;
                      const isActive =
                        filtroMacroRegiao === String(mr);
                      return (
                        <Badge
                          key={mr}
                          variant={isActive ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() =>
                            setFiltroMacroRegiao(
                              isActive ? "todas" : String(mr)
                            )
                          }
                        >
                          MR {mr} ({count})
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
              <div className="wms-stat-card">
                <p className="text-sm text-muted-foreground">Paradas</p>
                <p className="text-2xl font-bold">{filteredEntregas.length}</p>
              </div>
              <div className="wms-stat-card">
                <p className="text-sm text-muted-foreground">Total NFs</p>
                <p className="text-2xl font-bold">{totalNfs}</p>
              </div>
              <div className="wms-stat-card">
                <p className="text-sm text-muted-foreground">Total Caixas</p>
                <p className="text-2xl font-bold">{totalCaixas}</p>
              </div>
              <div className="wms-stat-card">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Weight className="w-3 h-3" /> Peso Total
                </p>
                <p className="text-2xl font-bold">{totalPeso.toFixed(1)} kg</p>
              </div>
              <div className="wms-stat-card">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Box className="w-3 h-3" /> Volume Total
                </p>
                <p className="text-2xl font-bold">{totalVolume.toFixed(2)} m³</p>
              </div>
              <div className="wms-stat-card">
                <p className="text-sm text-muted-foreground">Geocodificados</p>
                <p className="text-2xl font-bold">
                  {filteredEntregas.filter((e) => e.latitude).length}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 flex-wrap">
              <Button
                onClick={geocodeAddresses}
                disabled={geocoding || loading}
                variant="outline"
              >
                {geocoding ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <MapPin className="w-4 h-4 mr-2" />
                )}
                Geocodificar Endereços
              </Button>
              <Button
                onClick={calculateRoute}
                disabled={calculating || entregas.filter((e) => e.latitude).length === 0}
              >
                {calculating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Route className="w-4 h-4 mr-2" />
                )}
                Calcular Rota Otimizada
              </Button>
              <Button onClick={exportCSV} variant="secondary" disabled={entregas.length === 0}>
                <Download className="w-4 h-4 mr-2" />
                Exportar Rota CSV
              </Button>
              {roteirizacao && (
                <Button onClick={exportPDF} variant="secondary">
                  <Download className="w-4 h-4 mr-2" />
                  Exportar PDF
                </Button>
              )}
            </div>

            {/* Route Results */}
            {roteirizacao && (
              <Card className="border-success">
                <CardHeader>
                  <CardTitle className="text-success flex items-center gap-2">
                    <Route className="w-5 h-5" />
                    Rota Calculada
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Paradas</p>
                        <p className="text-xl font-bold">
                          {roteirizacao.paradas.length}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Route className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Distância</p>
                        <p className="text-xl font-bold">
                          {roteirizacao.distanciaTotalKm.toFixed(1)} km
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Tempo Estimado
                        </p>
                        <p className="text-xl font-bold">
                          {Math.floor(roteirizacao.tempoEstimadoMin / 60)}h{" "}
                          {roteirizacao.tempoEstimadoMin % 60}min
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Map */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Mapa
                </CardTitle>
              </CardHeader>
              <CardContent>
                <MapaRoteirizacao
                  cdLat={parseFloat(cdLat)}
                  cdLng={parseFloat(cdLng)}
                  cdNome={cdNome}
                  entregas={filteredEntregas}
                />
              </CardContent>
            </Card>

            {/* Rota Sugerida - Stops List */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Rota Sugerida – Paradas por CNPJ
                  {filtroMacroRegiao !== "todas" && (
                    <Badge variant="secondary">
                      Filtro: MR {filtroMacroRegiao}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ListaParadas entregas={filteredEntregas} />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </MainLayout>
  );
}
