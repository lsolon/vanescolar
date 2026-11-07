/**
 * ============================================================================
 * COMPONENTE: TELA DO MOTORISTA (DriverPanel.tsx)
 * CONFORMIDADE ESTRITA COM LGPD E ARQUITETURA ZERO-CACHE
 * ============================================================================
 * 
 * Diário de Bordo digital de alta segurança veicular.
 * 
 * REQUISITOS DE PRIVACIDADE E SEGURANÇA (Art. 14 da LGPD):
 * 1. Zero-Cache (Dados Efêmeros): Os dados sensíveis dos menores trafegam sob
 *    demanda ou em blocos imediatos. Nada é mantido em cache persistente.
 * 2. Mascaramento Visual de PII: Endereços residenciais NUNCA aparecem por extenso
 *    na tela. Apenas iniciais dos alunos ("Maria C.") e endereços mascarados
 *    ("Rua F... - Próximo à Praça"). Coordenadas exatas acionam navegação externa
 *    (Waze / Google Maps) de forma protegida.
 * 3. Kill-Switch / Bloqueio de Emergência: Botão de revogação imediata de sessão
 *    caso o tablet seja perdido, furtado ou comprometido, expurgando toda a tela.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import {
  ParadaMotoristaSanitizada,
  ViagemMotoristaZeroCache,
  StatusEmbarque,
  GPSCoordinate
} from '../../types/database';
import { InstalarApp } from '../shared/InstalarApp';
import { Mensalidades } from './Mensalidades';
import { Financeiro } from './Financeiro';
import { Mensagens, useNaoLidasMotorista } from './Mensagens';
import { TransportRepository, subscribeToDatabaseChanges } from '../../services/api';
import { minutosAgoraBrasil, sentidoPorHorario } from '../../services/sentidoAuto';
import {
  Play,
  Square,
  Phone,
  MessageCircle,
  MapPin,
  Clock,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  GraduationCap,
  Sparkles,
  RefreshCw,
  Bus,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  EyeOff,
  Radio,
  FileCheck2,
  X,
  LogOut,
  KeyRound,
  UserPlus,
  Copy
} from 'lucide-react';
import { LiveMap } from '../shared/LiveMap';
import { SeletorLocal, LocalMarcado } from '../shared/SeletorLocal';
import { MeuIdAcesso } from '../shared/MeuIdAcesso';
import { CampoHora } from '../shared/CampoHora';
import { CodigoMotorista, SolicitacoesPendentes } from './CodigoESolicitacoes';
import { NovoAlunoMotorista, ConviteFamilia, ConvidarFamilias, ImportarAlunos } from './NovoAluno';
import { EscolasDoMotorista, HorariosPorEscola, RotasIdaVolta } from './RotaEEscolas';

interface DriverPanelProps {
  coordenadas: GPSCoordinate;
  isRotaAtiva: boolean;
  onToggleRota: (sentido?: 'IDA' | 'VOLTA') => void;
  onSelectAluno?: (alunoId: number) => void;
  onLogout?: () => void;
  erroGps?: 'permissao_negada' | 'indisponivel' | 'sem_suporte' | null;
}

/** Ainda falta (até 2 h) para o horário combinado de passagem: o motorista não deve chegar antes. */
const aguardarAte = (h?: string | null): boolean => {
  if (!h || h.length < 5) return false;
  const n = new Date();
  const falta = parseInt(h.slice(0, 2), 10) * 60 + parseInt(h.slice(3, 5), 10) - (n.getHours() * 60 + n.getMinutes());
  return falta > 0 && falta <= 120;
};

