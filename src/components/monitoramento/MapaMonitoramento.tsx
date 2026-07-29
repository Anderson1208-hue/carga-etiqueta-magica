import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Map, Route, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPages } from "@/lib/supabase-pagination";
import type { MonitoramentoParada } from "./types";

const STATUS_COLORS: Record<string, string> = {
  programada: "hsl(215, 15%, 45%)",
  em_rota: "hsl(215, 70%, 45%)",
  chegou_cliente: "hsl(38, 92%, 50%)",
  em_atendimento: "hsl(185, 60%, 45%)",
  visitada: "hsl(48, 90%, 45%)",
  finalizada: "hsl(142, 70%, 40%)",
  pulada: "hsl(0, 72%, 51%)",
  parada_excessiva: "hsl(25, 95%, 53%)",
  fora_sequencia: "hsl(280, 60%, 50%)",
  visita_inconsistente: "hsl(0, 72%, 51%)",
};

interface MapaMonitoramentoProps {
  paradas: MonitoramentoParada[];
  veiculoLat: number | null;
  veiculoLng: number | null;
  placa: string;
  rotaId?: string;
  rotaData?: string;
}

type PosicaoRow = {
  latitude: number;
  longitude: number;
  registrado_em: string;
  heartbeat: boolean;
};

// Distância aproximada em metros (equirretangular — suficiente p/ filtro visual)
function distMeters(a: L.LatLngTuple, b: L.LatLngTuple): number {
  const R = 6371000;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const lat = ((a[0] + b[0]) / 2) * Math.PI / 180;
  const x = dLng * Math.cos(lat);
  return Math.sqrt(x * x + dLat * dLat) * R;
}

function toSaoPauloDate(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : null;
}

