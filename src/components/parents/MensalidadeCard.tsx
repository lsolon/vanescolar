import React, { useEffect, useState } from 'react';
import { TransportRepository } from '../../services/api';
import type { MensalidadeFilho, StatusMensalidade } from '../../services/api';

const brl = (n: number | null) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const curto = (m: string) => `${MESES[parseInt(m.slice(5), 10) - 1]}/${m.slice(2, 4)}`;
const ROTULO: Record<StatusMensalidade, { texto: string; cor: string }> = {
  PAGO: { texto: 'Pago', cor: 'text-emerald-300 border-emerald-400/40 bg-emerald-500/10' },
  EM_ABERTO: { texto: 'Em aberto', cor: 'text-sky-300 border-sky-400/40 bg-sky-500/10' },
  ATRASADO: { texto: 'Atrasado', cor: 'text-rose-300 border-rose-400/40 bg-rose-500/10' },
  SEM_VALOR: { texto: 'Não definido', cor: 'text-slate-300 border-slate-600 bg-slate-800/40' }
};

/** Mensalidade dos filhos, somente leitura: o responsável vê o valor, o vencimento e o que já foi pago. */
export const MensalidadeCard: React.FC = () => {
  const [filhos, setFilhos] = useState<MensalidadeFilho[] | null>(null);
  useEffect(() => { TransportRepository.minhasMensalidades().then(setFilhos).catch(() => setFilhos([])); }, []);
  if (!filhos || filhos.length === 0) return null;

  return (
    <section aria-label="Mensalidade" className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
      <h3 className="text-xs font-bold text-slate-200">Mensalidade</h3>
      {filhos.map((f) => {
        const r = ROTULO[f.status];
        return (
          <div key={f.id_aluno} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-100 truncate">{f.aluno}</p>
                <p className="text-[11px] text-slate-400">
                  {f.valor ? `${brl(f.valor)}${f.vencimento_dia ? ` · vence dia ${String(f.vencimento_dia).padStart(2, '0')}` : ''}` : 'O motorista ainda não definiu o valor.'}
                </p>
              </div>
              <span className={`shrink-0 px-2.5 py-1 rounded-full border text-[10px] font-black ${r.cor}`}>{r.texto}</span>
            </div>
            {f.meses_em_atraso > 0 && <p className="text-[11px] text-rose-300">Há {f.meses_em_atraso} mensalidade(s) vencida(s) sem pagamento registrado.</p>}
            <div className="flex gap-1.5 overflow-x-auto" aria-label="Últimos meses">
              {[...f.historico].reverse().map((h) => (
                <div key={h.mes} className={`shrink-0 w-14 text-center rounded-xl border py-1.5 ${ROTULO[h.status].cor}`}>
                  <p className="text-[10px] font-bold">{curto(h.mes)}</p>
                  <p className="text-[9px]">{h.status === 'PAGO' ? 'pago' : h.status === 'ATRASADO' ? 'atraso' : h.status === 'EM_ABERTO' ? 'aberto' : '—'}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <p className="text-[10px] text-slate-500">O pagamento é combinado direto com o motorista. Aqui você só acompanha.</p>
    </section>
  );
};
