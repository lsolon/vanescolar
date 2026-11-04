/**
 * ============================================================================
 * HOOK CUSTOMIZADO: useGPS(isAtivo)
 * ============================================================================
 * 
 * Simula a emissão periódica de telemetria e coordenadas geográficas (GPS) da van
 * escolar ao longo de um trajeto realista no Bairro Freguesia, Jacarepaguá, Rio de Janeiro.
 * 
 * PADRÃO DE ABSTRAÇÃO PARA PRODUÇÃO:
 * ----------------------------------------------------------------------------
 * Este hook foi arquitetado para permitir substituição direta por uma conexão
 * WebSocket (ex: Socket.io) ou pela Geolocation API nativa do dispositivo:
 * 
 * 1. MODO MOTORISTA (Transmissor):
 *    No app nativo/PWA do motorista, usa-se `navigator.geolocation.watchPosition`:
 *    navigator.geolocation.watchPosition((pos) => {
 *      socket.emit('driver:gps_beacon', {
 *        viagemId,
 *        lat: pos.coords.latitude,
 *        lng: pos.coords.longitude,
 *        speed: pos.coords.speed,
 *        heading: pos.coords.heading
 *      });
 *    });
 * 
 * 2. MODO PAIS (Receptor):
 *    No app dos pais, escuta-se o evento emitido pelo servidor Node.js/Socket.io:
 *    const socket = io('https://api.vaneascolar.com.br');
 *    socket.on('gps:van_location', (coords: GPSCoordinate) => setCoordenada(coords));
 * ============================================================================
 */

import { useState, useEffect, useRef } from 'react';
import { GPSCoordinate } from '../types/database';
import { subscribeToDatabaseChanges, TransportRepository } from '../services/api';
import { isDemoMode } from '../services/demo';

export interface WaypointRota {
  nome: string;
  endereco: string;
  latitude: number;
  longitude: number;
  alunoId?: number;
  alunoNome?: string;
  isDestinoFinal?: boolean;
}

// ROTA REALISTA: FREGUESIA (JACAREPAGUÁ), RIO DE JANEIRO
export const ROTA_FREGUESIA_PONTOS: WaypointRota[] = [
  {
    nome: "Ponto de Partida (Garagem)",
    endereco: "Estrada dos Três Rios, 200 - Freguesia",
    latitude: -22.9372,
    longitude: -43.3438
  },
  {
    nome: "Parada 1: Maria Clara (Leandro Solon)",
    endereco: "Rua Araguaia, 850",
    latitude: -22.9348,
    longitude: -43.3412,
    alunoId: 201,
    alunoNome: "Maria Clara Solon"
  },
  {
    nome: "Parada 2: Enzo Gabriel",
    endereco: "Rua Tirol, 340",
    latitude: -22.9320,
    longitude: -43.3445,
    alunoId: 203,
    alunoNome: "Enzo Gabriel"
  },
  {
    nome: "Parada 3: Lucas Silva",
    endereco: "Estrada dos Três Rios, 1200",
    latitude: -22.9295,
    longitude: -43.3385,
    alunoId: 202,
    alunoNome: "Lucas Silva"
  },
  {
    nome: "Parada 4: Beatriz Lima",
    endereco: "Estrada do Bananal, 510",
    latitude: -22.9268,
    longitude: -43.3340,
    alunoId: 204,
    alunoNome: "Beatriz Lima"
  },
  {
    nome: "Destino Final: Colégio Santa Mônica",
    endereco: "Estrada dos Três Rios, 138 - Freguesia",
    latitude: -22.9245,
    longitude: -43.3325,
    isDestinoFinal: true
  }
];

export interface UseGPSOptions {
  intervalMs?: number; // Padrão: 10000ms (10 segundos, conforme especificação)
  stepIncrement?: number;
}

export type ErroGPS = 'permissao_negada' | 'indisponivel' | 'sem_suporte' | null;

