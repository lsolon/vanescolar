import React from 'react';
import { GPSCoordinate, ParadaViagem, StatusEmbarque } from '../../types/database';
import { ROTA_FREGUESIA_PONTOS, WaypointRota } from '../../hooks/useGPS';
import { Bus, MapPin, School, Navigation, Sparkles } from 'lucide-react';
import { RealMap } from './RealMap';
import { isDemoMode } from '../../services/demo';

interface LiveMapProps {
  coordenadas: GPSCoordinate;
  isRotaAtiva: boolean;
  paradas?: ParadaViagem[];
  highlightAlunoId?: number; // Para destacar Maria Clara no app dos pais
  ocultarOutrasParadas?: boolean; // Requisito de privacidade: oculta paradas de outras crianças
  onSelectWaypoint?: (index: number) => void;
  compact?: boolean;
  motoristaNome?: string;
}

export const LiveMap: React.FC<LiveMapProps> = ({
  coordenadas,
  isRotaAtiva,
  paradas = [],
  highlightAlunoId = 201,
  ocultarOutrasParadas = false,
  onSelectWaypoint,
  compact = false,
  motoristaNome
}) => {
  // Fora do modo demonstração, usa mapa real com a posição enviada pelo celular do motorista.
  if (!isDemoMode()) {
    return <RealMap coordenadas={coordenadas} isRotaAtiva={isRotaAtiva} compact={compact} motoristaNome={motoristaNome} />;
  }
  // Conversão de Coordenadas Lat/Lng da Freguesia para coordenadas SVG locais (0..800 x 0..520)
  // Bounding box da Freguesia (Jacarepaguá):
  // Lat: -22.9230 (Norte) a -22.9390 (Sul)
  // Lng: -43.3460 (Oeste) a -43.3310 (Leste)
  const minLat = -22.9390;
  const maxLat = -22.9230;
  const minLng = -43.3460;
  const maxLng = -43.3310;

  const latToY = (lat: number) => {
    const clamped = Math.max(minLat, Math.min(maxLat, lat));
    const normalized = (clamped - minLat) / (maxLat - minLat);
    return 480 - normalized * 420; // Inverte eixo Y (Norte para cima)
  };

  const lngToX = (lng: number) => {
    const clamped = Math.max(minLng, Math.min(maxLng, lng));
    const normalized = (clamped - minLng) / (maxLng - minLng);
    return 60 + normalized * 680;
  };

  const vanX = lngToX(coordenadas.longitude);
  const vanY = latToY(coordenadas.latitude);

  // Calcula o status da parada do aluno
  const getStatusAluno = (alunoId?: number): StatusEmbarque => {
    if (!alunoId) return 'PENDENTE';
    const parada = paradas.find((p) => p.id_aluno === alunoId);
    return parada ? parada.status_embarque : 'PENDENTE';
  };

  // Caminho da rota principal traçado em SVG
  const routePointsString = ROTA_FREGUESIA_PONTOS.map(
    (pt) => `${lngToX(pt.longitude)},${latToY(pt.latitude)}`
  ).join(' ');

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl ${compact ? 'h-64' : 'h-[360px] md:h-[420px]'}`}>
      {/* HUD Superior do Mapa */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700/60 shadow-lg pointer-events-auto">
          <div className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${isRotaAtiva ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
            <span className="text-xs font-semibold text-slate-200">
              {isRotaAtiva ? 'GPS AO VIVO' : 'VAN ESTACIONADA'}
            </span>
          </div>
          <span className="text-slate-600">|</span>
          <span className="text-xs text-slate-400 font-mono">
            {isRotaAtiva ? `${coordenadas.speedKmH} km/h` : '0 km/h'}
          </span>
        </div>

        <div className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700/60 shadow-lg text-[11px] text-slate-300 font-medium pointer-events-auto flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-cyan-400" />
          <span>Freguesia, Jacarepaguá - RJ</span>
        </div>
      </div>

      {/* Canvas SVG Interativo com Ruas e Trajeto da Freguesia */}
      <svg
        viewBox="0 0 800 520"
        className="w-full h-full select-none"
        style={{ background: 'linear-gradient(135deg, #090d16 0%, #0d1527 100%)' }}
      >
        <defs>
          {/* Grade de fundo */}
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="0.75" strokeOpacity="0.4" />
          </pattern>

          {/* Gradiente da linha de rota */}
          <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="50%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>

          {/* Sombra suave para o marcador da Van */}
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Textura de grade */}
        <rect width="100%" height="100%" fill="url(#grid)" />

        {/* RUAS PRINCIPAIS DA FREGUESIA (Mapeamento Geográfico Simplificado) */}
        <g stroke="#1e293b" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" opacity="0.6">
          {/* Estrada dos Três Rios (artéria principal) */}
          <path d="M 120 480 Q 300 350 480 200 T 720 70" />
          {/* Rua Araguaia */}
          <path d="M 220 380 L 380 430 L 460 320" />
          {/* Rua Tirol */}
          <path d="M 160 300 L 320 220 L 400 240" />
          {/* Estrada do Bananal */}
          <path d="M 460 210 L 620 180 L 740 230" />
          {/* Estrada do Pau-Ferro */}
          <path d="M 100 220 L 280 180 L 420 80" />
        </g>

        {/* Nomes das Ruas (Tipografia Discreta) */}
        <g fill="#475569" fontSize="10" fontFamily="sans-serif" fontWeight="500">
          <text x="520" y="145" transform="rotate(-30 520 145)">Est. dos Três Rios</text>
          <text x="250" y="420" transform="rotate(15 250 420)">Rua Araguaia</text>
          <text x="220" y="270" transform="rotate(-20 220 270)">Rua Tirol</text>
          <text x="560" y="195" transform="rotate(-10 560 195)">Est. do Bananal</text>
          <text x="560" y="65" fill="#f59e0b" fontWeight="600">Colégio Santa Mônica 🎓</text>
        </g>

        {/* TRAÇADO DA ROTA DA VAN ESCOLAR */}
        <polyline
          points={routePointsString}
          fill="none"
          stroke="url(#routeGradient)"
          strokeWidth="4"
          strokeDasharray={isRotaAtiva ? "8,6" : "none"}
          className={isRotaAtiva ? "animate-pulse" : ""}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.85"
        />

        {/* PONTOS DE PARADA / RESIDÊNCIAS DOS ALUNOS */}
        {ROTA_FREGUESIA_PONTOS.filter((ponto) => {
          // No app dos pais (ocultarOutrasParadas === true), exibe apenas o trajeto,
          // a parada do próprio filho (Maria Clara) e o destino final escolar,
          // ocultando completamente as paradas e nomes de outras crianças por privacidade.
          if (ocultarOutrasParadas) {
            return ponto.alunoId === highlightAlunoId || ponto.isDestinoFinal;
          }
          return true;
        }).map((ponto, idx) => {
          const px = lngToX(ponto.longitude);
          const py = latToY(ponto.latitude);
          const isHighlight = ponto.alunoId === highlightAlunoId;
          const status = getStatusAluno(ponto.alunoId);

          let colorFill = "#38bdf8"; // Pendente (Azul claro)
          if (status === 'EMBARCOU') colorFill = "#10b981"; // Verde
          if (status === 'ENTREGUE') colorFill = "#6366f1"; // Roxo/Índigo
          if (status === 'AUSENTE') colorFill = "#ef4444"; // Vermelho

          return (
            <g
              key={idx}
              className="cursor-pointer transition-transform hover:scale-110"
              onClick={() => onSelectWaypoint && onSelectWaypoint(idx)}
            >
              {/* Destaque especial se for a parada da Maria Clara (App dos Pais) */}
              {isHighlight && (
                <circle
                  cx={px}
                  cy={py}
                  r="22"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2"
                  strokeDasharray="4,4"
                  className="animate-spin"
                  style={{ transformOrigin: `${px}px ${py}px`, animationDuration: '8s' }}
                />
              )}

              {/* Círculo do marcador */}
              <circle
                cx={px}
                cy={py}
                r={ponto.isDestinoFinal ? "13" : "10"}
                fill={ponto.isDestinoFinal ? "#f59e0b" : colorFill}
                stroke="#0f172a"
                strokeWidth="3"
                filter="url(#glow)"
              />

              {/* Ícone de Escola ou Aluno */}
              {ponto.isDestinoFinal ? (
                <text x={px - 5} y={py + 4} fontSize="10" fill="#0f172a" fontWeight="bold">🏫</text>
              ) : (
                <text x={px - 4} y={py + 3.5} fontSize="9" fill="#0f172a" fontWeight="bold">
                  {ocultarOutrasParadas ? '★' : idx}
                </text>
              )}

              {/* Rótulo da Parada */}
              <g transform={`translate(${px}, ${py + 22})`}>
                <rect
                  x="-65"
                  y="-8"
                  width="130"
                  height="16"
                  rx="8"
                  fill="#0f172a"
                  fillOpacity="0.85"
                  stroke={isHighlight ? "#38bdf8" : "#334155"}
                  strokeWidth="1"
                />
                <text
                  x="0"
                  y="4"
                  fill={isHighlight ? "#38bdf8" : "#e2e8f0"}
                  fontSize="9"
                  fontWeight={isHighlight ? "bold" : "500"}
                  textAnchor="middle"
                >
                  {isHighlight
                    ? 'Sua Residência (Casa)'
                    : (ponto.isDestinoFinal ? 'Colégio Santa Mônica' : (ponto.alunoNome ? ponto.alunoNome.split(' ')[0] : 'Início'))}
                  {status === 'AUSENTE' && isHighlight ? ' (Ausente)' : ''}
                </text>
              </g>
            </g>
          );
        })}

        {/* MARCADOR DA VAN EM TEMPO REAL */}
        <g
          transform={`translate(${vanX}, ${vanY})`}
          className="transition-all duration-1000 ease-linear"
        >
          {/* Radar pulsante quando a rota estiver ativa */}
          {isRotaAtiva && (
            <>
              <circle cx="0" cy="0" r="28" fill="#eab308" fillOpacity="0.15" className="animate-ping" />
              <circle cx="0" cy="0" r="18" fill="#eab308" fillOpacity="0.25" />
            </>
          )}

          {/* Seta de direção (Heading) */}
          <g transform={`rotate(${coordenadas.heading || 0})`}>
            <polygon points="0,-22 -7,-14 7,-14" fill="#facc15" />
          </g>

          {/* Ícone estilizado do veículo da van */}
          <rect
            x="-14"
            y="-10"
            width="28"
            height="20"
            rx="5"
            fill="#eab308"
            stroke="#0b0f19"
            strokeWidth="2.5"
            filter="url(#glow)"
          />
          {/* Para-brisa da van */}
          <rect x="-10" y="-7" width="20" height="6" rx="2" fill="#0f172a" />
          {/* Letreiro "ESCOLAR" */}
          <rect x="-8" y="2" width="16" height="3.5" rx="1" fill="#18181b" />

          {/* Badge flutuante com placa / motorista */}
          <g transform="translate(0, -26)">
            <rect
              x="-55"
              y="-10"
              width="110"
              height="18"
              rx="9"
              fill="#0f172a"
              stroke="#eab308"
              strokeWidth="1.5"
            />
            <text x="0" y="3" fill="#fef08a" fontSize="10" fontWeight="bold" textAnchor="middle">
              {motoristaNome
                ? (motoristaNome.toLowerCase().startsWith('tio ') || motoristaNome.toLowerCase().startsWith('tia ')
                    ? `🚐 ${motoristaNome}`
                    : `🚐 Van ${motoristaNome.split(' ')[0]}`)
                : '🚐 Van Escolar'}
            </text>
          </g>
        </g>
      </svg>

      {/* Barra Inferior com Telemetria Dinâmica (Adaptada para privacidade no modo pais) */}
      <div className="absolute bottom-2 left-2 right-2 bg-slate-900/90 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-800 flex items-center justify-between text-xs z-20">
        <div className="flex items-center gap-2 truncate">
          <Navigation className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="truncate">
            {ocultarOutrasParadas ? (
              <>
                <span className="text-slate-400">Trajeto em monitoramento: </span>
                <span className="font-semibold text-cyan-300">
                  {getStatusAluno(highlightAlunoId) === 'EMBARCOU'
                    ? 'A caminho do Colégio Santa Mônica'
                    : (getStatusAluno(highlightAlunoId) === 'ENTREGUE'
                        ? 'Entregue no Colégio'
                        : (getStatusAluno(highlightAlunoId) === 'AUSENTE'
                            ? 'Ausência registrada'
                            : (isRotaAtiva ? 'Van em deslocamento na Freguesia' : 'Aguardando partida da van')))}
                </span>
              </>
            ) : (
              <>
                <span className="text-slate-400">Próxima parada: </span>
                <span className="font-semibold text-slate-200">{coordenadas.nextStopName}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 font-mono">
          <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-md border border-emerald-500/20 text-[11px] font-medium">
            {ocultarOutrasParadas
              ? (getStatusAluno(highlightAlunoId) === 'PENDENTE' ? `ETA portaria: ~${coordenadas.etaNextStopMinutes} min` : 'Em rota')
              : `ETA: ~${coordenadas.etaNextStopMinutes} min`}
          </span>
        </div>
      </div>
    </div>
  );
};
