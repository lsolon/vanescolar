import React, { useEffect, useState } from 'react';
import { ArrowLeft, LayoutDashboard, TrendingUp, Wallet } from 'lucide-react';
import { TransportRepository } from '../../services/api';
import type { MensalidadesMotorista, ResumoFinanceiro } from '../../services/api';
import { Mensalidades } from '../driver/Mensalidades';
import { Financeiro } from '../driver/Financeiro';
import { useModulos } from '../../hooks/useModulos';

/**
 * Área de Gestão do motorista: o "escritório" do negócio (mensalidades, financeiro e, nas próximas fases,
 * manutenção, documentos e relatórios). Usa o mesmo login e os mesmos dados do painel do dia a dia.
 * O servidor só entrega estes dados ao motorista logado; aqui só organizamos a tela.
 */
type Secao = 'resumo' | 'mensalidades' | 'financeiro';

const SECOES: ReadonlyArray<readonly [Secao, string, React.ComponentType<{ className?: string }>]> = [
  ['resumo', 'Resumo', LayoutDashboard],
  ['mensalidades', 'Mensalidades', Wallet],
  ['financeiro', 'Financeiro', TrendingUp]
];

const brl = (n: number | null | undefined) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const tituloMes = (m: string) => {
  const t = `${MESES[parseInt(m.slice(5), 10) - 1]} de ${m.slice(0, 4)}`;
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const Cartao: React.FC<{ rotulo: string; valor: string; sub?: string; cor?: string; onClick: () => void }> = ({ rotulo, valor, sub, cor = 'text-slate-100', onClick }) => (
  <button type="button" onClick={onClick} className="text-left rounded-2xl p-4 bg-slate-900 border border-slate-800 hover:border-slate-700 min-h-[84px] cursor-pointer">
    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">{rotulo}</span>
    <span className={`block text-xl font-black ${cor}`}>{valor}</span>
    {sub && <span className="block text-[11px] text-slate-400">{sub}</span>}
  </button>
);

const Resumo: React.FC<{ onIr: (s: Secao) => void; comFin: boolean; comMen: boolean }> = ({ onIr, comFin, comMen }) => {
  const [fin, setFin] = useState<ResumoFinanceiro | null>(null);
  const [men, setMen] = useState<MensalidadesMotorista | null>(null);
  const [carregado, setCarregado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setCarregado(false);
    Promise.all([
      comFin ? TransportRepository.resumoFinanceiro() : Promise.resolve(null),
      comMen ? TransportRepository.listarMensalidades() : Promise.resolve(null)
    ])
      .then(([f, m]) => { if (vivo) { setFin(f); setMen(m); setCarregado(true); } })
      .catch((e: any) => { if (vivo) setErro(e?.message || 'Não foi possível carregar o resumo.'); });
    return () => { vivo = false; };
  }, [comFin, comMen]);

  if (erro) {
    return (
      <p role="alert" className="text-xs text-rose-300">
        {erro} A Gestão é exclusiva do motorista: confira se você entrou com a conta de motorista.
      </p>
    );
  }
  if (!carregado) return <p className="text-xs text-slate-400">Carregando resumo…</p>;

  const r = men?.resumo;
  const lucro = fin?.resumo.lucro ?? 0;
  const mes = men?.mes ?? fin?.mes ?? '';
  return (
    <section aria-label="Resumo do mês" className="space-y-3">
      {mes && <h2 className="text-sm font-extrabold text-slate-100">{tituloMes(mes)}</h2>}
      <div className="grid grid-cols-2 gap-3">
        {fin && (
          <Cartao rotulo={lucro >= 0 ? 'Lucro do mês' : 'Prejuízo do mês'} valor={brl(lucro)} cor={lucro >= 0 ? 'text-emerald-300' : 'text-rose-300'}
            sub={`Receita ${brl(fin.resumo.receita_total)} · despesas ${brl(fin.resumo.despesas_total)}`} onClick={() => onIr('financeiro')} />
        )}
        {r && (
          <>
            <Cartao rotulo="Recebido no mês" valor={brl(r.recebido)} cor="text-emerald-300"
              sub={`${r.qtd_pagos} pago(s) de ${brl(r.previsto)} previstos`} onClick={() => onIr('mensalidades')} />
            <Cartao rotulo="A vencer" valor={brl(r.a_vencer)} cor="text-sky-300"
              sub={`${r.qtd_a_vencer} mensalidade(s)`} onClick={() => onIr('mensalidades')} />
            <Cartao rotulo="Em atraso" valor={brl(r.atrasado)} cor={r.qtd_atrasados > 0 ? 'text-rose-300' : 'text-slate-100'}
              sub={r.qtd_atrasados > 0 ? `${r.qtd_atrasados} mensalidade(s) · cobre pelo WhatsApp` : 'Nenhuma em atraso'} onClick={() => onIr('mensalidades')} />
          </>
        )}
      </div>
      {r && r.qtd_sem_valor > 0 && (
        <p className="text-[11px] text-amber-200 bg-amber-400/10 border border-amber-400/30 rounded-xl p-3">
          {r.qtd_sem_valor} família(s) sem valor de mensalidade definido. Defina em Mensalidades para entrar na conta.
        </p>
      )}
    </section>
  );
};

