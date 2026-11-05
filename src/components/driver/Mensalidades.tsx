import React, { useCallback, useEffect, useState } from 'react';
import { TransportRepository } from '../../services/api';
import type { LinhaMensalidadeMotorista, MensalidadesMotorista, StatusMensalidade } from '../../services/api';

const brl = (n: number | null | undefined) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const nomeMes = (m: string) => `${MESES[parseInt(m.slice(5), 10) - 1]} de ${m.slice(0, 4)}`;
const tituloMes = (m: string) => { const t = nomeMes(m); return t.charAt(0).toUpperCase() + t.slice(1); };
const somarMes = (m: string, d: number) => {
  const idx = parseInt(m.slice(0, 4), 10) * 12 + (parseInt(m.slice(5), 10) - 1) + d;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
};
const dataBR = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '');

const ROTULO: Record<StatusMensalidade, { texto: string; cor: string }> = {
  PAGO: { texto: 'Pago', cor: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/40' },
  EM_ABERTO: { texto: 'Em aberto', cor: 'bg-sky-500/15 text-sky-300 border-sky-400/40' },
  ATRASADO: { texto: 'Atrasado', cor: 'bg-rose-500/15 text-rose-300 border-rose-400/40' },
  SEM_VALOR: { texto: 'Definir valor', cor: 'bg-slate-700/40 text-slate-300 border-slate-600' }
};
const FORMAS = [['PIX', 'PIX'], ['DINHEIRO', 'Dinheiro'], ['TRANSFERENCIA', 'Transferência'], ['OUTRO', 'Outro']] as const;

function mensagemCobranca(l: LinhaMensalidadeMotorista, mes: string) {
  const venc = l.vencimento_dia ? String(l.vencimento_dia).padStart(2, '0') : '';
  return `Olá, ${l.responsavel_nome.split(' ')[0] || ''}! Passando para lembrar da mensalidade do transporte escolar de ${nomeMes(mes)}` +
    `${l.valor ? ` (${brl(l.valor)}${venc ? `, vencimento dia ${venc}` : ''})` : ''}. ` +
    'Se já pagou, pode desconsiderar. Obrigado!';
}

const Linha: React.FC<{ l: LinhaMensalidadeMotorista; mes: string; aberta: boolean; onToggle: () => void; onMudou: () => void }> = ({ l, mes, aberta, onToggle, onMudou }) => {
  const [valor, setValor] = useState(l.valor ? String(l.valor).replace('.', ',') : '');
  const [dia, setDia] = useState(String(l.vencimento_dia ?? 10));
  const [forma, setForma] = useState('PIX');
  const [todos, setTodos] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const agir = async (fn: () => Promise<unknown>) => {
    setOcupado(true); setErro(null);
    try { await fn(); onMudou(); } catch (e: any) { setErro(e.message); } finally { setOcupado(false); }
  };
  const salvarValor = () => agir(() => TransportRepository.definirMensalidade(l.id_aluno, valor, parseInt(dia, 10), todos));
  const pagar = () => agir(async () => {
    if (l.status === 'SEM_VALOR' && !valor) throw new Error('Defina o valor antes de dar baixa.');
    if (l.status === 'SEM_VALOR') await TransportRepository.definirMensalidade(l.id_aluno, valor, parseInt(dia, 10), false);
    await TransportRepository.registrarPagamentoMensalidade(l.id_aluno, { mes, forma });
  });
  const desfazer = () => {
    if (!window.confirm('Desfazer a baixa deste mês?')) return;
    return agir(() => TransportRepository.desfazerPagamentoMensalidade(l.id_aluno, mes));
  };

  const r = ROTULO[l.status];
  return (
    <li className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <button type="button" onClick={onToggle} aria-expanded={aberta} className="w-full flex items-center gap-3 p-3 text-left min-h-[56px] cursor-pointer">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-100 truncate">{l.responsavel_nome || 'Responsável'}</p>
          <p className="text-[11px] text-slate-400 truncate">
            {l.aluno}
            {l.vencimento_dia ? ` · vence dia ${String(l.vencimento_dia).padStart(2, '0')}` : ''}
            {l.meses_em_atraso > 1 || (l.status !== 'ATRASADO' && l.meses_em_atraso > 0) ? ` · ${l.meses_em_atraso} mês(es) vencido(s)` : ''}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-extrabold text-slate-100">{l.valor ? brl(l.status === 'PAGO' ? l.valor_pago : l.valor) : '—'}</p>
          <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full border text-[10px] font-black ${r.cor}`}>{r.texto}</span>
        </div>
      </button>

      {aberta && (
        <div className="border-t border-slate-800 p-3 space-y-3 bg-slate-950/60">
          {l.status === 'PAGO' ? (
            <>
              <p className="text-xs text-emerald-300">Recebido em {dataBR(l.pago_em)} · {FORMAS.find(([k]) => k === l.forma)?.[1] ?? l.forma}</p>
              <button type="button" disabled={ocupado} onClick={desfazer} className="px-3 py-2 min-h-[44px] rounded-xl bg-slate-800 text-slate-200 text-xs font-bold cursor-pointer disabled:opacity-50">Desfazer baixa</button>
            </>
          ) : (
            <>
              {(l.status === 'SEM_VALOR' || !l.valor) && <p className="text-xs text-amber-200">Informe o valor mensal e o dia de vencimento desta família.</p>}
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-slate-400">Valor mensal (R$)
                  <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="350,00"
                    className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 min-h-[44px] text-sm text-slate-100" />
                </label>
                <label className="text-[11px] text-slate-400">Vence no dia
                  <select value={dia} onChange={(e) => setDia(e.target.value)} className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 min-h-[44px] text-sm text-slate-100">
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-slate-400 cursor-pointer">
                <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} /> Usar este valor e vencimento para todos os alunos
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={ocupado || !valor} onClick={salvarValor} className="px-3 py-2 min-h-[44px] rounded-xl bg-slate-800 text-slate-100 text-xs font-bold cursor-pointer disabled:opacity-50">Salvar valor</button>
              </div>
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <p className="text-[11px] font-semibold text-slate-300">Dar baixa de {nomeMes(mes)}</p>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Forma de pagamento">
                  {FORMAS.map(([k, nome]) => (
                    <button key={k} type="button" role="radio" aria-checked={forma === k} onClick={() => setForma(k)}
                      className={`px-3 py-2 min-h-[44px] rounded-xl border text-xs font-bold cursor-pointer ${forma === k ? 'bg-amber-400/15 text-amber-200 border-amber-400/50' : 'bg-slate-900 text-slate-400 border-slate-800'}`}>{nome}</button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={ocupado} onClick={pagar} className="px-4 py-2 min-h-[44px] rounded-xl bg-emerald-600 text-white text-xs font-black cursor-pointer disabled:opacity-50">Marcar como pago</button>
                  {l.whatsapp && (
                    <a href={`https://wa.me/${l.whatsapp.length <= 11 ? '55' + l.whatsapp : l.whatsapp}?text=${encodeURIComponent(mensagemCobranca(l, mes))}`} target="_blank" rel="noreferrer"
                      className="px-4 py-2 min-h-[44px] rounded-xl bg-slate-800 text-emerald-300 text-xs font-bold inline-flex items-center">Cobrar no WhatsApp</a>
                  )}
                </div>
              </div>
            </>
          )}
          {erro && <p role="alert" className="text-[11px] text-rose-300">{erro}</p>}
        </div>
      )}
    </li>
  );
};

