import React, { useCallback, useEffect, useState } from 'react';
import { TransportRepository } from '../../services/api';
import type { CustoFixoFin, LancamentoFin, ResumoFinanceiro } from '../../services/api';

const brl = (n: number | null | undefined, casas = 2) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: casas, maximumFractionDigits: casas });
const num = (n: number | null | undefined, casas = 2) => (n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const nomeMes = (m: string) => `${MESES[parseInt(m.slice(5), 10) - 1]} de ${m.slice(0, 4)}`;
const tituloMes = (m: string) => { const t = nomeMes(m); return t.charAt(0).toUpperCase() + t.slice(1); };
const mesCurto = (m: string) => MESES[parseInt(m.slice(5), 10) - 1].slice(0, 3);
const somarMes = (m: string, d: number) => {
  const idx = parseInt(m.slice(0, 4), 10) * 12 + (parseInt(m.slice(5), 10) - 1) + d;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
};
const dataBR = (iso: string) => iso.split('-').reverse().join('/');

const CAT: Record<string, string> = {
  COMBUSTIVEL: 'Combustível', MANUTENCAO: 'Manutenção', PECAS: 'Peças', PNEUS: 'Pneus', LAVAGEM: 'Lavagem',
  PEDAGIO_ESTACIONAMENTO: 'Pedágio e estacionamento', MULTA: 'Multas', SEGURO: 'Seguro', IPVA_LICENCIAMENTO: 'IPVA e licenciamento',
  FINANCIAMENTO: 'Financiamento', MONITOR: 'Monitor', OUTROS: 'Outros', CUSTOS_FIXOS: 'Custos fixos',
  FRETE_EXTRA: 'Frete extra', PASSEIO: 'Passeio', OUTRA_RECEITA: 'Outra receita'
};
const DESPESAS = ['MANUTENCAO', 'PECAS', 'PNEUS', 'LAVAGEM', 'PEDAGIO_ESTACIONAMENTO', 'MULTA', 'SEGURO', 'IPVA_LICENCIAMENTO', 'FINANCIAMENTO', 'MONITOR', 'OUTROS'];
const RECEITAS = ['FRETE_EXTRA', 'PASSEIO', 'OUTRA_RECEITA'];
const COMBUSTIVEIS: [string, string][] = [['DIESEL', 'Diesel'], ['GASOLINA', 'Gasolina'], ['ETANOL', 'Etanol'], ['GNV', 'GNV']];
const hojeLocal = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

const Tile: React.FC<{ rotulo: string; valor: string; sub?: string; cor?: string }> = ({ rotulo, valor, sub, cor = 'text-slate-100' }) => (
  <div className="rounded-2xl p-3 bg-slate-900 border border-slate-800">
    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{rotulo}</p>
    <p className={`text-lg font-black ${cor}`}>{valor}</p>
    {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
  </div>
);

/** Gráfico de barras do lucro dos últimos 6 meses (SVG simples, aceita lucro negativo). */
const GraficoLucro: React.FC<{ serie: ResumoFinanceiro['serie'] }> = ({ serie }) => {
  const max = Math.max(1, ...serie.map((s) => Math.abs(s.lucro)));
  const H = 120, meio = 60;
  return (
    <figure aria-label="Lucro dos últimos 6 meses" className="bg-slate-900 border border-slate-800 rounded-2xl p-3">
      <figcaption className="text-[11px] font-bold text-slate-300 mb-2">Lucro dos últimos 6 meses</figcaption>
      <svg viewBox={`0 0 300 ${H + 18}`} className="w-full" role="img">
        <line x1="0" x2="300" y1={meio} y2={meio} stroke="#334155" strokeWidth="1" />
        {serie.map((s, i) => {
          const h = (Math.abs(s.lucro) / max) * (meio - 8);
          const x = 10 + i * 48;
          const y = s.lucro >= 0 ? meio - h : meio;
          return (
            <g key={s.mes}>
              <rect x={x} y={y} width="30" height={Math.max(h, s.lucro === 0 ? 0 : 2)} rx="4" fill={s.lucro >= 0 ? '#34d399' : '#fb7185'} />
              <text x={x + 15} y={H + 12} textAnchor="middle" fontSize="10" fill="#94a3b8">{mesCurto(s.mes)}</text>
              <title>{`${nomeMes(s.mes)}: ${brl(s.lucro)}`}</title>
            </g>
          );
        })}
      </svg>
      <p className="text-[10px] text-slate-500 text-center">Verde = lucro · Rosa = prejuízo · toque na barra para ver o valor</p>
    </figure>
  );
};

type TipoForm = 'ABASTECIMENTO' | 'DESPESA' | 'RECEITA';

const Formulario: React.FC<{ editar?: LancamentoFin | null; ultimaKm: number | null; onFechar: () => void; onSalvo: () => void }> = ({ editar, ultimaKm, onFechar, onSalvo }) => {
  const inicial: TipoForm = editar ? (editar.categoria === 'COMBUSTIVEL' ? 'ABASTECIMENTO' : editar.tipo) : 'ABASTECIMENTO';
  const [tipo, setTipo] = useState<TipoForm>(inicial);
  const [data, setData] = useState(editar?.data ?? hojeLocal());
  const [km, setKm] = useState(editar?.km !== undefined ? String(editar.km) : '');
  const [litros, setLitros] = useState(editar?.litros !== undefined ? String(editar.litros).replace('.', ',') : '');
  const [precoLitro, setPrecoLitro] = useState(editar?.valor_litro !== undefined ? String(editar.valor_litro).replace('.', ',') : '');
  const [valor, setValor] = useState(editar ? String(editar.valor).replace('.', ',') : '');
  const [comb, setComb] = useState(editar?.combustivel ?? 'DIESEL');
  const [cheio, setCheio] = useState(editar?.tanque_cheio ?? true);
  const [posto, setPosto] = useState(editar?.posto ?? '');
  const [categoria, setCategoria] = useState(editar && editar.categoria !== 'COMBUSTIVEL' ? editar.categoria : (inicial === 'RECEITA' ? 'FRETE_EXTRA' : 'MANUTENCAO'));
  const [obs, setObs] = useState(editar?.obs ?? '');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const paraNum = (t: string) => Number(t.replace(/\./g, '').replace(',', '.'));
  const calculado = tipo === 'ABASTECIMENTO' && !valor && litros && precoLitro ? paraNum(litros) * paraNum(precoLitro) : null;

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado(true); setErro(null);
    try {
      const base: Record<string, unknown> = { data, obs: obs || undefined };
      if (tipo === 'ABASTECIMENTO') {
        Object.assign(base, { tipo: 'DESPESA', categoria: 'COMBUSTIVEL', combustivel: comb, km, litros, tanque_cheio: cheio, posto: posto || undefined });
        if (valor) base.valor = valor;
        if (precoLitro) base.valor_litro = precoLitro;
      } else {
        Object.assign(base, { tipo, categoria, valor });
        if (km) base.km = km;
      }
      await TransportRepository.salvarLancamentoFin(base, editar?.id);
      onSalvo();
    } catch (err: any) { setErro(err.message); } finally { setOcupado(false); }
  };

  const campo = 'mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 min-h-[44px] text-sm text-slate-100';
  return (
    <form onSubmit={salvar} aria-label="Novo lançamento" className="bg-slate-900 border border-amber-400/30 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-amber-200">{editar ? 'Editar lançamento' : 'Novo lançamento'}</h3>
        <button type="button" onClick={onFechar} className="text-xs text-slate-400 underline min-h-[44px] cursor-pointer">Fechar</button>
      </div>
      {!editar && (
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Tipo">
          {([['ABASTECIMENTO', 'Abastecimento'], ['DESPESA', 'Despesa'], ['RECEITA', 'Receita extra']] as const).map(([k, nome]) => (
            <button key={k} type="button" role="radio" aria-checked={tipo === k} onClick={() => { setTipo(k); setCategoria(k === 'RECEITA' ? 'FRETE_EXTRA' : 'MANUTENCAO'); }}
              className={`px-1 py-2 min-h-[44px] rounded-xl border text-[11px] font-black cursor-pointer ${tipo === k ? 'bg-amber-400/15 text-amber-200 border-amber-400/50' : 'bg-slate-950 text-slate-400 border-slate-800'}`}>{nome}</button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-slate-400">Data<input type="date" value={data} max={hojeLocal()} onChange={(e) => setData(e.target.value)} className={campo} required /></label>
        <label className="text-[11px] text-slate-400">Km do painel{tipo !== 'ABASTECIMENTO' ? ' (opcional)' : ''}
          <input inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} placeholder={ultimaKm ? `última: ${num(ultimaKm, 0)}` : '85000'} className={campo} required={tipo === 'ABASTECIMENTO'} />
        </label>
      </div>

      {tipo === 'ABASTECIMENTO' ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-slate-400">Litros<input inputMode="decimal" value={litros} onChange={(e) => setLitros(e.target.value)} placeholder="40,5" className={campo} required /></label>
            <label className="text-[11px] text-slate-400">Preço por litro (R$)<input inputMode="decimal" value={precoLitro} onChange={(e) => setPrecoLitro(e.target.value)} placeholder="5,99" className={campo} /></label>
          </div>
          <label className="text-[11px] text-slate-400 block">Valor total pago (R$)
            <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder={calculado ? `calculado: ${num(calculado)}` : '242,60'} className={campo} />
          </label>
          <p className="text-[10px] text-slate-500">Informe o preço por litro <em>ou</em> o valor total: o app calcula o outro.</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-slate-400">Combustível
              <select value={comb} onChange={(e) => setComb(e.target.value)} className={campo}>{COMBUSTIVEIS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
            </label>
            <label className="text-[11px] text-slate-400">Posto (opcional)<input value={posto} onChange={(e) => setPosto(e.target.value)} className={campo} maxLength={60} /></label>
          </div>
          <label className="flex items-start gap-2 text-xs text-slate-200 cursor-pointer min-h-[44px]">
            <input type="checkbox" checked={cheio} onChange={(e) => setCheio(e.target.checked)} className="mt-0.5" />
            <span><strong>Completei o tanque</strong><br /><span className="text-[10px] text-slate-400">O consumo (km/L) é calculado entre dois tanques cheios.</span></span>
          </label>
        </>
      ) : (
        <>
          <label className="text-[11px] text-slate-400 block">Categoria
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={campo}>{(tipo === 'RECEITA' ? RECEITAS : DESPESAS).map((k) => <option key={k} value={k}>{CAT[k]}</option>)}</select>
          </label>
          <label className="text-[11px] text-slate-400 block">Valor (R$)<input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="200,00" className={campo} required /></label>
        </>
      )}
      <label className="text-[11px] text-slate-400 block">Observação (opcional)<input value={obs} onChange={(e) => setObs(e.target.value)} maxLength={200} className={campo} /></label>
      {erro && <p role="alert" className="text-[11px] text-rose-300">{erro}</p>}
      <button type="submit" disabled={ocupado} className="w-full px-4 py-3 min-h-[48px] rounded-xl bg-amber-400 text-slate-950 text-sm font-black cursor-pointer disabled:opacity-50">{ocupado ? 'Salvando…' : 'Salvar'}</button>
    </form>
  );
};

const CustosFixos: React.FC<{ onMudou: () => void }> = ({ onMudou }) => {
  const [lista, setLista] = useState<CustoFixoFin[]>([]);
  const [nome, setNome] = useState('');
  const [valor, setValor] = useState('');
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const carregar = useCallback(() => { TransportRepository.listarCustosFixos().then(setLista).catch((e) => setErro(e.message)); }, []);
  useEffect(() => { carregar(); }, [carregar]);
  const adicionar = async (e: React.FormEvent) => {
    e.preventDefault(); setErro(null);
    try { await TransportRepository.adicionarCustoFixo({ nome, valor_mensal: valor }); setNome(''); setValor(''); carregar(); onMudou(); } catch (err: any) { setErro(err.message); }
  };
  const apagar = async (id: number) => {
    if (!window.confirm('Remover este custo fixo? Ele deixa de contar em todos os meses.')) return;
    try { await TransportRepository.apagarCustoFixo(id); carregar(); onMudou(); } catch (err: any) { setErro(err.message); }
  };
  const total = lista.reduce((s, c) => s + c.valor_mensal, 0);
  return (
    <section aria-label="Custos fixos" className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
      <button type="button" onClick={() => setAberto(!aberto)} aria-expanded={aberto} className="w-full flex items-center justify-between min-h-[44px] cursor-pointer">
        <span className="text-xs font-bold text-slate-200">Custos fixos mensais</span>
        <span className="text-xs text-slate-400">{lista.length ? `${brl(total)}/mês · ` : ''}{aberto ? 'Esconder' : 'Ver'}</span>
      </button>
      {aberto && (
        <>
          <p className="text-[11px] text-slate-400">Seguro, parcela do financiamento, IPVA parcelado etc. Entram todo mês no cálculo do lucro.</p>
          <ul className="space-y-1.5">
            {lista.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 text-xs bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
                <span className="text-slate-200 truncate">{c.nome}</span>
                <span className="flex items-center gap-2 shrink-0"><strong className="text-slate-100">{brl(c.valor_mensal)}</strong>
                  <button type="button" onClick={() => apagar(c.id)} aria-label={`Remover ${c.nome}`} className="text-rose-300 underline min-h-[44px] cursor-pointer">Remover</button></span>
              </li>
            ))}
          </ul>
          <form onSubmit={adicionar} className="grid grid-cols-[1fr_96px_auto] gap-2 items-end">
            <label className="text-[11px] text-slate-400">Nome<input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seguro" maxLength={60} required className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 min-h-[44px] text-sm text-slate-100" /></label>
            <label className="text-[11px] text-slate-400">R$/mês<input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="250" required className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 min-h-[44px] text-sm text-slate-100" /></label>
            <button type="submit" className="px-3 min-h-[44px] rounded-xl bg-slate-800 text-slate-100 text-xs font-bold cursor-pointer">Adicionar</button>
          </form>
        </>
      )}
      {erro && <p role="alert" className="text-[11px] text-rose-300">{erro}</p>}
    </section>
  );
};

/** Aba "Financeiro" do painel do motorista: lucro, combustível (R$ e litros), consumo, custo por km e lançamentos. */
export const Financeiro: React.FC = () => {
  const [mes, setMes] = useState<string | undefined>(undefined);
  const [dados, setDados] = useState<ResumoFinanceiro | null>(null);
  const [lancs, setLancs] = useState<LancamentoFin[]>([]);
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<LancamentoFin | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async (m?: string) => {
    try {
      const r = await TransportRepository.resumoFinanceiro(m);
      setDados(r);
      setLancs(await TransportRepository.listarLancamentosFin(r.mes));
      setErro(null);
    } catch (e: any) { setErro(e.message); }
  }, []);
  useEffect(() => { carregar(mes); }, [mes, carregar]);

  if (erro && !dados) return <p role="alert" className="text-xs text-rose-300">{erro}</p>;
  if (!dados) return <p className="text-xs text-slate-400">Carregando financeiro…</p>;

  const { resumo: r, consumo: c } = dados;
  const lucroPositivo = r.lucro >= 0;
  const mesAtual = dados.hoje.slice(0, 7);
  const dif = r.lucro - dados.mes_anterior.lucro;
  const maxCat = Math.max(1, ...r.por_categoria.map((x) => x.valor));

  const apagar = async (l: LancamentoFin) => {
    if (!window.confirm('Apagar este lançamento?')) return;
    try { await TransportRepository.apagarLancamentoFin(l.id); carregar(mes); } catch (e: any) { setErro(e.message); }
  };

  return (
    <section aria-label="Financeiro" className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button type="button" aria-label="Mês anterior" onClick={() => setMes(somarMes(dados.mes, -1))} className="w-11 h-11 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 font-black cursor-pointer">‹</button>
        <div className="text-center">
          <h2 className="text-sm font-extrabold text-slate-100">{tituloMes(dados.mes)}</h2>
          {dados.mes !== mesAtual && <button type="button" onClick={() => setMes(undefined)} className="text-[11px] text-amber-300 underline cursor-pointer">Voltar ao mês atual</button>}
        </div>
        <button type="button" aria-label="Próximo mês" disabled={dados.mes >= mesAtual} onClick={() => setMes(somarMes(dados.mes, 1))} className="w-11 h-11 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 font-black cursor-pointer disabled:opacity-30">›</button>
      </div>

      <div className={`rounded-3xl p-4 border space-y-2 ${lucroPositivo ? 'bg-gradient-to-br from-emerald-600/30 via-slate-900 to-slate-900 border-emerald-400/30' : 'bg-gradient-to-br from-rose-600/30 via-slate-900 to-slate-900 border-rose-400/30'}`}>
        <p className={`text-[11px] font-bold uppercase tracking-wider ${lucroPositivo ? 'text-emerald-300' : 'text-rose-300'}`}>{lucroPositivo ? 'Lucro do mês' : 'Prejuízo do mês'}</p>
        <p data-testid="lucro-mes" className="text-3xl font-black text-white">{brl(r.lucro)}</p>
        <p className="text-[11px] text-slate-300">
          {r.margem_pct !== null ? `Margem de ${num(r.margem_pct, 1)}% · ` : ''}
          {dados.mes_anterior.receita_total + dados.mes_anterior.despesas_total > 0
            ? `${dif >= 0 ? '▲' : '▼'} ${brl(Math.abs(dif))} em relação a ${mesCurto(dados.mes_anterior.mes)}`
            : 'Sem mês anterior para comparar'}
        </p>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div><p className="text-[10px] text-slate-400">Receita</p><p className="text-sm font-extrabold text-emerald-300">{brl(r.receita_total)}</p></div>
          <div><p className="text-[10px] text-slate-400">Despesas</p><p className="text-sm font-extrabold text-rose-300">{brl(r.despesas_total)}</p></div>
        </div>
        <p className="text-[10px] text-slate-400">Mensalidades recebidas {brl(r.receita_mensalidades)} · extras {brl(r.receita_extras)} · custos fixos {brl(r.custos_fixos)}</p>
      </div>

      <button type="button" onClick={() => { setEditando(null); setFormAberto(true); }} className="w-full px-4 py-3 min-h-[48px] rounded-2xl bg-amber-400 text-slate-950 text-sm font-black cursor-pointer">+ Lançar abastecimento, despesa ou receita</button>
      {(formAberto || editando) && (
        <Formulario editar={editando} ultimaKm={dados.ultima_km} onFechar={() => { setFormAberto(false); setEditando(null); }} onSalvo={() => { setFormAberto(false); setEditando(null); carregar(mes); }} />
      )}

      <div className="rounded-3xl p-4 bg-slate-900 border border-amber-400/30 space-y-2">
        <p className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">Combustível no mês</p>
        <div className="grid grid-cols-2 gap-3">
          <div><p className="text-[10px] text-slate-400">Gasto</p><p data-testid="comb-valor" className="text-xl font-black text-white">{brl(r.combustivel.valor)}</p></div>
          <div><p className="text-[10px] text-slate-400">Litros</p><p data-testid="comb-litros" className="text-xl font-black text-white">{num(r.combustivel.litros, 1)} L</p></div>
        </div>
        <p className="text-[11px] text-slate-400">
          {r.combustivel.abastecimentos} abastecimento(s){r.combustivel.preco_medio_litro ? ` · preço médio ${brl(r.combustivel.preco_medio_litro, 3)}/L` : ''}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Tile rotulo="Consumo médio" valor={c.media_km_por_litro ? `${num(c.media_km_por_litro)} km/L` : '—'} sub={c.media_km_por_litro ? `${brl(c.custo_medio_por_km, 3)}/km de combustível` : 'precisa de 2 tanques cheios'} />
        <Tile rotulo="Km rodados" valor={r.km_rodados ? `${num(r.km_rodados, 0)} km` : '—'} sub={dados.ultima_km ? `painel: ${num(dados.ultima_km, 0)} km` : 'lance o km do painel'} />
        <Tile rotulo="Custo por km" valor={r.custo_por_km ? brl(r.custo_por_km, 3) : '—'} sub="todas as despesas ÷ km" />
        <Tile rotulo="Lucro por km" valor={r.lucro_por_km !== null ? brl(r.lucro_por_km, 3) : '—'} sub="lucro ÷ km" cor={(r.lucro_por_km ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'} />
      </div>
      {c.aviso && <p role="status" className="text-[11px] text-amber-200 bg-amber-400/10 border border-amber-400/40 rounded-xl p-3">{c.aviso}</p>}

      <GraficoLucro serie={dados.serie} />

      {r.por_categoria.length > 0 && (
        <section aria-label="Despesas por categoria" className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
          <h3 className="text-xs font-bold text-slate-200">Para onde foi o dinheiro</h3>
          {r.por_categoria.map((x) => (
            <div key={x.categoria}>
              <div className="flex justify-between text-[11px]"><span className="text-slate-300">{CAT[x.categoria] ?? x.categoria}</span><span className="text-slate-100 font-bold">{brl(x.valor)} <span className="text-slate-500 font-normal">· {num((x.valor / r.despesas_total) * 100, 0)}%</span></span></div>
              <div className="h-2 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-amber-400" style={{ width: `${(x.valor / maxCat) * 100}%` }} /></div>
            </div>
          ))}
        </section>
      )}

      {c.ciclos.length > 0 && (
        <section aria-label="Consumo por tanque" className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
          <h3 className="text-xs font-bold text-slate-200">Consumo por tanque (últimos ciclos)</h3>
          <ul className="space-y-1.5">
            {c.ciclos.map((x) => (
              <li key={x.fim + x.km} className="flex items-center justify-between text-[11px] bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
                <span className="text-slate-400">{dataBR(x.inicio)} → {dataBR(x.fim)}</span>
                <span className="text-slate-200"><strong>{num(x.km_por_litro)} km/L</strong> · {num(x.km, 0)} km · {num(x.litros, 1)} L · {brl(x.valor)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Lançamentos do mês" className="space-y-2">
        <h3 className="text-xs font-bold text-slate-200">Lançamentos de {nomeMes(dados.mes)}</h3>
        {lancs.length === 0 ? <p className="text-xs text-slate-400 bg-slate-900 border border-slate-800 rounded-2xl p-4">Nada lançado neste mês ainda.</p> : (
          <ul className="space-y-2">
            {lancs.map((l) => (
              <li key={l.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-100">{CAT[l.categoria] ?? l.categoria}{l.combustivel ? ` · ${COMBUSTIVEIS.find(([k]) => k === l.combustivel)?.[1]}` : ''}</p>
                  <p className="text-[11px] text-slate-400">
                    {dataBR(l.data)}{l.km !== undefined ? ` · ${num(l.km, 0)} km` : ''}
                    {l.litros ? ` · ${num(l.litros, 1)} L a ${brl(l.valor_litro, 3)}` : ''}{l.tanque_cheio ? ' · tanque cheio' : ''}
                  </p>
                  {(l.posto || l.obs) && <p className="text-[11px] text-slate-500 truncate">{[l.posto, l.obs].filter(Boolean).join(' · ')}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-extrabold ${l.tipo === 'RECEITA' ? 'text-emerald-300' : 'text-rose-300'}`}>{l.tipo === 'RECEITA' ? '+' : '−'} {brl(l.valor)}</p>
                  <div className="flex justify-end gap-3">
                    <button type="button" onClick={() => { setEditando(l); setFormAberto(true); }} className="text-[11px] text-slate-300 underline min-h-[44px] cursor-pointer">Editar</button>
                    <button type="button" onClick={() => apagar(l)} className="text-[11px] text-rose-300 underline min-h-[44px] cursor-pointer">Apagar</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CustosFixos onMudou={() => carregar(mes)} />
      {erro && <p role="alert" className="text-[11px] text-rose-300">{erro}</p>}
    </section>
  );
};
