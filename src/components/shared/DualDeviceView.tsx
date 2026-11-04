import React from 'react';
import { DriverPanel } from '../driver/DriverPanel';
import { ParentApp } from '../parents/ParentApp';
import { GPSCoordinate } from '../../types/database';
import { Smartphone, Bus, Users, Sparkles, ArrowRightLeft, QrCode } from 'lucide-react';

interface DualDeviceViewProps {
  coordenadas: GPSCoordinate;
  isRotaAtiva: boolean;
  onToggleRota: () => void;
  onOpenTestModal?: () => void;
}

export const DualDeviceView: React.FC<DualDeviceViewProps> = ({
  coordenadas,
  isRotaAtiva,
  onToggleRota,
  onOpenTestModal
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-3 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Banner Informativo de Simulação Reativa */}
      <div className="w-full bg-gradient-to-r from-amber-500/10 via-cyan-500/10 to-indigo-500/10 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-400/20 text-amber-300 border border-amber-400/30 shrink-0">
            <ArrowRightLeft className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <span>Simulação Reativa Simultânea (Tempo Real)</span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono">
                Repository Pattern + Event Bus
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Experimente clicar em <strong>&quot;Avisar Ausência&quot;</strong> no App dos Pais (à direita) e veja o Diário de Bordo do Motorista (à esquerda) atualizar instantaneamente para <em>Ausente</em>. Em seguida, clique em <strong>&quot;Iniciar Rota&quot;</strong> para ativar a telemetria GPS pela Freguesia.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onOpenTestModal && (
            <button
              onClick={onOpenTestModal}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-400 hover:bg-amber-300 text-slate-950 flex items-center gap-1.5 shadow-md shadow-amber-400/20 transition-all cursor-pointer"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>QR Codes (2 Celulares)</span>
            </button>
          )}

          <span className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 ${
            isRotaAtiva
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
              : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isRotaAtiva ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
            {isRotaAtiva ? 'GPS ATIVO (10s)' : 'GPS AGUARDANDO'}
          </span>
        </div>
      </div>

      {/* DISPOSITIVOS LADO A LADO COM MOLDURAS MOBILE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full justify-items-center">
        {/* DISPOSITIVO 1: PAINEL DO MOTORISTA */}
        <div className="flex flex-col items-center w-full max-w-[440px]">
          <div className="flex items-center gap-2 mb-2 text-xs font-bold text-amber-400">
            <Bus className="w-4 h-4" />
            <span>DISPOSITIVO DO MOTORISTA (DIÁRIO DE BORDO)</span>
          </div>

          <div className="w-full h-[760px] bg-slate-950 rounded-[40px] border-4 border-slate-800 shadow-2xl overflow-hidden relative ring-1 ring-slate-700/50 flex flex-col">
            {/* Notch / Câmera Superior do Smartphone */}
            <div className="h-6 bg-slate-900 flex items-center justify-center relative shrink-0 z-40 border-b border-slate-800">
              <div className="w-24 h-4 bg-slate-950 rounded-b-xl flex items-center justify-center">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-900" />
              </div>
            </div>

            {/* Tela do Motorista */}
            <div className="flex-1 overflow-hidden">
              <DriverPanel
                coordenadas={coordenadas}
                isRotaAtiva={isRotaAtiva}
                onToggleRota={onToggleRota}
              />
            </div>

            {/* Barra Home inferior */}
            <div className="h-4 bg-slate-900 flex items-center justify-center shrink-0 border-t border-slate-800">
              <div className="w-28 h-1 bg-slate-700 rounded-full" />
            </div>
          </div>
        </div>

        {/* DISPOSITIVO 2: APLICATIVO DOS PAIS (LEANDRO & MARIA CLARA) */}
        <div className="flex flex-col items-center w-full max-w-[440px]">
          <div className="flex items-center gap-2 mb-2 text-xs font-bold text-cyan-400">
            <Users className="w-4 h-4" />
            <span>APLICATIVO DOS PAIS (LEANDRO SOLON)</span>
          </div>

          <div className="w-full h-[760px] bg-slate-950 rounded-[40px] border-4 border-slate-800 shadow-2xl overflow-hidden relative ring-1 ring-slate-700/50 flex flex-col">
            {/* Notch / Câmera Superior do Smartphone */}
            <div className="h-6 bg-slate-900 flex items-center justify-center relative shrink-0 z-40 border-b border-slate-800">
              <div className="w-24 h-4 bg-slate-950 rounded-b-xl flex items-center justify-center">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-900" />
              </div>
            </div>

            {/* Tela dos Pais */}
            <div className="flex-1 overflow-hidden">
              <ParentApp
                coordenadas={coordenadas}
                isRotaAtiva={isRotaAtiva}
              />
            </div>

            {/* Barra Home inferior */}
            <div className="h-4 bg-slate-900 flex items-center justify-center shrink-0 border-t border-slate-800">
              <div className="w-28 h-1 bg-slate-700 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