/** Aba "Mensalidades" do painel do motorista: quanto entrou, quanto falta e quem está atrasado. */
export const Mensalidades: React.FC = () => {
  const [dados, setDados] = useState<MensalidadesMotorista | null>(null);
  const [mes, setMes] = useState<string | undefined>(undefined);
  const [aberta, setAberta] = useState<number | null>(null);
  const [filtro, setFiltro] = useState<'TODOS' | StatusMensalidade>('TODOS');
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async (m?: string) => {
    try { setDados(await TransportRepository.listarMensalidades(m)); setErro(null); } catch (e: any) { setErro(e.message); }
  }, []);
  useEffect(() => { carregar(mes); }, [mes, carregar]);

  if (erro && !dados) return <p role="alert" className="text-xs text-rose-300">{erro}</p>;
  if (!dados) return <p className="text-xs text-slate-400">Carregando mensalidades…</p>;

  const { resumo, alunos } = dados;
  const pct = resumo.previsto > 0 ? Math.min(100, Math.round((resumo.recebido / resumo.previsto) * 100)) : 0;
  const lista = filtro === 'TODOS' ? alunos : alunos.filter((a) => a.status === filtro);
  const mesAtual = dados.hoje.slice(0, 7);

  return (
    <section aria-label="Mensalidades" className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button type="button" aria-label="Mês anterior" onClick={() => setMes(somarMes(dados.mes, -1))} className="w-11 h-11 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 font-black cursor-pointer">‹</button>
        <div className="text-center">
          <h2 className="text-sm font-extrabold text-slate-100">{tituloMes(dados.mes)}</h2>
          {dados.mes !== mesAtual && <button type="button" onClick={() => setMes(undefined)} className="text-[11px] text-amber-300 underline cursor-pointer">Voltar ao mês atual</button>}
        </div>
        <button type="button" aria-label="Próximo mês" onClick={() => setMes(somarMes(dados.mes, 1))} className="w-11 h-11 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 font-black cursor-pointer">›</button>
      </div>

      <div className="rounded-3xl p-4 bg-gradient-to-br from-emerald-600/30 via-slate-900 to-slate-900 border border-emerald-400/30 space-y-2">
        <p className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider">Recebido no mês</p>
        <p className="text-3xl font-black text-white">{brl(resumo.recebido)}</p>
        <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Percentual recebido">
          <div className="h-full bg-emerald-400" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[11px] text-slate-300">{pct}% de {brl(resumo.previsto)} previstos · {resumo.qtd_pagos} de {alunos.length} famílias pagaram</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl p-3 bg-slate-900 border border-rose-400/30">
          <p className="text-[10px] font-bold text-rose-300 uppercase">Em atraso</p>
          <p className="text-lg font-black text-rose-200">{brl(resumo.atrasado)}</p>
          <p className="text-[10px] text-slate-400">{resumo.qtd_atrasados} família(s)</p>
        </div>
        <div className="rounded-2xl p-3 bg-slate-900 border border-sky-400/30">
          <p className="text-[10px] font-bold text-sky-300 uppercase">A vencer</p>
          <p className="text-lg font-black text-sky-200">{brl(resumo.a_vencer)}</p>
          <p className="text-[10px] text-slate-400">{resumo.qtd_a_vencer} família(s)</p>
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Filtrar por situação">
        {([['TODOS', 'Todos'], ['ATRASADO', 'Atrasados'], ['EM_ABERTO', 'Em aberto'], ['PAGO', 'Pagos'], ['SEM_VALOR', 'Sem valor']] as const).map(([k, nome]) => (
          <button key={k} type="button" role="tab" aria-selected={filtro === k} onClick={() => setFiltro(k)}
            className={`shrink-0 px-3 py-2 min-h-[44px] rounded-xl border text-[11px] font-black cursor-pointer ${filtro === k ? 'bg-amber-400/15 text-amber-200 border-amber-400/50' : 'bg-slate-900 text-slate-400 border-slate-800'}`}>{nome}</button>
        ))}
      </div>

      {alunos.length === 0 ? (
        <p className="text-xs text-slate-400 bg-slate-900 border border-slate-800 rounded-2xl p-4">Nenhum aluno confirmado na van ainda. Quando você confirmar os alunos, as mensalidades aparecem aqui.</p>
      ) : lista.length === 0 ? (
        <p className="text-xs text-slate-400">Nenhuma família nesta situação.</p>
      ) : (
        <ul className="space-y-2">
          {lista.map((l) => (
            <Linha key={`${dados.mes}-${l.id_aluno}`} l={l} mes={dados.mes} aberta={aberta === l.id_aluno}
              onToggle={() => setAberta(aberta === l.id_aluno ? null : l.id_aluno)} onMudou={() => carregar(mes)} />
          ))}
        </ul>
      )}
      {erro && <p role="alert" className="text-[11px] text-rose-300">{erro}</p>}
    </section>
  );
};
