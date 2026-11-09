import React, { useEffect, useMemo, useState } from 'react';
import { TransportRepository } from '../../services/api';

type Aluno = { nome: string; resultado: 'ENTREGUE' | 'AUSENTE' | 'NAO_ATENDIDO'; embarcou_em: string | null; entregue_em: string | null };
type Trecho = {
  id: string; data: string; sentido: 'IDA' | 'VOLTA'; iniciado_em: string; encerrado_em: string; duracao_min: number;
  km: number | null; escola: string | null; alunos: Aluno[];
  totais: { previstos: number; entregues: number; ausentes: number; nao_atendidos: number };
};

const hora = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
const dataBR = (d: string) => d.split('-').reverse().join('/');
const dur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`);
const km = (v: number | null) => (v === null ? '—' : `${v.toString().replace('.', ',')} km`);
const RESULTADO: Record<Aluno['resultado'], string> = { ENTREGUE: 'Entregue', AUSENTE: 'Ausente', NAO_ATENDIDO: 'Não atendido' };
const PERIODOS = [{ d: 7, t: '7 dias' }, { d: 30, t: '30 dias' }, { d: 90, t: '90 dias' }, { d: 180, t: '180 dias' }];

/** Campo de planilha seguro: aspas dobradas e proteção contra fórmula (=, +, -, @) ao abrir no Excel. */
const campo = (v: string | number | null) => {
  let t = v === null ? '' : String(v);
  if (/^[=+\-@]/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
};

export function planilhaDoHistorico(trechos: Trecho[]): string {
  const cab = ['Data', 'Sentido', 'Início', 'Fim', 'Duração (min)', 'Km', 'Escola', 'Aluno', 'Resultado', 'Embarque', 'Entrega'];
  const linhas: string[] = [cab.map(campo).join(';')];
  for (const t of trechos) {
    const base = [dataBR(t.data), t.sentido === 'IDA' ? 'Ida' : 'Volta', hora(t.iniciado_em), hora(t.encerrado_em), t.duracao_min, t.km === null ? '' : t.km.toString().replace('.', ','), t.escola ?? ''];
    if (!t.alunos.length) linhas.push([...base, '', '', '', ''].map(campo).join(';'));
    for (const a of t.alunos) linhas.push([...base, a.nome, RESULTADO[a.resultado], a.embarcou_em ?? '', a.entregue_em ?? ''].map(campo).join(';'));
  }
  return '﻿' + linhas.join('\r\n');
}

/** Relatório de histórico: um cartão por trecho encerrado. Só nome abreviado, resultado, horas e km: sem endereço, telefone nem coordenadas. */
export const HistoricoViagens: React.FC = () => {
  const [dias, setDias] = useState(30);
  const [trechos, setTrechos] = useState<Trecho[] | null>(null);
  const [retencao, setRetencao] = useState(180);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const carregar = async (d: number) => {
    setErro(null);
    try { const r = await TransportRepository.historicoDeViagens(d); setTrechos(r.trechos); setRetencao(r.retencaoDias); }
    catch (e: any) { setErro(e?.message || 'Não foi possível carregar.'); setTrechos([]); }
  };
  useEffect(() => { setTrechos(null); void carregar(dias); }, [dias]);

  const resumo = useMemo(() => {
    const l = trechos ?? [];
    return { trechos: l.length, entregues: l.reduce((s, t) => s + t.totais.entregues, 0), ausentes: l.reduce((s, t) => s + t.totais.ausentes, 0), km: Math.round(l.reduce((s, t) => s + (t.km ?? 0), 0) * 10) / 10 };
  }, [trechos]);

  const baixar = () => {
    if (!trechos?.length) return;
    const url = URL.createObjectURL(new Blob([planilhaDoHistorico(trechos)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `vanescolar-historico-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const apagar = async () => {
    try { await TransportRepository.apagarHistoricoDeViagens(); setConfirmando(false); setTrechos([]); }
    catch (e: any) { setErro(e?.message || 'Não foi possível apagar.'); }
  };

  return (
    <section aria-label="Histórico de viagens" className="space-y-3">
      <div>
        <h2 className="text-sm font-bold text-slate-200">Histórico de viagens</h2>
        <p className="text-[11px] text-slate-400">Um registro por trecho encerrado. Guarda só o nome abreviado do aluno, o resultado, as horas e os km. Não guarda endereço, telefone nem o trajeto no mapa. Apaga sozinho depois de {retencao} dias.</p>
      </div>

      <div className="flex gap-1.5" role="group" aria-label="Período">
        {PERIODOS.map((p) => (
          <button key={p.d} type="button" onClick={() => setDias(p.d)} aria-pressed={dias === p.d}
            className={`flex-1 min-h-[40px] rounded-lg border text-xs font-bold cursor-pointer ${dias === p.d ? 'bg-amber-400 text-slate-950 border-amber-300' : 'bg-slate-900 text-slate-300 border-slate-800'}`}>{p.t}</button>
        ))}
      </div>

      {erro && <p role="alert" className="text-xs text-rose-300">{erro}</p>}
      {trechos === null && <p className="text-xs text-slate-400">Carregando…</p>}

      {trechos !== null && (
        <>
          <div className="grid grid-cols-4 gap-1.5 text-center text-[11px]" aria-label="Resumo do período">
            <span className="rounded-lg bg-slate-950/70 border border-slate-800 py-1"><span className="text-slate-400">Trechos </span><strong className="text-slate-100">{resumo.trechos}</strong></span>
            <span className="rounded-lg bg-slate-950/70 border border-slate-800 py-1"><span className="text-slate-400">Entregas </span><strong className="text-emerald-300">{resumo.entregues}</strong></span>
            <span className="rounded-lg bg-slate-950/70 border border-slate-800 py-1"><span className="text-slate-400">Ausências </span><strong className="text-rose-300">{resumo.ausentes}</strong></span>
            <span className="rounded-lg bg-slate-950/70 border border-slate-800 py-1"><span className="text-slate-400">Km </span><strong className="text-slate-100">{resumo.km.toString().replace('.', ',')}</strong></span>
          </div>

          {trechos.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 text-center text-xs text-slate-400">
              Nenhum trecho neste período. O histórico começa a ser registrado quando você toca em Encerrar rota.
            </div>
          ) : (
            <div className="space-y-2">
              {trechos.map((t) => {
                const volta = t.sentido === 'VOLTA';
                const abre = aberto === t.id;
                return (
                  <div key={t.id} className={`rounded-2xl border border-l-4 ${volta ? 'bg-amber-950/60 border-amber-500/40 border-l-amber-400' : 'bg-blue-950/70 border-blue-500/40 border-l-sky-400'}`}>
                    <button type="button" onClick={() => setAberto(abre ? null : t.id)} aria-expanded={abre} className="w-full text-left px-3 py-3 min-h-[56px] cursor-pointer">
                      <span className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-black ${volta ? 'text-amber-200' : 'text-sky-200'}`}>{volta ? '↩ Volta' : '➜ Ida'} · {dataBR(t.data)}</span>
                        <span className="text-[11px] font-mono text-slate-300">{hora(t.iniciado_em)}–{hora(t.encerrado_em)}</span>
                      </span>
                      <span className="mt-1 block text-[11px] text-slate-300">
                        {t.totais.entregues} de {t.totais.previstos} entregues{t.totais.ausentes ? ` · ${t.totais.ausentes} ausente(s)` : ''}{t.totais.nao_atendidos ? ` · ${t.totais.nao_atendidos} não atendido(s)` : ''} · {dur(t.duracao_min)} · {km(t.km)}
                      </span>
                      {t.escola && <span className="block text-[11px] text-slate-400 truncate">{t.escola}</span>}
                    </button>
                    {abre && (
                      <ul className="px-3 pb-3 space-y-1">
                        {t.alunos.map((a, i) => (
                          <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-slate-950/50 px-2.5 py-1.5 text-[11px]">
                            <span className="font-bold text-slate-100 truncate">{a.nome}</span>
                            <span className="text-slate-400 shrink-0">{a.embarcou_em ? `embarcou ${a.embarcou_em}` : ''}{a.embarcou_em && a.entregue_em ? ' · ' : ''}{a.entregue_em ? `entregue ${a.entregue_em}` : ''}</span>
                            <span className={`shrink-0 font-bold ${a.resultado === 'ENTREGUE' ? 'text-emerald-300' : a.resultado === 'AUSENTE' ? 'text-rose-300' : 'text-amber-300'}`}>{RESULTADO[a.resultado]}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <button type="button" onClick={baixar} disabled={!trechos.length} className="w-full min-h-[48px] rounded-xl bg-cyan-500 text-slate-950 text-sm font-bold cursor-pointer disabled:opacity-40">Baixar planilha (CSV)</button>

          {!confirmando ? (
            <button type="button" onClick={() => setConfirmando(true)} className="w-full min-h-[44px] rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-slate-400 cursor-pointer">Apagar todo o histórico</button>
          ) : (
            <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 space-y-2" role="alertdialog" aria-label="Confirmar exclusão">
              <p className="text-xs text-rose-100">Apagar todo o histórico? Isso não pode ser desfeito. Baixe a planilha antes, se quiser guardar.</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setConfirmando(false)} className="min-h-[44px] rounded-lg bg-slate-800 text-slate-200 text-xs font-bold cursor-pointer">Cancelar</button>
                <button type="button" onClick={apagar} className="min-h-[44px] rounded-lg bg-rose-600 text-white text-xs font-bold cursor-pointer">Apagar</button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
};
