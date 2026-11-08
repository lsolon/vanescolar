import React, { useCallback, useEffect, useState } from 'react';
import { TransportRepository } from '../../services/api';
import type { ItemManutencaoStatus, PainelManutencao, SituacaoManutencao } from '../../services/api';

const ROTULO: Record<SituacaoManutencao, { texto: string; cor: string }> = {
  VENCIDO: { texto: 'Vencido', cor: 'bg-rose-500/15 text-rose-300 border-rose-400/40' },
  ATENCAO: { texto: 'Perto de vencer', cor: 'bg-amber-400/15 text-amber-200 border-amber-400/40' },
  SEM_DADOS: { texto: 'Falta informar', cor: 'bg-slate-700/40 text-slate-300 border-slate-600' },
  EM_DIA: { texto: 'Em dia', cor: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/40' }
};

const num = (n: number) => n.toLocaleString('pt-BR');
const dataBR = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '');

/** "faltam 1.200 km · até 30/11/2026" / "passou 500 km". */
function textoFaltam(i: ItemManutencaoStatus): string[] {
  const t: string[] = [];
  if (i.faltam_km !== null) t.push(i.faltam_km > 0 ? `faltam ${num(i.faltam_km)} km (próximo aos ${num(i.proximo_km as number)} km)` : `passou ${num(-i.faltam_km)} km`);
  if (i.faltam_dias !== null) t.push(i.faltam_dias > 0 ? `faltam ${num(i.faltam_dias)} dia(s) (até ${dataBR(i.proxima_data)})` : i.faltam_dias === 0 ? 'vence hoje' : `venceu há ${num(-i.faltam_dias)} dia(s)`);
  return t;
}

