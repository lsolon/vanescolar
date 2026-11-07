import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, X } from 'lucide-react';
import { TransportRepository } from '../../services/api';
import { AbaMotorista, PapelGuia, PassoGuia, passosDoPapel } from './guiaPassos';

const chaveVisto = (papel: PapelGuia) => `van_guia_visto_${papel}`;

const lerVisto = (papel: PapelGuia): boolean => {
  try { return localStorage.getItem(chaveVisto(papel)) === '1'; } catch { return false; }
};
const gravarVisto = (papel: PapelGuia) => {
  try { localStorage.setItem(chaveVisto(papel), '1'); } catch { /* sem armazenamento: o guia só reaparece na próxima visita */ }
};

export interface EstadoGuia {
  papel: PapelGuia;
  aberto: boolean;
  passo: number;
  abrir: () => void;
  fechar: () => void;
  ir: (n: number) => void;
}

/** Estado do guia. Abre sozinho no primeiro acesso de cada papel neste aparelho e pode ser reaberto à mão. */
export function useGuiaPrimeiroAcesso(papel: PapelGuia): EstadoGuia {
  const [aberto, setAberto] = useState<boolean>(() => !lerVisto(papel));
  const [passo, setPasso] = useState(0);
  const abrir = useCallback(() => { setPasso(0); setAberto(true); }, []);
  const fechar = useCallback(() => { gravarVisto(papel); setAberto(false); }, [papel]);
  const ir = useCallback((n: number) => setPasso(n), []);
  return { papel, aberto, passo, abrir, fechar, ir };
}

const campoCopiar = async (texto: string) => {
  try { await navigator.clipboard.writeText(texto); return true; } catch { return false; }
};

