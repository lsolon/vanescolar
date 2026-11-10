import React, { useEffect, useState } from 'react';
import { TransportRepository } from '../../services/api';
import { CampoHora } from '../shared/CampoHora';
import type { ProximidadeVan } from '../../services/api';
import { sentidoPorHorario, minutosAgoraBrasil } from '../../services/sentidoAuto';

interface Props {
  alunoId: number | string;
  entrada?: string;
  saida?: string;
  horaIda?: string | null;
  horaVolta?: string | null;
  /** horário limite de chegada à escola, calculado no servidor com a antecedência do motorista */
  chegarEscolaAte?: string | null;
  /** horários definidos pelo motorista para a escola e o turno: o responsável não altera */
  fixoPeloMotorista?: boolean;
  /** situação da van calculada no servidor (sem coordenadas) */
  prox?: ProximidadeVan | null;
  onSalvo: () => void;
}

/** O responsável informa a entrada e a saída da escola; a van calcula os horários de ida e de volta. */
export const HorariosEscola: React.FC<Props> = ({ alunoId, entrada, saida, horaIda, horaVolta, chegarEscolaAte, fixoPeloMotorista, prox, onSalvo }) => {
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
            <div className="text-[11px] text-slate-300 space-y-1"><span id="lbl-entrada">Entrada na escola</span><CampoHora label="Entrada na escola" value={e} onChange={setE} horaPadrao="07" /></div>
            <div className="text-[11px] text-slate-300 space-y-1"><span id="lbl-saida">Saída da escola</span><CampoHora label="Saída da escola" value={s} onChange={setS} horaPadrao="12" /></div>
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
          {(() => {
            const sentido = prox?.rotaAtiva && prox.sentido ? prox.sentido : sentidoPorHorario([{ escola_entrada: entrada, escola_saida: saida }], minutosAgoraBrasil());
            const ida = sentido === 'IDA';
            const aBordo = prox?.estado === 'embarcou';
            const antes = prox?.rotaAtiva && (prox.estado === 'a_caminho' || prox.estado === 'proxima') && ida;
            const linhas: { rot: string; val: string; dest?: boolean; sub?: string }[] = [];
            if (ida) {
              linhas.push({ rot: 'Entrada na escola', val: entrada || '--:--' });
              linhas.push({ rot: 'Horário para chegar na escola', val: prox?.chegarEscolaAte || chegarEscolaAte || '--:--' });
              if (aBordo && prox?.destino === 'escola') linhas.push({ rot: 'Tempo para chegada na escola', val: prox.minutos != null ? `${prox.minutos} min` : '–', dest: true, sub: 'Tempo real da van até a escola' });
              else if (antes) {
                linhas.push({ rot: 'Horário combinado no seu ponto', val: prox?.horarioPrevisto || horaIda || '--:--' });
                linhas.push({ rot: 'Tempo até o seu ponto', val: prox?.chegou ? 'No ponto' : prox?.minutosAtePonto != null ? `${prox.minutosAtePonto} min` : '–', dest: true, sub: prox?.minutosAtePonto == null && !prox?.chegou ? 'Sem localização exata da van agora' : 'Tempo real da van até o seu ponto' });
              } else linhas.push({ rot: 'Horário combinado no seu ponto', val: horaIda || '--:--' });
            } else {
              linhas.push({ rot: 'Saída da escola', val: saida || '--:--' });
              linhas.push({ rot: 'Chegada prevista em casa', val: horaVolta || '--:--' });
              if (aBordo && prox?.destino === 'casa') linhas.push({ rot: 'Tempo até a sua casa', val: prox.minutos != null ? `${prox.minutos} min` : '–', dest: true, sub: 'Tempo real da van até a sua casa' });
            }
            return (
              <div className="space-y-2" aria-live="polite" data-sentido={sentido}>
                <p className="text-[10px] text-slate-400">{ida ? '➜ Ida (casa → escola)' : '↩ Volta (escola → casa)'}</p>
                {linhas.map((l) => (
                  <div key={l.rot} className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${l.dest ? 'bg-cyan-500/10 border-cyan-400/40' : 'bg-slate-950/70 border-slate-800'}`}>
                    <div className="min-w-0">
                      <div className="text-[11px] text-slate-300">{l.rot}</div>
                      {l.sub && <div className="text-[10px] text-slate-500">{l.sub}</div>}
                    </div>
                    <div className={`text-lg font-black font-mono shrink-0 ${l.dest ? 'text-cyan-300' : 'text-amber-400'}`}>{l.val}</div>
                  </div>
                ))}
              </div>
            );
          })()}
          {fixoPeloMotorista
            ? <p className="text-[11px] text-slate-500">Horários da escola definidos pelo motorista.</p>
            : <button type="button" onClick={() => setEditando(true)} className="text-[11px] text-cyan-300 underline cursor-pointer">Alterar horários da escola</button>}
        </div>
      )}
    </section>
  );
};
