import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Map } from "lucide-react";
import type { MonitoramentoRota } from "./types";

const STATUS_COLORS: Record<string, string> = {
  aguardando: "hsl(215, 15%, 60%)",
  ativa: "hsl(142, 70%, 40%)",
  finalizada: "hsl(215, 15%, 45%)",
  pausada: "hsl(38, 92%, 50%)",
};

interface MapaGeralProps {
  rotas: MonitoramentoRota[];
  height?: string;
  onSelectRota?: (rota: MonitoramentoRota) => void;
  showTitle?: boolean;
  selectedRotaId?: string | null;
}

export function MapaGeral({ rotas, height = "250px", onSelectRota, showTitle = true, selectedRotaId = null }: MapaGeralProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    if (!mapRef.current) {
      mapRef.current = L.map(containerRef.current).setView([-23.5505, -46.6333], 10);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
      }).addTo(mapRef.current);
    }

    const map = mapRef.current;

    // Clear markers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.Circle) {
        map.removeLayer(layer);
      }
    });

    const bounds: L.LatLngTuple[] = [];

    rotas.forEach((rota) => {
      if (!rota.ultima_lat || !rota.ultima_lng) return;

      const color = STATUS_COLORS[rota.status] || STATUS_COLORS.ativa;
      const isActive = rota.status === "ativa";
      const isSelected = selectedRotaId === rota.id;
      const progress = rota.total_paradas
        ? Math.round((rota.paradas_concluidas / rota.total_paradas) * 100)
        : 0;

      const size = isSelected ? 52 : isActive ? 40 : 32;
      const icon = L.divIcon({
        className: "custom-div-icon",
        html: `<div style="
          background-color: ${color};
          color: white;
          width: ${size}px;
          height: ${size}px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: ${isSelected ? 20 : isActive ? 16 : 13}px;
          border: ${isSelected ? 4 : 3}px solid ${isSelected ? "hsl(var(--primary))" : "white"};
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          cursor: pointer;
          ${isActive ? "animation: pulse 2s infinite;" : "opacity: 0.75;"}
        ">🚛</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      const marker = L.marker([rota.ultima_lat, rota.ultima_lng], { icon })
        .bindPopup(
          `<div style="min-width: 180px;">
            <strong style="font-size: 14px;">${rota.placa}</strong><br>
            <span style="color: #666;">${rota.motorista || "Sem motorista"}</span><br>
            <div style="margin-top: 6px;">
              <span style="background: ${color}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px;">
                ${rota.status === "ativa" ? "Ativa" : rota.status === "finalizada" ? "Finalizada" : "Pausada"}
              </span>
            </div>
            <div style="margin-top: 6px; font-size: 12px;">
              📦 ${rota.paradas_concluidas}/${rota.total_paradas} entregas (${progress}%)
            </div>
            <div style="background: #e5e7eb; border-radius: 4px; height: 6px; margin-top: 4px;">
              <div style="background: ${color}; height: 6px; border-radius: 4px; width: ${progress}%;"></div>
            </div>
          </div>`
        )
        .addTo(map);

      if (onSelectRota) {
        marker.on("click", () => onSelectRota(rota));
      }

      bounds.push([rota.ultima_lat, rota.ultima_lng]);
    });

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [rotas, onSelectRota, selectedRotaId]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  const content = (
    <div ref={containerRef} className="w-full rounded-b-lg overflow-hidden" style={{ height }} />
  );

  if (!showTitle) return content;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Map className="w-4 h-4" />
          Visão Geral — Veículos em Rota
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {content}
      </CardContent>
    </Card>
  );
}