/** Botão dos dados de exemplo. Só existe quando o servidor está em modo de teste. */
const AcaoExemplos: React.FC<{ papel: PapelGuia; onExemplos?: () => void }> = ({ papel, onExemplos }) => {
  const [modoTeste, setModoTeste] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const resultado = useRef<HTMLDivElement | null>(null);
  useEffect(() => { TransportRepository.modoTesteAtivo().then(setModoTeste); }, []);
  // O guia rola por dentro: leva o resultado (mensagem e código) para a vista.
  useEffect(() => { if (msg || codigo) resultado.current?.scrollIntoView({ block: 'nearest' }); }, [msg, codigo]);
  if (!modoTeste) return null;

  const carregar = async () => {
    setOcupado(true);
    setMsg(null);
    try {
      const r = await TransportRepository.carregarExemplosTeste();
      if (papel === 'motorista') {
        setMsg(r.criados ? `${r.criados} alunos de exemplo adicionados. Veja na tela Hoje.` : (r.motivo || 'Nada foi adicionado.'));
        onExemplos?.();
      } else {
        setCodigo(r.codigo || null);
        setMsg(r.codigo ? `Código de exemplo para ${r.nomeAluno || 'um aluno de exemplo'}. Digite no campo "Tenho um código do motorista".` : 'Não foi possível gerar o código.');
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Não foi possível carregar os exemplos.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-dashed border-rose-400/50 bg-rose-500/10 p-3 space-y-2">
      <p className="text-[11px] font-bold text-rose-300">AMBIENTE DE TESTE</p>
      <button type="button" onClick={carregar} disabled={ocupado} className="w-full py-2.5 min-h-[44px] rounded-xl bg-rose-400 text-slate-950 text-xs font-black cursor-pointer disabled:opacity-50">
        {ocupado ? 'Carregando…' : papel === 'motorista' ? 'Carregar 3 alunos de exemplo' : 'Gerar código de exemplo'}
      </button>
      <div ref={resultado} className="space-y-2">
      {msg && <p role="status" className="text-xs text-slate-200">{msg}</p>}
      {codigo && (
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-base font-mono font-bold tracking-wider text-cyan-300 text-center">{codigo}</code>
          <button type="button" aria-label="Copiar código" onClick={async () => { setCopiado(await campoCopiar(codigo)); }} className="px-3 min-h-[44px] rounded-lg bg-slate-800 text-slate-200 text-xs font-bold cursor-pointer flex items-center gap-1">
            <Copy className="w-4 h-4" /> {copiado ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      )}
      </div>
    </div>
  );
};

/**
 * Faixa de guia passo a passo, fixa na parte de baixo da tela (acima do menu).
 * Não cobre a tela: o motorista vê a tela real enquanto lê o passo.
 */
export const GuiaPrimeiroAcesso: React.FC<{
  guia: EstadoGuia;
  /** Motorista: abre a tela que o passo explica. */
  onIrParaAba?: (aba: AbaMotorista) => void;
  /** Depois de carregar os alunos de exemplo (motorista): recarrega a lista. */
  onExemplos?: () => void;
}> = ({ guia, onIrParaAba, onExemplos }) => {
  const passos: PassoGuia[] = passosDoPapel(guia.papel);
  const { aberto, passo, papel } = guia;
  const atual = passos[Math.min(passo, passos.length - 1)];

  useEffect(() => {
    if (aberto && atual.aba) onIrParaAba?.(atual.aba);
    // só reage à mudança de passo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, passo]);

  if (!aberto) return null;
  const ultimo = passo >= passos.length - 1;
  const cor = papel === 'motorista'
    ? { borda: 'border-amber-400/70', barra: 'bg-amber-400', botao: 'bg-amber-400', texto: 'text-amber-300' }
    : { borda: 'border-cyan-400/70', barra: 'bg-cyan-400', botao: 'bg-cyan-400', texto: 'text-cyan-300' };

  return (
    <section role="dialog" aria-label="Guia passo a passo" className={`shrink-0 border-t-2 ${cor.borda} bg-slate-900 max-h-[46vh] overflow-y-auto overscroll-contain`}>
      <div className="px-4 pt-3 pb-4 space-y-2">
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-bold ${cor.texto}`}>Passo {passo + 1} de {passos.length}</span>
          <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden" aria-hidden="true">
            <div className={`h-full ${cor.barra}`} style={{ width: `${((passo + 1) / passos.length) * 100}%` }} />
          </div>
          <button type="button" aria-label="Fechar guia" onClick={guia.fechar} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        <h3 className="text-base font-extrabold text-slate-100 leading-tight">{atual.titulo}</h3>
        <p className="text-sm text-slate-300">{atual.texto}</p>
        {atual.itens && atual.itens.length > 0 && (
          <ul className="space-y-1.5 text-[13px] text-slate-300 list-disc pl-5">
            {atual.itens.map((t) => <li key={t}>{t}</li>)}
          </ul>
        )}
        {atual.acao === 'exemplos' && <AcaoExemplos papel={papel} onExemplos={onExemplos} />}
        <div className="flex items-center gap-2 pt-2">
          <button type="button" onClick={() => guia.ir(passo - 1)} disabled={passo === 0}
            className="flex items-center gap-1 px-3 py-2.5 min-h-[48px] rounded-xl bg-slate-800 text-slate-200 text-sm font-bold cursor-pointer disabled:opacity-40">
            <ChevronLeft className="w-4 h-4" /> Voltar
          </button>
          <button type="button" onClick={() => (ultimo ? guia.fechar() : guia.ir(passo + 1))}
            className={`flex-1 flex items-center justify-center gap-1 py-2.5 min-h-[48px] rounded-xl ${cor.botao} text-slate-950 text-sm font-black cursor-pointer`}>
            {ultimo ? 'Concluir' : <>Próximo <ChevronRight className="w-4 h-4" /></>}
          </button>
        </div>
        {!ultimo && (
          <button type="button" onClick={guia.fechar} className="block mx-auto text-xs text-slate-400 underline min-h-[36px] cursor-pointer">Pular guia</button>
        )}
      </div>
    </section>
  );
};