export function useGPS(isAtivo: boolean, options: UseGPSOptions = {}) {
  const { intervalMs = 10000, stepIncrement = 0.08 } = options;
  const real = !isDemoMode();
  const [erroGps, setErroGps] = useState<ErroGPS>(null);

  // Progresso decimal ao longo do vetor de waypoints (0 a ROTA_FREGUESIA_PONTOS.length - 1)
  const [progresso, setProgresso] = useState<number>(0);
  const [coordenadas, setCoordenadas] = useState<GPSCoordinate>(() => {
    const inicio = ROTA_FREGUESIA_PONTOS[0];
    return {
      latitude: inicio.latitude,
      longitude: inicio.longitude,
      speedKmH: 0,
      heading: 42,
      timestamp: new Date().toLocaleTimeString('pt-BR'),
      accuracyMeters: isDemoMode() ? 5 : 0, // 0 = ainda sem posição real
      currentAddress: inicio.endereco,
      nextStopName: ROTA_FREGUESIA_PONTOS[1].nome,
      etaNextStopMinutes: 4
    };
  });

  const progressoRef = useRef(progresso);
  progressoRef.current = progresso;

  // Escuta telemetria do motorista se este dispositivo for o receptor (ex: celular dos pais)
  useEffect(() => {
    const unsubscribe = subscribeToDatabaseChanges((event, payload) => {
      if (event === 'INIT_STATE' && !isAtivo && (payload as any)?.gpsAtual?.accuracyMeters) {
        const g = (payload as any).gpsAtual as GPSCoordinate;
        const t = new Date(g.timestamp);
        setCoordenadas({ ...g, timestamp: isNaN(t.getTime()) ? g.timestamp : t.toLocaleTimeString('pt-BR') });
      }
      if (event === 'GPS_ATUALIZADO' && payload) {
        const gps = payload as GPSCoordinate;
        if (!isAtivo) {
          const t = new Date(gps.timestamp);
          setCoordenadas({ ...gps, timestamp: isNaN(t.getTime()) ? gps.timestamp : t.toLocaleTimeString('pt-BR') });
        }
      }
    });
    return () => unsubscribe();
  }, [isAtivo]);

  useEffect(() => {
    if (!isAtivo) {
      // Quando a rota local não está ativa, mantém van com velocidade zero se não houver telemetria externa
      setCoordenadas((prev) => ({
        ...prev,
        speedKmH: 0,
        timestamp: new Date().toLocaleTimeString('pt-BR')
      }));
      return;
    }

    // MODO REAL: usa o GPS do celular do motorista e envia ao servidor (no máximo 1 envio a cada `intervalMs`).
    if (real) {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        setErroGps('sem_suporte');
        return;
      }
      setErroGps(null);
      let ultimoEnvio = 0;
      let wakeLock: any = null;
      try { (navigator as any).wakeLock?.request('screen').then((w: any) => { wakeLock = w; }).catch(() => {}); } catch {}
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const c = pos.coords;
          const telemetria: GPSCoordinate = {
            latitude: c.latitude,
            longitude: c.longitude,
            speedKmH: c.speed != null && c.speed >= 0 ? Math.round(c.speed * 3.6) : 0,
            heading: c.heading != null && !isNaN(c.heading) ? Math.round(c.heading) : 0,
            timestamp: new Date().toLocaleTimeString('pt-BR'),
            accuracyMeters: Math.max(1, Math.round(c.accuracy || 1)),
            currentAddress: '',
            nextStopName: '',
            etaNextStopMinutes: 0
          };
          setCoordenadas((prev) => ({ ...prev, ...telemetria }));
          const agora = Date.now();
          if (agora - ultimoEnvio >= intervalMs) {
            ultimoEnvio = agora;
            TransportRepository.atualizarGPS(telemetria);
          }
        },
        (err) => setErroGps(err.code === err.PERMISSION_DENIED ? 'permissao_negada' : 'indisponivel'),
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
      );
      return () => {
        navigator.geolocation.clearWatch(watchId);
        try { wakeLock?.release?.(); } catch {}
      };
    }

    /**
     * SIMULAÇÃO DE TRANSMISSÃO DE GPS A CADA INTERVALO
     * Transmite tanto localmente quanto via POST /api/gps para o servidor Express
     */
    const intervalId = setInterval(() => {
      const pontos = ROTA_FREGUESIA_PONTOS;
      let novoProgresso = progressoRef.current + stepIncrement;

      // Loop ou parada no destino
      if (novoProgresso >= pontos.length - 1) {
        novoProgresso = 0; // Reinicia o ciclo na simulação para teste contínuo
      }

      setProgresso(novoProgresso);

      const indexAtual = Math.floor(novoProgresso);
      const proximoIndex = Math.min(indexAtual + 1, pontos.length - 1);
      const fator = novoProgresso - indexAtual;

      const pA = pontos[indexAtual];
      const pB = pontos[proximoIndex];

      // Interpolação linear de coordenadas geográficas
      const lat = pA.latitude + (pB.latitude - pA.latitude) * fator;
      const lng = pA.longitude + (pB.longitude - pA.longitude) * fator;

      // Cálculo de direção (heading/bearing aproximado)
      const dLng = pB.longitude - pA.longitude;
      const dLat = pB.latitude - pA.latitude;
      const angleRad = Math.atan2(dLng, dLat);
      const headingDeg = (Math.round((angleRad * 180) / Math.PI) + 360) % 360;

      // Velocidade dinâmica simulada (22 km/h a 42 km/h no trânsito de Jacarepaguá)
      const speedKmH = Math.round(26 + Math.sin(novoProgresso * 4) * 12);

      // Estimativa de tempo até a próxima parada
      const distanciaRestanteFator = 1 - fator;
      const etaMinutes = Math.max(1, Math.round(distanciaRestanteFator * 4));

      const novaTelemetria: GPSCoordinate = {
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6)),
        speedKmH,
        heading: headingDeg,
        timestamp: new Date().toLocaleTimeString('pt-BR'),
        accuracyMeters: Math.floor(4 + Math.random() * 3),
        currentAddress: pA.endereco,
        nextStopName: pB.nome,
        etaNextStopMinutes: etaMinutes
      };

      setCoordenadas(novaTelemetria);

      // Envia telemetria GPS para o servidor propagar via SSE para os pais
      if (typeof fetch !== 'undefined') {
        fetch('/api/gps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(novaTelemetria)
        }).catch(() => {});
      }
    }, intervalMs);

    return () => clearInterval(intervalId);
  }, [isAtivo, intervalMs, stepIncrement, real]);

  // Permite avançar ou reiniciar manualmente a rota
  const resetRota = () => {
    setProgresso(0);
    const inicio = ROTA_FREGUESIA_PONTOS[0];
    setCoordenadas({
      latitude: inicio.latitude,
      longitude: inicio.longitude,
      speedKmH: 0,
      heading: 42,
      timestamp: new Date().toLocaleTimeString('pt-BR'),
      accuracyMeters: 5,
      currentAddress: inicio.endereco,
      nextStopName: ROTA_FREGUESIA_PONTOS[1].nome,
      etaNextStopMinutes: 4
    });
  };

  const setWaypointManual = (index: number) => {
    if (index >= 0 && index < ROTA_FREGUESIA_PONTOS.length) {
      setProgresso(index);
      const p = ROTA_FREGUESIA_PONTOS[index];
      const nextP = ROTA_FREGUESIA_PONTOS[Math.min(index + 1, ROTA_FREGUESIA_PONTOS.length - 1)];
      setCoordenadas({
        latitude: p.latitude,
        longitude: p.longitude,
        speedKmH: isAtivo ? 30 : 0,
        heading: 45,
        timestamp: new Date().toLocaleTimeString('pt-BR'),
        accuracyMeters: 5,
        currentAddress: p.endereco,
        nextStopName: nextP.nome,
        etaNextStopMinutes: 3
      });
    }
  };

  return {
    coordenadas,
    erroGps,
    progresso,
    resetRota,
    setWaypointManual,
    pontosRota: ROTA_FREGUESIA_PONTOS
  };
}
