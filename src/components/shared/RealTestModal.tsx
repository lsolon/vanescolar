/**
 * ============================================================================
 * MODAL DE TESTE REAL COM 2 CELULARES (RealTestModal.tsx)
 * Permite ao usuário escanear os QR Codes e sincronizar Motorista & Pais
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  Smartphone,
  Bus,
  Users,
  Copy,
  Check,
  ExternalLink,
  X,
  Wifi,
  Sparkles,
  ShieldCheck,
  Compass,
  BellRing
} from 'lucide-react';

interface RealTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRole?: (role: 'DRIVER' | 'PARENT') => void;
}

export const RealTestModal: React.FC<RealTestModalProps> = ({ isOpen, onClose }) => {
  const [driverQr, setDriverQr] = useState<string>('');
  const [parentQr, setParentQr] = useState<string>('');
  const [copiedRole, setCopiedRole] = useState<'DRIVER' | 'PARENT' | null>(null);
  const [customLanIp, setCustomLanIp] = useState<string>('');
  const [showNetworkGuide, setShowNetworkGuide] = useState<boolean>(false);

  const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  // Determina a URL base: se o usuário informou um IP local, usa ele; senão usa window.location.origin
  let effectiveBaseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  if (customLanIp.trim()) {
    const clean = customLanIp.trim().replace(/\/$/, '');
    if (clean.startsWith('http://') || clean.startsWith('https://')) {
      effectiveBaseUrl = clean;
    } else {
      effectiveBaseUrl = clean.includes(':') ? `http://${clean}` : `http://${clean}:3000`;
    }
  }

  const driverUrl = `${effectiveBaseUrl}/?role=motorista`;
  const parentUrl = `${effectiveBaseUrl}/?role=pais`;

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;

    QRCode.toDataURL(driverUrl, {
      width: 220,
      margin: 1,
      color: { dark: '#0f172a', light: '#f8fafc' }
    }).then(setDriverQr).catch(console.error);

    QRCode.toDataURL(parentUrl, {
      width: 220,
      margin: 1,
      color: { dark: '#0f172a', light: '#f8fafc' }
    }).then(setParentQr).catch(console.error);
  }, [isOpen, driverUrl, parentUrl]);

  if (!isOpen) return null;

  const handleCopy = (url: string, role: 'DRIVER' | 'PARENT') => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(url);
      setCopiedRole(role);
      setTimeout(() => setCopiedRole(null), 2000);
    }
  };

  const handleOpenDualTabs = () => {
    window.open(driverUrl, '_blank');
    setTimeout(() => {
      window.open(parentUrl, '_blank');
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-4xl w-full p-6 text-slate-100 shadow-2xl relative my-8">
        {/* Botão Fechar */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Cabeçalho */}
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold mb-2">
            <Wifi className="w-3.5 h-3.5 animate-pulse text-cyan-400" />
            Sincronização Ativa em Tempo Real (Express SSE + BroadcastChannel)
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            <span>Como Testar em 2 Celulares Reais</span>
            <span className="text-amber-400 text-sm font-bold bg-amber-400/10 px-2.5 py-0.5 rounded-lg border border-amber-400/20">
              Passo a Passo
            </span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Abra o painel do motorista em um celular e o app dos pais no outro celular. Qualquer clique em um dispositivo sincroniza instantaneamente com o outro via internet!
          </p>
        </div>

        {/* CONFIGURAÇÃO DE IP DE REDE LOCAL (WI-FI) */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Wifi className="w-4 h-4 text-amber-400" />
                <span>Testando no Wi-Fi Local (Mesma Rede dos Celulares)?</span>
              </span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {isLocalhost
                  ? 'Como você está no localhost, informe o IP da sua máquina na rede local para os celulares conseguirem acessar:'
                  : 'Host atual detectado automaticamente. Se quiser apontar para um IP de rede local ou túnel ngrok, informe abaixo:'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Ex: 192.168.1.15 ou ngrok..."
                value={customLanIp}
                onChange={(e) => setCustomLanIp(e.target.value)}
                className="bg-slate-900 border border-slate-700 focus:border-amber-400 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 font-mono w-48 sm:w-56"
              />
              {customLanIp && (
                <button
                  onClick={() => setCustomLanIp('')}
                  className="text-xs text-slate-400 hover:text-white px-2 py-1"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>

          {/* Botão para abrir o Guia de Comandos */}
          <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
            <button
              onClick={() => setShowNetworkGuide(!showNetworkGuide)}
              className="text-cyan-400 hover:text-cyan-300 font-medium underline flex items-center gap-1 cursor-pointer"
            >
              <span>{showNetworkGuide ? 'Ocultar guia de rede' : 'Como descobrir o IP da minha máquina no Windows / Mac / Linux?'}</span>
            </button>
            <span className="text-slate-500">Porta padrão: 3000</span>
          </div>

          {showNetworkGuide && (
            <div className="mt-3 p-3 bg-slate-900/90 rounded-xl border border-slate-800 text-[11px] text-slate-300 space-y-2">
              <div>
                <strong className="text-amber-400">Windows:</strong> Abra o Prompt/PowerShell e digite <code className="bg-slate-950 px-1.5 py-0.5 rounded text-cyan-300">ipconfig</code>. Procure por <em>Endereço IPv4</em> (ex: <code>192.168.0.25</code>).
              </div>
              <div>
                <strong className="text-amber-400">Mac / Linux:</strong> Abra o terminal e digite <code className="bg-slate-950 px-1.5 py-0.5 rounded text-cyan-300">ipconfig getifaddr en0</code> ou <code className="bg-slate-950 px-1.5 py-0.5 rounded text-cyan-300">hostname -I</code>.
              </div>
              <div>
                <strong className="text-amber-400">Dica de Túnel (Sem Firewall):</strong> Rode no terminal <code className="bg-slate-950 px-1.5 py-0.5 rounded text-cyan-300">npx localtunnel --port 3000</code> ou <code className="bg-slate-950 px-1.5 py-0.5 rounded text-cyan-300">ngrok http 3000</code> e cole a URL HTTPS gerada no campo acima!
              </div>
            </div>
          )}
        </div>

        {/* CARDS DOS 2 QR CODES */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* DISPOSITIVO 1: MOTORISTA */}
          <div className="bg-slate-950/70 border border-amber-500/30 rounded-2xl p-5 flex flex-col items-center text-center relative overflow-hidden group hover:border-amber-400/60 transition-all">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-500 to-amber-300" />
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl bg-amber-400/20 text-amber-400 flex items-center justify-center font-bold">
                <Bus className="w-4 h-4" />
              </div>
              <div className="text-left">
                <h3 className="font-extrabold text-white text-base">1º Celular: Motorista</h3>
                <p className="text-[11px] text-amber-300/80">Tio David Santos • Rota Freguesia</p>
              </div>
            </div>

            {/* QR Code */}
            <div className="bg-white p-2.5 rounded-2xl shadow-lg my-2 border-2 border-amber-400/40">
              {driverQr ? (
                <img src={driverQr} alt="QR Code Motorista" className="w-44 h-44 object-contain rounded-lg" />
              ) : (
                <div className="w-44 h-44 flex items-center justify-center text-slate-400 text-xs">Gerando QR...</div>
              )}
            </div>
            <p className="text-xs text-slate-300 mt-2 font-medium">
              Aponte a câmera do celular para abrir
            </p>

            {/* Link e Botão Copiar */}
            <div className="w-full mt-3 flex items-center gap-2">
              <input
                readOnly
                value={driverUrl}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-[11px] text-slate-300 font-mono truncate"
              />
              <button
                onClick={() => handleCopy(driverUrl, 'DRIVER')}
                className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm"
              >
                {copiedRole === 'DRIVER' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedRole === 'DRIVER' ? 'Copiado!' : 'Copiar'}</span>
              </button>
            </div>
          </div>

          {/* DISPOSITIVO 2: PAIS */}
          <div className="bg-slate-950/70 border border-cyan-500/30 rounded-2xl p-5 flex flex-col items-center text-center relative overflow-hidden group hover:border-cyan-400/60 transition-all">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-cyan-500 to-indigo-400" />
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl bg-cyan-400/20 text-cyan-400 flex items-center justify-center font-bold">
                <Users className="w-4 h-4" />
              </div>
              <div className="text-left">
                <h3 className="font-extrabold text-white text-base">2º Celular: Pais</h3>
                <p className="text-[11px] text-cyan-300/80">Leandro Solon • Maria Clara</p>
              </div>
            </div>

            {/* QR Code */}
            <div className="bg-white p-2.5 rounded-2xl shadow-lg my-2 border-2 border-cyan-400/40">
              {parentQr ? (
                <img src={parentQr} alt="QR Code Pais" className="w-44 h-44 object-contain rounded-lg" />
              ) : (
                <div className="w-44 h-44 flex items-center justify-center text-slate-400 text-xs">Gerando QR...</div>
              )}
            </div>
            <p className="text-xs text-slate-300 mt-2 font-medium">
              Aponte a câmera do celular para abrir
            </p>

            {/* Link e Botão Copiar */}
            <div className="w-full mt-3 flex items-center gap-2">
              <input
                readOnly
                value={parentUrl}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-[11px] text-slate-300 font-mono truncate"
              />
              <button
                onClick={() => handleCopy(parentUrl, 'PARENT')}
                className="px-3 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm"
              >
                {copiedRole === 'PARENT' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedRole === 'PARENT' ? 'Copiado!' : 'Copiar'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* ROTEIRO DE TESTES EM TEMPO REAL */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5 mb-6">
          <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-400" />
            Roteiro Sugerido de Teste Interativo
          </h4>
          <ol className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-300">
            <li className="flex items-start gap-2 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
              <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
              <div>
                <strong className="text-white">Iniciar Rota no Celular do Motorista:</strong> Clique em "Iniciar Rota". A telemetria GPS começará a emitir coordenadas pela Freguesia.
              </div>
            </li>
            <li className="flex items-start gap-2 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
              <span className="w-5 h-5 rounded-full bg-cyan-400 text-slate-950 font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
              <div>
                <strong className="text-white">Acompanhar ETA no Celular dos Pais:</strong> Veja o card de Tempo de Chegada (~4 min) e a van se movimentando no mapa privativo.
              </div>
            </li>
            <li className="flex items-start gap-2 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
              <span className="w-5 h-5 rounded-full bg-rose-400 text-slate-950 font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
              <div>
                <strong className="text-white">Avisar Ausência no Celular dos Pais:</strong> Clique em "Avisar Ausência" (ex: médico) e olhe o celular do motorista: a Maria Clara mudará para "Ausente" na hora!
              </div>
            </li>
            <li className="flex items-start gap-2 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
              <span className="w-5 h-5 rounded-full bg-emerald-400 text-slate-950 font-bold flex items-center justify-center shrink-0 text-[11px]">4</span>
              <div>
                <strong className="text-white">Embarque & Navegação Protegida:</strong> No motorista, clique em "Embarcou", "Waze" ou "Maps" para testar a navegação sem expor PII.
              </div>
            </li>
          </ol>
        </div>

        {/* RODAPÉ COM ATALHO DE 2 ABAS */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-800">
          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Zero-Cache e LGPD ativos em ambos os dispositivos.</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenDualTabs}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl flex items-center gap-2 transition-all border border-slate-700"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Sem celular agora? Abrir 2 Abas no PC</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold rounded-xl transition-all shadow-md"
            >
              Entendido!
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
