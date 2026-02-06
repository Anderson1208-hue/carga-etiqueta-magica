import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
} from "lucide-react";
import { calculateBoxes } from "@/lib/xml-parser";
import { format } from "date-fns";
import { MapaRoteirizacao } from "@/components/roteirizacao/MapaRoteirizacao";
import { ListaParadas } from "@/components/roteirizacao/ListaParadas";
import { generateRoteirizacaoPDF } from "@/lib/roteirizacao-pdf";

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
  latitude: number | null;
  longitude: number | null;
  totalNfs: number;
  totalCaixas: number;
  pesoTotalKg: number;
  volumeTotalM3: number;
  ordem?: number;
}

interface Roteirizacao {
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
  const [selectedCargaId, setSelectedCargaId] = useState<string>("");
  const [selectedCarga, setSelectedCarga] = useState<Carga | null>(null);
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [roteirizacao, setRoteirizacao] = useState<Roteirizacao | null>(null);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  // CD coordinates (default: São Paulo)
  const [cdLat, setCdLat] = useState<string>("-23.5505");
  const [cdLng, setCdLng] = useState<string>("-46.6333");
  const [cdNome, setCdNome] = useState<string>("Centro de Distribuição");

  useEffect(() => {
    loadCargas();
  }, []);

  useEffect(() => {
    if (selectedCargaId) {
      loadEntregas(selectedCargaId);
    }
  }, [selectedCargaId]);

  async function loadCargas() {
    const { data } = await supabase
      .from("cargas")
      .select("id, data, placa, motorista")
      .order("created_at", { ascending: false });

    setCargas(data || []);
  }

  async function loadEntregas(cargaId: string) {
    setLoading(true);
    setRoteirizacao(null);
    try {
      const { data: cargaData } = await supabase
        .from("cargas")
        .select("*")
        .eq("id", cargaId)
        .single();

      if (cargaData) {
        setSelectedCarga(cargaData);
      }

      // Fetch NFs with address data, weight, and items
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
        .eq("carga_id", cargaId);

      // Group by CEP + CNPJ (mesmo CEP mas CNPJs diferentes = entregas separadas)
      const entregasMap = new Map<string, Entrega>();

      (nfsData || []).forEach((nf) => {
        const cep = nf.dest_cep || "SEM_CEP";
        const cnpj = nf.cnpj_destinatario || "SEM_CNPJ";
        const chave = `${cep}|${cnpj}`;
        
        if (!entregasMap.has(chave)) {
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
            cep,
            cnpjDestinatario: cnpj,
            razaoSocial: nf.dest_razao_social || "Cliente não identificado",
            enderecoCompleto: endereco || "Endereço não informado",
            latitude: null,
            longitude: null,
            totalNfs: 0,
            totalCaixas: 0,
            pesoTotalKg: 0,
            volumeTotalM3: 0,
          });
        }

        const entrega = entregasMap.get(chave)!;
        entrega.totalNfs++;
        
        // Add NF weight (from transp/vol in XML)
        entrega.pesoTotalKg += Number(nf.peso_bruto) || 0;

        // Count boxes from items
        const nfItems = (nf.itens_nf || []) as { q_com: number }[];
        nfItems.forEach((item) => {
          entrega.totalCaixas += calculateBoxes(Number(item.q_com));
        });
      });

      const entregasList = Array.from(entregasMap.values()).sort((a, b) => {
        const cepA = parseInt((a.cep || "0").replace(/\D/g, ""), 10);
        const cepB = parseInt((b.cep || "0").replace(/\D/g, ""), 10);
        return cepA - cepB;
      });
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

  async function geocodeAddresses() {
    setGeocoding(true);
    const updatedEntregas = [...entregas];

    for (let i = 0; i < updatedEntregas.length; i++) {
      const entrega = updatedEntregas[i];
      if (entrega.latitude && entrega.longitude) continue;
      if (entrega.enderecoCompleto === "Endereço não informado") continue;

      try {
        // Use Nominatim (OpenStreetMap) for geocoding - free, no API key needed
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

        // Respect rate limiting
        await new Promise((r) => setTimeout(r, 1100));
      } catch (error) {
        console.error("Geocoding error:", error);
      }
    }

    // After geocoding, sort by nearest-neighbor from CD to group nearby deliveries
    const cdLatNum = parseFloat(cdLat);
    const cdLngNum = parseFloat(cdLng);
    const sortedEntregas = nearestNeighborSort(updatedEntregas, cdLatNum, cdLngNum);

    setEntregas(sortedEntregas);
    setGeocoding(false);
    toast({
      title: "Geocodificação concluída",
      description: `${sortedEntregas.filter((e) => e.latitude).length} de ${
        sortedEntregas.length
      } endereços localizados`,
    });
  }

  /**
   * Haversine distance in km between two points.
   */
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

