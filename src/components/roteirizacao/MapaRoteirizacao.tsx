import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Entrega {
  cep: string;
  cnpjDestinatario: string;
  razaoSocial: string;
  enderecoCompleto: string;
  latitude: number | null;
  longitude: number | null;
  totalNfs: number;
  totalCaixas: number;
  ordem?: number;
}

interface MapaRoteirizacaoProps {
  cdLat: number;
  cdLng: number;
  cdNome: string;
  entregas: Entrega[];
}

export function MapaRoteirizacao({
  cdLat,
  cdLng,
  cdNome,
  entregas,
}: MapaRoteirizacaoProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize map
    if (!mapRef.current) {
      mapRef.current = L.map(containerRef.current).setView(
        [cdLat || -23.5505, cdLng || -46.6333],
        10
      );

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(mapRef.current);
    }

    const map = mapRef.current;

    // Clear existing markers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.Polyline) {
        map.removeLayer(layer);
      }
    });

    // Re-add tile layer
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);

    const bounds: L.LatLngTuple[] = [];

    // Add CD marker
    if (!isNaN(cdLat) && !isNaN(cdLng)) {
      const cdIcon = L.divIcon({
        className: "custom-div-icon",
        html: `<div style="background-color: #2563eb; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">CD</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      L.marker([cdLat, cdLng], { icon: cdIcon })
        .bindPopup(`<strong>${cdNome}</strong><br>Ponto de Partida`)
        .addTo(map);

      bounds.push([cdLat, cdLng]);
    }

    // Add delivery markers
    const validEntregas = entregas.filter((e) => e.latitude && e.longitude);
    const routePoints: L.LatLngTuple[] = [];

    if (!isNaN(cdLat) && !isNaN(cdLng)) {
      routePoints.push([cdLat, cdLng]);
    }

    validEntregas.forEach((entrega, index) => {
      const lat = entrega.latitude!;
      const lng = entrega.longitude!;
      const ordem = entrega.ordem || index + 1;

      const markerIcon = L.divIcon({
        className: "custom-div-icon",
        html: `<div style="background-color: ${
          entrega.ordem ? "#16a34a" : "#64748b"
        }; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">${ordem}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      L.marker([lat, lng], { icon: markerIcon })
        .bindPopup(
          `<strong>#${ordem} - ${entrega.razaoSocial}</strong><br>
          CNPJ: ${entrega.cnpjDestinatario}<br>
          ${entrega.enderecoCompleto}<br>
          <small>NFs: ${entrega.totalNfs} | Caixas: ${entrega.totalCaixas}</small>`
        )
        .addTo(map);

      bounds.push([lat, lng]);
      routePoints.push([lat, lng]);
    });

    // Draw route line if we have optimized order
    if (routePoints.length > 1 && validEntregas.some((e) => e.ordem)) {
      L.polyline(routePoints, {
        color: "#2563eb",
        weight: 3,
        opacity: 0.7,
        dashArray: "10, 10",
      }).addTo(map);
    }

    // Fit bounds
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }

    return () => {
      // Don't destroy map on cleanup, just clear markers
    };
  }, [cdLat, cdLng, cdNome, entregas]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-[400px] w-full rounded-lg overflow-hidden border"
    />
  );
}
