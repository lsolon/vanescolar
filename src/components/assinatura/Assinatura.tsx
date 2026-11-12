import React, { useCallback, useEffect, useState } from 'react';
import { TransportRepository, type EstadoAssinaturaMotorista } from '../../services/api';
import { AuthService } from '../../services/auth';

/**
 * Teste grátis de 30 dias e assinatura (cobrança pelo Mercado Pago).
 * - FaixaTeste: aviso discreto no painel do motorista ("faltam N dias").
 * - PainelAssinatura: planos, assinar, cancelar e trocar de plano.
 * - AssinaturaGlobal: tela de bloqueio (motorista e família) e volta do checkout.
 * O app nunca vê dados de cartão: o motorista paga no site do Mercado Pago.
 */

export const EVENTO_BLOQUEIO = 'van-bloqueio';
export const EVENTO_ABRIR = 'van-abrir-assinatura';

const reais = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const dataBR = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '';

export function useAssinatura() {
  const [estado, setEstado] = useState<EstadoAssinaturaMotorista | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const recarregar = useCallback(async () => {
    try { setEstado(await TransportRepository.obterAssinatura()); setErro(null); }
    catch (e: any) { setErro(e?.message || 'Não foi possível carregar.'); }
  }, []);
  useEffect(() => { recarregar(); }, [recarregar]);
  return { estado, setEstado, erro, recarregar };
}

/** Faixa no topo do painel: só aparece no teste (e quando falta subir de plano). Toque abre os planos. */
export const FaixaTeste: React.FC = () => {
  const { estado } = useAssinatura();
  if (!estado) return null;
  let texto: string | null = null;
  if (estado.estado === 'TESTE' && estado.diasRestantes !== null) {
    texto = estado.aguardandoPagamento
      ? `Teste grátis: faltam ${estado.diasRestantes} ${estado.diasRestantes === 1 ? 'dia' : 'dias'} · finalize a assinatura`
      : `Teste grátis: ${estado.diasRestantes === 1 ? 'falta 1 dia' : `faltam ${estado.diasRestantes} dias`} · ver planos`;
  } else if (estado.estado === 'ATIVA' && estado.precisaSubirPlano) {
    texto = 'Você passou do limite de alunos do seu plano · ajustar';
  }
  if (!texto) return null;
  const urgente = estado.estado === 'TESTE' && (estado.diasRestantes ?? 99) <= 5;
  return (
    <button
      type="button" data-testid="faixa-teste"
      onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR))}
      className={`w-full min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold text-left cursor-pointer border ${urgente ? 'bg-rose-950/60 border-rose-500/40 text-rose-200' : 'bg-amber-400/10 border-amber-400/30 text-amber-200'}`}
    >
      {texto}
    </button>
  );
};