export const DriverPanel: React.FC<DriverPanelProps> = ({
  coordenadas,
  isRotaAtiva,
  onToggleRota,
  onLogout,
  erroGps
}) => {
  const [viagemZeroCache, setViagemZeroCache] = useState<ViagemMotoristaZeroCache | null>(null);
  const [aceitaDinamicos, setAceitaDinamicos] = useState<boolean>(false);
  const [fotoFalhou, setFotoFalhou] = useState<boolean>(false);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [processandoAcaoId, setProcessandoAcaoId] = useState<number | null>(null);
  const [reordenando, setReordenando] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState<string>('TODOS');
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);
  const [mostrarMapa, setMostrarMapa] = useState<boolean>(true);

  // Modo Zero-Cache: apenas a próxima parada imediata ou bloco da rota
  const [apenasProximaParada, setApenasProximaParada] = useState<boolean>(false);

  // Estados de Segurança / Kill-Switch
  const [dispositivoBloqueado, setDispositivoBloqueado] = useState<boolean>(false);
  const [motivoBloqueio, setMotivoBloqueio] = useState<string>('');
  const [modalKillSwitchAberto, setModalKillSwitchAberto] = useState<boolean>(false);
  const [modalDesbloqueioAberto, setModalDesbloqueioAberto] = useState<boolean>(false);
  const [pinDesbloqueio, setPinDesbloqueio] = useState<string>('');
  const [erroPin, setErroPin] = useState<string | null>(null);

  // Modal de Cadastro de Novo Aluno pelo Motorista
  const [aba, setAba] = useState<'diario' | 'mapa' | 'mensagens' | 'mensalidades' | 'financeiro' | 'ajustes'>('diario');
  const [sentidoRota, setSentidoRota] = useState<'IDA' | 'VOLTA'>('IDA');
  // Com a rota em andamento vale o sentido do servidor (sobrevive a recarregar a página); antes de iniciar, o escolhido no seletor.
  const sentidoServidor: 'IDA' | 'VOLTA' | null = isRotaAtiva ? (String((viagemZeroCache?.viagem as any)?.sentido) === 'VOLTA' ? 'VOLTA' : 'IDA') : null;
  useEffect(() => { if (sentidoServidor) setSentidoRota(sentidoServidor); }, [sentidoServidor]);
  // Antes de iniciar, o sentido é sugerido pelo horário da escola (entrada = ida, saída = volta). Escolher à mão desliga o automático até tocar em "Auto".
  const naoLidasMsgs = useNaoLidasMotorista();
  const [sentidoAuto, setSentidoAuto] = useState(true);
  const [agoraMin, setAgoraMin] = useState(() => minutosAgoraBrasil());
  useEffect(() => { const t = setInterval(() => setAgoraMin(minutosAgoraBrasil()), 60_000); return () => clearInterval(t); }, []);
  const alunosDoDia = (viagemZeroCache?.paradas || []).filter((p) => p.vinculo !== 'PENDENTE' && p.vinculo !== 'RECUSADO');
  const sentidoSugerido = sentidoPorHorario(alunosDoDia, agoraMin);
  useEffect(() => { if (sentidoAuto && !isRotaAtiva) setSentidoRota(sentidoSugerido); }, [sentidoAuto, isRotaAtiva, sentidoSugerido]);
  // Ajuste manual dos horários previstos de uma parada
  const [paradaHorarios, setParadaHorarios] = useState<{ id: number | string; nome: string } | null>(null);
  const [horaIdaEdit, setHoraIdaEdit] = useState('');
  const [horaVoltaEdit, setHoraVoltaEdit] = useState('');
  const [erroHorarios, setErroHorarios] = useState<string | null>(null);
  // Marcar o local de um aluno já cadastrado
  const [paradaMarcando, setParadaMarcando] = useState<{ id: number | string; nome: string } | null>(null);
  const [localMarcando, setLocalMarcando] = useState<LocalMarcado | null>(null);
  const [salvandoLocal, setSalvandoLocal] = useState(false);
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<boolean>(false);

  // Carrega dados sanitizados via Repository Pattern (Zero-Cache)
  const carregarDadosZeroCache = async () => {
    try {
      setCarregando(true);
      const dados = await TransportRepository.getViagemMotoristaZeroCache(undefined, {
        apenasProximaParada
      });
      setViagemZeroCache(dados);
      if (dados?.motorista) {
        setAceitaDinamicos(dados.motorista.aceita_enderecos_dinamicos ?? false);
      }
      setDispositivoBloqueado(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('DISPOSITIVO_BLOQUEADO')) {
        setDispositivoBloqueado(true);
        setViagemZeroCache(null); // Expurgar dados da memória imediatamente
      } else {
        console.error('Erro ao carregar dados do diário de bordo:', err);
      }
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarDadosZeroCache();

    // Sincronização em tempo real de alterações e alertas de segurança
    const unsubscribe = subscribeToDatabaseChanges((event, payload) => {
      if (event === 'database:reset' || event === 'DADOS_LIMPOS') {
        carregarDadosZeroCache();
        return;
      }

      if (event === 'seguranca:kill_switch_ativado' || event === 'KILL_SWITCH_ATIVADO') {
        const p = payload as { motivo?: string };
        setDispositivoBloqueado(true);
        setMotivoBloqueio(p?.motivo || 'Bloqueio de Emergência Ativado');
        setViagemZeroCache(null); // Purge de memória (Zero-Cache)
        return;
      }

      if (event === 'seguranca:dispositivo_restaurado' || event === 'DISPOSITIVO_DESBLOQUEADO') {
        setDispositivoBloqueado(false);
        carregarDadosZeroCache();
        return;
      }

      if (!dispositivoBloqueado) {
        TransportRepository.getViagemMotoristaZeroCache(undefined, { apenasProximaParada }).then((dados) => {
          setViagemZeroCache(dados);
        }).catch(() => {
          // Bloqueado
        });
      }

      if (event === 'aluno:ausencia_avisada' || event === 'AUSENCIA_NOTIFICADA') {
        setMensagemSucesso('Alerta LGPD: O responsável registrou ausência pelo aplicativo dos Pais.');
        setTimeout(() => setMensagemSucesso(null), 5000);
      }
    });

    return () => unsubscribe();
  }, [apenasProximaParada, dispositivoBloqueado]);

  // Atualização do status de embarque com botões táteis veiculares
  const handleAtualizarStatus = async (
    alunoId: number | string,
    novoStatus: StatusEmbarque,
    nomeAlunoSanitizado: string
  ) => {
    if (!viagemZeroCache) return;
    const numericId = Number(alunoId);
    setProcessandoAcaoId(numericId);
    try {
      await TransportRepository.updateStatusEmbarque(numericId, Number(viagemZeroCache.viagem.id), novoStatus);
      const atualizado = await TransportRepository.getViagemMotoristaZeroCache(undefined, { apenasProximaParada });
      setViagemZeroCache(atualizado);

      const statusMsg = novoStatus === 'EMBARCOU' ? 'embarcou na van' : (novoStatus === 'ENTREGUE' ? 'entregue na escola' : 'marcado como ausente');
      setMensagemSucesso(`${nomeAlunoSanitizado} ${statusMsg}!`);
      setTimeout(() => setMensagemSucesso(null), 3500);
    } catch (err) {
      console.error('Erro ao atualizar status:', err);
    } finally {
      setProcessandoAcaoId(null);
    }
  };

  const handleSalvarHorarios = async () => {
    if (!paradaHorarios) return;
    setErroHorarios(null);
    try {
      await TransportRepository.definirHorariosParada(paradaHorarios.id, {
        horaIda: horaIdaEdit || null,
        horaVolta: horaVoltaEdit || null
      });
      setParadaHorarios(null);
      await carregarDadosZeroCache();
      setMensagemSucesso('Horários salvos.');
    } catch (err: unknown) {
      setErroHorarios(err instanceof Error ? err.message : 'Não foi possível salvar.');
    }
  };

  const handleSalvarLocal = async () => {
    if (!paradaMarcando || !localMarcando) return;
    setSalvandoLocal(true);
    setErroLocal(null);
    try {
      await TransportRepository.definirLocalParada(paradaMarcando.id, localMarcando.latitude, localMarcando.longitude);
      setParadaMarcando(null);
      setLocalMarcando(null);
      await carregarDadosZeroCache();
      setMensagemSucesso('Local de embarque salvo.');
    } catch (err: unknown) {
      setErroLocal(err instanceof Error ? err.message : 'Não foi possível salvar o local.');
    } finally {
      setSalvandoLocal(false);
    }
  };

  // Acionamento do Kill-Switch remoto
  const handleConfirmarKillSwitch = async () => {
    try {
      const motivo = "Alerta manual do motorista: Dispositivo Comprometido / Suspeita de Acesso Não Autorizado";
      await TransportRepository.acionarKillSwitch(Number(viagemZeroCache?.motorista?.id || 1), motivo);
      setModalKillSwitchAberto(false);
      setDispositivoBloqueado(true);
      setMotivoBloqueio(motivo);
      setViagemZeroCache(null); // Expurgar dados locais imediatamente (Zero-Cache)
    } catch (err) {
      console.error('Erro ao acionar Kill-Switch:', err);
    }
  };

  // Desbloqueio e recuperação com PIN mestre
  const handleDesbloquearDispositivo = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroPin(null);
    try {
      await TransportRepository.desbloquearDispositivo(1, pinDesbloqueio);
      setModalDesbloqueioAberto(false);
      setPinDesbloqueio('');
      setDispositivoBloqueado(false);
      carregarDadosZeroCache();
      setMensagemSucesso('Sessão restaurada com sucesso!');
      setTimeout(() => setMensagemSucesso(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao desbloquear';
      setErroPin(msg);
    }
  };

  // ==========================================================================
  // TELA 1: ESTADO DE BLOQUEIO DE EMERGÊNCIA (KILL-SWITCH ATIVO)
  // ==========================================================================
  if (dispositivoBloqueado) {
    return (
      <div className="flex flex-col h-full bg-slate-950 text-slate-100 font-sans p-6 items-center justify-center text-center space-y-5 animate-fadeIn">
        <div className="w-20 h-20 rounded-3xl bg-rose-500/10 border-2 border-rose-500/40 flex items-center justify-center text-rose-500 shadow-2xl shadow-rose-950/60 animate-pulse">
          <ShieldAlert className="w-10 h-10" />
        </div>

        <div className="space-y-2 max-w-sm">
          <span className="px-3 py-1 rounded-full text-[10px] font-mono font-bold tracking-widest bg-rose-500/20 text-rose-300 border border-rose-500/30 uppercase">
            KILL-SWITCH ATIVADO • PROTOCOLO LGPD
          </span>
          <h2 className="text-lg font-black text-slate-100 leading-tight">
            Dispositivo Bloqueado Remotamente
          </h2>
          <p className="text-xs text-rose-300/90 leading-relaxed">
            {motivoBloqueio || "Acesso revogado por política de segurança da informação e proteção a dados de menores."}
          </p>
        </div>

        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl max-w-xs w-full text-left space-y-2 text-xs">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-[11px]">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Memória do dispositivo expurgada</span>
          </div>
          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-[11px]">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Zero-Cache: Nenhum PII residente</span>
          </div>
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-[11px]">
            <Lock className="w-4 h-4 shrink-0" />
            <span>Tokens de sessão revogados</span>
          </div>
        </div>

        <button
          onClick={() => setModalDesbloqueioAberto(true)}
          className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-all flex items-center gap-2"
        >
          <Unlock className="w-4 h-4 text-amber-400" />
          <span>Restaurar com PIN de Supervisor</span>
        </button>

        {/* Modal de Desbloqueio com PIN */}
        {modalDesbloqueioAberto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl text-left max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-400" />
                  <span>Desbloqueio com PIN</span>
                </h3>
                <button
                  onClick={() => setModalDesbloqueioAberto(false)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleDesbloquearDispositivo} className="space-y-3">
                <p className="text-xs text-slate-400">
                  Insira o PIN mestre do supervisor para restabelecer a sessão do motorista (PIN demo: <strong className="text-amber-400 font-mono">9988</strong>):
                </p>

                <input
                  type="password"
                  maxLength={6}
                  autoFocus
                  placeholder="PIN Mestre (9988)"
                  value={pinDesbloqueio}
                  onChange={(e) => setPinDesbloqueio(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-center text-lg font-mono text-slate-100 tracking-widest focus:outline-none focus:border-amber-400"
                />

                {erroPin && (
                  <p className="text-xs text-rose-400 font-medium">{erroPin}</p>
                )}

                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalDesbloqueioAberto(false)}
                    className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
                  >
                    Voltar
                  </button>
                  <button
                    type="submit"
                    className="py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold"
                  >
                    Desbloquear
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================================================
  // TELA 2: OPERAÇÃO NORMAL COM ZERO-CACHE & MASCARAMENTO VISUAL
  // ==========================================================================
  const todasParadas = viagemZeroCache?.paradas || [];
  const pendentes = todasParadas.filter((p) => p.vinculo === 'PENDENTE');
  const paradas = todasParadas.filter((p) => p.vinculo !== 'PENDENTE' && p.vinculo !== 'RECUSADO');
  const motorista = viagemZeroCache?.motorista;
  const totalAlunos = paradas.length;
  const embarcados = paradas.filter((p) => p.status_embarque === 'EMBARCOU').length;
  const entregues = paradas.filter((p) => p.status_embarque === 'ENTREGUE').length;
  const ausentes = paradas.filter((p) => p.status_embarque === 'AUSENTE').length;
  /** Rota em andamento e ninguém mais pendente nem a bordo: sugere encerrar (o motorista confirma). */
  const rotaTodaConcluida = totalAlunos > 0 && paradas.every((p) => p.status_embarque === 'ENTREGUE' || p.status_embarque === 'AUSENTE');

  const ordemDoSentido = (p: any): number => (sentidoRota === 'VOLTA' ? (p.ordem_volta ?? p.ordem_sequencia) : (p.ordem_ida ?? p.ordem_sequencia)) ?? 0;
  const paradasNaOrdem = [...paradas].sort((a, b) => ordemDoSentido(a) - ordemDoSentido(b));
  /** Troca o aluno de lugar com o próximo pendente na direção pedida e salva: vale nas próximas viagens deste sentido até nova mudança. */
  const moverNoDiario = async (item: any, d: -1 | 1) => {
    const i = paradasNaOrdem.findIndex((x) => x.parada_id === item.parada_id);
    let j = i + d;
    while (j >= 0 && j < paradasNaOrdem.length && paradasNaOrdem[j].status_embarque !== 'PENDENTE') j += d;
    if (i < 0 || j < 0 || j >= paradasNaOrdem.length) return;
    const nova = [...paradasNaOrdem];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    setReordenando(true);
    try {
      await TransportRepository.aplicarOrdemRota(nova.map((x) => Number(x.parada_id)), sentidoRota);
      await carregarDadosZeroCache();
      setMensagemSucesso(`Ordem da ${sentidoRota === 'VOLTA' ? 'volta' : 'ida'} salva para as próximas viagens.`);
      setTimeout(() => setMensagemSucesso(null), 3500);
    } catch (e) {
      setMensagemSucesso(e instanceof Error ? e.message : 'Não foi possível salvar a ordem.');
      setTimeout(() => setMensagemSucesso(null), 4500);
    } finally { setReordenando(false); }
  };
  const paradasFiltradas = paradasNaOrdem.filter((p) => {
    if (filtroStatus === 'TODOS') return true;
    if (filtroStatus === 'PENDENTES') return p.status_embarque === 'PENDENTE';
    if (filtroStatus === 'A_BORDO') return p.status_embarque === 'EMBARCOU';
    if (filtroStatus === 'CONCLUIDOS') return p.status_embarque === 'ENTREGUE' || p.status_embarque === 'AUSENTE';
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 font-sans">
      {/* CABEÇALHO DO MOTORISTA COM INDICADORES DE SEGURANÇA */}
      <header className="bg-slate-900 border-b border-slate-800 p-4 sticky top-0 z-30 shadow-md">
        {/* Barra Superior: Selo Zero-Cache e Botão de Kill-Switch */}
        <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-800/80 text-[11px]">
          <div className="flex items-center gap-1.5 text-emerald-400 font-semibold bg-emerald-950/60 border border-emerald-500/30 px-2.5 py-1 rounded-lg">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Zero-Cache LGPD Ativo</span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* BOTÃO 2FA / TOTP */}
            <button
              onClick={async () => {
                try {
                  const current = viagemZeroCache?.motorista;
                  const res = await TransportRepository.toggleTotp(!current?.totp_enabled);
                  setMensagemSucesso(res.message || 'Configuração 2FA atualizada!');
                  setTimeout(() => setMensagemSucesso(null), 3000);
                  carregarDadosZeroCache();
                } catch {
                  setMensagemSucesso('Erro ao atualizar 2FA');
                  setTimeout(() => setMensagemSucesso(null), 3000);
                }
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-[11px] font-bold transition-all cursor-pointer"
              title="Ativar ou desativar verificação em 2 etapas (TOTP)"
            >
              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
              <span>{viagemZeroCache?.motorista?.totp_enabled ? '2FA: Ativo' : '2FA: Ativar'}</span>
            </button>

            {/* BOTÃO CRÍTICO: KILL-SWITCH REMOTO / DISPOSITIVO COMPROMETIDO */}
            <button
              onClick={() => setModalKillSwitchAberto(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 text-[11px] font-bold transition-all active:scale-95 shadow-sm cursor-pointer"
              title="Acionar bloqueio imediato caso o dispositivo seja perdido ou comprometido"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
              <span>Kill-Switch</span>
            </button>

            {/* BOTÃO SAIR / LOGOUT */}
            {onLogout && (
              <button
                onClick={async () => {
                  await TransportRepository.logout();
                  onLogout();
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-bold transition-all active:scale-95 cursor-pointer"
                title="Sair do painel e voltar ao Portal"
              >
                <LogOut className="w-3.5 h-3.5 text-slate-400" />
                <span>Sair</span>
              </button>
            )}
          </div>
        </div>

        {/* Linha do Motorista: Foto, Placa e Botão de Rota */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              {motorista?.foto_url && !fotoFalhou ? (
                <img
                  src={motorista.foto_url}
                  alt={motorista?.nome || "Motorista"}
                  onError={() => setFotoFalhou(true)}
                  className="w-12 h-12 rounded-xl object-cover ring-2 ring-amber-400 shadow-md"
                />
              ) : (
                <div
                  aria-label={motorista?.nome || "Motorista"}
                  className="w-12 h-12 rounded-xl ring-2 ring-amber-400 shadow-md bg-slate-800 text-amber-300 font-black text-base flex items-center justify-center"
                >
                  {(motorista?.nome || 'M').trim().split(/\s+/).slice(0, 2).map((p: string) => p[0]?.toUpperCase()).join('')}
                </div>
              )}
              <span className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-900 ${isRotaAtiva ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-100 leading-tight">
                  {motorista?.nome || "Motorista"}
                </h1>
                <span className="bg-amber-400/10 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-400/20">
                  MOTORISTA
                </span>
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                <Bus className="w-3.5 h-3.5 text-amber-400" />
                <span>{motorista?.veiculo_modelo || "Van Escolar"}</span>
                <span className="text-slate-600">•</span>
                <span className="font-mono font-semibold text-slate-300 bg-slate-800 px-1 rounded text-[11px]">
                  {motorista?.veiculo_placa || "RIO-2026"}
                </span>
              </p>
            </div>
          </div>

          {/* BOTÃO PRINCIPAL: INICIAR / ENCERRAR ROTA */}
          <div className="flex items-center gap-2 ml-auto">
          {!isRotaAtiva && (
            <div role="group" aria-label="Sentido da viagem" className="flex rounded-xl overflow-hidden border border-slate-700 text-[11px] font-bold shrink-0">
              <button
                type="button"
                aria-pressed={sentidoAuto}
                title="Escolhe Ida ou Volta pelo horário de entrada e saída da escola"
                onClick={() => { setSentidoAuto(true); setSentidoRota(sentidoSugerido); }}
                className={`px-2.5 py-2 min-h-[40px] cursor-pointer border-r border-slate-700 ${sentidoAuto ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-900 text-slate-500'}`}
              >
                Auto
              </button>
              {(['IDA', 'VOLTA'] as const).map((sv) => (
                <button
                  key={sv}
                  type="button"
                  aria-pressed={sentidoRota === sv}
                  onClick={() => { setSentidoAuto(false); setSentidoRota(sv); }}
                  className={`px-2.5 py-2 min-h-[40px] cursor-pointer ${sentidoRota === sv ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-900 text-slate-400'}`}
                >
                  {sv === 'IDA' ? 'Ida' : 'Volta'}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => onToggleRota(sentidoRota)}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-lg active:scale-95 ${
              isRotaAtiva
                ? 'bg-rose-600 hover:bg-rose-500 text-white ring-2 ring-rose-400/50 shadow-rose-950/50'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white ring-2 ring-emerald-400/50 shadow-emerald-950/50'
            }`}
          >
            {isRotaAtiva ? (
              <>
                <Square className="w-4 h-4 fill-white" />
                <span>Encerrar</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white animate-pulse" />
                <span>Iniciar Rota</span>
              </>
            )}
          </button>
          </div>
        </div>

        {isRotaAtiva && rotaTodaConcluida && (
          <div className="mt-3 p-3 bg-amber-950/70 border border-amber-500/40 rounded-xl text-xs text-amber-100 flex items-center justify-between gap-3 animate-fadeIn" role="status">
            <span className="font-medium">
              {sentidoRota === 'IDA' ? 'Todos os alunos foram entregues na escola.' : 'Todos os alunos foram deixados em casa.'} Encerrar a rota?
            </span>
            <button
              type="button"
              onClick={() => onToggleRota(sentidoRota)}
              className="shrink-0 px-3 py-2 min-h-[40px] rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold uppercase tracking-wider cursor-pointer"
            >
              Encerrar rota
            </button>
          </div>
        )}

        {/* ALERTA DE SUCESSO / NOTIFICAÇÃO DOS PAIS */}
        {mensagemSucesso && (
          <div className="mt-3 p-2.5 bg-emerald-950/80 border border-emerald-500/40 rounded-xl text-xs text-emerald-200 flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-medium">{mensagemSucesso}</span>
          </div>
        )}

        {/* MÉTRICAS OPERACIONAIS */}
        <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-slate-800/80">
          <div className="bg-slate-950/70 p-2 rounded-xl border border-slate-800 text-center">
            <span className="text-[10px] text-slate-400 block font-medium">Total</span>
            <span className="text-base font-extrabold text-slate-100">{totalAlunos}</span>
          </div>
          <div className="bg-slate-950/70 p-2 rounded-xl border border-slate-800 text-center">
            <span className="text-[10px] text-emerald-400 block font-medium">A Bordo</span>
            <span className="text-base font-extrabold text-emerald-400">{embarcados}</span>
          </div>
          <div className="bg-slate-950/70 p-2 rounded-xl border border-slate-800 text-center">
            <span className="text-[10px] text-indigo-400 block font-medium">Entregues</span>
            <span className="text-base font-extrabold text-indigo-400">{entregues}</span>
          </div>
          <div className="bg-slate-950/70 p-2 rounded-xl border border-slate-800 text-center">
            <span className="text-[10px] text-rose-400 block font-medium">Ausentes</span>
            <span className="text-base font-extrabold text-rose-400">{ausentes}</span>
          </div>
        </div>
      </header>

      {/* CONTEÚDO PRINCIPAL COM ZERO-CACHE */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {erroGps && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
            {erroGps === 'permissao_negada'
              ? 'O GPS está bloqueado. Permita a localização deste site nas configurações do navegador para que os pais acompanhem a van.'
              : erroGps === 'sem_suporte'
              ? 'Este navegador não oferece GPS. Abra o app no Chrome ou Safari do celular.'
              : 'Não foi possível obter sua localização agora. Verifique se o GPS do celular está ligado.'}
          </div>
        )}

        {/* NAVEGAÇÃO: a home é o Diário de Bordo; o resto fica a um toque */}
        <nav aria-label="Seções do painel" role="tablist" className="flex gap-2 overflow-x-auto pb-1">
          {([['diario', 'Diário de Bordo'], ['mapa', 'Mapa'], ['mensagens', 'Mensagens'], ['mensalidades', 'Mensalidades'], ['financeiro', 'Financeiro'], ['ajustes', 'Rotas e ajustes']] as const).map(([k, nome]) => (
            <button key={k} type="button" role="tab" aria-selected={aba === k} onClick={() => setAba(k)}
              className={`relative shrink-0 px-3 py-2 min-h-[44px] rounded-xl border text-[11px] font-black cursor-pointer whitespace-nowrap ${aba === k ? 'bg-amber-400/15 text-amber-200 border-amber-400/50' : 'bg-slate-900 text-slate-400 border-slate-800'}`}>
              {nome}
              {k === 'mensagens' && naoLidasMsgs > 0 && <span aria-label={`${naoLidasMsgs} mensagens não lidas`} className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-cyan-500 text-slate-950 text-[10px] font-black flex items-center justify-center">{naoLidasMsgs}</span>}
              {k === 'diario' && pendentes.length > 0 && <span aria-label={`${pendentes.length} solicitações pendentes`} className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center">{pendentes.length}</span>}
            </button>
          ))}
        </nav>

        {aba === 'diario' && (
          <>
        <ConvidarFamilias nomeMotorista={motorista?.nome} />
        <NovoAlunoMotorista onCriado={carregarDadosZeroCache} />
        <ImportarAlunos onCriados={carregarDadosZeroCache} />
        <SolicitacoesPendentes pendentes={pendentes} totalNaVan={paradas.length} onMudou={carregarDadosZeroCache} />
        {/* DIÁRIO DE BORDO COM MASCARAMENTO VISUAL RIGOROSO */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-200 tracking-wide flex items-center gap-2">
                <span>Diário de Bordo da Rota</span>
                <span className="text-xs font-normal text-slate-400">({paradasFiltradas.length} paradas)</span>
              </h2>
              <p
                data-testid="sentido-diario"
                className={`mt-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-black ${sentidoRota === 'VOLTA' ? 'bg-amber-500/15 text-amber-200 border-amber-400/50' : 'bg-cyan-500/15 text-cyan-200 border-cyan-400/50'}`}
              >
                {sentidoRota === 'VOLTA' ? '↩ VOLTA · escola → casa' : '➜ IDA · casa → escola'}
                <span className="font-semibold opacity-80">{isRotaAtiva ? '· em andamento' : '· rota não iniciada'}</span>
              </p>
              <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                <EyeOff className="w-3 h-3 text-cyan-400" />
                <span>Endereços completos mascarados (LGPD Menores)</span>
              </span>
            </div>

            {/* Ações do Diário de Bordo: Toggle Endereços Dinâmicos, Botão Novo Aluno e Alternador Zero-Cache */}
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              {/* TOGGLE SWITCH: Aceitar Endereços Dinâmicos (Regra de Ouro - Controle do Motorista) */}
              <button
                onClick={async () => {
                  try {
                    const novoVal = !aceitaDinamicos;
                    setAceitaDinamicos(novoVal);
                    await TransportRepository.toggleEnderecosDinamicos(viagemZeroCache?.motorista?.id || 1, novoVal);
                    setMensagemSucesso(`Endereços dinâmicos ${novoVal ? 'ativados' : 'desativados'} para sua van.`);
                    setTimeout(() => setMensagemSucesso(null), 3500);
                    carregarDadosZeroCache();
                  } catch {
                    setMensagemSucesso('Erro ao alterar permissão de endereços dinâmicos.');
                    setTimeout(() => setMensagemSucesso(null), 3000);
                  }
                }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  aceitaDinamicos
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-sm shadow-emerald-950/50'
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
                title="Ligar/Desligar permissão para que pais configurem endereços diferentes por dia da semana"
              >
                <span className={`w-3 h-3 rounded-full transition-all ${aceitaDinamicos ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                <span>End. Dinâmicos: {aceitaDinamicos ? 'LIGADO' : 'DESLIGADO'}</span>
              </button>


              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-[11px]">
                <button
                  onClick={() => setApenasProximaParada(false)}
                  className={`px-2 py-0.5 rounded-lg font-medium transition-all ${!apenasProximaParada ? 'bg-amber-400 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Bloco Rota
                </button>
                <button
                  onClick={() => setApenasProximaParada(true)}
                  className={`px-2 py-0.5 rounded-lg font-medium transition-all ${apenasProximaParada ? 'bg-cyan-400 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                  title="Zero-Cache: Exibe estritamente a próxima parada pendente"
                >
                  1x1
                </button>
              </div>
            </div>
          </div>

          {carregando && (
            <div className="text-center py-10 text-slate-400 flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
              <span className="text-xs">Sincronizando dados efêmeros da rota...</span>
            </div>
          )}

          {/* ESTADO VAZIO: NENHUM ALUNO NA VAN */}
          {!carregando && paradasFiltradas.length === 0 && (
            <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-8 text-center space-y-4 shadow-lg animate-fadeIn">
              <div className="w-14 h-14 rounded-2xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center mx-auto text-amber-400">
                <GraduationCap className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-slate-100">Van Vazia (0 Passageiros)</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                  Você ainda não tem alunos na van. Passe o seu código (no cartão acima) aos responsáveis: eles cadastram os filhos e você confirma o lugar de cada um.
                </p>
              </div>
            </div>
          )}

          {/* CARDS DOS ALUNOS COM DADOS SENSÍVEIS MASCARADOS */}
          {!carregando && paradasFiltradas.map((item) => {
            const isMariaClara = item.aluno_id === 201;
            const isBusy = processandoAcaoId === item.aluno_id;

            return (
              <div
                key={item.parada_id}
                className={`bg-slate-900 rounded-2xl border p-4 transition-all shadow-md ${
                  isMariaClara ? 'border-amber-500/50 ring-1 ring-amber-500/30' : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Linha 1: Foto, Nome Sanitizado e Ponto de Referência Genérico */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-base text-amber-400">
                        {item.nome_aluno_sanitizado.slice(0, 2)}
                      </div>
                      <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-bold text-amber-400 flex items-center justify-center">
                        #{ordemDoSentido(item)}
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        {/* Nome mascarado: "Maria C." */}
                        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                          <span>{item.nome_aluno_sanitizado}</span>
                          <span className="text-[10px] font-normal text-slate-500 font-mono">
                            (ID: {item.aluno_id})
                          </span>
                        </h3>
                        {isMariaClara && (
                          <span className="bg-amber-400/20 text-amber-300 text-[9px] font-bold px-1.5 py-0.5 rounded border border-amber-400/30">
                            TESTE LGPD
                          </span>
                        )}
                      </div>

                      {/* ENDEREÇO MASCARADO (LGPD) */}
                      <div className="mt-1 space-y-0.5">
                        <p className="text-xs font-semibold text-cyan-300 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-cyan-400 shrink-0" />
                          <span className="font-mono">
                            {item.endereco_mascarado ? item.endereco_mascarado.replace(/\d+/g, '').replace(/(\.\.\.)\./g, '$1') : 'Endereço Restrito (LGPD)'}
                          </span>
                        </p>
                        {item.ponto_referencia_generico && (
                          <p className="text-[11px] text-slate-400">
                            Ref: <strong className="text-slate-300">{item.ponto_referencia_generico}</strong>
                          </p>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-400 mt-1">
                        Contato Responsável: <span className="font-mono text-slate-300">{item.responsavel_contato_mascarado || 'não informado'}</span>
                      </p>
                    </div>
                  </div>

                  {/* Badge de Status Atual */}
                  <div>
                    {item.status_embarque === 'PENDENTE' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                        <Clock className="w-3 h-3" /> Pendente
                      </span>
                    )}
                    {item.status_embarque === 'EMBARCOU' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <UserCheck className="w-3 h-3" /> A Bordo ({item.hora_embarque})
                      </span>
                    )}
                    {item.status_embarque === 'ENTREGUE' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                        <GraduationCap className="w-3 h-3" /> Entregue ({item.hora_desembarque})
                      </span>
                    )}
                    {item.status_embarque === 'AUSENTE' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                        <AlertTriangle className="w-3 h-3" /> Ausente
                      </span>
                    )}
                    {filtroStatus === 'TODOS' && item.status_embarque === 'PENDENTE' && (
                      <div role="group" aria-label={`Mudar a posição de ${item.nome_aluno_sanitizado} na ${sentidoRota === 'VOLTA' ? 'volta' : 'ida'}`} className="mt-2 flex justify-end gap-1.5">
                        <button type="button" aria-label={`Subir ${item.nome_aluno_sanitizado}`} disabled={reordenando || !!processandoAcaoId} onClick={() => moverNoDiario(item, -1)} className="w-10 h-10 rounded-lg bg-slate-800 text-slate-200 text-sm cursor-pointer disabled:opacity-30">▲</button>
                        <button type="button" aria-label={`Descer ${item.nome_aluno_sanitizado}`} disabled={reordenando || !!processandoAcaoId} onClick={() => moverNoDiario(item, 1)} className="w-10 h-10 rounded-lg bg-slate-800 text-slate-200 text-sm cursor-pointer disabled:opacity-30">▼</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Motivo de Ausência informado pelos pais, se houver */}
                {item.status_embarque === 'AUSENTE' && item.motivo_ausencia && (
                  <div className="mt-2.5 p-2 bg-rose-950/40 border border-rose-500/20 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span><strong>Aviso da família:</strong> {item.motivo_ausencia}</span>
                  </div>
                )}

                {/* HORÁRIOS PREVISTOS (ida/volta) e horário da escola informado pelo responsável */}
                <div className="mt-3 p-2 bg-slate-950/60 rounded-xl border border-slate-800 flex items-center justify-between gap-2 text-[11px]">
                  <div className="text-slate-300 leading-relaxed">
                    <div>Ida <strong className="font-mono text-slate-100">{item.hora_ida || '--:--'}</strong> · Volta <strong className="font-mono text-slate-100">{item.hora_volta || '--:--'}</strong></div>
                    <div className="text-slate-500">
                      {item.escola_entrada && item.escola_saida
                        ? `Escola: entra ${item.escola_entrada}, sai ${item.escola_saida}${item.horario_da_escola ? ' (definido por você)' : ''}`
                        : item.turno ? 'Defina os horários dessa escola e turno em Ajustes' : 'Escolha o turno do aluno'}
                    </div>
                    <div className="flex items-center gap-1 mt-1" role="group" aria-label={`Turno de ${item.nome_aluno_sanitizado}`}>
                      {(['MANHA', 'TARDE'] as const).map((t) => (
                        <button key={t} type="button" aria-pressed={item.turno === t}
                          onClick={async () => { try { await TransportRepository.definirTurnoDoAluno(item.parada_id, t); await carregarDadosZeroCache(); } catch (e) { console.error(e); } }}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold min-h-[36px] cursor-pointer border ${item.turno === t ? 'bg-amber-400/20 border-amber-400 text-amber-200' : 'bg-slate-900 border-slate-700 text-slate-300'}`}>
                          {t === 'MANHA' ? 'Manhã' : 'Tarde'}
                        </button>
                      ))}
                    </div>
                    <div className="mt-1"><ConviteFamilia paradaId={item.parada_id} /></div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setErroHorarios(null); setHoraIdaEdit(item.hora_ida || ''); setHoraVoltaEdit(item.hora_volta || ''); setParadaHorarios({ id: item.parada_id, nome: item.nome_aluno_sanitizado }); }}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold min-h-[36px] cursor-pointer shrink-0"
                  >
                    Ajustar
                  </button>
                </div>

                {/* Navegação externa (Waze/Maps) oculta no Diário. Só aparece o aviso quando falta o ponto de embarque. */}
                {item.tem_localizacao === false && (
                  <button
                    type="button"
                    onClick={() => { setLocalMarcando(null); setErroLocal(null); setParadaMarcando({ id: item.parada_id, nome: item.nome_aluno_sanitizado }); }}
                    className="mt-3 w-full px-2.5 py-1.5 rounded-lg bg-amber-400/10 hover:bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[11px] font-bold cursor-pointer min-h-[36px]"
                  >
                    Marcar local de embarque
                  </button>
                )}

                {/* BOTÕES DE AÇÃO GRANDES E RESPONSIVOS (EMBARCOU / ENTREGUE / AUSENTE) */}
                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-800">
                  <button
                    disabled={isBusy}
                    onClick={() => handleAtualizarStatus(item.aluno_id, 'EMBARCOU', item.nome_aluno_sanitizado)}
                    className={`py-3 px-2 rounded-xl font-bold text-xs flex flex-col items-center justify-center gap-1 transition-all active:scale-95 ${
                      item.status_embarque === 'EMBARCOU'
                        ? 'bg-emerald-600 text-white ring-2 ring-emerald-400 shadow-md shadow-emerald-950/60'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/80'
                    }`}
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>Embarcou</span>
                  </button>

                  <button
                    disabled={isBusy}
                    onClick={() => handleAtualizarStatus(item.aluno_id, 'ENTREGUE', item.nome_aluno_sanitizado)}
                    className={`py-3 px-2 rounded-xl font-bold text-xs flex flex-col items-center justify-center gap-1 transition-all active:scale-95 ${
                      item.status_embarque === 'ENTREGUE'
                        ? 'bg-indigo-600 text-white ring-2 ring-indigo-400 shadow-md shadow-indigo-950/60'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/80'
                    }`}
                  >
                    <GraduationCap className="w-4 h-4" />
                    <span>Entregue</span>
                  </button>

                  <button
                    disabled={isBusy}
                    onClick={() => handleAtualizarStatus(item.aluno_id, 'AUSENTE', item.nome_aluno_sanitizado)}
                    className={`py-3 px-2 rounded-xl font-bold text-xs flex flex-col items-center justify-center gap-1 transition-all active:scale-95 ${
                      item.status_embarque === 'AUSENTE'
                        ? 'bg-rose-600 text-white ring-2 ring-rose-400 shadow-md shadow-rose-950/60'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/80'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4" />
                    <span>Ausente</span>
                  </button>
                </div>

                {/* Previsão e Contato Seguro */}
                <div className="flex items-center justify-between mt-2.5 pt-2 text-xs text-slate-400">
                  <span className="text-[11px] text-slate-400">
                    Previsão de embarque: <strong className="text-slate-300 font-mono">{item.hora_prevista}</strong>
                    {isRotaAtiva && sentidoRota === 'IDA' && item.status_embarque === 'PENDENTE' && aguardarAte(item.hora_ida) && (
                      <span className="ml-2 text-amber-300 font-bold">Aguardar até {item.hora_ida}</span>
                    )}
                  </span>

                  <div className="flex items-center gap-2">
                    <a
                      href={`tel:${item.telefone_para_chamada.replace(/\D/g, '')}`}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 transition-colors"
                      title="Ligar para o responsável"
                    >
                      <Phone className="w-3.5 h-3.5" />
                    </a>
                    <a
                      href={`https://wa.me/55${item.telefone_para_chamada.replace(/\D/g, '')}?text=Ol%C3%A1,%20aqui%20%C3%A9%20${encodeURIComponent(motorista?.nome || 'o motorista')}%20do%20transporte%20escolar.`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 transition-colors"
                      title="WhatsApp com o responsável"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
          </>
        )}

        {aba === 'mapa' && (
          <>
        {/* MAPA REBATÍVEL */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400 px-1">
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-amber-400" />
              Trajeto Freguesia (Jacarepaguá, RJ)
            </span>
            <button
              onClick={() => setMostrarMapa(!mostrarMapa)}
              className="text-amber-400 hover:underline"
            >
              {mostrarMapa ? 'Ocultar Mapa' : 'Expandir Mapa'}
            </button>
          </div>

          {mostrarMapa && (
            <LiveMap
              coordenadas={coordenadas}
              isRotaAtiva={isRotaAtiva}
              compact={true}
              motoristaNome={motorista?.nome}
            />
          )}
        </div>

          </>
        )}

        {aba === 'mensagens' && <Mensagens />}

        {aba === 'mensalidades' && <Mensalidades />}

        {aba === 'financeiro' && <Financeiro />}

        {aba === 'ajustes' && (
          <>
        <InstalarApp />
        <CodigoMotorista nome={motorista?.nome} />
        <HorariosPorEscola versao={paradas.length} onMudou={carregarDadosZeroCache} />
        <EscolasDoMotorista versao={paradas.length} />
        <RotasIdaVolta sentidoAtivo={sentidoRota} versao={paradas.length} onAplicado={carregarDadosZeroCache} />
        <MeuIdAcesso />

          </>
        )}
      </main>

      {/* MODAL DE CONFIRMAÇÃO DO KILL-SWITCH REMOTO */}
      {modalKillSwitchAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border-2 border-rose-500/50 rounded-3xl max-w-sm w-full p-5 shadow-2xl space-y-4 max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 rounded-2xl bg-rose-500/20 border border-rose-500/30">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">Confirmar Kill-Switch?</h3>
                <p className="text-[11px] text-rose-300">Protocolo de Emergência LGPD</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Esta ação <strong>revoga imediatamente a sessão do motorista</strong> e realiza o <strong>expurgo completo (wipe)</strong> de todos os dados de passageiros e coordenadas da memória deste dispositivo.
            </p>

            <div className="p-3 bg-slate-950 rounded-xl border border-rose-500/30 text-[11px] text-slate-400 space-y-1">
              <p>• Dispositivo marcado como comprometido</p>
              <p>• Dados de menores expurgados imediatamente</p>
              <p>• Restauração requer PIN mestre do supervisor</p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => setModalKillSwitchAberto(false)}
                className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmarKillSwitch}
                className="py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-950"
              >
                Ativar Kill-Switch
              </button>
            </div>
          </div>
        </div>
      )}

      {paradaHorarios && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-end sm:items-center justify-center p-3" role="dialog" aria-modal="true">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain">
            <h3 className="text-sm font-bold text-slate-100">Ajustar horários — {paradaHorarios.nome}</h3>
            <p className="text-[11px] text-slate-400">Os horários são calculados pela escola do aluno. Se mudar aqui, o seu valor passa a valer. Deixe vazio para voltar ao cálculo automático.</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">Horário de ida</label>
                <CampoHora label="Horário de ida" value={horaIdaEdit} onChange={setHoraIdaEdit} />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">Horário de volta</label>
                <CampoHora label="Horário de volta" value={horaVoltaEdit} onChange={setHoraVoltaEdit} horaPadrao="12" />
              </div>
            </div>
            {erroHorarios && <p role="alert" className="text-[11px] text-rose-300">{erroHorarios}</p>}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setParadaHorarios(null)} className="py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer">Cancelar</button>
              <button type="button" onClick={handleSalvarHorarios} className="py-2.5 rounded-xl bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {paradaMarcando && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-end sm:items-center justify-center p-3" role="dialog" aria-modal="true">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain">
            <h3 className="text-sm font-bold text-slate-100">Marcar local de embarque — {paradaMarcando.nome}</h3>
            <SeletorLocal valor={localMarcando} onChange={setLocalMarcando} />
            {erroLocal && <p role="alert" className="text-[11px] text-rose-300">{erroLocal}</p>}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setParadaMarcando(null)} className="py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer">Cancelar</button>
              <button type="button" onClick={handleSalvarLocal} disabled={!localMarcando || salvandoLocal} className="py-2.5 rounded-xl bg-amber-400 text-slate-950 text-xs font-bold disabled:opacity-50 cursor-pointer">
                {salvandoLocal ? 'Salvando…' : 'Salvar local'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
