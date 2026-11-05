import React, { useEffect, useState } from 'react';
import { TransportRepository } from '../../services/api';
import type { SugestaoRota, EscolaMotorista } from '../../services/api';
import { SeletorLocal, LocalMarcado } from '../shared/SeletorLocal';

/** O motorista define onde fica cada escola: é o destino da barra de deslocamento do aluno a bordo. */
export const EscolasDoMotorista: React.FC<{ versao?: number }> = ({ versao }) => {
  const [escolas, setEscolas] = useState<EscolaMotorista[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [local, setLocal] = useState<LocalMarcado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [endereco, setEndereco] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [achado, setAchado] = useState<string | null>(null);

  const carregar = () => TransportRepository.obterEscolas().then(setEscolas).catch(() => {});
  useEffect(() => { carregar(); }, [versao]);

  if (escolas.length === 0) return null;

  const buscar = async () => {
    if (endereco.trim().length < 5) { setErro('Digite o endereço da escola (rua, número, bairro).'); return; }
    setBuscando(true); setErro(null); setAchado(null);
    const g = await TransportRepository.buscarEnderecoEscola(endereco);
    setBuscando(false);
    if (!g) { setErro('Não encontrei esse endereço. Toque no mapa para marcar o local da escola.'); return; }
    setLocal({ latitude: g.latitude, longitude: g.longitude });
    setAchado(g.nome);
  };

  const salvar = async (nome: string) => {
    if (!local) return;
    setSalvando(true); setErro(null);
    try { await TransportRepository.definirLocalEscola(nome, local.latitude, local.longitude); setEditando(null); setLocal(null); await carregar(); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao salvar.'); }
    finally { setSalvando(false); }
  };

  return (
    <section aria-label="Escolas" className="bg-slate-900 border border-indigo-400/30 rounded-2xl p-4 space-y-2">
      <h3 className="text-xs font-bold text-indigo-300">Local da escola</h3>
      <p className="text-[11px] text-slate-400">Depois que o aluno embarca, o responsável acompanha a van até a escola pela barra (sem mapa). Digite o endereço da escola ou marque no mapa.</p>
      <ul className="space-y-2">
        {escolas.map((e) => (
          <li key={e.nome} className="rounded-xl bg-slate-950 border border-slate-800 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-semibold text-slate-100">{e.nome}</span>
              <span className={`text-[10px] font-bold ${e.local ? 'text-emerald-400' : 'text-amber-300'}`}>{e.local ? 'Local marcado' : 'Local não marcado'}</span>
              {editando !== e.nome && (
                <button type="button" onClick={() => { setEditando(e.nome); setLocal(e.local); setErro(null); setEndereco(''); setAchado(null); }} className="px-3 py-2 rounded-xl bg-indigo-500/20 border border-indigo-400/40 text-indigo-200 text-xs font-bold min-h-[44px] cursor-pointer">
                  {e.local ? 'Alterar local' : 'Marcar local da escola'}
                </button>
              )}
            </div>
            {editando === e.nome && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input value={endereco} onChange={(ev) => setEndereco(ev.target.value)} onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); buscar(); } }}
                    placeholder="Endereço da escola (rua, número, bairro)" maxLength={200} aria-label="Endereço da escola"
                    className="flex-1 min-w-0 px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-cyan-400 min-h-[44px]" />
                  <button type="button" onClick={buscar} disabled={buscando} className="px-3 py-2 rounded-xl bg-amber-400/10 border border-amber-400/40 text-amber-200 text-xs font-bold min-h-[44px] cursor-pointer disabled:opacity-50">{buscando ? 'Buscando…' : 'Buscar no mapa'}</button>
                </div>
                {achado && <p className="text-[11px] text-emerald-300">Encontrado: {achado}. Confira no mapa e ajuste tocando, se precisar.</p>}
                <p className="text-[11px] text-slate-500">Ou toque direto no mapa (ou use o GPS no local) para marcar a escola.</p>
                <SeletorLocal valor={local} onChange={setLocal} />
                {erro && <p role="alert" className="text-[11px] text-rose-300">{erro}</p>}
                <div className="flex gap-2">
                  <button type="button" disabled={!local || salvando} onClick={() => salvar(e.nome)} className="px-3 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold min-h-[44px] cursor-pointer disabled:opacity-50">{salvando ? 'Salvando…' : 'Salvar local'}</button>
                  <button type="button" onClick={() => setEditando(null)} className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold min-h-[44px] cursor-pointer">Cancelar</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};

const PARTIDA: Record<string, string> = {
  gps: 'a partir da sua posição atual',
  escola: 'a partir da escola',
  mais_distante: 'a partir do aluno mais distante da escola',
  primeira: 'a partir da primeira parada'
};

type Sent = 'IDA' | 'VOLTA';
const TEMA: Record<Sent, { nome: string; aba: string; titulo: string; borda: string; num: string; btn: string; sec: string }> = {
  IDA: { nome: 'Ida', aba: 'bg-cyan-500/20 text-cyan-200 border-cyan-400/60', titulo: 'text-cyan-300', borda: 'border-cyan-400/30', num: 'text-cyan-300', btn: 'bg-cyan-400 text-slate-950', sec: 'bg-cyan-500/15 border-cyan-400/40 text-cyan-200' },
  VOLTA: { nome: 'Volta', aba: 'bg-amber-500/20 text-amber-200 border-amber-400/60', titulo: 'text-amber-300', borda: 'border-amber-400/30', num: 'text-amber-300', btn: 'bg-amber-400 text-slate-950', sec: 'bg-amber-500/15 border-amber-400/40 text-amber-200' }
};

/** Duas rotas independentes (Ida em azul, Volta em âmbar): cada uma com sua ordem, sugestão automática e ajuste manual. */
export const RotasIdaVolta: React.FC<{ sentidoAtivo?: Sent; versao?: number; onAplicado: () => void }> = ({ sentidoAtivo = 'IDA', versao, onAplicado }) => {
  const [aba, setAba] = useState<Sent>(sentidoAtivo);
  const [sug, setSug] = useState<SugestaoRota | null>(null);
  const [ordem, setOrdem] = useState<SugestaoRota['paradas']>([]);
  const [editado, setEditado] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const t = TEMA[aba];

  const carregar = async (modo: 'atual' | 'sugestao') => {
    setCarregando(true); setErro(null); setOk(null);
    try {
      const s = await TransportRepository.obterSugestaoRota(aba, modo);
      setSug(s); setOrdem(s.paradas); setEditado(modo === 'sugestao' && s.mudou);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao carregar a rota.'); }
    finally { setCarregando(false); }
  };
  useEffect(() => { carregar('atual'); /* eslint-disable-next-line */ }, [aba, versao]);

  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= ordem.length) return;
    const nova = [...ordem]; [nova[i], nova[j]] = [nova[j], nova[i]]; setOrdem(nova); setEditado(true); setOk(null);
  };
  const aplicar = async () => {
    setSalvando(true); setErro(null);
    try {
      await TransportRepository.aplicarOrdemRota(ordem.map((p) => p.id), aba);
      setEditado(false); setOk(`Rota de ${t.nome.toLowerCase()} salva.`); onAplicado();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao aplicar.'); }
    finally { setSalvando(false); }
  };

  return (
    <section aria-label="Rotas de ida e volta" className={`bg-slate-900 border ${t.borda} rounded-2xl p-4 space-y-3`}>
      <div role="tablist" aria-label="Sentido da rota" className="grid grid-cols-2 gap-2">
        {(['IDA', 'VOLTA'] as Sent[]).map((sv) => (
          <button key={sv} type="button" role="tab" id={`aba-rota-${sv}`} aria-selected={aba === sv} onClick={() => setAba(sv)}
            className={`px-3 py-2 min-h-[44px] rounded-xl border text-xs font-black cursor-pointer ${aba === sv ? TEMA[sv].aba : 'bg-slate-950 border-slate-800 text-slate-400'}`}>
            {sv === 'IDA' ? '➜ ' : '↩ '}{TEMA[sv].nome}{sv === 'IDA' ? ' (casa → escola)' : ' (escola → casa)'}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-labelledby={`aba-rota-${aba}`} className="space-y-3">
        <div>
          <h3 className={`text-xs font-bold ${t.titulo}`}>Rota de {t.nome.toLowerCase()}</h3>
          {sug?.modo === 'sugestao' && sug.partida && <p className="text-[11px] text-slate-400">Ordem sugerida {PARTIDA[sug.partida] || ''}{aba === 'IDA' && sug.escolaDefinida ? ', terminando na escola' : ''}.</p>}
          {sug?.modo === 'sugestao' && typeof sug.kmSugerido === 'number' && <p className="text-[11px] text-slate-400">Distância em linha reta: ~{sug.kmSugerido} km (ordem atual: ~{sug.kmAtual} km).</p>}
          {sug?.modo !== 'sugestao' && <p className="text-[11px] text-slate-400">Ordem em uso. Use as setas ou peça uma sugestão.</p>}
        </div>
        {sug && sug.semLocal > 0 && <p className="text-[11px] text-amber-300">{sug.semLocal} aluno(s) sem local marcado ficam no fim da sugestão.</p>}
        {sug && !sug.escolaDefinida && <p className="text-[11px] text-amber-300">Marque o local da escola para a sugestão considerar o trajeto até ela.</p>}
        {ordem.length === 0 && !carregando && <p className="text-[11px] text-slate-500">Nenhum aluno confirmado nesta rota.</p>}
        <ol className="space-y-2">
          {ordem.map((p, i) => (
            <li key={p.id} className="flex items-center gap-2 rounded-xl bg-slate-950 border border-slate-800 px-3 py-2">
              <span className={`w-6 text-center text-sm font-black ${t.num}`}>{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-100 truncate">{p.nome}</p>
                <p className="text-[10px] text-slate-500 truncate">{p.fixa ? 'já atendido' : p.temLocal ? (p.endereco || '') : 'sem local marcado'}</p>
              </div>
              <button type="button" aria-label={`Subir ${p.nome}`} onClick={() => mover(i, -1)} disabled={i === 0 || p.fixa || !!ordem[i - 1]?.fixa} className="w-10 h-10 rounded-lg bg-slate-800 text-slate-200 text-sm cursor-pointer disabled:opacity-30">▲</button>
              <button type="button" aria-label={`Descer ${p.nome}`} onClick={() => mover(i, 1)} disabled={i === ordem.length - 1 || p.fixa} className="w-10 h-10 rounded-lg bg-slate-800 text-slate-200 text-sm cursor-pointer disabled:opacity-30">▼</button>
            </li>
          ))}
        </ol>
        {erro && <p role="alert" className="text-[11px] text-rose-300">{erro}</p>}
        {ok && <p role="status" className="text-[11px] text-emerald-300">{ok}</p>}
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={() => carregar('sugestao')} disabled={carregando || ordem.length < 2} className={`px-3 py-2 rounded-xl border text-xs font-bold min-h-[44px] cursor-pointer disabled:opacity-50 ${t.sec}`}>{carregando ? 'Calculando…' : 'Sugerir rota'}</button>
          <button type="button" onClick={aplicar} disabled={salvando || !editado} className={`px-4 py-2 rounded-xl text-xs font-black min-h-[44px] cursor-pointer disabled:opacity-40 ${t.btn}`}>{salvando ? 'Salvando…' : 'Salvar esta ordem'}</button>
          {editado && <button type="button" onClick={() => carregar('atual')} className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold min-h-[44px] cursor-pointer">Descartar</button>}
        </div>
      </div>
    </section>
  );
};