export function MapaMonitoramento({ paradas, veiculoLat, veiculoLng, placa, rotaId, rotaData }: MapaMonitoramentoProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const percursoLayerRef = useRef<L.LayerGroup | null>(null);
  const [showPercurso, setShowPercurso] = useState(false);
  const [loadingPercurso, setLoadingPercurso] = useState(false);
  const [percursoPoints, setPercursoPoints] = useState<L.LatLngTuple[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;

    if (!mapRef.current) {
      mapRef.current = L.map(containerRef.current).setView([-23.5505, -46.6333], 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
      }).addTo(mapRef.current);
    }

    const map = mapRef.current;

    // Clear existing markers/polylines (mantém o layer de percurso separado)
    map.eachLayer((layer) => {
      if (layer === percursoLayerRef.current) return;
      if (layer instanceof L.Marker || layer instanceof L.Polyline || layer instanceof L.Circle) {
        map.removeLayer(layer);
      }
    });

    const bounds: L.LatLngTuple[] = [];
    const routePoints: L.LatLngTuple[] = [];

    // Vehicle marker
    if (veiculoLat && veiculoLng) {
      const vehicleIcon = L.divIcon({
        className: "custom-div-icon",
        html: `<div style="background-color: hsl(215, 70%, 45%); color: white; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); animation: pulse 2s infinite;">🚛</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      L.marker([veiculoLat, veiculoLng], { icon: vehicleIcon })
        .bindPopup(`<strong>${placa}</strong><br>Posição atual`)
        .addTo(map);

      bounds.push([veiculoLat, veiculoLng]);
    }

    // Stop markers
    const validParadas = paradas.filter((p) => p.latitude && p.longitude);
    validParadas.forEach((parada) => {
      const lat = parada.latitude!;
      const lng = parada.longitude!;
      const color = STATUS_COLORS[parada.status] || STATUS_COLORS.programada;
      const isFinalizada = parada.status === "finalizada";
      const isExcecao = parada.is_excecao;

      const markerIcon = L.divIcon({
        className: "custom-div-icon",
        html: `<div style="
          background-color: ${color};
          color: white;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 12px;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.25);
          opacity: ${isFinalizada ? "0.6" : "1"};
        ">${parada.ordem}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      L.marker([lat, lng], { icon: markerIcon })
        .bindPopup(
          `<strong>#${parada.ordem} - ${parada.razao_social || "Cliente"}</strong><br>
          Status: ${parada.status.replace(/_/g, " ")}<br>
          ${parada.endereco_completo || ""}<br>
          ${isExcecao ? "<span style='color: red;'>⚠ Exceção</span>" : ""}`
        )
        .addTo(map);

      L.circle([lat, lng], {
        radius: parada.raio_geofence_metros,
        color: color,
        fillColor: color,
        fillOpacity: 0.08,
        weight: 1,
        dashArray: "4, 4",
      }).addTo(map);

      bounds.push([lat, lng]);
      routePoints.push([lat, lng]);
    });

    if (routePoints.length > 1) {
      L.polyline(routePoints, {
        color: "hsl(215, 70%, 45%)",
        weight: 2.5,
        opacity: 0.5,
        dashArray: "8, 8",
      }).addTo(map);
    }

    if (bounds.length > 0 && !showPercurso) {
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [paradas, veiculoLat, veiculoLng, placa, showPercurso]);

  // Desenha o percurso quando os pontos mudam
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (percursoLayerRef.current) {
      map.removeLayer(percursoLayerRef.current);
      percursoLayerRef.current = null;
    }

    if (!showPercurso || percursoPoints.length < 2) return;

    const group = L.layerGroup();
    L.polyline(percursoPoints, {
      color: "hsl(142, 70%, 40%)",
      weight: 4,
      opacity: 0.75,
    }).addTo(group);

    // Marcador de início e fim
    const start = percursoPoints[0];
    const end = percursoPoints[percursoPoints.length - 1];
    L.circleMarker(start, { radius: 6, color: "#fff", fillColor: "hsl(142, 70%, 40%)", fillOpacity: 1, weight: 2 })
      .bindPopup("Início do percurso")
      .addTo(group);
    L.circleMarker(end, { radius: 6, color: "#fff", fillColor: "hsl(0, 72%, 51%)", fillOpacity: 1, weight: 2 })
      .bindPopup("Última posição")
      .addTo(group);

    group.addTo(map);
    percursoLayerRef.current = group;
    map.fitBounds(L.latLngBounds(percursoPoints), { padding: [40, 40] });
  }, [percursoPoints, showPercurso]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Reseta percurso ao trocar de rota
  useEffect(() => {
    setShowPercurso(false);
    setPercursoPoints([]);
  }, [rotaId]);

  async function togglePercurso() {
    if (showPercurso) {
      setShowPercurso(false);
      return;
    }
    if (!rotaId) return;

    if (percursoPoints.length > 0) {
      setShowPercurso(true);
      return;
    }

    setLoadingPercurso(true);
    try {
      const rows = await fetchAllPages<PosicaoRow>((from, to) =>
        supabase
          .from("posicoes_gps")
          .select("latitude, longitude, registrado_em, heartbeat")
          .eq("monitoramento_rota_id", rotaId)
          .eq("heartbeat", false)
          .order("registrado_em", { ascending: true })
          .range(from, to)
      );

      const rowsDaOperacao = rotaData
        ? rows.filter((r) => toSaoPauloDate(r.registrado_em) === rotaData.slice(0, 10))
        : rows;

      // Simplificação: descarta pontos a menos de 15m do anterior
      const simplified: L.LatLngTuple[] = [];
      const MIN_DIST = 15;
      for (const r of rowsDaOperacao) {
        const p: L.LatLngTuple = [Number(r.latitude), Number(r.longitude)];
        if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
        if (simplified.length === 0 || distMeters(simplified[simplified.length - 1], p) >= MIN_DIST) {
          simplified.push(p);
        }
      }
      setPercursoPoints(simplified);
      setShowPercurso(true);
    } catch (err) {
      console.error("Erro ao carregar percurso:", err);
    } finally {
      setLoadingPercurso(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Map className="w-4 h-4" />
          Mapa da Rota
        </CardTitle>
        {rotaId && (
          <Button
            size="sm"
            variant={showPercurso ? "default" : "outline"}
            onClick={togglePercurso}
            disabled={loadingPercurso}
          >
            {loadingPercurso ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Route className="w-4 h-4 mr-1" />
            )}
            {showPercurso
              ? `Ocultar percurso${percursoPoints.length ? ` (${percursoPoints.length} pts)` : ""}`
              : "Mostrar percurso"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <div ref={containerRef} className="h-[350px] w-full rounded-b-lg overflow-hidden" />
      </CardContent>
    </Card>
  );
}