const Item: React.FC<{ i: ItemManutencaoStatus; kmAtual: number | null; aberto: boolean; onToggle: () => void; onPainel: (p: PainelManutencao) => void }> = ({ i, kmAtual, aberto, onToggle, onPainel }) => {
  const [km, setKm] = useState(kmAtual !== null ? String(kmAtual) : '');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const r = ROTULO[i.situacao];

  const agir = async (fn: () => Promise<PainelManutencao>) => {
    setOcupado(true); setErro(null);
    try { onPainel(await fn()); } catch (e: any) { setErro(e.message); } finally { setOcupado(false); }
  };

  return (
    <li className="rounded-2xl bg-slate-900 border border-slate-800">
      <button type="button" onClick={onToggle} aria-expanded={aberto} className="w-full text-left p-3 min-h-[56px] cursor-pointer">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-bold text-slate-100">{i.nome}</span>
          <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-full border ${r.cor}`}>{r.texto}</span>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">
          {i.situacao === 'SEM_DADOS'
            ? 'Informe quando foi feito pela última vez (toque aqui) para o app calcular.'
            : textoFaltam(i).join(' · ')}
        </p>
      </button>
      {aberto && (
        <div className="px-3 pb-3 space-y-2 border-t border-slate-800 pt-3">
          <p className="text-[11px] text-slate-400">
            A cada {[i.intervalo_km ? `${num(i.intervalo_km)} km` : '', i.intervalo_meses ? `${i.intervalo_meses} mês(es)` : ''].filter(Boolean).join(' ou ')}.
            {i.ultimo_km !== undefined || i.ultima_data ? ` Último: ${[i.ultimo_km !== undefined ? `${num(i.ultimo_km)} km` : '', i.ultima_data ? dataBR(i.ultima_data) : ''].filter(Boolean).join(' em ')}.` : ''}
          </p>
          <div className="flex items-end gap-2">
            {i.intervalo_km !== undefined && (
              <div className="flex-1">
                <label htmlFor={`km-${i.id}`} className="block text-[11px] font-semibold text-slate-300 mb-1">Km do painel agora</label>
                <input id={`km-${i.id}`} inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white min-h-[44px]" />
              </div>
            )}
            <button type="button" disabled={ocupado} onClick={() => agir(() => TransportRepository.marcarManutencaoFeita(i.id, i.intervalo_km !== undefined ? { km } : {}))}
              className="px-3 py-2 min-h-[44px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold cursor-pointer disabled:opacity-60">
              Marquei como feito hoje
            </button>
          </div>
          <button type="button" disabled={ocupado} onClick={() => { if (window.confirm(`Apagar "${i.nome}"?`)) agir(() => TransportRepository.apagarManutencao(i.id)); }}
            className="text-[11px] text-rose-300 underline cursor-pointer">Apagar este serviço</button>
          {erro && <p role="alert" className="text-[11px] text-rose-300">{erro}</p>}
        </div>
      )}
    </li>
  );
};

const Novo: React.FC<{ sugestoes: PainelManutencao['sugestoes']; onPainel: (p: PainelManutencao) => void; onFechar: () => void }> = ({ sugestoes, onPainel, onFechar }) => {
  const [nome, setNome] = useState('');
  const [ikm, setIkm] = useState('');
  const [imes, setImes] = useState('');
  const [ukm, setUkm] = useState('');
  const [udata, setUdata] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const usar = (s: PainelManutencao['sugestoes'][number]) => {
    setNome(s.nome); setIkm(s.intervalo_km ? String(s.intervalo_km) : ''); setImes(s.intervalo_meses ? String(s.intervalo_meses) : '');
  };
  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado(true); setErro(null);
    try {
      onPainel(await TransportRepository.adicionarManutencao({ nome, intervalo_km: ikm, intervalo_meses: imes, ultimo_km: ukm, ultima_data: udata }));
      onFechar();
    } catch (er: any) { setErro(er.message); } finally { setOcupado(false); }
  };
  const campo = 'w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white min-h-[44px]';

  return (
    <form onSubmit={salvar} className="rounded-2xl bg-slate-900 border border-cyan-500/30 p-3 space-y-3" aria-label="Novo serviço de manutenção">
      <div>
        <p className="text-[11px] font-semibold text-slate-300 mb-1.5">Comece por uma sugestão (você ajusta os números)</p>
        <div className="flex flex-wrap gap-1.5">
          {sugestoes.map((s) => (
            <button key={s.nome} type="button" onClick={() => usar(s)} className="px-2.5 py-1.5 min-h-[36px] rounded-full bg-slate-800 border border-slate-700 text-[11px] text-slate-200 cursor-pointer">{s.nome}</button>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor="man-nome" className="block text-[11px] font-semibold text-slate-300 mb-1">Serviço</label>
        <input id="man-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} placeholder="Ex.: Troca de óleo" className={campo} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="man-ikm" className="block text-[11px] font-semibold text-slate-300 mb-1">A cada (km)</label>
          <input id="man-ikm" inputMode="numeric" value={ikm} onChange={(e) => setIkm(e.target.value)} placeholder="10000" className={campo} />
        </div>
        <div>
          <label htmlFor="man-imes" className="block text-[11px] font-semibold text-slate-300 mb-1">ou a cada (meses)</label>
          <input id="man-imes" inputMode="numeric" value={imes} onChange={(e) => setImes(e.target.value)} placeholder="12" className={campo} />
        </div>
        <div>
          <label htmlFor="man-ukm" className="block text-[11px] font-semibold text-slate-300 mb-1">Último serviço: km</label>
          <input id="man-ukm" inputMode="numeric" value={ukm} onChange={(e) => setUkm(e.target.value)} className={campo} />
        </div>
        <div>
          <label htmlFor="man-udata" className="block text-[11px] font-semibold text-slate-300 mb-1">Último serviço: data</label>
          <input id="man-udata" type="date" value={udata} onChange={(e) => setUdata(e.target.value)} className={campo} />
        </div>
      </div>
      <p className="text-[10px] text-slate-500">Informe o km, a data, ou os dois. Se não souber, deixe em branco e marque como feito na próxima revisão.</p>
      {erro && <p role="alert" className="text-[11px] text-rose-300">{erro}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={ocupado} className="flex-1 px-3 py-2 min-h-[44px] rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-extrabold cursor-pointer disabled:opacity-60">Salvar serviço</button>
        <button type="button" onClick={onFechar} className="px-3 py-2 min-h-[44px] rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 cursor-pointer">Cancelar</button>
      </div>
    </form>
  );
};

/** Manutenção da van por km e por data. Dados só do motorista; o km atual vem dos abastecimentos do Financeiro e dos serviços. */
export const Manutencao: React.FC = () => {
  const [painel, setPainel] = useState<PainelManutencao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [aberto, setAberto] = useState<number | null>(null);

  const carregar = useCallback(() => {
    TransportRepository.listarManutencao().then(setPainel).catch((e: any) => setErro(e?.message || 'Não foi possível carregar a manutenção.'));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  if (erro) return <p role="alert" className="text-xs text-rose-300">{erro}</p>;
  if (!painel) return <p className="text-xs text-slate-400">Carregando manutenção…</p>;

  return (
    <section aria-label="Manutenção da van" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-extrabold text-slate-100">Manutenção</h2>
          <p className="text-[11px] text-slate-400">
            {painel.km_atual !== null ? `Km conhecido: ${num(painel.km_atual)}. Vem dos abastecimentos e dos serviços que você marca.` : 'Lance um abastecimento com o km do painel, ou marque um serviço, para o app saber o km atual.'}
          </p>
        </div>
        {!novo && (
          <button type="button" onClick={() => setNovo(true)} className="shrink-0 px-3 py-2 min-h-[44px] rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-extrabold cursor-pointer">+ Serviço</button>
        )}
      </div>
      {novo && <Novo sugestoes={painel.sugestoes} onPainel={setPainel} onFechar={() => setNovo(false)} />}
      {painel.itens.length === 0 && !novo && (
        <p className="text-xs text-slate-300 bg-slate-900 border border-slate-800 rounded-2xl p-4">
          Nenhum serviço cadastrado. Toque em <strong>+ Serviço</strong> e escolha uma sugestão, como a troca de óleo.
        </p>
      )}
      <ul className="space-y-2">
        {painel.itens.map((i) => (
          <Item key={i.id} i={i} kmAtual={painel.km_atual} aberto={aberto === i.id} onToggle={() => setAberto(aberto === i.id ? null : i.id)} onPainel={setPainel} />
        ))}
      </ul>
    </section>
  );
};