  /**
   * Cluster-based sort: groups nearby deliveries into geographic clusters,
   * then orders clusters by proximity to CD, and within each cluster
   * orders stops by nearest-neighbor. This keeps nearby neighborhoods
   * together, minimizing back-and-forth.
   *
   * Uses a simple greedy clustering: pick the nearest unvisited point to
   * the cluster centroid, and keep adding points within CLUSTER_RADIUS_KM.
   * When no more points fit, start a new cluster from the nearest remaining.
   */
  function nearestNeighborSort(
    list: Entrega[],
    startLat: number,
    startLng: number
  ): Entrega[] {
    const geocoded = list.filter((e) => e.latitude && e.longitude);
    const notGeocoded = list.filter((e) => !e.latitude || !e.longitude);

    if (geocoded.length === 0) return list;

    // --- Step 1: Build geographic clusters ---
    const CLUSTER_RADIUS_KM = 3; // points within 3 km form a cluster
    const clusters: Entrega[][] = [];
    const unassigned = [...geocoded];

    while (unassigned.length > 0) {
      // Seed: pick the point closest to CD (or to the last cluster's centroid)
      const refLat = clusters.length === 0
        ? startLat
        : clusters[clusters.length - 1].reduce((s, e) => s + e.latitude!, 0) /
          clusters[clusters.length - 1].length;
      const refLng = clusters.length === 0
        ? startLng
        : clusters[clusters.length - 1].reduce((s, e) => s + e.longitude!, 0) /
          clusters[clusters.length - 1].length;

      // Find nearest unassigned to reference
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

      // Greedily add nearby points
      let changed = true;
      while (changed) {
        changed = false;
        for (let i = unassigned.length - 1; i >= 0; i--) {
          const d = haversineDistance(centroidLat, centroidLng, unassigned[i].latitude!, unassigned[i].longitude!);
          if (d <= CLUSTER_RADIUS_KM) {
            cluster.push(unassigned.splice(i, 1)[0]);
            // Recalculate centroid
            centroidLat = cluster.reduce((s, e) => s + e.latitude!, 0) / cluster.length;
            centroidLng = cluster.reduce((s, e) => s + e.longitude!, 0) / cluster.length;
            changed = true;
          }
        }
      }

      clusters.push(cluster);
    }

    // --- Step 2: Order clusters by nearest-neighbor from CD ---
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

    // --- Step 3: Within each cluster, order by nearest-neighbor ---
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

    // Append non-geocoded sorted by CEP
    const sortedNotGeocoded = notGeocoded.sort((a, b) => {
      const cepA = parseInt((a.cep || "0").replace(/\D/g, ""), 10);
      const cepB = parseInt((b.cep || "0").replace(/\D/g, ""), 10);
      return cepA - cepB;
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

      // Build waypoints for OSRM
      const coordinates = [
        [cdLngNum, cdLatNum], // Start at CD
        ...validEntregas.map((e) => [e.longitude!, e.latitude!]),
      ];

      // Use OSRM for route optimization (trip endpoint)
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

      // Map each delivery waypoint to its optimized trip position
      // waypoints[i] corresponds to coordinates[i] (input order)
      // waypoints[i].waypoint_index is the position in the optimized trip
      const deliveryWaypoints = waypoints
        .slice(1) // skip CD (first input)
        .map((wp: any, inputIdx: number) => ({
          entrega: validEntregas[inputIdx],
          tripOrder: wp.waypoint_index,
        }));

      // Sort by trip order to get the proximity-optimized sequence
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

      // Fallback if OSRM doesn't return proper order
      if (orderedEntregas.length === 0) {
        validEntregas.forEach((e, i) => {
          orderedEntregas.push({ ...e, ordem: i + 1 });
        });
      }

      const distanciaKm = trip.distance / 1000;
      const tempoMin = Math.round(trip.duration / 60);

      // Save to database
      const { data: rotData, error: rotError } = await supabase
        .from("roteirizacoes")
        .insert({
          carga_id: selectedCargaId,
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

      // Calculate totals
      const pesoTotal = orderedEntregas.reduce((sum, e) => sum + e.pesoTotalKg, 0);
      const volumeTotal = orderedEntregas.reduce((sum, e) => sum + e.volumeTotalM3, 0);

      // Update roteirizacao with totals
      await supabase
        .from("roteirizacoes")
        .update({
          peso_total_kg: pesoTotal,
          volume_total_m3: volumeTotal,
        })
        .eq("id", rotData.id);

      // Save paradas
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
    if (!roteirizacao || !selectedCarga) return;

    try {
      const blob = await generateRoteirizacaoPDF({
        carga: selectedCarga,
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
      link.download = `roteirizacao_${selectedCarga.placa}_${format(
        new Date(selectedCarga.data),
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

  const totalCaixas = entregas.reduce((sum, e) => sum + e.totalCaixas, 0);
  const totalNfs = entregas.reduce((sum, e) => sum + e.totalNfs, 0);
  const totalPeso = entregas.reduce((sum, e) => sum + e.pesoTotalKg, 0);
  const totalVolume = entregas.reduce((sum, e) => sum + e.volumeTotalM3, 0);

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
            Gere rotas otimizadas agrupando por CEP do destinatário
          </p>
        </div>

        {/* Carga Selector */}
        <div className="wms-card p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-[250px] max-w-sm">
              <Select value={selectedCargaId} onValueChange={setSelectedCargaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma carga" />
                </SelectTrigger>
                <SelectContent>
                  {cargas.map((carga) => (
                    <SelectItem key={carga.id} value={carga.id}>
                      {carga.placa} - {format(new Date(carga.data), "dd/MM/yyyy")}{" "}
                      - {carga.motorista}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {selectedCarga && (
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

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
              <div className="wms-stat-card">
                <p className="text-sm text-muted-foreground">Entregas</p>
                <p className="text-2xl font-bold">{entregas.length}</p>
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
                  {entregas.filter((e) => e.latitude).length}
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
                  entregas={entregas}
                />
              </CardContent>
            </Card>

            {/* Stops List */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Lista de Paradas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ListaParadas entregas={entregas} />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </MainLayout>
  );
}
