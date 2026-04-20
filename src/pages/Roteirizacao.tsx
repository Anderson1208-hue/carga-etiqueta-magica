import { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
  Save,
  Truck,
  CheckCircle2,
  List,
  Eye,
  Calendar,
  User,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { calculateBoxes } from "@/lib/xml-parser";
import { format } from "date-fns";
import { proximoDiaUtilApos } from "@/lib/feriados-rj";
import { MapaRoteirizacao } from "@/components/roteirizacao/MapaRoteirizacao";
import { ListaParadas } from "@/components/roteirizacao/ListaParadas";
import { generateRoteirizacaoPDF } from "@/lib/roteirizacao-pdf";
import { generateNotaDeCargaPDF, downloadBlob } from "@/lib/pdf-generator";
import { generateResumoVeiculoPDF } from "@/lib/resumo-veiculo-pdf";
import { generateResumoDiaPDF, type VeiculoDiaData } from "@/lib/resumo-dia-pdf";
import {
  getMacroRegiao,
  getMacroRegiaoLabel,
  getAllMacroRegioes,
} from "@/lib/macro-regioes";
import { Badge } from "@/components/ui/badge";
import { TipoCargaBadge, isChocolate } from "@/components/TipoCargaBadge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlterarRotaDialog } from "@/components/roteirizacao/AlterarRotaDialog";
import { ReroteirizarVeiculoDialog } from "@/components/roteirizacao/ReroteirizarVeiculoDialog";
import { Settings2 } from "lucide-react";

interface Carga {
  id: string;
  data: string;
  placa: string;
  motorista: string;
  tipo_carga?: string;
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
  const [orderChanged, setOrderChanged] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  
  // When coming from Preparação with specific NF IDs
  const [modoNfIds, setModoNfIds] = useState(false);
  const [nfIdsSelecionados, setNfIdsSelecionados] = useState<string[]>([]);
  const [modoManual, setModoManual] = useState(false);
  const [totaisPreparacao, setTotaisPreparacao] = useState<{
    nfs: number; caixas: number; peso: number; volume: number; entregas: number;
  } | null>(null);

  // Emplacamento
  const [emplacPlaca, setEmplacPlaca] = useState("");
  const [emplacMotorista, setEmplacMotorista] = useState("");
  const [emplacData, setEmplacData] = useState(format(proximoDiaUtilApos(new Date()), "yyyy-MM-dd"));
  const [sairHoje, setSairHoje] = useState(false);
  const [savingEmplac, setSavingEmplac] = useState(false);
  const [veiculoCriado, setVeiculoCriado] = useState<{ id: string; placa: string; accessCode: string | null; motorista?: string } | null>(null);
  const [motoristaDespacho, setMotoristaDespacho] = useState("");
  const [savingMotorista, setSavingMotorista] = useState(false);

  // Tab & Vehicles listing
  const [activeTab, setActiveTab] = useState("nova-rota");
  const [veiculos, setVeiculos] = useState<any[]>([]);
  const [loadingVeiculos, setLoadingVeiculos] = useState(false);
  const [filtroAno, setFiltroAno] = useState(String(new Date().getFullYear()));
  const [filtroMes, setFiltroMes] = useState(String(new Date().getMonth() + 1));
  const [filtroDia, setFiltroDia] = useState("all");
  const [expandedVeiculoId, setExpandedVeiculoId] = useState<string | null>(null);
  const [veiculoNfs, setVeiculoNfs] = useState<Record<string, any[]>>({});
  const [alterarRotaVeiculo, setAlterarRotaVeiculo] = useState<any | null>(null);
  const [reroteirizarVeiculo, setReroteirizarVeiculo] = useState<any | null>(null);

  // CD coordinates (Rua da Regeneração, 235 - Rio de Janeiro)
  const [cdLat, setCdLat] = useState<string>("-22.8783");
  const [cdLng, setCdLng] = useState<string>("-43.3367");
  const [cdNome, setCdNome] = useState<string>("CD - Rua da Regeneração, 235");

  const selectedCargas = cargas.filter((c) => selectedCargaIds.includes(c.id));

  const location = useLocation();
  const navigate = useNavigate();
  const stateConsumedRef = useRef(false);

  useEffect(() => {
    loadCargas();
  }, []);

  // Auto-select cargas or NFs when coming from Preparação
  useEffect(() => {
    if (stateConsumedRef.current) return;
    const state = location.state as { cargaIds?: string[]; nfIds?: string[]; modoManual?: boolean; totais?: { nfs: number; caixas: number; peso: number; volume: number; entregas: number } } | null;
    if (!state) return;
    
    // New mode: specific NF IDs from Preparação
    if (state.nfIds && state.nfIds.length > 0) {
      stateConsumedRef.current = true;
      setModoNfIds(true);
      setNfIdsSelecionados(state.nfIds);
      if (state.modoManual) setModoManual(true);
      if (state.totais) setTotaisPreparacao(state.totais);
      if (state.cargaIds && state.cargaIds.length > 0 && cargas.length > 0) {
        const valid = state.cargaIds.filter((id) => cargas.some((c) => c.id === id));
        if (valid.length > 0) setSelectedCargaIds(valid);
      }
      loadEntregasByNfIds(state.nfIds);
      navigate(location.pathname, { replace: true, state: null });
      return;
    }
    
    // Legacy mode: all NFs from selected cargas
    if (state.cargaIds && state.cargaIds.length > 0 && cargas.length > 0) {
      const valid = state.cargaIds.filter((id) => cargas.some((c) => c.id === id));
      if (valid.length > 0) {
        setSelectedCargaIds(valid);
      }
      if (state.modoManual) setModoManual(true);
      stateConsumedRef.current = true;
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [cargas, location.state]);

  useEffect(() => {
    // Skip if in nfIds mode - entregas already loaded by loadEntregasByNfIds
    if (modoNfIds) return;
    if (selectedCargaIds.length > 0) {
      loadEntregas(selectedCargaIds);
    } else {
      setEntregas([]);
      setRoteirizacao(null);
      setVeiculoCriado(null);
    }
  }, [selectedCargaIds, modoNfIds]);

  async function loadCargas() {
    const { data } = await supabase
      .from("cargas")
      .select("id, data, placa, motorista, tipo_carga")
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
          carga_id,
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
          volume_m3,
          itens_nf(q_com)
        `)
        .in("carga_id", cargaIds);

      // Fetch NFs that already have delivery confirmation (entregue)
      const { data: baixasData } = await supabase
        .from("baixas_entrega")
        .select("nf_id, status")
        .eq("status", "entregue");

      const nfsEntregues = new Set((baixasData || []).map((b) => b.nf_id));

      // Filter out delivered NFs
      const nfsDisponiveis = (nfsData || []).filter((nf) => !nfsEntregues.has(nf.id));

      // Group by CNPJ — cada CNPJ é uma parada única
      const entregasMap = new Map<string, Entrega>();

      nfsDisponiveis.forEach((nf) => {
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
            cidade: nf.dest_cidade || "",
            uf: nf.dest_uf || "",
            logradouro: nf.dest_logradouro || "",
            macroRegiao: getMacroRegiao(bairro, nf.dest_cidade),
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

        const entrega = entregasMap.get(chave)!;
        entrega.totalNfs++;
        entrega.nfs.push(nf.numero_nf);
        entrega.nfIds.push(nf.id);
        entrega.cargaIds.push(nf.carga_id);

        entrega.pesoTotalKg += Number(nf.peso_bruto) || 0;
        entrega.volumeTotalM3 += Number(nf.volume_m3) || 0;

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

  async function loadEntregasByNfIds(nfIds: string[]) {
    setLoading(true);
    setRoteirizacao(null);
    setFiltroMacroRegiao("todas");
    try {
      const batchSize = 500;
      const allNfs: any[] = [];
      for (let i = 0; i < nfIds.length; i += batchSize) {
        const batch = nfIds.slice(i, i + batchSize);
        const { data } = await supabase
          .from("notas_fiscais")
          .select(`
            id, numero_nf, carga_id, cnpj_destinatario,
            dest_razao_social, dest_logradouro, dest_numero,
            dest_bairro, dest_cidade, dest_uf, dest_cep,
            peso_bruto, peso_liquido, volume_m3, itens_nf(q_com)
          `)
          .in("id", batch);
        if (data) allNfs.push(...data);
      }

      const entregasMap = new Map<string, Entrega>();
      allNfs.forEach((nf) => {
        const cnpj = nf.cnpj_destinatario || "SEM_CNPJ";
        if (!entregasMap.has(cnpj)) {
          const bairro = nf.dest_bairro || "";
          const endereco = [nf.dest_logradouro, nf.dest_numero, nf.dest_bairro, nf.dest_cidade, nf.dest_uf, nf.dest_cep].filter(Boolean).join(", ");
          entregasMap.set(cnpj, {
            cep: nf.dest_cep || "SEM_CEP", cnpjDestinatario: cnpj,
            razaoSocial: nf.dest_razao_social || "Cliente não identificado",
            enderecoCompleto: endereco || "Endereço não informado", bairro,
            cidade: nf.dest_cidade || "", uf: nf.dest_uf || "", logradouro: nf.dest_logradouro || "",
            macroRegiao: getMacroRegiao(bairro, nf.dest_cidade), latitude: null, longitude: null,
            totalNfs: 0, totalCaixas: 0, pesoTotalKg: 0, volumeTotalM3: 0,
            nfs: [], nfIds: [], cargaIds: [],
          });
        }
        const entrega = entregasMap.get(cnpj)!;
        entrega.totalNfs++;
        entrega.nfs.push(nf.numero_nf);
        entrega.nfIds.push(nf.id);
        entrega.cargaIds.push(nf.carga_id);
        entrega.pesoTotalKg += Number(nf.peso_bruto) || 0;
        entrega.volumeTotalM3 += Number(nf.volume_m3) || 0;
        const nfItems = (nf.itens_nf || []) as { q_com: number }[];
        nfItems.forEach((item) => { entrega.totalCaixas += calculateBoxes(Number(item.q_com)); });
      });

      const entregasList = sortByMacroRegiao(Array.from(entregasMap.values()));
      setEntregas(entregasList);

      const cargaIdsFromNfs = [...new Set(allNfs.map((nf) => nf.carga_id))];
      setSelectedCargaIds((prev) => prev.length > 0 ? prev : cargaIdsFromNfs);
    } catch (error) {
      console.error("Error loading entregas by NF IDs:", error);
      toast({ title: "Erro", description: "Erro ao carregar NFs selecionadas", variant: "destructive" });
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

  async function geocodeViaCep(cep: string): Promise<{ lat: number; lng: number } | null> {
    try {
      const cleanCep = cep.replace(/\D/g, "");
      if (cleanCep.length !== 8) return null;
      const response = await fetch(`https://brasilapi.com.br/api/cep/v2/${cleanCep}`);
      if (!response.ok) return null;
      const data = await response.json();
      if (data.location?.coordinates?.longitude && data.location?.coordinates?.latitude) {
        return { lat: Number(data.location.coordinates.latitude), lng: Number(data.location.coordinates.longitude) };
      }
      return null;
    } catch { return null; }
  }

  async function geocodeViaNominatim(query: string, retries = 2): Promise<{ lat: number; lng: number } | null> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=br`,
          { headers: { "Accept": "application/json" } }
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

  async function geocodeAddresses() {
    setGeocoding(true);
    const updatedEntregas = [...entregas];
    let successCount = 0;
    let failedAddresses: string[] = [];

    for (let i = 0; i < updatedEntregas.length; i++) {
      const entrega = updatedEntregas[i];
      if (entrega.latitude && entrega.longitude) { successCount++; continue; }
      if (entrega.enderecoCompleto === "Endereço não informado") continue;

      let coords: { lat: number; lng: number } | null = null;

      // Tentativa 1: CEP via BrasilAPI (mais preciso)
      if (entrega.cep && entrega.cep !== "SEM_CEP") {
        coords = await geocodeViaCep(entrega.cep);
        await new Promise((r) => setTimeout(r, 300));
      }

      const cidade = entrega.cidade || "Rio de Janeiro";
      const uf = entrega.uf || "RJ";

      // Tentativa 2: Logradouro + Bairro + Cidade (mais específico)
      if (!coords && entrega.logradouro && entrega.bairro) {
        coords = await geocodeViaNominatim(`${entrega.logradouro}, ${entrega.bairro}, ${cidade}, ${uf}`);
        await new Promise((r) => setTimeout(r, 1100));
      }

      // Tentativa 3: Bairro + Cidade + UF via Nominatim
      if (!coords && entrega.bairro) {
        coords = await geocodeViaNominatim(`${entrega.bairro}, ${cidade}, ${uf}`);
        await new Promise((r) => setTimeout(r, 1100));
      }

      // Tentativa 4: Logradouro + Cidade via Nominatim
      if (!coords && entrega.logradouro) {
        coords = await geocodeViaNominatim(`${entrega.logradouro}, ${cidade}, ${uf}`);
        await new Promise((r) => setTimeout(r, 1100));
      }

      // Tentativa 5 (último recurso): Cidade + UF para ao menos posicionar no mapa
      if (!coords && entrega.cidade) {
        coords = await geocodeViaNominatim(`${cidade}, ${uf}`);
        await new Promise((r) => setTimeout(r, 1100));
        if (coords) {
          console.warn(`Geocoding aproximado (cidade) para ${entrega.razaoSocial}: ${entrega.enderecoCompleto}`);
        }
      }

      if (coords) {
        updatedEntregas[i] = { ...entrega, latitude: coords.lat, longitude: coords.lng };
        successCount++;
      } else {
        failedAddresses.push(entrega.razaoSocial);
        console.warn(`Geocoding falhou TOTALMENTE para ${entrega.razaoSocial} | CEP=${entrega.cep} | ${entrega.enderecoCompleto}`);
      }
    }

    setEntregas(updatedEntregas);
    setGeocoding(false);
    
    const msg = failedAddresses.length > 0
      ? `${successCount} localizados. Falha: ${failedAddresses.join(", ")}`
      : `Todos os ${successCount} endereços localizados com sucesso!`;
    
    toast({
      title: "Geocodificação concluída",
      description: msg,
      variant: failedAddresses.length > 0 ? "destructive" : "default",
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

  /**
   * Modo manual: respeita a ordem atual das entregas (drag-and-drop).
   * Geocodifica em background e calcula km/tempo via Haversine entre paradas consecutivas.
   */
  async function calculateRouteManual() {
    setCalculating(true);
    try {
      if (entregas.length === 0) {
        toast({ title: "Erro", description: "Nenhuma entrega para roteirizar", variant: "destructive" });
        return;
      }

      const cdLatNum = parseFloat(cdLat);
      const cdLngNum = parseFloat(cdLng);
      if (isNaN(cdLatNum) || isNaN(cdLngNum)) {
        toast({ title: "Erro", description: "Coordenadas do CD inválidas", variant: "destructive" });
        return;
      }

      // Geocodifica em background as paradas que ainda não têm coordenadas
      setGeocoding(true);
      const updated = [...entregas];
      for (let i = 0; i < updated.length; i++) {
        const e = updated[i];
        if (e.latitude && e.longitude) continue;
        if (e.enderecoCompleto === "Endereço não informado") continue;

        let coords: { lat: number; lng: number } | null = null;
        if (e.cep && e.cep !== "SEM_CEP") {
          coords = await geocodeViaCep(e.cep);
          await new Promise((r) => setTimeout(r, 250));
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
        if (coords) {
          updated[i] = { ...e, latitude: coords.lat, longitude: coords.lng };
        }
      }
      setGeocoding(false);

      // Mantém a ordem manual + numera sequencialmente
      const orderedEntregas: Entrega[] = updated.map((e, i) => ({ ...e, ordem: i + 1 }));

      // Distância via Haversine entre paradas consecutivas
      let distanciaTotal = 0;
      let prevLat = cdLatNum;
      let prevLng = cdLngNum;
      for (const e of orderedEntregas) {
        if (e.latitude && e.longitude) {
          distanciaTotal += haversineDistance(prevLat, prevLng, e.latitude, e.longitude);
          prevLat = e.latitude;
          prevLng = e.longitude;
        }
      }
      // Estimativa: 25 km/h média urbana + 10min por parada
      const tempoMin = Math.round((distanciaTotal / 25) * 60 + orderedEntregas.length * 10);

      const pesoTotal = orderedEntregas.reduce((s, e) => s + e.pesoTotalKg, 0);
      const volumeTotal = orderedEntregas.reduce((s, e) => s + e.volumeTotalM3, 0);

      const { data: rotData, error: rotError } = await supabase
        .from("roteirizacoes")
        .insert({
          carga_id: selectedCargaIds[0],
          created_by: user?.id,
          ponto_inicial_lat: cdLatNum,
          ponto_inicial_lng: cdLngNum,
          ponto_inicial_nome: cdNome,
          distancia_total_km: distanciaTotal,
          tempo_estimado_min: tempoMin,
          peso_total_kg: pesoTotal,
          volume_total_m3: volumeTotal,
          status: "concluida",
        })
        .select()
        .single();
      if (rotError) throw rotError;

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
        distanciaTotalKm: distanciaTotal,
        tempoEstimadoMin: tempoMin,
        pesoTotalKg: pesoTotal,
        volumeTotalM3: volumeTotal,
        paradas: orderedEntregas,
      });
      setEntregas(orderedEntregas);

      toast({
        title: "Rota manual confirmada!",
        description: `${orderedEntregas.length} paradas - ${distanciaTotal.toFixed(1)} km - ~${tempoMin} min (estimado)`,
      });
    } catch (error) {
      console.error("Manual route error:", error);
      setGeocoding(false);
      toast({ title: "Erro ao confirmar rota manual", description: String(error), variant: "destructive" });
    } finally {
      setCalculating(false);
    }
  }

  function handleReorder(reordered: Entrega[]) {
    setEntregas(reordered);
    if (roteirizacao) {
      setRoteirizacao({ ...roteirizacao, paradas: reordered });
    }
    setOrderChanged(true);
  }

  async function saveOrder() {
    if (!roteirizacao) return;
    setSavingOrder(true);
    try {
      const updates = entregas.map((e) =>
        supabase
          .from("roteirizacao_paradas")
          .update({ ordem: e.ordem || 0 })
          .eq("roteirizacao_id", roteirizacao.id)
          .eq("cnpj_destinatario", e.cnpjDestinatario)
      );
      await Promise.all(updates);
      setOrderChanged(false);
      toast({
        title: "Ordem salva",
        description: "A sequência de entregas foi atualizada com sucesso",
      });
    } catch (error) {
      console.error("Error saving order:", error);
      toast({
        title: "Erro",
        description: "Erro ao salvar a ordem das entregas",
        variant: "destructive",
      });
    } finally {
      setSavingOrder(false);
    }
  }

  async function handleEmplacar() {
    if (!emplacPlaca.trim()) {
      toast({ title: "Dados incompletos", description: "Preencha a placa do veículo", variant: "destructive" });
      return;
    }

    setSavingEmplac(true);
    try {
      // Collect all NF IDs from entregas
      const allNfIds: { nfId: string; cargaId: string }[] = [];
      entregas.forEach((e) => {
        e.nfIds.forEach((nfId, idx) => {
          allNfIds.push({ nfId, cargaId: e.cargaIds[idx] });
        });
      });

      if (allNfIds.length === 0) {
        toast({ title: "Nenhuma NF", description: "Não há NFs para emplacar", variant: "destructive" });
        return;
      }

      // Create veículo
      const { data: veiculo, error: veicError } = await supabase
        .from("veiculos")
        .insert({
          placa: emplacPlaca.trim().toUpperCase(),
          motorista: emplacMotorista.trim() || "",
          data: emplacData,
          created_by: user?.id,
        })
        .select("id, access_code")
        .single();

      if (veicError) throw veicError;

      // Link NFs to veículo
      const links = allNfIds.map((item) => ({
        veiculo_id: veiculo.id,
        nf_id: item.nfId,
        carga_origem_id: item.cargaId,
      }));

      const { error: linkError } = await supabase.from("veiculo_nfs").insert(links);
      if (linkError) throw linkError;

      // Atualizar status_entrega das NFs para "NF EM ROTA"
      const nfIdsExpedidas = Array.from(new Set(allNfIds.map((i) => i.nfId)));
      if (nfIdsExpedidas.length > 0) {
        await supabase
          .from("notas_fiscais")
          .update({ status_entrega: "NF EM ROTA" })
          .in("id", nfIdsExpedidas);
      }

      // Só marca a carga como expedida quando não restar NF pendente de emplacamento.
      const cargaIdsAfetadas = Array.from(new Set(allNfIds.map((i) => i.cargaId)));
      if (cargaIdsAfetadas.length > 0) {
        const [{ data: nfsDasCargas, error: nfsCargasError }, { data: vnfsDasCargas, error: vnfsCargasError }] = await Promise.all([
          supabase
            .from("notas_fiscais")
            .select("id, carga_id, status_entrega")
            .in("carga_id", cargaIdsAfetadas),
          supabase
            .from("veiculo_nfs")
            .select("nf_id, carga_origem_id")
            .in("carga_origem_id", cargaIdsAfetadas),
        ]);

        if (nfsCargasError) throw nfsCargasError;
        if (vnfsCargasError) throw vnfsCargasError;

        const nfsEmplacadas = new Set((vnfsDasCargas || []).map((item) => item.nf_id));
        const statusPorCarga = new Map<string, "aberta" | "expedida">();

        cargaIdsAfetadas.forEach((cargaId) => {
          const aindaTemNfDisponivel = (nfsDasCargas || []).some((nf) => {
            if (nf.carga_id !== cargaId) return false;
            if (nf.status_entrega === "ENTREGUE" || nf.status_entrega === "RECUSADO") return false;
            return !nfsEmplacadas.has(nf.id);
          });

          statusPorCarga.set(cargaId, aindaTemNfDisponivel ? "aberta" : "expedida");
        });

        const cargasAbertas = cargaIdsAfetadas.filter((cargaId) => statusPorCarga.get(cargaId) === "aberta");
        const cargasExpedidas = cargaIdsAfetadas.filter((cargaId) => statusPorCarga.get(cargaId) === "expedida");

        await Promise.all([
          cargasAbertas.length > 0
            ? supabase.from("cargas").update({ status: "aberta" as any }).in("id", cargasAbertas)
            : Promise.resolve(),
          cargasExpedidas.length > 0
            ? supabase.from("cargas").update({ status: "expedida" as any }).in("id", cargasExpedidas)
            : Promise.resolve(),
        ]);
      }

      setVeiculoCriado({
        id: veiculo.id,
        placa: emplacPlaca.trim().toUpperCase(),
        accessCode: veiculo.access_code,
        motorista: emplacMotorista.trim() || undefined,
      });
      setMotoristaDespacho("");

      toast({
        title: "Veículo emplacado!",
        description: `${emplacPlaca.toUpperCase()}${emplacMotorista.trim() ? ` - ${emplacMotorista}` : " (sem motorista)"} com ${allNfIds.length} NFs`,
      });
    } catch (error) {
      console.error("Error creating vehicle:", error);
      toast({ title: "Erro", description: "Erro ao emplacar veículo", variant: "destructive" });
    } finally {
      setSavingEmplac(false);
    }
  }

  async function handleAtribuirMotorista() {
    if (!veiculoCriado || !motoristaDespacho.trim()) return;
    setSavingMotorista(true);
    try {
      const { error } = await supabase
        .from("veiculos")
        .update({ motorista: motoristaDespacho.trim() })
        .eq("id", veiculoCriado.id);
      if (error) throw error;
      setVeiculoCriado({ ...veiculoCriado, motorista: motoristaDespacho.trim() });
      toast({ title: "Motorista atribuído!", description: `${motoristaDespacho.trim()} vinculado ao veículo ${veiculoCriado.placa}` });
    } catch {
      toast({ title: "Erro", description: "Erro ao atribuir motorista", variant: "destructive" });
    } finally {
      setSavingMotorista(false);
    }
  }

  // ========== VEHICLES LISTING ==========
  useEffect(() => {
    if (activeTab === "veiculos") loadVeiculos();
  }, [activeTab, filtroAno, filtroMes, filtroDia]);

  async function loadVeiculos() {
    setLoadingVeiculos(true);
    try {
      let query = supabase
        .from("veiculos")
        .select("id, placa, motorista, data, status, access_code, created_at")
        .order("data", { ascending: false })
        .order("created_at", { ascending: false });

      // Date filters
      const year = parseInt(filtroAno);
      const month = parseInt(filtroMes);
      if (filtroDia && filtroDia !== "all") {
        const day = parseInt(filtroDia);
        const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        query = query.eq("data", dateStr);
      } else {
        const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
        const endMonth = month === 12 ? 1 : month + 1;
        const endYear = month === 12 ? year + 1 : year;
        const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
        query = query.gte("data", startDate).lt("data", endDate);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Filtra veículos que não têm mais NFs vinculadas (rotas esvaziadas)
      const ids = (data || []).map((v) => v.id);
      let comNfs = new Set<string>(ids);
      if (ids.length > 0) {
        const { data: vnfs } = await supabase
          .from("veiculo_nfs")
          .select("veiculo_id")
          .in("veiculo_id", ids);
        comNfs = new Set((vnfs || []).map((r: any) => r.veiculo_id));
      }
      setVeiculos((data || []).filter((v) => comNfs.has(v.id)));
    } catch (err) {
      console.error("Error loading veiculos:", err);
    } finally {
      setLoadingVeiculos(false);
    }
  }

  /**
   * Constrói o mapa CNPJ → ordem de entrega para um veículo.
   * Em veículos multi-carga, prioriza a roteirização que cobre o MAIOR número
   * de CNPJs do veículo (rota consolidada). Faz fallback combinando rotas
   * individuais para CNPJs ainda não cobertos.
   */
  async function buildOrdemPorCnpj(
    cargaIds: string[],
    cnpjsDoVeiculo: Set<string>
  ): Promise<Map<string, number>> {
    const ordemPorCnpj = new Map<string, number>();
    if (cargaIds.length === 0) return ordemPorCnpj;

    const { data: rots } = await supabase
      .from("roteirizacoes")
      .select("id, carga_id, created_at")
      .in("carga_id", cargaIds)
      .order("created_at", { ascending: false });
    if (!rots || rots.length === 0) return ordemPorCnpj;

    const rotIds = rots.map((r: any) => r.id);
    const { data: paradas } = await supabase
      .from("roteirizacao_paradas")
      .select("cnpj_destinatario, ordem, roteirizacao_id")
      .in("roteirizacao_id", rotIds)
      .order("ordem", { ascending: true });
    if (!paradas || paradas.length === 0) return ordemPorCnpj;

    // Agrupa paradas por roteirização
    const paradasPorRot = new Map<string, { cnpj: string; ordem: number }[]>();
    for (const p of paradas) {
      const cnpj = (p.cnpj_destinatario || "").replace(/\D/g, "");
      if (!cnpj) continue;
      const arr = paradasPorRot.get(p.roteirizacao_id) || [];
      arr.push({ cnpj, ordem: p.ordem });
      paradasPorRot.set(p.roteirizacao_id, arr);
    }

    // Pontuação: nº de CNPJs do veículo cobertos por cada roteirização
    const rotsRanked = rots
      .map((r: any) => {
        const ps = paradasPorRot.get(r.id) || [];
        const coverage = ps.filter((p) => cnpjsDoVeiculo.has(p.cnpj)).length;
        return { id: r.id, created_at: r.created_at, coverage, paradas: ps };
      })
      .sort((a, b) => {
        if (b.coverage !== a.coverage) return b.coverage - a.coverage;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

    // Aplica melhor rota primeiro; depois preenche CNPJs ainda sem ordem.
    // IMPORTANTE: considera apenas CNPJs do veículo atual, para que a
    // numeração seja 1..N do veículo (e não 1..N da rota consolidada inteira).
    const cnpjsOrdenados: string[] = [];
    for (const r of rotsRanked) {
      const ordenadas = [...r.paradas].sort((a, b) => a.ordem - b.ordem);
      for (const p of ordenadas) {
        if (!cnpjsDoVeiculo.has(p.cnpj)) continue;
        if (!cnpjsOrdenados.includes(p.cnpj)) cnpjsOrdenados.push(p.cnpj);
      }
    }
    cnpjsOrdenados.forEach((cnpj, idx) => ordemPorCnpj.set(cnpj, idx + 1));
    return ordemPorCnpj;
  }

  async function loadVeiculoNfs(veiculoId: string) {
    if (veiculoNfs[veiculoId]) return;
    try {
      const { data } = await supabase
        .from("veiculo_nfs")
        .select(`
          id, nf_id, carga_origem_id,
          notas_fiscais!inner(numero_nf, dest_razao_social, dest_bairro, dest_cep, dest_logradouro, dest_numero, dest_cidade, dest_uf, peso_bruto, volume_m3, cnpj_destinatario, itens_nf(q_com))
        `)
        .eq("veiculo_id", veiculoId);

      // Fetch CTEs linked to these NFs
      const nfIds = (data || []).map((vnf: any) => vnf.nf_id);
      let ctesMap: Record<string, any[]> = {};
      if (nfIds.length > 0) {
        const { data: ctesData } = await supabase
          .from("ctes")
          .select("nf_id, numero_cte, razao_social_emitente, valor_frete")
          .in("nf_id", nfIds);
        if (ctesData) {
          for (const cte of ctesData) {
            if (!ctesMap[cte.nf_id!]) ctesMap[cte.nf_id!] = [];
            ctesMap[cte.nf_id!].push(cte);
          }
        }
      }

      // Buscar ordem de entrega (CNPJ → ordem) baseada na roteirização das cargas.
      // Em veículos multi-carga, prioriza a rota consolidada que cobre mais CNPJs do veículo.
      const cargaIds = Array.from(new Set((data || []).map((v: any) => v.carga_origem_id).filter(Boolean)));
      const cnpjsDoVeiculo = new Set(
        (data || [])
          .map((v: any) => (v.notas_fiscais?.cnpj_destinatario || "").replace(/\D/g, ""))
          .filter(Boolean)
      );
      const ordemPorCnpj = await buildOrdemPorCnpj(cargaIds, cnpjsDoVeiculo);

      // Anexa CTEs e ordem de entrega a cada vnf
      const enriched = (data || []).map((vnf: any) => {
        const cnpjKey = (vnf.notas_fiscais?.cnpj_destinatario || "").replace(/\D/g, "");
        return {
          ...vnf,
          ctes: ctesMap[vnf.nf_id] || [],
          ordemEntrega: ordemPorCnpj.get(cnpjKey),
        };
      });

      setVeiculoNfs((prev) => ({ ...prev, [veiculoId]: enriched }));
    } catch (err) {
      console.error("Error loading vehicle NFs:", err);
    }
  }

  const [generatingPdfVeiculoId, setGeneratingPdfVeiculoId] = useState<string | null>(null);
  const [generatingResumoPdfId, setGeneratingResumoPdfId] = useState<string | null>(null);
  const [generatingResumoDiaDate, setGeneratingResumoDiaDate] = useState<string | null>(null);

  async function handleGerarResumoDia(dateStr: string, veics: any[]) {
    setGeneratingResumoDiaDate(dateStr);
    try {
      const veiculosData: VeiculoDiaData[] = [];
      for (const veiculo of veics) {
        const { data } = await supabase
          .from("veiculo_nfs")
          .select(`
            nf_id, carga_origem_id,
            notas_fiscais!inner(numero_nf, dest_razao_social, dest_bairro, dest_cep, dest_logradouro, dest_numero, dest_cidade, dest_uf, peso_bruto, volume_m3, cnpj_destinatario, itens_nf(q_com))
          `)
          .eq("veiculo_id", veiculo.id);
        const nfIds = (data || []).map((vnf: any) => vnf.nf_id);
        let ctesMap: Record<string, any[]> = {};
        if (nfIds.length > 0) {
          const { data: ctesData } = await supabase.from("ctes").select("nf_id, numero_cte").in("nf_id", nfIds);
          if (ctesData) { for (const c of ctesData) { if (!ctesMap[c.nf_id!]) ctesMap[c.nf_id!] = []; ctesMap[c.nf_id!].push(c); } }
        }
        // Ordem de entrega por CNPJ (rota consolidada prioritária)
        const cargaIdsDia = Array.from(new Set((data || []).map((v: any) => v.carga_origem_id).filter(Boolean)));
        const cnpjsVeiculoDia = new Set(
          (data || [])
            .map((v: any) => (v.notas_fiscais?.cnpj_destinatario || "").replace(/\D/g, ""))
            .filter(Boolean)
        );
        const ordemPorCnpjDia = cargaIdsDia.length > 0
          ? await buildOrdemPorCnpj(cargaIdsDia as string[], cnpjsVeiculoDia)
          : new Map<string, number>();
        const totalRotaDia = new Set(ordemPorCnpjDia.keys()).size;

        const nfs = (data || []).map((vnf: any) => {
          const nf = vnf.notas_fiscais;
          const cnpjKey = (nf.cnpj_destinatario || "").replace(/\D/g, "");
          return {
            numero_nf: nf.numero_nf, dest_razao_social: nf.dest_razao_social || "",
            dest_logradouro: nf.dest_logradouro || "", dest_numero: nf.dest_numero || "",
            dest_bairro: nf.dest_bairro || "", dest_cidade: nf.dest_cidade || "",
            dest_uf: nf.dest_uf || "", dest_cep: nf.dest_cep || "",
            cnpj_destinatario: nf.cnpj_destinatario || "",
            peso_bruto: Number(nf.peso_bruto || 0), volume_m3: Number(nf.volume_m3 || 0),
            itens_nf: (nf.itens_nf || []).map((it: any) => ({ q_com: Number(it.q_com) })),
            ctes: (ctesMap[vnf.nf_id] || []).map((c: any) => ({ numero_cte: c.numero_cte })),
            ordem_entrega: ordemPorCnpjDia.get(cnpjKey),
          };
        });
        veiculosData.push({
          placa: veiculo.placa,
          motorista: veiculo.motorista || "",
          data: veiculo.data,
          nfs,
          totalEntregasRota: totalRotaDia || undefined,
        });
      }
      const blob = await generateResumoDiaPDF({ data: dateStr, veiculos: veiculosData });
      downloadBlob(blob, `resumo_dia_${dateStr}.pdf`);
      toast({ title: "Resumo do dia gerado", description: `${veics.length} veículo(s)` });
    } catch (err) {
      console.error("Error generating resumo dia PDF:", err);
      toast({ title: "Erro", description: "Erro ao gerar resumo do dia", variant: "destructive" });
    } finally {
      setGeneratingResumoDiaDate(null);
    }
  }

  async function handleGerarResumoVeiculo(veiculo: any) {
    setGeneratingResumoPdfId(veiculo.id);
    try {
      // Fetch data directly if not cached
      let nfsData = veiculoNfs[veiculo.id];
      if (!nfsData) {
        const { data } = await supabase
          .from("veiculo_nfs")
          .select(`
            id, nf_id, carga_origem_id,
            notas_fiscais!inner(numero_nf, dest_razao_social, dest_bairro, dest_cep, dest_logradouro, dest_numero, dest_cidade, dest_uf, peso_bruto, volume_m3, cnpj_destinatario, itens_nf(q_com))
          `)
          .eq("veiculo_id", veiculo.id);
        const nfIds = (data || []).map((vnf: any) => vnf.nf_id);
        let ctesMap: Record<string, any[]> = {};
        if (nfIds.length > 0) {
          const { data: ctesData } = await supabase.from("ctes").select("nf_id, numero_cte").in("nf_id", nfIds);
          if (ctesData) { for (const c of ctesData) { if (!ctesMap[c.nf_id!]) ctesMap[c.nf_id!] = []; ctesMap[c.nf_id!].push(c); } }
        }
        nfsData = (data || []).map((vnf: any) => ({ ...vnf, ctes: ctesMap[vnf.nf_id] || [] }));
      }
      if (!nfsData || nfsData.length === 0) {
        toast({ title: "Sem NFs", description: "Este veículo não possui NFs vinculadas", variant: "destructive" });
        return;
      }

      // Buscar ordem de entrega por CNPJ priorizando rota consolidada (multi-carga)
      const cargaIdsResumo = Array.from(
        new Set(nfsData.map((v: any) => v.carga_origem_id).filter(Boolean))
      );
      const cnpjsDoVeiculoResumo = new Set(
        nfsData
          .map((v: any) => (v.notas_fiscais?.cnpj_destinatario || "").replace(/\D/g, ""))
          .filter(Boolean)
      );
      const ordemPorCnpjResumo = cargaIdsResumo.length > 0
        ? await buildOrdemPorCnpj(cargaIdsResumo as string[], cnpjsDoVeiculoResumo)
        : new Map<string, number>();
      const totalEntregasResumo = new Set(ordemPorCnpjResumo.keys()).size;

      const nfs = nfsData.map((vnf: any) => {
        const nf = vnf.notas_fiscais;
        const cnpjKey = (nf.cnpj_destinatario || "").replace(/\D/g, "");
        return {
          numero_nf: nf.numero_nf, dest_razao_social: nf.dest_razao_social || "",
          dest_logradouro: nf.dest_logradouro || "", dest_numero: nf.dest_numero || "",
          dest_bairro: nf.dest_bairro || "", dest_cidade: nf.dest_cidade || "",
          dest_uf: nf.dest_uf || "", dest_cep: nf.dest_cep || "",
          cnpj_destinatario: nf.cnpj_destinatario || "",
          peso_bruto: Number(nf.peso_bruto || 0), volume_m3: Number(nf.volume_m3 || 0),
          itens_nf: (nf.itens_nf || []).map((it: any) => ({ q_com: Number(it.q_com) })),
          ctes: (vnf.ctes || []).map((c: any) => ({ numero_cte: c.numero_cte })),
          ordem_entrega: ordemPorCnpjResumo.get(cnpjKey),
        };
      });
      const blob = await generateResumoVeiculoPDF({
        placa: veiculo.placa,
        motorista: veiculo.motorista || "",
        data: veiculo.data,
        nfs,
        totalEntregasRota: totalEntregasResumo || undefined,
      });
      downloadBlob(blob, `resumo_entregas_${veiculo.placa}_${veiculo.data}.pdf`);
    } catch (err) {
      console.error("Error generating resumo PDF:", err);
      toast({ title: "Erro", description: "Erro ao gerar PDF", variant: "destructive" });
    } finally {
      setGeneratingResumoPdfId(null);
    }
  }

  async function handleGerarNotaDeCargaVeiculo(veiculo: any) {
    setGeneratingPdfVeiculoId(veiculo.id);
    try {
      // Fetch NFs with items for this vehicle
      const { data: vnfs } = await supabase
        .from("veiculo_nfs")
        .select(`
          nf_id, carga_origem_id,
          notas_fiscais!inner(
            numero_nf, cnpj_emitente, razao_social_emitente, cnpj_destinatario,
            dest_razao_social, dest_logradouro, dest_numero, dest_bairro,
            dest_cidade, dest_uf, dest_cep, data_emissao, peso_bruto, volume_m3,
            itens_nf(c_prod, x_prod, q_com)
          )
        `)
        .eq("veiculo_id", veiculo.id);

      if (!vnfs || vnfs.length === 0) {
        toast({ title: "Sem NFs", description: "Este veículo não possui NFs vinculadas", variant: "destructive" });
        return;
      }

      // Buscar a ordem de entrega por CNPJ priorizando a rota consolidada (multi-carga)
      const cargaIds = Array.from(new Set(vnfs.map((v: any) => v.carga_origem_id).filter(Boolean)));
      const cnpjsDoVeiculo = new Set(
        vnfs
          .map((v: any) => (v.notas_fiscais?.cnpj_destinatario || "").replace(/\D/g, ""))
          .filter(Boolean)
      );
      const ordemPorCnpj = await buildOrdemPorCnpj(cargaIds, cnpjsDoVeiculo);
      const totalEntregasRota = new Set(ordemPorCnpj.keys()).size;

      const notasFiscais = vnfs.map((vnf: any) => {
        const nf = vnf.notas_fiscais;
        const bairro = nf.dest_bairro || "";
        const cnpjKey = (nf.cnpj_destinatario || "").replace(/\D/g, "");
        return {
          numeroNf: nf.numero_nf,
          razaoSocialEmitente: nf.razao_social_emitente,
          cnpjEmitente: nf.cnpj_emitente,
          cnpjDestinatario: nf.cnpj_destinatario || "",
          destRazaoSocial: nf.dest_razao_social || undefined,
          destLogradouro: nf.dest_logradouro || undefined,
          destNumero: nf.dest_numero || undefined,
          destBairro: bairro,
          destCidade: nf.dest_cidade || undefined,
          destUf: nf.dest_uf || undefined,
          destCep: nf.dest_cep || undefined,
          macroRegiao: getMacroRegiao(bairro, nf.dest_cidade),
          dataEmissao: nf.data_emissao,
          ordemEntrega: ordemPorCnpj.get(cnpjKey),
          totalEntregas: totalEntregasRota || undefined,
          itens: (nf.itens_nf || []).map((item: any) => ({
            cProd: item.c_prod,
            xProd: item.x_prod,
            qtdCaixas: calculateBoxes(Number(item.q_com)),
          })),
        };
      });

      const blob = await generateNotaDeCargaPDF(
        { data: veiculo.data, placa: veiculo.placa, motorista: veiculo.motorista || "" },
        notasFiscais
      );
      downloadBlob(blob, `nota_carga_${veiculo.placa}_${veiculo.data}.pdf`);
      toast({ title: "PDF gerado", description: `Nota de Carga do veículo ${veiculo.placa}` });
    } catch (err) {
      console.error("Error generating PDF:", err);
      toast({ title: "Erro", description: "Erro ao gerar PDF", variant: "destructive" });
    } finally {
      setGeneratingPdfVeiculoId(null);
    }
  }

  function toggleExpandVeiculo(veiculoId: string) {
    if (expandedVeiculoId === veiculoId) {
      setExpandedVeiculoId(null);
    } else {
      setExpandedVeiculoId(veiculoId);
      loadVeiculoNfs(veiculoId);
    }
  }

  // Group vehicles by date for display
  const veiculosByDate = veiculos.reduce<Record<string, typeof veiculos>>((acc, v) => {
    const dateKey = v.data;
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(v);
    return acc;
  }, {});

  const meses = [
    { value: "1", label: "Janeiro" }, { value: "2", label: "Fevereiro" }, { value: "3", label: "Março" },
    { value: "4", label: "Abril" }, { value: "5", label: "Maio" }, { value: "6", label: "Junho" },
    { value: "7", label: "Julho" }, { value: "8", label: "Agosto" }, { value: "9", label: "Setembro" },
    { value: "10", label: "Outubro" }, { value: "11", label: "Novembro" }, { value: "12", label: "Dezembro" },
  ];

  const diasNoMes = new Date(parseInt(filtroAno), parseInt(filtroMes), 0).getDate();

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

      // Collect all nfIds from paradas
      const allNfIds = roteirizacao.paradas.flatMap((p) => p.nfIds || []);

      // Fetch NFs details and CTEs in parallel
      const [nfsRes, ctesRes] = await Promise.all([
        allNfIds.length > 0
          ? supabase
              .from("notas_fiscais")
              .select("id, numero_nf, peso_bruto, volume_m3, cnpj_destinatario")
              .in("id", allNfIds)
          : Promise.resolve({ data: [] as any[] }),
        selectedCargas.length > 0
          ? supabase
              .from("ctes")
              .select("chave_nf_referenciada, numero_cte, razao_social_emitente, valor_frete, nf_id")
              .in("carga_id", selectedCargaIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const nfsData = nfsRes.data || [];
      const ctesData = ctesRes.data || [];

      // Build lookup maps
      const nfsByCnpj: Record<string, { numero_nf: string; peso_bruto: number; volume_m3: number }[]> = {};
      for (const nf of nfsData) {
        const cnpj = nf.cnpj_destinatario || "";
        if (!nfsByCnpj[cnpj]) nfsByCnpj[cnpj] = [];
        nfsByCnpj[cnpj].push({
          numero_nf: nf.numero_nf,
          peso_bruto: nf.peso_bruto || 0,
          volume_m3: nf.volume_m3 || 0,
        });
      }

      // Map CTEs by nf_id
      const ctesByNfId: Record<string, typeof ctesData> = {};
      for (const cte of ctesData) {
        if (cte.nf_id) {
          if (!ctesByNfId[cte.nf_id]) ctesByNfId[cte.nf_id] = [];
          ctesByNfId[cte.nf_id].push(cte);
        }
      }

      // Enrich paradas with NFs and CTEs
      const paradasEnriquecidas = roteirizacao.paradas.map((p) => {
        const nfsDetail = nfsByCnpj[p.cnpjDestinatario] || [];
        // Sort NFs numerically
        nfsDetail.sort((a, b) => parseInt(a.numero_nf) - parseInt(b.numero_nf));

        // Collect CTEs for this parada's NFs
        const nfIdsParada = p.nfIds || [];
        const ctesDetail: { numero_cte: string; razao_social_emitente: string; valor_frete: number }[] = [];
        for (const nfId of nfIdsParada) {
          const ctes = ctesByNfId[nfId] || [];
          for (const cte of ctes) {
            ctesDetail.push({
              numero_cte: cte.numero_cte,
              razao_social_emitente: cte.razao_social_emitente || "",
              valor_frete: cte.valor_frete || 0,
            });
          }
        }

        return { ...p, nfsDetail, ctesDetail };
      });

      const blob = await generateRoteirizacaoPDF({
        carga: cargaLabel,
        cdNome,
        cdLat: parseFloat(cdLat),
        cdLng: parseFloat(cdLng),
        distanciaTotalKm: roteirizacao.distanciaTotalKm,
        tempoEstimadoMin: roteirizacao.tempoEstimadoMin,
        pesoTotalKg: roteirizacao.pesoTotalKg,
        volumeTotalM3: roteirizacao.volumeTotalM3,
        paradas: paradasEnriquecidas,
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

  // Use totals from Preparação when available (authoritative), otherwise compute from entregas
  const totalCaixas = totaisPreparacao ? totaisPreparacao.caixas : entregas.reduce((sum, e) => sum + e.totalCaixas, 0);
  const totalNfs = totaisPreparacao ? totaisPreparacao.nfs : entregas.reduce((sum, e) => sum + e.totalNfs, 0);
  const totalPeso = totaisPreparacao ? totaisPreparacao.peso : entregas.reduce((sum, e) => sum + e.pesoTotalKg, 0);
  const totalVolume = totaisPreparacao ? totaisPreparacao.volume : entregas.reduce((sum, e) => sum + e.volumeTotalM3, 0);
  const totalParadas = totaisPreparacao ? totaisPreparacao.entregas : entregas.length;
  
  // Filtered totals for when MR filter is active
  const filteredCaixas = filteredEntregas.reduce((sum, e) => sum + e.totalCaixas, 0);
  const filteredNfs = filteredEntregas.reduce((sum, e) => sum + e.totalNfs, 0);
  const filteredPeso = filteredEntregas.reduce((sum, e) => sum + e.pesoTotalKg, 0);
  const filteredVolume = filteredEntregas.reduce((sum, e) => sum + e.volumeTotalM3, 0);
  const isFiltered = filtroMacroRegiao !== "todas";

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

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="nova-rota" className="gap-2">
              <Route className="w-4 h-4" />
              Nova Rota
            </TabsTrigger>
            <TabsTrigger value="veiculos" className="gap-2">
              <Truck className="w-4 h-4" />
              Veículos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="nova-rota" className="space-y-6 mt-4">

        {/* NF selection mode banner */}
        {modoNfIds && (
          <Card className="border-primary bg-primary/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-semibold text-primary">
                      Rota montada a partir da Preparação
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {totalNfs} NFs • {totalParadas} paradas • {totalCaixas} caixas • {totalPeso.toFixed(1)} kg • {totalVolume.toFixed(2)} m³ — de {selectedCargaIds.length} carga(s)
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setModoNfIds(false);
                    setNfIdsSelecionados([]);
                    setTotaisPreparacao(null);
                    setEntregas([]);
                    setSelectedCargaIds([]);
                    setRoteirizacao(null);
                  }}
                >
                  <X className="w-3 h-3 mr-1" />
                  Limpar e selecionar cargas
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Multi-Carga Selector - hidden when in nfIds mode */}
        {!modoNfIds && (
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
                    className={`gap-1 pr-1 ${isChocolate(carga.tipo_carga) ? "bg-red-100 border-red-300 text-red-800 dark:bg-red-950 dark:text-red-300" : ""}`}
                  >
                    {isChocolate(carga.tipo_carga) && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
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
        )}

        {(selectedCargas.length > 0 || modoNfIds) && (
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
                <p className="text-2xl font-bold">
                  {isFiltered ? `${filteredEntregas.length}/${totalParadas}` : totalParadas}
                </p>
              </div>
              <div className="wms-stat-card">
                <p className="text-sm text-muted-foreground">Total NFs</p>
                <p className="text-2xl font-bold">
                  {isFiltered ? `${filteredNfs}/${totalNfs}` : totalNfs}
                </p>
              </div>
              <div className="wms-stat-card">
                <p className="text-sm text-muted-foreground">Total Caixas</p>
                <p className="text-2xl font-bold">
                  {isFiltered ? `${filteredCaixas}/${totalCaixas}` : totalCaixas}
                </p>
              </div>
              <div className="wms-stat-card">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Weight className="w-3 h-3" /> Peso Total
                </p>
                <p className="text-2xl font-bold">
                  {isFiltered ? `${filteredPeso.toFixed(1)}/${totalPeso.toFixed(1)}` : totalPeso.toFixed(1)} kg
                </p>
              </div>
              <div className="wms-stat-card">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Box className="w-3 h-3" /> Volume Total
                </p>
                <p className="text-2xl font-bold">
                  {isFiltered ? `${filteredVolume.toFixed(2)}/${totalVolume.toFixed(2)}` : totalVolume.toFixed(2)} m³
                </p>
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

            {/* Emplacamento */}
            {roteirizacao && !veiculoCriado && (
              <Card className="border-primary">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Truck className="w-4 h-4" />
                    Emplacar Veículo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Vincule uma placa às {entregas.reduce((s, e) => s + e.nfIds.length, 0)} NFs desta rota. O motorista pode ser informado depois.
                  </p>
                  <div className="grid gap-4 md:grid-cols-4">
                    <div>
                      <Label>Placa</Label>
                      <Input
                        value={emplacPlaca}
                        onChange={(e) => setEmplacPlaca(e.target.value.toUpperCase())}
                        placeholder="ABC1D23"
                        maxLength={7}
                      />
                    </div>
                    <div>
                      <Label>Motorista <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                      <Input
                        value={emplacMotorista}
                        onChange={(e) => setEmplacMotorista(e.target.value)}
                        placeholder="Informar depois"
                      />
                    </div>
                    <div>
                      <Label>Data</Label>
                      <Input
                        type="date"
                        value={emplacData}
                        onChange={(e) => {
                          setEmplacData(e.target.value);
                          setSairHoje(e.target.value === format(new Date(), "yyyy-MM-dd"));
                        }}
                      />
                      <label className="flex items-center gap-2 mt-2 text-sm cursor-pointer select-none">
                        <Checkbox
                          checked={sairHoje}
                          onCheckedChange={(v) => {
                            const checked = v === true;
                            setSairHoje(checked);
                            setEmplacData(
                              checked
                                ? format(new Date(), "yyyy-MM-dd")
                                : format(proximoDiaUtilApos(new Date()), "yyyy-MM-dd")
                            );
                          }}
                        />
                        <span>Sair hoje ({format(new Date(), "dd/MM/yyyy")})</span>
                      </label>
                    </div>
                    <div className="flex items-end">
                      <Button
                        onClick={handleEmplacar}
                        disabled={savingEmplac || !emplacPlaca.trim()}
                        className="w-full"
                      >
                        {savingEmplac ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Truck className="w-4 h-4 mr-2" />
                        )}
                        Emplacar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Veículo criado */}
            {veiculoCriado && (
              <Card className="border-success bg-success/5">
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-6 h-6 text-success" />
                    <div>
                      <p className="font-semibold text-success">
                        Veículo {veiculoCriado.placa} emplacado com sucesso!
                      </p>
                      {veiculoCriado.motorista && (
                        <p className="text-sm text-muted-foreground">
                          Motorista: {veiculoCriado.motorista}
                        </p>
                      )}
                      {veiculoCriado.accessCode && (
                        <p className="text-sm text-muted-foreground">
                          Código de acesso:{" "}
                          <code className="font-mono font-bold bg-muted px-2 py-0.5 rounded tracking-wider">
                            {veiculoCriado.accessCode}
                          </code>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Assign driver later */}
                  {!veiculoCriado.motorista && (
                    <div className="border-t pt-4">
                      <p className="text-sm font-medium mb-2 flex items-center gap-2">
                        <Truck className="w-4 h-4" />
                        Atribuir motorista para despacho
                      </p>
                      <div className="flex gap-2">
                        <Input
                          value={motoristaDespacho}
                          onChange={(e) => setMotoristaDespacho(e.target.value)}
                          placeholder="Nome do motorista"
                          className="flex-1"
                        />
                        <Button
                          onClick={handleAtribuirMotorista}
                          disabled={savingMotorista || !motoristaDespacho.trim()}
                          size="sm"
                        >
                          {savingMotorista ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            "Atribuir"
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
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
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    Rota Sugerida – Paradas por CNPJ
                    {filtroMacroRegiao !== "todas" && (
                      <Badge variant="secondary">
                        Filtro: MR {filtroMacroRegiao}
                      </Badge>
                    )}
                  </CardTitle>
                  {roteirizacao && orderChanged && (
                    <Button
                      size="sm"
                      onClick={saveOrder}
                      disabled={savingOrder}
                    >
                      {savingOrder ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      Salvar Ordem
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <ListaParadas
                  entregas={filteredEntregas}
                  onReorder={roteirizacao ? handleReorder : undefined}
                />
              </CardContent>
            </Card>
          </>
        )}
          </TabsContent>

          <TabsContent value="veiculos" className="space-y-6 mt-4">
            {/* Date Filters */}
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <Label className="text-xs">Ano</Label>
                <Select value={filtroAno} onValueChange={(v) => { setFiltroAno(v); setFiltroDia("all"); }}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[2024, 2025, 2026].map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Mês</Label>
                <Select value={filtroMes} onValueChange={(v) => { setFiltroMes(v); setFiltroDia("all"); }}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {meses.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Dia</Label>
                <Select value={filtroDia} onValueChange={setFiltroDia}>
                  <SelectTrigger className="w-24"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {Array.from({ length: diasNoMes }, (_, i) => i + 1).map((d) => (
                      <SelectItem key={d} value={String(d)}>{String(d).padStart(2, "0")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {loadingVeiculos ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : veiculos.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Truck className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p>Nenhum veículo encontrado neste período</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {Object.entries(veiculosByDate).map(([dateStr, veics]) => (
                  <div key={dateStr}>
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-semibold text-muted-foreground">
                        {format(new Date(dateStr + "T12:00:00"), "dd/MM/yyyy")}
                      </span>
                      <Badge variant="outline" className="text-xs">{veics.length} veículo(s)</Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 ml-auto"
                        disabled={generatingResumoDiaDate === dateStr}
                        onClick={() => handleGerarResumoDia(dateStr, veics)}
                      >
                        {generatingResumoDiaDate === dateStr ? (
                          <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                        ) : (
                          <FileText className="w-3.5 h-3.5 mr-1" />
                        )}
                        Resumo do Dia
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {veics.map((v: any) => (
                        <Card key={v.id} className="overflow-hidden">
                          <button
                            onClick={() => toggleExpandVeiculo(v.id)}
                            className="w-full text-left p-4 flex items-center justify-between hover:bg-accent/50 transition-colors"
                          >
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                <Truck className="w-5 h-5 text-primary" />
                              </div>
                              <div>
                                <p className="font-semibold">{v.placa}</p>
                                <p className="text-sm text-muted-foreground flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  {v.motorista || <span className="italic">Sem motorista</span>}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {v.access_code && (
                                <code className="text-xs font-mono bg-muted px-2 py-1 rounded">
                                  {v.access_code}
                                </code>
                              )}
                              <Badge variant={v.status === "pendente" ? "secondary" : "default"} className="text-xs capitalize">
                                {v.status}
                              </Badge>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-2"
                                disabled={generatingPdfVeiculoId === v.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleGerarNotaDeCargaVeiculo(v);
                                }}
                              >
                                {generatingPdfVeiculoId === v.id ? (
                                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                                ) : (
                                  <FileText className="w-3.5 h-3.5 mr-1" />
                                )}
                                Nota de Carga
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-2"
                                disabled={generatingResumoPdfId === v.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleGerarResumoVeiculo(v);
                                }}
                              >
                                {generatingResumoPdfId === v.id ? (
                                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                                ) : (
                                  <Download className="w-3.5 h-3.5 mr-1" />
                                )}
                                Resumo
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-2"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAlterarRotaVeiculo(v);
                                }}
                              >
                                <Settings2 className="w-3.5 h-3.5 mr-1" />
                                Alterar Rota
                              </Button>
                              <Button
                                variant="default"
                                size="sm"
                                className="h-8 px-2"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setReroteirizarVeiculo(v);
                                }}
                              >
                                <Route className="w-3.5 h-3.5 mr-1" />
                                Reroteirizar
                              </Button>
                              <ChevronDown className={`w-4 h-4 transition-transform ${expandedVeiculoId === v.id ? "rotate-180" : ""}`} />
                            </div>
                          </button>

                          {expandedVeiculoId === v.id && (
                            <div className="border-t px-4 py-3 bg-muted/30">
                              {!veiculoNfs[v.id] ? (
                                <div className="flex justify-center py-4">
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                </div>
                              ) : veiculoNfs[v.id].length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma NF vinculada</p>
                              ) : (() => {
                                // Group NFs by CNPJ (entrega) e captura ordem de entrega da rota
                                const entregas = new Map<string, { razaoSocial: string; endereco: string; nfs: any[]; ordem: number | undefined }>();
                                veiculoNfs[v.id].forEach((vnf: any) => {
                                  const nf = vnf.notas_fiscais;
                                  const cnpj = nf.cnpj_destinatario || "SEM_CNPJ";
                                  if (!entregas.has(cnpj)) {
                                    const end = [nf.dest_logradouro, nf.dest_numero, nf.dest_bairro, nf.dest_cidade, nf.dest_uf].filter(Boolean).join(", ");
                                    entregas.set(cnpj, {
                                      razaoSocial: nf.dest_razao_social || "Cliente não identificado",
                                      endereco: end || "Endereço não informado",
                                      nfs: [],
                                      ordem: vnf.ordemEntrega,
                                    });
                                  }
                                  entregas.get(cnpj)!.nfs.push(vnf);
                                });

                                // Ordena pela ordem real da rota (sem ordem vai para o final)
                                const entregasOrdenadas = Array.from(entregas.entries()).sort((a, b) => {
                                  const oa = a[1].ordem ?? Number.POSITIVE_INFINITY;
                                  const ob = b[1].ordem ?? Number.POSITIVE_INFINITY;
                                  return oa - ob;
                                });
                                const totalEntregas = entregasOrdenadas.length;

                                return (
                                  <div className="space-y-4">
                                    <p className="text-xs font-semibold text-muted-foreground">
                                      {veiculoNfs[v.id].length} NF(s) em {entregas.size} entrega(s)
                                    </p>
                                    {entregasOrdenadas.map(([cnpj, group], idx) => {
                                      const ordemEntrega = group.ordem ?? (idx + 1);
                                      const totalPeso = group.nfs.reduce((s: number, vnf: any) => s + Number(vnf.notas_fiscais.peso_bruto || 0), 0);
                                      const totalVolume = group.nfs.reduce((s: number, vnf: any) => s + Number(vnf.notas_fiscais.volume_m3 || 0), 0);
                                      const totalCaixas = group.nfs.reduce((s: number, vnf: any) => {
                                        const items = vnf.notas_fiscais.itens_nf || [];
                                        return s + items.reduce((si: number, it: any) => si + calculateBoxes(Number(it.q_com)), 0);
                                      }, 0);

                                      return (
                                        <div key={cnpj} className="rounded-lg border bg-background overflow-hidden">
                                          <div className="p-3 bg-accent/30 flex items-center justify-between">
                                            <div className="flex items-center gap-3 min-w-0">
                                              <Badge variant="default" className="shrink-0 text-sm font-bold px-3 py-1">
                                                {ordemEntrega}ª ENTREGA
                                              </Badge>
                                              <div className="min-w-0">
                                                <p className="text-sm font-semibold flex items-center gap-2">
                                                  <Package className="w-3.5 h-3.5 text-primary" />
                                                  {group.razaoSocial}
                                                </p>
                                                <p className="text-xs text-muted-foreground mt-0.5">{group.endereco}</p>
                                              </div>
                                            </div>
                                            <div className="flex gap-3 text-xs font-medium text-muted-foreground shrink-0">
                                              <span>{group.nfs.length} NFs</span>
                                              <span>{totalCaixas} cx</span>
                                              <span>{totalPeso.toFixed(1)} kg</span>
                                              <span>{totalVolume.toFixed(2)} m³</span>
                                            </div>
                                          </div>
                                          <div className="p-2 space-y-1">
                                            {group.nfs.map((vnf: any) => {
                                              const nf = vnf.notas_fiscais;
                                              const nfCaixas = (nf.itens_nf || []).reduce((s: number, it: any) => s + calculateBoxes(Number(it.q_com)), 0);
                                              const nfCtes = vnf.ctes || [];
                                              return (
                                                <div key={vnf.id} className="flex items-center justify-between text-sm py-1.5 px-3 rounded bg-muted/40">
                                                  <div className="flex items-center gap-3 min-w-0">
                                                    <Badge variant="outline" className="shrink-0 text-[10px] font-semibold">
                                                      {ordemEntrega}ª de {totalEntregas}
                                                    </Badge>
                                                    <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                                    <span className="font-medium">NF {nf.numero_nf}</span>
                                                    {nfCtes.length > 0 && (
                                                      <span className="text-xs text-muted-foreground">
                                                        CT-e {nfCtes.map((c: any) => c.numero_cte).join(", ")}
                                                      </span>
                                                    )}
                                                  </div>
                                                  <div className="flex gap-3 text-xs text-muted-foreground shrink-0">
                                                    <span>{nfCaixas} cx</span>
                                                    <span>{Number(nf.peso_bruto || 0).toFixed(1)} kg</span>
                                                    <span>{Number(nf.volume_m3 || 0).toFixed(2)} m³</span>
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      );
                                    })}
                                    {/* Grand totals */}
                                    {(() => {
                                      const gtPeso = veiculoNfs[v.id].reduce((s: number, vnf: any) => s + Number(vnf.notas_fiscais.peso_bruto || 0), 0);
                                      const gtVolume = veiculoNfs[v.id].reduce((s: number, vnf: any) => s + Number(vnf.notas_fiscais.volume_m3 || 0), 0);
                                      const gtCaixas = veiculoNfs[v.id].reduce((s: number, vnf: any) => {
                                        return s + (vnf.notas_fiscais.itens_nf || []).reduce((si: number, it: any) => si + calculateBoxes(Number(it.q_com)), 0);
                                      }, 0);
                                      return (
                                        <div className="rounded-lg bg-primary/10 p-3 flex items-center justify-between">
                                          <span className="text-sm font-bold">TOTAL VEÍCULO</span>
                                          <div className="flex gap-4 text-sm font-semibold">
                                            <span>{entregas.size} entregas</span>
                                            <span>{veiculoNfs[v.id].length} NFs</span>
                                            <span>{gtCaixas} cx</span>
                                            <span>{gtPeso.toFixed(1)} kg</span>
                                            <span>{gtVolume.toFixed(2)} m³</span>
                                          </div>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </Card>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <AlterarRotaDialog
          open={!!alterarRotaVeiculo}
          onOpenChange={(open) => { if (!open) setAlterarRotaVeiculo(null); }}
          veiculo={alterarRotaVeiculo}
          onUpdated={() => {
            loadVeiculos();
            setVeiculoNfs({});
            setExpandedVeiculoId(null);
          }}
        />

        <ReroteirizarVeiculoDialog
          open={!!reroteirizarVeiculo}
          onOpenChange={(open) => { if (!open) setReroteirizarVeiculo(null); }}
          veiculo={reroteirizarVeiculo}
          onCompleted={() => {
            loadVeiculos();
            setVeiculoNfs({});
            setExpandedVeiculoId(null);
          }}
        />
      </div>
    </MainLayout>
  );
}
