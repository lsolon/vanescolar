/**
 * ============================================================================
 * COMPONENTE: APLICATIVO DOS PAIS (ParentApp.tsx)
 * ============================================================================
 * 
 * Interface para os pais acompanharem o transporte escolar em tempo real.
 * Mostra o aluno vinculado ao responsável logado (modo ?demo=true usa um aluno de exemplo).
 * 
 * DESTAQUES:
 * - Mapa e telemetria GPS da van ao vivo pelo bairro Freguesia (Jacarepaguá, RJ).
 * - Card de status em tempo real com indicador de segurança.
 * - Botão de acionamento rápido: "Avisar Ausência", que atualiza instantaneamente
 *   o Diário de Bordo do Motorista de forma reativa.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import {
  Aluno,
  Responsavel,
  Motorista,
  ViagemDiario,
  ParadaViagem,
  GPSCoordinate
} from '../../types/database';
import { TransportRepository, subscribeToDatabaseChanges } from '../../services/api';
import type { ProximidadeVan, PrefsProximidade, FilhoResumo } from '../../services/api';
import { isDemoMode } from '../../services/demo';
import { ProximidadeBar } from '../shared/ProximidadeBar';
import { RealMap } from '../shared/RealMap';
import { PreferenciasProximidade } from './PreferenciasProximidade';
import { HorariosEscola } from './HorariosEscola';
import { AdicionarFilho, BarraFilhos, SituacaoVinculo } from './FilhosParent';
import { MeuIdAcesso } from '../shared/MeuIdAcesso';
import {
  MapPin,
  Clock,
  ShieldCheck,
  AlertCircle,
  Phone,
  MessageCircle,
  Navigation,
  School,
  CheckCircle2,
  CalendarX,
  X,
  Sparkles,
  Info,
  LogOut
} from 'lucide-react';
import { LiveMap } from '../shared/LiveMap';

interface ParentAppProps {
  coordenadas: GPSCoordinate;
  isRotaAtiva: boolean;
  onOpenAusenciaModal?: () => void;
  onLogout?: () => void;
}

export const ParentApp: React.FC<ParentAppProps> = ({
  coordenadas,
  isRotaAtiva,
  onLogout
}) => {
  const [dados, setDados] = useState<{
    aluno: Aluno;
    responsavel: Responsavel;
    motorista: Motorista;
    viagem: ViagemDiario;
    parada: ParadaViagem;
  } | null>(null);

  const [modalAusenciaAberto, setModalAusenciaAberto] = useState<boolean>(false);
  const [motivoSelecionado, setMotivoSelecionado] = useState<string>('Consulta médica / Dentista');
  const [observacaoTexto, setObservacaoTexto] = useState<string>('');
  const [trechoAusencia, setTrechoAusencia] = useState<'AMBOS' | 'IDA' | 'VOLTA'>('AMBOS');
  const [enviandoAusencia, setEnviandoAusencia] = useState<boolean>(false);
  const [sucessoFeedback, setSucessoFeedback] = useState<string | null>(null);
  const [carregando, setCarregando] = useState<boolean>(true);

  // Proximidade da van (modo real): resumo calculado no servidor, sem coordenadas até a próxima parada ser a do aluno.
  const modoReal = !isDemoMode();
  const [prox, setProx] = useState<ProximidadeVan | null>(null);
  const [prefs, setPrefs] = useState<PrefsProximidade>({ estilo: 'C', avisoMin: 10 });
  const [avisoProximidade, setAvisoProximidade] = useState<string | null>(null);
  const avisoJaDisparado = React.useRef(false);

  useEffect(() => {
    if (!modoReal) return;
    TransportRepository.getProximidade().then((r) => {
      if (r) { setProx(r.proximidade); setPrefs(r.prefs); }
    }).catch(() => {});
    const unsub = subscribeToDatabaseChanges((event, payload: any) => {
      if (event === 'PROXIMIDADE_ATUALIZADA' || event === 'INIT_STATE') {
        const novo = payload?.proximidade ?? payload?.estado?.proximidade;
        if (novo !== undefined) setProx(novo);
        const pf = payload?.estado?.prefs ?? payload?.prefs;
        if (pf) setPrefs(pf);
      }
    });
    return () => unsub();
  }, [modoReal]);

  // Aviso quando a van chega ao tempo escolhido (uma vez por rota).
  useEffect(() => {
    if (!modoReal || !prox) return;
    if (prox.estado === 'embarcou' || prox.estado === 'entregue') { setAvisoProximidade(null); return; }
    if (prox.estado === 'aguardando' || prox.estado === 'encerrada') { avisoJaDisparado.current = false; return; }
    if (prox.avisoAtivo && !avisoJaDisparado.current && ['a_caminho', 'proxima'].includes(prox.estado)) {
      avisoJaDisparado.current = true;
      const msg = `A van chega em ~${prox.minutos} min. Prepare o aluno!`;
      setAvisoProximidade(msg);
      try { navigator.vibrate?.([200, 100, 200]); } catch {}
      try { if ('Notification' in window && Notification.permission === 'granted') new Notification('VanEscolar', { body: msg }); } catch {}
    }
  }, [modoReal, prox]);
  const [erroCarga, setErroCarga] = useState<boolean>(false);
  const [filhosInfo, setFilhosInfo] = useState<{ filhos: FilhoResumo[]; filhoAtivo: number | null; motoristas: { id: number; nome: string }[] }>({ filhos: [], filhoAtivo: null, motoristas: [] });
  const [adicionando, setAdicionando] = useState(false);

  // No modo demonstração (?demo=true) usa o aluno de exemplo; em uso real, o aluno vinculado ao responsável.
  const isDemo = (typeof window !== 'undefined' && window.location.search.includes('demo=true'))
    || import.meta.env.VITE_DEMO_MODE === 'true';
  const alunoDemoId = isDemo ? 201 : undefined;

  // Carrega os dados do aluno vinculado via Repository
  const carregarDados = async () => {
    try {
      const info = await TransportRepository.getDadosAlunoParaPais(alunoDemoId);
      if (!isDemo) {
        const f = await TransportRepository.getFilhos();
        if (f) setFilhosInfo(f);
      }
      setDados(info);
      setErroCarga(false);
    } catch (err) {
      console.error('Erro ao carregar dados do aluno para os pais:', err);
      setErroCarga(true);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarDados();

    // Sincronização reativa quando o motorista altera o status ou rota no painel dele
    const unsubscribe = subscribeToDatabaseChanges((event) => {
      if (event === 'database:reset' || event === 'DADOS_LIMPOS') {
        carregarDados();
        return;
      }

      TransportRepository.getDadosAlunoParaPais(alunoDemoId).then((res) => {
        if (res) setDados(res);
      }).catch(() => {});
      // A confirmação do motorista muda o vínculo do filho: atualiza a lista para o aviso "Aguardando…" sumir na hora.
      if (!isDemo && (event === 'STATUS_EMBARQUE_ATUALIZADO' || event === 'NOVA_PARADA_CADASTRADA' || event === 'INIT_STATE' || event === 'ALUNO_CONFIRMADO')) {
        TransportRepository.getFilhos().then((f) => { if (f) setFilhosInfo(f); }).catch(() => {});
      }

      if (event === 'aluno:status_alterado' || event === 'STATUS_EMBARQUE_ATUALIZADO') {
        setSucessoFeedback('Status de transporte atualizado em tempo real pelo motorista!');
        setTimeout(() => setSucessoFeedback(null), 4000);
      } else if (event === 'aluno:endereco_atualizado' || event === 'NOVA_PARADA_CADASTRADA') {
        setSucessoFeedback('Endereço de embarque sincronizado!');
        setTimeout(() => setSucessoFeedback(null), 5000);
      } else if (event === 'aluno:ausencia_avisada' || event === 'AUSENCIA_NOTIFICADA') {
        setSucessoFeedback('Ausência confirmada e transmitida ao motorista.');
        setTimeout(() => setSucessoFeedback(null), 4000);
      } else if (event === 'ROTA_STATUS_ALTERADO' || event === 'viagem:iniciada') {
        setSucessoFeedback('O motorista iniciou a rota da van!');
        setTimeout(() => setSucessoFeedback(null), 4000);
      }
    });

    return () => unsubscribe();
  }, []);

  // Handler de envio do "Avisar Ausência"
  const handleConfirmarAusencia = async () => {
    if (!dados) return;
    setEnviandoAusencia(true);
    try {
      const motivoFinal = observacaoTexto.trim()
        ? `${motivoSelecionado} - ${observacaoTexto.trim()}`
        : motivoSelecionado;

      await TransportRepository.avisarAusencia(Number(dados.aluno.id), motivoFinal, undefined, trechoAusencia);
      await carregarDados();

      setModalAusenciaAberto(false);
      setSucessoFeedback(`Ausência comunicada ao motorista (${dados.motorista.nome}) com sucesso!`);
      setTimeout(() => setSucessoFeedback(null), 4000);
    } catch (err) {
      console.error('Erro ao avisar ausência:', err);
    } finally {
      setEnviandoAusencia(false);
    }
  };

  // Handler para cancelar o aviso de ausência
  const handleCancelarAusencia = async () => {
    if (!dados) return;
    try {
      await TransportRepository.cancelarAvisoAusencia(Number(dados.aluno.id));
      await carregarDados();
      setSucessoFeedback(`Aviso de ausência cancelado! ${dados?.aluno.nome?.split(' ')[0] || 'O aluno'} aguarda a van.`);
      setTimeout(() => setSucessoFeedback(null), 4000);
    } catch (err) {
      console.error('Erro ao cancelar ausência:', err);
    }
  };

  if (carregando) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-950 text-slate-400">
        <p className="text-xs">Carregando dados da van escolar...</p>
      </div>
    );
  }

  // Primeiro acesso: o responsável cadastra o filho com o código do motorista
  if (!isDemo && !erroCarga && filhosInfo.filhos.length === 0) {
    return (
      <div className="h-full overflow-y-auto bg-slate-950 text-slate-200 p-4">
        <div className="max-w-md mx-auto pb-10">
          <AdicionarFilho primeiro motoristas={filhosInfo.motoristas} onSalvo={() => { setCarregando(true); carregarDados(); }} />
          {onLogout && <button onClick={onLogout} className="mt-4 text-xs text-slate-400 underline cursor-pointer min-h-[44px]">Sair</button>}
        </div>
      </div>
    );
  }

  // Falha de carga: tela amigável em vez de tela em branco
  if (!dados || !dados.parada || !dados.aluno) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 bg-slate-950 text-slate-200 p-6 text-center">
        <div className="text-4xl" aria-hidden="true">🚐</div>
        <h2 className="text-lg font-bold">
          {erroCarga ? 'Não foi possível carregar os dados' : 'Nenhum aluno vinculado ainda'}
        </h2>
        <p className="text-sm text-slate-400 max-w-xs">
          {erroCarga
            ? 'Verifique sua conexão e tente novamente.'
            : 'Escolha um filho na barra acima ou cadastre um novo.'}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => { setCarregando(true); carregarDados(); }}
            className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 text-sm font-bold"
          >
            Atualizar
          </button>
          {onLogout && (
            <button onClick={onLogout} className="px-4 py-2 rounded-xl border border-slate-700 text-sm">
              Sair
            </button>
          )}
        </div>
      </div>
    );
  }

  const { aluno, responsavel, motorista, parada } = dados;
  const primeiroNomeAluno = aluno.nome?.split(' ')[0] || 'O aluno';
  const primeiroNomeMotorista = motorista?.nome?.split(' ')[0] || 'O motorista';
  const nomeEscola = aluno.escola_destino || 'a escola';

  // Status humanizado
  const statusLabels = {
    PENDENTE: {
      titulo: isRotaAtiva ? "Van em Rota de Coleta" : "Van Aguardando Partida",
      subtitulo: isRotaAtiva ? "A van está a caminho para buscar o aluno" : "A rota ainda não começou. Você será avisado quando a van sair.",
      corBadge: "bg-amber-500/10 text-amber-400 border-amber-500/30",
      progressoPct: isRotaAtiva ? 35 : 10
    },
    EMBARCOU: {
      titulo: `${primeiroNomeAluno} a Bordo!`,
      subtitulo: `Embarcou${parada.hora_embarque ? ` às ${parada.hora_embarque}` : ''} • A caminho da escola`,
      corBadge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
      progressoPct: 75
    },
    ENTREGUE: {
      titulo: `Entregue: ${nomeEscola}`,
      subtitulo: `Desembarcou em segurança${parada.hora_desembarque ? ` às ${parada.hora_desembarque}` : ''}`,
      corBadge: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
      progressoPct: 100
    },
    AUSENTE: {
      titulo: "Ausência Informada Hoje",
      subtitulo: parada.motivo_ausencia || "A van não passará no ponto hoje",
      corBadge: "bg-rose-500/15 text-rose-400 border-rose-500/30",
      progressoPct: 0
    },
    Aguardando: {
      titulo: "Van Aguardando Partida",
      subtitulo: "A rota ainda não começou. Você será avisado quando a van sair.",
      corBadge: "bg-amber-500/10 text-amber-400 border-amber-500/30",
      progressoPct: 10
    }
  };

  const statusConfig = statusLabels[parada.status_embarque as keyof typeof statusLabels] || statusLabels.PENDENTE;

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 font-sans">
      {/* CABEÇALHO DO APP DOS PAIS */}
      <header className="bg-slate-900 border-b border-slate-800 p-4 sticky top-0 z-30 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img
                src={aluno.foto_url}
                alt={aluno.nome}
                className="w-12 h-12 rounded-xl object-cover ring-2 ring-cyan-400 shadow-md"
              />
              <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-cyan-500 border-2 border-slate-900 flex items-center justify-center text-[9px] font-bold text-slate-950">
                ❤
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-100 leading-tight">
                  {aluno.nome}
                </h1>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Responsável: <strong className="text-slate-300">{responsavel.nome}</strong>{responsavel.parentesco && responsavel.parentesco !== 'Responsável' ? ` (${responsavel.parentesco})` : ''}
              </p>
            </div>
          </div>

          {/* AÇÕES: AVISAR AUSÊNCIA E SAIR */}
          <div className="flex items-center gap-2">
            {parada.status_embarque !== 'AUSENTE' ? (
              <button
                onClick={() => setModalAusenciaAberto(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-bold transition-all shadow-sm active:scale-95"
              >
                <CalendarX className="w-4 h-4 text-rose-400" />
                <span>Avisar Ausência</span>
              </button>
            ) : (
              <button
                onClick={handleCancelarAusencia}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold transition-all active:scale-95"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Desfazer Ausência</span>
              </button>
            )}

            {onLogout && (
              <button
                onClick={onLogout}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 transition-all active:scale-95"
                title="Sair e voltar ao Portal"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* FEEDBACK DE ATUALIZAÇÃO */}
        {sucessoFeedback && (
          <div className="mt-3 p-2.5 bg-cyan-950/80 border border-cyan-500/40 rounded-xl text-xs text-cyan-200 flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="font-medium">{sucessoFeedback}</span>
          </div>
        )}
      </header>

      {/* CONTEÚDO PRINCIPAL (SCROLLABLE) */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {modoReal && filhosInfo.filhos.length > 0 && (
          <>
            <BarraFilhos
              filhos={filhosInfo.filhos}
              ativo={filhosInfo.filhoAtivo}
              onEscolher={(id) => { TransportRepository.selecionarFilho(id); setCarregando(true); carregarDados(); }}
              onAdicionar={() => setAdicionando(true)}
            />
            {(() => {
              const f = filhosInfo.filhos.find((x) => x.id_aluno === filhosInfo.filhoAtivo);
              return f ? <SituacaoVinculo filho={f} motoristas={filhosInfo.motoristas} onMudou={() => { setCarregando(true); carregarDados(); }} /> : null;
            })()}
          </>
        )}

        {modoReal && (
          <HorariosEscola
            alunoId={dados.aluno.id}
            entrada={dados.parada.escola_entrada}
            saida={dados.parada.escola_saida}
            horaIda={dados.parada.hora_ida}
            horaVolta={dados.parada.hora_volta}
            onSalvo={carregarDados}
          />
        )}

        {modoReal && (
          <section aria-label="Acompanhe a van" className="bg-slate-900 border border-cyan-500/30 rounded-2xl p-4 shadow-xl">
            {avisoProximidade && (
              <div role="status" className="mb-3 p-2.5 bg-amber-400/10 border border-amber-400/40 rounded-xl text-xs text-amber-200 flex items-center justify-between gap-2">
                <span className="font-semibold">{avisoProximidade}</span>
                <button type="button" onClick={() => setAvisoProximidade(null)} className="text-amber-300 underline cursor-pointer shrink-0">Ok</button>
              </div>
            )}
            <ProximidadeBar proximidade={prox} estilo={prefs.estilo} />
            <PreferenciasProximidade prefs={prefs} onChange={setPrefs} />
          </section>
        )}

        {modoReal && <MeuIdAcesso />}

        {modoReal && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-xs text-slate-400 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 truncate">
              <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="truncate">Embarque: <strong className="text-slate-200">{aluno.endereco_embarque_real}</strong></span>
            </span>
            <span className="text-slate-500 shrink-0">{aluno.bairro || ''}</span>
          </div>
        )}

        {!modoReal && (
        <>
        {/* CARD PRINCIPAL DE STATUS & TEMPO DE CHEGADA EM DESTAQUE */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/40 border border-cyan-500/30 rounded-2xl p-4 shadow-xl relative overflow-hidden ring-1 ring-cyan-500/20">
          {/* Cabeçalho do Card com Status */}
          <div className="flex items-center justify-between gap-3 mb-3">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${statusConfig.corBadge}`}>
              <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
              {statusConfig.titulo}
            </span>

            <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/70 border border-cyan-500/30 px-2 py-0.5 rounded-lg flex items-center gap-1">
              <Clock className="w-3 h-3" />
              GPS: {coordenadas.timestamp}
            </span>
          </div>

          {/* DESTAQUE PRINCIPAL: TEMPO DE CHEGADA (ETA) */}
          <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5 font-semibold text-slate-300">
                <Clock className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
                {parada.status_embarque === 'PENDENTE'
                  ? 'TEMPO ESTIMADO DE CHEGADA (PORTARIA)'
                  : (parada.status_embarque === 'EMBARCOU'
                      ? 'TEMPO ESTIMADO ATÉ A ESCOLA'
                      : (parada.status_embarque === 'ENTREGUE'
                          ? 'HORÁRIO DE ENTREGA'
                          : 'STATUS DO DIA'))}
              </span>

              {parada.status_embarque === 'PENDENTE' && (
                <span className="text-[10px] bg-amber-400/10 text-amber-300 border border-amber-400/20 px-1.5 py-0.5 rounded font-mono">
                  {isRotaAtiva ? 'VAN EM ROTA' : 'AGUARDANDO'}
                </span>
              )}
            </div>

            <div className="flex items-baseline justify-between gap-2 pt-1">
              {parada.status_embarque === 'PENDENTE' && (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-amber-400 tracking-tight font-mono">
                      ~{coordenadas.etaNextStopMinutes} min
                    </span>
                    <span className="text-xs text-slate-400 font-medium">
                      ({isRotaAtiva ? 'Van em movimento' : 'Previsão'})
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block">Horário na portaria</span>
                    <span className="text-base font-bold text-slate-100 font-mono">
                      {parada.hora_prevista}
                    </span>
                  </div>
                </>
              )}

              {parada.status_embarque === 'EMBARCOU' && (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-black text-emerald-400 tracking-tight">
                      A bordo
                    </span>
                    <span className="text-xs text-slate-400 font-medium">
                      a caminho da escola
                    </span>
                  </div>
                </>
              )}

              {parada.status_embarque === 'ENTREGUE' && (
                <div className="w-full flex items-center justify-between">
                  <div>
                    <span className="text-lg font-bold text-indigo-400">Entregue com Sucesso</span>
                    <p className="text-[11px] text-slate-400">Recepção: {nomeEscola}</p>
                  </div>
                  <span className="text-xl font-bold font-mono text-slate-100">
                    {parada.hora_desembarque || '--:--'}
                  </span>
                </div>
              )}

              {parada.status_embarque === 'AUSENTE' && (
                <div>
                  <span className="text-sm font-bold text-rose-400">Ausência Notificada</span>
                  <p className="text-xs text-slate-400 mt-0.5">{parada.motivo_ausencia}</p>
                </div>
              )}
            </div>

            {/* Endereço de Embarque Atual Cadastrado */}
            <div className="pt-2 border-t border-slate-900 flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1 truncate">
                <MapPin className="w-3 h-3 text-cyan-400 shrink-0" />
                <span className="truncate">Endereço de Embarque: <strong className="text-slate-200">{aluno.endereco_embarque_real}</strong></span>
              </span>
              <span className="text-slate-500 shrink-0 ml-2">{aluno.bairro || ""}</span>
            </div>
          </div>

          {/* Barra de Progresso Visual da Viagem */}
          <div className="mt-3 pt-2">
            <div className="flex justify-between text-[11px] text-slate-400 mb-1 font-medium">
              <span>{aluno.endereco_embarque_real ? aluno.endereco_embarque_real.split(',')[0] : 'Endereço'} (Casa)</span>
              <span>{nomeEscola}</span>
            </div>
            <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-amber-400 via-cyan-400 to-indigo-500 transition-all duration-700"
                style={{ width: `${statusConfig.progressoPct}%` }}
              />
            </div>
          </div>
        </div>
        </>
        )}

        {!modoReal && (
        <>
        {/* MAPA DA VAN EM TEMPO REAL NA FREGUESIA (demonstração) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400 px-1">
            <span className="flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-cyan-400" />
              Localização da Van em Tempo Real
            </span>
            <span className="text-[11px] text-cyan-400 font-medium">
              GPS Atualizado: {coordenadas.timestamp}
            </span>
          </div>

          <LiveMap
            coordenadas={coordenadas}
            isRotaAtiva={isRotaAtiva}
            paradas={[parada]}
            highlightAlunoId={201}
            ocultarOutrasParadas={true}
            motoristaNome={motorista.nome}
          />
        </div>
        </>
        )}

        {/* CARD DO MOTORISTA & VEÍCULO */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
            Motorista Responsável
          </h3>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <img
                src={motorista.foto_url}
                alt={motorista.nome}
                className="w-11 h-11 rounded-xl object-cover ring-2 ring-slate-800"
              />
              <div>
                <h4 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                  {motorista.nome}
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  {motorista.veiculo_modelo} • Placa <strong className="text-slate-200 font-mono">{motorista.veiculo_placa}</strong>
                </p>
              </div>
            </div>

            {/* Ações de contato com o Motorista */}
            <div className="flex items-center gap-2">
              <a
                href={`tel:${motorista.telefone.replace(/\D/g, '')}`}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 transition-all border border-slate-700"
                title="Ligar para o motorista"
              >
                <Phone className="w-4 h-4" />
              </a>
              <a
                href={`https://wa.me/55${motorista.telefone.replace(/\D/g, '')}?text=Ol%C3%A1%20${encodeURIComponent(motorista.nome)},%20aqui%20%C3%A9%20o%20respons%C3%A1vel%20pelo%20transporte%20escolar.`}
                target="_blank"
                rel="noreferrer"
                className="p-2.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 transition-all border border-emerald-500/30"
                title="WhatsApp com o motorista"
              >
                <MessageCircle className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>

        {/* DETALHES DO DESTINO ESCOLAR */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <School className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-100">{nomeEscola}</h4>
            </div>
          </div>
        </div>
      </main>

      {/* MODAL: AVISAR AUSÊNCIA (REQUISITO EXPLÍCITO) */}
      {adicionando && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 overflow-y-auto overscroll-contain p-3" role="dialog" aria-modal="true">
          <div className="max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-4 my-2">
            <AdicionarFilho motoristas={filhosInfo.motoristas} onCancelar={() => setAdicionando(false)} onSalvo={() => { setAdicionando(false); setCarregando(true); carregarDados(); }} />
          </div>
        </div>
      )}

      {modalAusenciaAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4 max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <CalendarX className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Avisar Ausência</h3>
                  <p className="text-[11px] text-slate-400">Aluno(a): {aluno.nome}</p>
                </div>
              </div>
              <button
                onClick={() => setModalAusenciaAberto(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Ao confirmar, <strong>{primeiroNomeMotorista}</strong> será notificado imediatamente no Diário de Bordo da van e ajustará a rota.
            </p>

            {/* SELEÇÃO DO MOTIVO */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Motivo da ausência:</label>
              {[
                "Consulta médica / Dentista",
                "Gripe ou indisposição de saúde",
                "Viagem em família",
                "Não irá hoje (Motivo particular)"
              ].map((motivo) => (
                <button
                  key={motivo}
                  type="button"
                  onClick={() => setMotivoSelecionado(motivo)}
                  className={`w-full text-left p-2.5 rounded-xl text-xs font-medium transition-all border ${
                    motivoSelecionado === motivo
                      ? 'bg-rose-500/15 border-rose-500 text-rose-200'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {motivo}
                </button>
              ))}
            </div>

            {/* OBSERVAÇÃO ADICIONAL OPCIONAL */}
            <div role="group" aria-label="Qual trecho" className="flex rounded-xl overflow-hidden border border-slate-700 text-[11px] font-bold">
              {([['AMBOS', 'Ida e volta'], ['IDA', 'Só ida'], ['VOLTA', 'Só volta']] as const).map(([v, rot]) => (
                <button key={v} type="button" aria-pressed={trechoAusencia === v} onClick={() => setTrechoAusencia(v)}
                  className={`flex-1 py-2 min-h-[40px] cursor-pointer ${trechoAusencia === v ? 'bg-rose-500/20 text-rose-300' : 'bg-slate-950 text-slate-400'}`}>{rot}</button>
              ))}
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-slate-400">Observação rápida para o motorista (opcional):</label>
              <input
                type="text"
                placeholder="Ex: Volta amanhã normalmente"
                value={observacaoTexto}
                onChange={(e) => setObservacaoTexto(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-rose-500 placeholder-slate-600"
              />
            </div>

            {/* BOTÕES DE AÇÃO */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => setModalAusenciaAberto(false)}
                className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all"
              >
                Voltar
              </button>
              <button
                disabled={enviandoAusencia}
                onClick={handleConfirmarAusencia}
                className="py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-lg shadow-rose-950 flex items-center justify-center gap-1.5"
              >
                {enviandoAusencia ? 'Enviando...' : 'Confirmar Ausência'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