/** Planos, assinar e gerenciar. `bloqueada` deixa o aviso de exclusão dos dados em destaque. */
export const PainelAssinatura: React.FC<{ aoMudar?: (e: EstadoAssinaturaMotorista) => void }> = ({ aoMudar }) => {
  const { estado, setEstado, erro, recarregar } = useAssinatura();
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmaCancelar, setConfirmaCancelar] = useState(false);
  const [escolhido, setEscolhido] = useState<string | null>(null);

  const atualizar = (e: EstadoAssinaturaMotorista) => { setEstado(e); aoMudar?.(e); };

  const executar = async (fn: () => Promise<void>) => {
    setOcupado(true); setMsg(null);
    try { await fn(); } catch (e: any) { setMsg(e?.message || 'Não foi possível concluir.'); } finally { setOcupado(false); }
  };

  const assinar = () => executar(async () => {
    const r = await TransportRepository.iniciarAssinatura(planoEscolhido?.chave);
    window.location.assign(r.url); // checkout do Mercado Pago
  });
  const cancelar = () => executar(async () => { atualizar(await TransportRepository.cancelarAssinatura()); setConfirmaCancelar(false); });
  const ajustar = () => executar(async () => { atualizar(await TransportRepository.ajustarAssinatura()); setMsg('Plano ajustado.'); });
  const conferir = () => executar(async () => { atualizar(await TransportRepository.sincronizarAssinatura()); });

  if (erro) return <p role="alert" className="text-xs text-rose-300">{erro} <button type="button" className="underline cursor-pointer" onClick={recarregar}>Tentar de novo</button></p>;
  if (!estado) return <p className="text-xs text-slate-400">Carregando…</p>;

  const sugerido = estado.planoSugerido?.chave;
  const acima = !!estado.acimaDoLimite; // passou do limite dos planos: valor combinado pelo WhatsApp
  const indiceMin = acima ? estado.planos.length : Math.max(0, estado.planos.findIndex((p) => p.chave === sugerido));
  const podeEscolher = estado.estado !== 'ATIVA' && estado.estado !== 'ISENTA' && !estado.aguardandoPagamento;
  const planoEscolhido = acima ? undefined : (estado.planos.find((p) => p.chave === escolhido) ?? estado.planos[indiceMin]);
  const bloqueada = estado.estado === 'BLOQUEADA';
  return (
    <div className="space-y-3" data-testid="painel-assinatura">
      {estado.estado === 'ISENTA' && <p className="text-sm text-emerald-300 font-bold">Sua conta é cortesia: não há cobrança.</p>}

      {estado.estado === 'TESTE' && (
        <p className="text-sm text-amber-200 font-bold">
          Teste grátis até {dataBR(estado.testeFim)} ({estado.diasRestantes === 1 ? 'falta 1 dia' : `faltam ${estado.diasRestantes} dias`}).
          <span className="block text-[11px] font-normal text-slate-400">Se assinar agora, a primeira cobrança só acontece depois do teste.</span>
        </p>
      )}

      {bloqueada && (
        <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-950/50 p-3 space-y-1">
          <p className="text-sm font-bold text-rose-200">{estado.statusMercadoPago === 'cancelled' || estado.statusMercadoPago === 'paused' ? 'Sua assinatura não está ativa.' : 'Seu teste grátis terminou.'}</p>
          <p className="text-xs text-rose-100/90">O app (para você e para as famílias da sua van) fica bloqueado até assinar.</p>
          <p className="text-xs font-bold text-rose-100">Se não assinar até {dataBR(estado.excluirApos)}, os dados da sua van (alunos, rotas, mensalidades) poderão ser excluídos.</p>
        </div>
      )}

      {estado.estado === 'ATIVA' && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-3 space-y-1">
          <p className="text-sm font-bold text-emerald-200">Assinatura ativa{estado.planoContratado ? ` · ${estado.planoContratado.nome} · ${reais(estado.planoContratado.valor)}/mês` : ''}</p>
          <p className="text-[11px] text-slate-400">A cobrança é mensal, no cartão cadastrado no Mercado Pago.</p>
          {estado.precisaSubirPlano && estado.planoSugerido && (
            <div className="pt-1 space-y-1">
              <p className="text-xs text-amber-200">Você tem {estado.alunos} alunos, mais do que o seu plano cobre. O plano certo é {estado.planoSugerido.nome} ({reais(estado.planoSugerido.valor)}/mês).</p>
              <button type="button" disabled={ocupado} onClick={ajustar} className="min-h-[44px] px-4 rounded-xl bg-amber-400 text-slate-950 text-sm font-black cursor-pointer disabled:opacity-60">Passar para {estado.planoSugerido.nome}</button>
            </div>
          )}
        </div>
      )}

      {estado.aguardandoPagamento && estado.estado !== 'ATIVA' && (
        <div className="rounded-xl border border-sky-500/30 bg-sky-950/40 p-3 space-y-2">
          <p className="text-xs text-sky-100">Falta concluir o pagamento no Mercado Pago. Se você já concluiu, confira abaixo.</p>
          <button type="button" disabled={ocupado} onClick={conferir} className="min-h-[44px] px-4 rounded-xl bg-sky-400 text-slate-950 text-sm font-black cursor-pointer disabled:opacity-60">Já paguei, conferir</button>
        </div>
      )}

      {estado.estado !== 'ISENTA' && (
        <>
          <p className="text-[11px] text-slate-400">Valor mensal pelo total de alunos cadastrados (manhã e tarde somados). Você tem <b className="text-slate-200">{estado.alunos}</b>.{podeEscolher ? ' Toque no plano que quiser; pode escolher um maior que o mínimo, se for crescer.' : ''}</p>
          <ul className="space-y-1.5" role="radiogroup" aria-label="Plano">
            {estado.planos.map((p, i) => {
              const abaixo = i < indiceMin;
              const marcado = podeEscolher ? p.chave === planoEscolhido?.chave : p.chave === sugerido;
              return (
                <li key={p.chave}>
                  <button
                    type="button" role="radio" aria-checked={marcado} disabled={!podeEscolher || abaixo} onClick={() => setEscolhido(p.chave)}
                    className={`w-full flex items-center justify-between rounded-xl border px-3 py-2.5 min-h-[44px] text-sm text-left ${marcado ? 'border-amber-400 bg-amber-400/10 text-amber-100 font-bold' : 'border-slate-800 bg-slate-950/60 text-slate-300'} ${podeEscolher && !abaixo ? 'cursor-pointer' : 'cursor-default'} ${abaixo ? 'opacity-40' : ''}`}
                  >
                    <span>{p.nome}{!acima && p.chave === sugerido ? ' · mínimo para você' : ''}</span>
                    <span>{reais(p.valor)}/mês</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {acima && (
            <div role="note" className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 space-y-2">
              <p className="text-sm font-bold text-amber-100">Mais de {estado.limiteDosPlanos ?? 50} alunos · a partir de {reais(estado.aPartirDeAcima ?? 350)}/mês</p>
              <p className="text-xs text-amber-100/90">Para o seu tamanho o valor é combinado. Fale com a gente pelo WhatsApp (21) 97268-2614.</p>
              <a href="https://wa.me/5521972682614" target="_blank" rel="noopener noreferrer" className="inline-flex items-center min-h-[44px] px-4 rounded-xl bg-emerald-500 text-slate-950 text-sm font-black">Chamar no WhatsApp</a>
            </div>
          )}
          {estado.estado !== 'ATIVA' && !estado.aguardandoPagamento && !acima && (
            estado.cobrancaDisponivel
              ? <button type="button" disabled={ocupado} onClick={assinar} className="w-full min-h-[48px] rounded-xl bg-amber-400 text-slate-950 text-sm font-black cursor-pointer disabled:opacity-60">{ocupado ? 'Abrindo o Mercado Pago…' : `Assinar com Mercado Pago · ${planoEscolhido ? reais(planoEscolhido.valor) : ''}/mês`}</button>
              : <p className="text-xs text-slate-400">A cobrança ainda não está liberada. Fale com o suporte: WhatsApp (21) 97268-2614.</p>
          )}
          {estado.aguardandoPagamento && estado.estado !== 'ATIVA' && estado.cobrancaDisponivel && (
            <button type="button" disabled={ocupado} onClick={assinar} className="w-full min-h-[44px] rounded-xl border border-slate-700 text-slate-300 text-xs font-bold cursor-pointer disabled:opacity-60">Abrir o pagamento de novo</button>
          )}
          {(estado.statusMercadoPago === 'authorized' || estado.statusMercadoPago === 'paused') && (
            !confirmaCancelar
              ? <button type="button" onClick={() => setConfirmaCancelar(true)} className="min-h-[44px] px-3 text-xs font-bold text-slate-400 underline cursor-pointer">Cancelar assinatura</button>
              : (
                <div className="rounded-xl border border-rose-500/30 p-3 space-y-2">
                  <p className="text-xs text-rose-100">Cancelar encerra a cobrança. Quando o período pago acabar, o app fica bloqueado e os dados poderão ser excluídos depois de {estado.diasAteExclusao ?? 30} dias.</p>
                  <div className="flex gap-2">
                    <button type="button" disabled={ocupado} onClick={cancelar} className="min-h-[44px] px-4 rounded-xl bg-rose-500 text-white text-xs font-black cursor-pointer disabled:opacity-60">Sim, cancelar</button>
                    <button type="button" onClick={() => setConfirmaCancelar(false)} className="min-h-[44px] px-4 rounded-xl border border-slate-700 text-slate-300 text-xs font-bold cursor-pointer">Voltar</button>
                  </div>
                </div>
              )
          )}
        </>
      )}
      {msg && <p role="alert" className="text-xs text-rose-300">{msg}</p>}
    </div>
  );
};

/**
 * Camada global (fica no App): mostra a tela de bloqueio quando o servidor responde 402,
 * abre os planos quando o motorista toca na faixa e confere o pagamento na volta do checkout (?assinatura=retorno).
 */
export const AssinaturaGlobal: React.FC = () => {
  const [bloqueio, setBloqueio] = useState<{ papel: 'motorista' | 'responsavel'; erro?: string } | null>(null);
  const [aberto, setAberto] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    const aoBloquear = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      setBloqueio({ papel: d.papel === 'responsavel' ? 'responsavel' : 'motorista', erro: d.error });
    };
    const aoAbrir = () => setAberto(true);
    window.addEventListener(EVENTO_BLOQUEIO, aoBloquear);
    window.addEventListener(EVENTO_ABRIR, aoAbrir);
    return () => { window.removeEventListener(EVENTO_BLOQUEIO, aoBloquear); window.removeEventListener(EVENTO_ABRIR, aoAbrir); };
  }, []);

  // Volta do checkout do Mercado Pago: o aviso automático pode demorar alguns segundos, então confere algumas vezes.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('assinatura') !== 'retorno' || !AuthService.getSessionToken()) return;
    let vivo = true;
    setAberto(true); setConfirmando(true);
    (async () => {
      for (let i = 0; i < 6 && vivo; i++) {
        try {
          const e = await TransportRepository.sincronizarAssinatura();
          if (e.estado === 'ATIVA' || e.statusMercadoPago === 'authorized') break;
        } catch { break; }
        await new Promise((r) => setTimeout(r, 4000));
      }
      if (!vivo) return;
      setConfirmando(false);
      window.history.replaceState(null, '', '/app');
    })();
    return () => { vivo = false; };
  }, []);

  const sair = async () => { await AuthService.logout(); window.location.assign('/app'); };

  if (bloqueio?.papel === 'responsavel') {
    return (
      <div role="alertdialog" aria-label="Acesso suspenso" className="fixed inset-0 z-[80] bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-sm w-full space-y-4 text-center">
          <h2 className="text-lg font-black text-amber-300">Acesso suspenso</h2>
          <p className="text-sm text-slate-300">{bloqueio.erro || 'O acesso desta van ao VanEscolar está suspenso no momento. Fale com o motorista.'}</p>
          <button type="button" onClick={sair} className="min-h-[44px] px-5 rounded-xl border border-slate-700 text-slate-200 text-sm font-bold cursor-pointer">Sair</button>
        </div>
      </div>
    );
  }
  if (!bloqueio && !aberto) return null;
  const bloqueado = !!bloqueio;
  return (
    <div role="dialog" aria-label="Assinatura" className="fixed inset-0 z-[80] bg-slate-950 text-slate-100 overflow-y-auto">
      <div className="max-w-md mx-auto p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-black text-amber-300">{bloqueado ? 'Assine para continuar' : 'Assinatura VanEscolar'}</h2>
          {!bloqueado && <button type="button" aria-label="Fechar" onClick={() => setAberto(false)} className="min-w-[44px] min-h-[44px] rounded-xl bg-slate-800 text-slate-200 text-lg cursor-pointer">×</button>}
        </div>
        {confirmando && <p role="status" className="text-sm text-sky-200">Confirmando o seu pagamento com o Mercado Pago…</p>}
        <PainelAssinatura aoMudar={(e) => { if (e.estado !== 'BLOQUEADA') { setBloqueio(null); if (bloqueado) window.location.reload(); } }} />
        {bloqueado && <button type="button" onClick={sair} className="min-h-[44px] px-3 text-xs font-bold text-slate-400 underline cursor-pointer">Sair da conta</button>}
      </div>
    </div>
  );
};
