import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { GPSCoordinate } from '../../types/database';

interface RealMapProps {
  coordenadas: GPSCoordinate;
  isRotaAtiva: boolean;
  compact?: boolean;
  motoristaNome?: string;
}

const vanIcon = L.divIcon({
  className: '',
  html: '<div style="font-size:28px;line-height:28px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.6))">🚐</div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14]
});

/** Mapa real (OpenStreetMap) com a posição da van recebida do celular do motorista. */
export const RealMap: React.FC<RealMapProps> = ({ coordenadas, isRotaAtiva, compact = false, motoristaNome }) => {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const semSinal = !coordenadas.accuracyMeters; // servidor inicia com precisão 0 = nenhuma posição recebida

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { zoomControl: true, attributionControl: true }).setView(
      [coordenadas.latitude, coordenadas.longitude],
      semSinal ? 11 : 16
    );
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || semSinal) return;
    const pos: L.LatLngExpression = [coordenadas.latitude, coordenadas.longitude];
    if (!markerRef.current) {
      markerRef.current = L.marker(pos, { icon: vanIcon, title: motoristaNome || 'Van' }).addTo(map);
      map.setView(pos, 16);
    } else {
      markerRef.current.setLatLng(pos);
      map.panTo(pos, { animate: true });
    }
  }, [coordenadas.latitude, coordenadas.longitude, semSinal, motoristaNome]);

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-slate-800 shadow-2xl ${compact ? 'h-64' : 'h-[360px] md:h-[420px]'}`}>
      <div ref={elRef} className="absolute inset-0 z-0" />
      <div className="absolute top-3 left-3 z-[500] flex items-center gap-2 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-700/60 text-xs font-semibold text-slate-200 pointer-events-none">
        <span className={`w-2.5 h-2.5 rounded-full ${isRotaAtiva && !semSinal ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
        {semSinal ? 'SEM LOCALIZAÇÃO' : isRotaAtiva ? `GPS AO VIVO · ${coordenadas.speedKmH} km/h` : 'VAN ESTACIONADA'}
      </div>
      {semSinal && (
        <div className="absolute inset-0 z-[400] flex items-center justify-center bg-slate-950/60 text-center px-6 pointer-events-none">
          <p className="text-sm text-slate-200">
            A localização da van aparece aqui assim que o motorista iniciar a rota.
          </p>
        </div>
      )}
    </div>
  );
};
