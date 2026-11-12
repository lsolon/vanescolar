/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useGPS } from './hooks/useGPS';
import { DriverPanel } from './components/driver/DriverPanel';
import { ParentApp } from './components/parents/ParentApp';
import { DualDeviceView } from './components/shared/DualDeviceView';
import { ArchitectureModal } from './components/shared/ArchitectureModal';
import { RealTestModal } from './components/shared/RealTestModal';
import { LandingPage } from './components/auth/LandingPage';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { GestaoPanel } from './components/gestao/GestaoPanel';
import { TransportRepository, subscribeToDatabaseChanges } from './services/api';
import { AuthService } from './services/auth';
import { CODIGO_VERSAO } from './versao';
import { AssinaturaGlobal } from './components/assinatura/Assinatura';
import { useVanPersonalizada, rotuloDaVan } from './services/vanPersonalizada';
import {
  Bus,
  Users,
  Smartphone,
  Cpu,
  RotateCcw,
  Gauge,
  QrCode,
  ArrowLeft,
  Home
} from 'lucide-react';

type ModoTela = 'LANDING' | 'DUAL' | 'DRIVER' | 'PARENT' | 'ADMIN' | 'GESTAO';

export default function App() {
  const isDemoMode = (typeof window !== 'undefined' && window.location.search.includes('demo=true')) || import.meta.env.VITE_DEMO_MODE === 'true';
  // "Van do João • Freguesia": vem do link ?m= ou da última van usada neste aparelho. No modo demonstração, sem van, mantém o texto de exemplo.
  const van = useVanPersonalizada();
  const rotuloVan = rotuloDaVan(van) ?? (isDemoMode ? 'Freguesia • Jacarepaguá' : null);

  const [viewMode, setViewMode] = useState<ModoTela>('LANDING');
  const [isRotaAtiva, setIsRotaAtiva] = useState<boolean>(false);
  const [isFastGPS, setIsFastGPS] = useState<boolean>(true); // 3s para testar rapidamente na UI, ou 10s padrão
  const [isArchModalOpen, setIsArchModalOpen] = useState<boolean>(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState<boolean>(false);
  const [isStandaloneMobile, setIsStandaloneMobile] = useState<boolean>(false);

  // Detecta parâmetro de URL (?role=motorista ou ?role=pais) para abrir direto no celular
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const role = params.get('role')?.toLowerCase() || params.get('view')?.toLowerCase();
      const temSessao = !!AuthService.getSessionToken();
      const rolePrecisaLogin = ['motorista', 'driver', 'pais', 'parent', 'pai'].includes(role || '');
      if (rolePrecisaLogin && !temSessao && !isDemoMode) {
        // Sem login (e fora do modo demonstração): volta para a tela de entrada
        setViewMode('LANDING');
      } else if (role === 'motorista' || role === 'driver') {
        setViewMode('DRIVER');
        setIsStandaloneMobile(true);
      } else if (role === 'pais' || role === 'parent' || role === 'pai') {
        setViewMode('PARENT');
        setIsStandaloneMobile(true);
      } else if ((role === 'dupla' || role === 'dual' || role === 'simulador') && isDemoMode) {
        setViewMode('DUAL');
      } else if (window.location.pathname === '/gestao') {
        // Gestão do motorista: precisa de login (o servidor também confere o papel de motorista)
        setViewMode(temSessao ? 'GESTAO' : 'LANDING');
      } else if (window.location.pathname === '/admin' || role === 'admin') {
        setViewMode('ADMIN');
      } else {
        setViewMode('LANDING');
      }
    }
  }, []);

  // Escuta status da rota para sincronizar instantaneamente entre o celular do motorista e dos pais
  useEffect(() => {
    const unsubscribe = subscribeToDatabaseChanges((event, payload) => {
      if (
        event === 'ROTA_STATUS_ALTERADO' ||
        event === 'viagem:iniciada' ||
        event === 'viagem:encerrada' ||
        event === 'INIT_STATE'
      ) {
        const p = payload as any;
        const status = p?.status || p?.viagem?.status;
        if (status === 'EM_ANDAMENTO') {
          setIsRotaAtiva(true);
        } else if (status === 'FINALIZADA' || status === 'CONCLUIDA' || status === 'AGENDADA') {
          setIsRotaAtiva(false);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Navegação entre ambientes com sincronização da URL no navegador
  const navigateTo = (mode: ModoTela) => {
    setViewMode(mode);
    if (typeof window !== 'undefined') {
      // Endereços começam em "/" para não herdar o caminho atual (ex.: sair de /gestao para o painel).
      if (mode === 'DRIVER') {
        window.history.pushState(null, '', '/?role=motorista');
        setIsStandaloneMobile(true);
      } else if (mode === 'PARENT') {
        window.history.pushState(null, '', '/?role=pais');
        setIsStandaloneMobile(true);
      } else if (mode === 'DUAL') {
        window.history.pushState(null, '', '/?role=dupla');
        setIsStandaloneMobile(false);
      } else if (mode === 'GESTAO') {
        window.history.pushState(null, '', '/gestao');
        setIsStandaloneMobile(false);
      } else if (mode === 'ADMIN') {
        window.history.pushState(null, '', '/admin');
        setIsStandaloneMobile(false);
      } else {
        window.history.pushState(null, '', '/app');
        setIsStandaloneMobile(false);
      }
    }
  };

  // Apenas o celular do motorista ou a visão dupla emite coordenadas de simulação GPS
  // O aplicativo dos pais opera puramente como RECEPTOR das coordenadas transmitidas pelo motorista
  // A Gestão é do motorista: com a rota em andamento, o GPS continua enviando enquanto ele consulta a Gestão.
  const isDriverRole = viewMode === 'DRIVER' || viewMode === 'DUAL' || viewMode === 'GESTAO';
  const intervalMs = isFastGPS ? 3000 : 10000;
  const { coordenadas, resetRota, erroGps } = useGPS(isRotaAtiva && isDriverRole, { intervalMs });

  // Iniciar ou encerrar rota
  const handleToggleRota = async (sentido: 'IDA' | 'VOLTA' = 'IDA') => {
    try {
      if (!isRotaAtiva) {
        await TransportRepository.iniciarRota(501, sentido);
        setIsRotaAtiva(true);
      } else {
        await TransportRepository.encerrarRota(501);
        setIsRotaAtiva(false);
      }
    } catch (err) {
      console.error('Erro ao alternar status da rota:', err);
    }
  };

  // Limpar dados e sair do ambiente de teste
  const handleLimparDados = async () => {
    if (window.confirm("Deseja limpar todos os dados de alunos e motorista e sair do ambiente de teste?")) {
      try {
        await TransportRepository.limparDadosTeste();
        resetRota();
        setIsRotaAtiva(false);
        navigateTo('LANDING');
      } catch (err) {
        console.error("Erro ao limpar dados de teste:", err);
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-400 selection:text-slate-950">
      <div
        aria-hidden="true"
        data-testid="codigo-versao"
        className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 z-[60] px-2 text-[9px] leading-4 font-mono tracking-wider text-slate-500/70 select-none"
      >
        {CODIGO_VERSAO}
      </div>
      <AssinaturaGlobal />
      {/* ==================================================================== */}
      {/* 1. SELEÇÃO DE AMBIENTE: LANDING PAGE COM PORTAIS DE LOGIN SEPARADOS */}
      {/* ==================================================================== */}
      {viewMode === 'LANDING' ? (
        <LandingPage
          onLoginDriver={() => navigateTo('DRIVER')}
          onLoginParent={() => navigateTo('PARENT')}
          onLoginAdmin={() => navigateTo('ADMIN')}
          onOpenDualSimulator={() => navigateTo('DUAL')}
          onOpenQRModal={() => setIsTestModalOpen(true)}
          onOpenArchitecture={() => setIsArchModalOpen(true)}
          onLimparDados={handleLimparDados}
        />
      ) : viewMode === 'ADMIN' ? (
        <AdminDashboard onLogout={() => navigateTo('LANDING')} />
      ) : viewMode === 'GESTAO' ? (
        <GestaoPanel onVoltar={() => navigateTo('DRIVER')} />
      ) : (
        <>
          {/* ==================================================================== */}
          {/* 2. ÁREA AUTENTICADA: PAINEL DO MOTORISTA, APP DOS PAIS OU SIMULADOR */}
          {/* ==================================================================== */}
          <nav className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40 px-4 py-3">
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
              {/* Botão de Voltar ao Portal e Identidade */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigateTo('LANDING')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition-all border border-slate-700 cursor-pointer"
                  title="Voltar à tela inicial de login"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{isDemoMode ? 'Portal / Trocar Login' : 'Voltar'}</span>
                </button>

                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-400 flex items-center justify-center text-slate-950 font-black text-sm">
                    🚐
                  </div>
                  <div>
                    <span className="font-extrabold text-sm tracking-tight text-white">
                      Van<span className="text-amber-400">Escolar</span>
                    </span>
                    {rotuloVan && (
                      <span className="text-[10px] text-slate-400 ml-2 hidden sm:inline">
                        {rotuloVan}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* SELETOR RÁPIDO DE INTERFACES (apenas no modo demonstração) */}
              {isDemoMode && (
              <div className="flex items-center gap-1 bg-slate-950 p-1.5 rounded-2xl border border-slate-800 text-xs">
                <button
                  onClick={() => navigateTo('DUAL')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all ${
                    viewMode === 'DUAL'
                      ? 'bg-amber-400 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Smartphone className="w-4 h-4" />
                  <span className="hidden sm:inline">Visão Dupla</span>
                  <span className="sm:hidden">Dupla</span>
                </button>

                <button
                  onClick={() => navigateTo('DRIVER')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all ${
                    viewMode === 'DRIVER'
                      ? 'bg-amber-400 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Bus className="w-4 h-4" />
                  <span>Painel Motorista</span>
                </button>

                <button
                  onClick={() => navigateTo('PARENT')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all ${
                    viewMode === 'PARENT'
                      ? 'bg-cyan-400 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>App dos Pais</span>
                </button>
              </div>
              )}

              {/* CONTROLES DE SIMULAÇÃO DE GPS & QR CODE */}
              <div className="flex items-center gap-2">
                {isDemoMode && (
                  <>
                    <button
                      onClick={() => setIsFastGPS(!isFastGPS)}
                      title="Alternar velocidade de simulação do GPS"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono border border-slate-700 transition-all"
                    >
                      <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                      <span>GPS: {isFastGPS ? '3s' : '10s'}</span>
                    </button>

                    <button
                      onClick={handleLimparDados}
                      title="Limpar dados e sair do ambiente de teste"
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-400 hover:text-rose-300 transition-colors border border-slate-700"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => setIsTestModalOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 text-xs font-black transition-all shadow-md shadow-amber-400/20"
                    >
                      <QrCode className="w-4 h-4" />
                      <span className="hidden sm:inline">QR Codes (2 Celulares)</span>
                      <span className="sm:hidden">2 Celulares</span>
                    </button>

                    <button
                      onClick={() => setIsArchModalOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-950 border border-indigo-400/40"
                    >
                      <Cpu className="w-4 h-4" />
                      <span className="hidden sm:inline">SQL & VPS</span>
                      <span className="sm:hidden">SQL</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </nav>

          {/* ÁREA DE VISUALIZAÇÃO PRINCIPAL DO AMBIENTE ESCOLHIDO */}
          <main className="flex-1 w-full max-w-7xl mx-auto p-4 flex flex-col justify-center">
            {viewMode === 'DUAL' && (
              <DualDeviceView
                coordenadas={coordenadas}
                isRotaAtiva={isRotaAtiva}
                onToggleRota={handleToggleRota}
                onOpenTestModal={() => setIsTestModalOpen(true)}
              />
            )}

            {viewMode === 'DRIVER' && (
              <div className="max-w-md mx-auto w-full min-h-[calc(100vh-80px)] sm:h-[840px] rounded-3xl border border-slate-800 overflow-hidden shadow-2xl bg-slate-950 flex flex-col">
                <DriverPanel
                  coordenadas={coordenadas}
                  isRotaAtiva={isRotaAtiva}
                  onToggleRota={handleToggleRota}
                  onLogout={() => navigateTo('LANDING')}
                  onAbrirGestao={() => navigateTo('GESTAO')}
                  erroGps={erroGps}
                />
              </div>
            )}

            {viewMode === 'PARENT' && (
              <div className="max-w-md mx-auto w-full min-h-[calc(100vh-80px)] sm:h-[840px] rounded-3xl border border-slate-800 overflow-hidden shadow-2xl bg-slate-950 flex flex-col">
                <ParentApp
                  coordenadas={coordenadas}
                  isRotaAtiva={isRotaAtiva}
                  onLogout={() => navigateTo('LANDING')}
                />
              </div>
            )}
          </main>
        </>
      )}

      {/* MODAL DE TESTE REAL COM 2 CELULARES (QR CODES) */}
      <RealTestModal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
      />

      {/* MODAL DE ARQUITETURA E ESPECIFICAÇÃO TÉCNICA */}
      <ArchitectureModal
        isOpen={isArchModalOpen}
        onClose={() => setIsArchModalOpen(false)}
      />
    </div>
  );
}
