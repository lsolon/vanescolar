import React, { useCallback, useEffect, useState } from 'react';
import { TransportRepository } from '../../services/api';
import type { ConsumoEstimado, PainelConsumo, TotalConsumo } from '../../services/api';

const fmt = (n: number, d = 1) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dm = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
const diaSemana = (iso: string) => ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))).getUTCDay()];

const campo = 'w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white min-h-[44px]';

/** Onde o motorista informa quantos km a van faz com 1 litro. */
const Config: React.FC<{ painel: PainelConsumo; onPainel: (p: PainelConsumo) => void }> = ({ painel, onPainel }) => {
  const atual = painel.config?.km_por_litro;
  const [valor, setValor] = useState(atual !== undefined ? String(atual).replace('.', ',') : '');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const salvar = async (v: string | number) => {
    setOcupado(true); setErro(null); setOk(false);
    try { onPainel(await TransportRepository.definirKmPorLitro(v)); setOk(true); }
    catch (e: any) { setErro(e?.message || 'Não foi possível salvar.'); }
    finally { setOcupado(false); }
  };

  const sug = painel.sugestao_km_por_litro;
  return (
    <form onSubmit={(e) => { e.preventDefault(); void salvar(valor); }} className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-3" aria-label="Consumo da van">
      <div>
        <label htmlFor="con-kml" className="block text-sm font-bold text-slate-100">Quantos km a van faz com 1 litro?</label>
        <p className="text-[11px] text-slate-400 mt-0.5">Informe uma vez. O app usa os km que o GPS registra em cada viagem para estimar quanto combustível você gastou.</p>
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <input id="con-kml" inputMode="decimal" value={valor} onChange={(e) => { setValor(e.target.value); setOk(false); }} placeholder="Ex.: 9,5" className={campo} />
        </div>
        <span className="pb-3 text-xs font-bold text-slate-300">km/L</span>
        <button type="submit" disabled={ocupado} className="px-4 py-2 min-h-[44px] rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-extrabold cursor-pointer disabled:opacity-60">
          {atual !== undefined ? 'Atualizar' : 'Salvar'}
        </button>
      </div>
      {sug !== null && sug !== atual && (
        <p className="text-[11px] text-slate-300 bg-slate-950/60 border border-slate-800 rounded-xl p-2.5">
          Pelos seus abastecimentos de tanque cheio, a média real é <strong>{fmt(sug, 2)} km/L</strong>.{' '}
          <button type="button" disabled={ocupado} onClick={() => { setValor(fmt(sug, 2)); void salvar(sug); }} className="underline text-cyan-300 font-bold cursor-pointer">Usar este valor</button>
        </p>
      )}
      {ok && <p role="status" className="text-[11px] text-emerald-300">Salvo.</p>}
      {erro && <p role="alert" className="text-[11px] text-rose-300">{erro}</p>}
    </form>
  );
};

const Cartao: React.FC<{ rotulo: string; periodo: string; t: TotalConsumo; comCusto: boolean }> = ({ rotulo, periodo, t, comCusto }) => (
  <div className="rounded-2xl p-4 bg-slate-900 border border-slate-800 min-h-[104px]">
    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">{rotulo}</span>
    <span className="block text-xl font-black text-amber-200">{fmt(t.litros, 1)} L</span>
    <span className="block text-[11px] text-slate-300">{fmt(t.km, 1)} km{comCusto && t.custo !== null ? ` · ${brl(t.custo)}` : ''}</span>
    <span className="block text-[10px] text-slate-500 mt-0.5">{periodo}</span>
    {t.sem_gps > 0 && <span className="block text-[10px] text-amber-300 mt-0.5">{t.sem_gps} viagem(ns) sem GPS não entram</span>}
  </div>
);

