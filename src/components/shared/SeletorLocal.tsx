import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface LocalMarcado { latitude: number; longitude: number; precisaoM?: number }

const pino = L.divIcon({
  className: '',
  html: '<div style="width:18px;height:18px;border-radius:50%;background:#22d3ee;border:3px solid #0f172a;box-shadow:0 0 0 2px #22d3ee"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9]
});

/** O motorista marca o ponto de embarque: pelo GPS do celular (melhor, no local) ou tocando no mapa. */
export const SeletorLocal: React.FC<{ valor: LocalMarcado | null; onChange: (v: LocalMarcado | null) => void }> = ({ valor, onChange }) => {
  const el = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const marcador = useRef<L.Marker | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!el.current || mapa.current) return;
    const centro: [number, number] = valor ? [valor.latitude, valor.longitude] : [-22.9068, -43.1729];
    const m = L.map(el.current, { scrollWheelZoom: false }).setView(centro, valor ? 17 : 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => {
      setErro(null);
      onChangeRef.current({ latitude: Number(e.latlng.lat.toFixed(6)), longitude: Number(e.latlng.lng.toFixed(6)) });
    });
    mapa.current = m;
    return () => { m.remove(); mapa.current = null; marcador.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    if (!valor) {
      marcador.current?.remove();
      marcador.current = null;
      return;
    }
    const pos: L.LatLngExpression = [valor.latitude, valor.longitude];
    if (!marcador.current) marcador.current = L.marker(pos, { icon: pino }).addTo(m);
    else marcador.current.setLatLng(pos);
    m.setView(pos, Math.max(m.getZoom(), 17));
  }, [valor]);

  const usarGps = () => {
    setErro(null);
    if (!navigator.geolocation) { setErro('Este navegador não oferece GPS. Toque no mapa para marcar.'); return; }
    setBuscando(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setBuscando(false);
        onChange({ latitude: Number(p.coords.latitude.toFixed(6)), longitude: Number(p.coords.longitude.toFixed(6)), precisaoM: Math.round(p.coords.accuracy) });
      },
      (e) => {
        setBuscando(false);
        setErro(e.code === e.PERMISSION_DENIED ? 'GPS bloqueado. Permita a localização ou toque no mapa para marcar.' : 'Não consegui obter sua localização. Toque no mapa para marcar.');
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={usarGps} disabled={buscando} className="px-3 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-bold min-h-[44px] cursor-pointer disabled:opacity-50">
          {buscando ? 'Buscando GPS…' : 'Usar minha localização agora'}
        </button>
        {valor && (
          <button type="button" onClick={() => onChange(null)} className="text-[11px] text-slate-400 underline cursor-pointer">Remover marcação</button>
        )}
      </div>
      <div ref={el} className="h-44 rounded-xl overflow-hidden border border-slate-800 z-0" />
      <p className="text-[11px] text-slate-400">
        {valor
          ? `Local marcado${valor.precisaoM ? ` (precisão ~${valor.precisaoM} m)` : ''}. Toque no mapa para ajustar.`
          : 'Fique no ponto de embarque e use o GPS, ou toque no mapa para marcar o local.'}
      </p>
      {erro && <p role="alert" className="text-[11px] text-rose-300">{erro}</p>}
    </div>
  );
};