export const GestaoPanel: React.FC<{ onVoltar: () => void }> = ({ onVoltar }) => {
  const [secao, setSecao] = useState<Secao>('resumo');
  const modulos = useModulos();
  const comMen = modulos.ativo('mensalidades');
  const comFin = modulos.ativo('financeiro');
  const secoes = SECOES.filter(([k]) => k === 'resumo' || (k === 'mensalidades' ? comMen : comFin));
  const nenhum = !comMen && !comFin;
  // Se o módulo da seção aberta for desligado, volta ao resumo.
  const secaoAtual: Secao = secoes.some(([k]) => k === secao) ? secao : 'resumo';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <button type="button" onClick={onVoltar} className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 cursor-pointer">
            <ArrowLeft className="w-4 h-4" /> Painel
          </button>
          <div className="min-w-0">
            <h1 className="text-base font-extrabold text-white leading-tight">Gestão</h1>
            <p className="text-[11px] text-slate-400 truncate">Van<span className="text-amber-400">Escolar</span> · controle do seu negócio</p>
          </div>
        </div>
        {/* Celular: abas no topo */}
        <nav aria-label="Seções da Gestão" role="tablist" style={{ gridTemplateColumns: `repeat(${secoes.length}, minmax(0, 1fr))` }} className="md:hidden grid border-t border-slate-800">
          {secoes.map(([k, nome, Icone]) => (
            <button key={k} type="button" role="tab" aria-selected={secaoAtual === k} onClick={() => setSecao(k)}
              className={`flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] text-[11px] font-bold cursor-pointer ${secaoAtual === k ? 'text-amber-300 border-b-2 border-amber-300' : 'text-slate-400 border-b-2 border-transparent'}`}>
              <Icone className="w-5 h-5" />
              {nome}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 w-full max-w-5xl mx-auto px-4 py-4 md:flex md:gap-6">
        {/* Computador: menu lateral */}
        <nav aria-label="Seções da Gestão" className="hidden md:block w-52 shrink-0 space-y-1">
          {secoes.map(([k, nome, Icone]) => (
            <button key={k} type="button" aria-current={secaoAtual === k ? 'page' : undefined} onClick={() => setSecao(k)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-xl text-sm font-bold text-left cursor-pointer ${secaoAtual === k ? 'bg-amber-400/15 text-amber-200 border border-amber-400/40' : 'text-slate-300 hover:bg-slate-900 border border-transparent'}`}>
              <Icone className="w-4 h-4" />
              {nome}
            </button>
          ))}
        </nav>

        <main className="flex-1 min-w-0 md:max-w-2xl space-y-4">
          {nenhum && (
            <p role="status" className="text-xs text-slate-300 bg-slate-900 border border-slate-800 rounded-2xl p-4">
              Nenhum módulo ligado. Para usar a Gestão, ligue Mensalidades ou Financeiro em Painel &gt; Mais &gt; Rotas e ajustes &gt; Módulos.
            </p>
          )}
          {!nenhum && secaoAtual === 'resumo' && <Resumo onIr={setSecao} comFin={comFin} comMen={comMen} />}
          {secaoAtual === 'mensalidades' && comMen && <Mensalidades />}
          {secaoAtual === 'financeiro' && comFin && <Financeiro />}
        </main>
      </div>
    </div>
  );
};