const Painel: React.FC<{ c: ConsumoEstimado }> = ({ c }) => {
  const comCusto = c.preco_litro !== null;
  const vazio = c.mes.trechos === 0 && c.mes.sem_gps === 0 && c.trechos_de_hoje.length === 0;
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Cartao rotulo="Hoje" periodo={dm(c.dia.de)} t={c.dia} comCusto={comCusto} />
        <Cartao rotulo="Esta semana" periodo={`${dm(c.semana.de)} a ${dm(c.semana.ate)}`} t={c.semana} comCusto={comCusto} />
        <Cartao rotulo="Esta quinzena" periodo={`${dm(c.quinzena.de)} a ${dm(c.quinzena.ate)}`} t={c.quinzena} comCusto={comCusto} />
        <Cartao rotulo="Este mês" periodo={`${dm(c.mes.de)} a ${dm(c.mes.ate)}`} t={c.mes} comCusto={comCusto} />
      </div>

      {vazio && (
        <p role="status" className="text-xs text-slate-300 bg-slate-900 border border-slate-800 rounded-2xl p-4">
          Ainda não há viagens com km registrado. Ao iniciar e encerrar a rota com o GPS ligado, o consumo aparece aqui.
        </p>
      )}

      {c.trechos_de_hoje.length > 0 && (
        <section aria-label="Viagens de hoje" className="rounded-2xl bg-slate-900 border border-slate-800 p-3 space-y-2">
          <h3 className="text-xs font-extrabold text-slate-100">Viagens de hoje</h3>
          <ul className="space-y-1.5">
            {c.trechos_de_hoje.map((t, i) => (
              <li key={i} className="flex items-start justify-between gap-2 text-[12px]">
                <span className="text-slate-200">
                  {t.sentido === 'IDA' ? 'Ida' : 'Volta'}{t.viagem ? ` · ${t.viagem}` : ''}
                  {t.em_andamento && <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-400/40">em andamento</span>}
                </span>
                <span className="text-right text-slate-300 shrink-0">
                  {t.km === null ? <span className="text-amber-300">sem GPS</span> : `${fmt(t.km, 1)} km · ${fmt(t.litros as number, 2)} L${t.custo !== null ? ` · ${brl(t.custo)}` : ''}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {c.dias.length > 0 && (
        <section aria-label="Dia a dia do mês" className="rounded-2xl bg-slate-900 border border-slate-800 p-3 space-y-2">
          <h3 className="text-xs font-extrabold text-slate-100">Dia a dia do mês</h3>
          <ul className="divide-y divide-slate-800">
            {c.dias.map((d) => (
              <li key={d.data} className="flex items-center justify-between gap-2 py-1.5 text-[12px]">
                <span className="text-slate-200">{dm(d.data)} <span className="text-slate-500">{diaSemana(d.data)}</span></span>
                <span className="text-slate-300">{fmt(d.km, 1)} km · {fmt(d.litros, 2)} L{d.custo !== null ? ` · ${brl(d.custo)}` : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-[10px] text-slate-500">
        Estimativa: km registrados pelo GPS ÷ {fmt(c.km_por_litro, 2)} km/L.{' '}
        {comCusto
          ? `O custo usa o preço médio do litro dos seus abastecimentos no Financeiro (${brl(c.preco_litro as number)}/L).`
          : 'Para ver o custo em reais, lance um abastecimento no Financeiro: o app usa o preço do litro dele.'}{' '}
        Confira de vez em quando com o abastecimento real.
      </p>
    </>
  );
};

/** Consumo de combustível estimado da van: km/L informado pelo motorista × km do GPS em cada viagem. */
export const Consumo: React.FC = () => {
  const [painel, setPainel] = useState<PainelConsumo | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    TransportRepository.consumoCombustivel().then(setPainel).catch((e: any) => setErro(e?.message || 'Não foi possível carregar o consumo.'));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  if (erro) return <p role="alert" className="text-xs text-rose-300">{erro}</p>;
  if (!painel) return <p className="text-xs text-slate-400">Carregando consumo…</p>;

  return (
    <section aria-label="Consumo de combustível" className="space-y-3">
      <div>
        <h2 className="text-sm font-extrabold text-slate-100">Consumo de combustível</h2>
        <p className="text-[11px] text-slate-400">Quanto a van gastou de combustível por dia, semana, quinzena e mês.</p>
      </div>
      <Config key={painel.config?.atualizado_em ?? 'novo'} painel={painel} onPainel={setPainel} />
      {painel.consumo && <Painel c={painel.consumo} />}
    </section>
  );
};
