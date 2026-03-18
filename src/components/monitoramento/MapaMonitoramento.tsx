import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Map } from "lucide-react";
import type { MonitoramentoParada } from "./types";

const STATUS_COLORS: Record<string, string> = {
  programada: "hsl(215, 15%, 45%)",
  em_rota: "hsl(215, 70%, 45%)",
  chegou_cliente: "hsl(38, 92%, 50%)",
  em_atendimento: "hsl(185, 60%, 45%)",
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
}

export function MapaMonitoramento({ paradas, veiculoLat, veiculoLng, placa }: MapaMonitoramentoProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    if (!mapRef.current) {
      mapRef.current = L.map(containerRef.current).setView([-23.5505, -46.6333], 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
      }).addTo(mapRef.current);
    }

    const map = mapRef.current;

    // Clear existing markers/polylines
    map.eachLayer((layer) => {
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

      // Geofence circle
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

    // Route line
    if (routePoints.length > 1) {
      L.polyline(routePoints, {
        color: "hsl(215, 70%, 45%)",
        weight: 2.5,
        opacity: 0.5,
        dashArray: "8, 8",
      }).addTo(map);
    }

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [paradas, veiculoLat, veiculoLng, placa]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Map className="w-4 h-4" />
          Mapa da Rota
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div ref={containerRef} className="h-[350px] w-full rounded-b-lg overflow-hidden" />
      </CardContent>
    </Card>
  );
}
