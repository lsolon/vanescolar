import React, { useEffect, useState } from 'react';
import { TransportRepository } from '../../services/api';

interface Props {
  alunoId: number | string;
  entrada?: string;
  saida?: string;
  horaIda?: string | null;
  horaVolta?: string | null;
  onSalvo: () => void;
}

/** O responsável informa a entrada e a saída da escola; a van calcula os horários de ida e de volta. */
export const HorariosEscola: React.FC<Props> = ({ alunoId, entrada, saida, horaIda, horaVolta, onSalvo }) => {
  const informado = !!(entrada && saida);
  const [editando, setEditando] = useState(!informado);
  const [e, setE] = useState(entrada || '');
  const [s, setS] = useState(saida || '');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { setE(entrada || ''); setS(saida || ''); if (entrada && saida) setEditando(false); }, [entrada, saida]);

  const salvar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      await TransportRepository.salvarHorariosEscola(alunoId, e, s);
      setEditando(false);
      onSalvo();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar os horários.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section aria-label="Horários da escola" className={`rounded-2xl p-4 border ${informado ? 'bg-slate-900 border-slate-800' : 'bg-amber-400/10 border-amber-400/40'}`}>
      <h3 className="text-xs font-bold text-slate-100">Horários da escola</h3>
      {!informado && (
        <p className="text-[11px] text-amber-200 mt-1">Informe a entrada e a saída do seu filho(a) para a van calcular os horários de ida e de volta.</p>
      )}
      {editando ? (
        <form onSubmit={salvar} className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-slate-300">
              Entrada na escola
              <input type="time" required value={e} onChange={(x) => setE(x.target.value)} className="mt-1 w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-cyan-400" />
            </label>
            <label className="text-[11px] text-slate-300">
              Saída da escola
              <input type="time" required value={s} onChange={(x) => setS(x.target.value)} className="mt-1 w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-cyan-400" />
            </label>
          </div>
          {erro && <p role="alert" className="text-[11px] text-rose-300">{erro}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={salvando || !e || !s} className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold disabled:opacity-50 cursor-pointer min-h-[44px]">
              {salvando ? 'Salvando…' : 'Salvar horários'}
            </button>
            {informado && (
              <button type="button" onClick={() => setEditando(false)} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer min-h-[44px]">Cancelar</button>
            )}
          </div>
        </form>
      ) : (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-2">
              <div className="text-[10px] text-slate-400">Van passa (ida)</div>
              <div className="text-lg font-black font-mono text-amber-400">{horaIda || '--:--'}</div>
              <div className="text-[10px] text-slate-500">Escola entra {entrada}</div>
            </div>
            <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-2">
              <div className="text-[10px] text-slate-400">Van chega (volta)</div>
              <div className="text-lg font-black font-mono text-amber-400">{horaVolta || '--:--'}</div>
              <div className="text-[10px] text-slate-500">Escola sai {saida}</div>
            </div>
          </div>
          <button type="button" onClick={() => setEditando(true)} className="text-[11px] text-cyan-300 underline cursor-pointer">Alterar horários da escola</button>
        </div>
      )}
    </section>
  );
};
