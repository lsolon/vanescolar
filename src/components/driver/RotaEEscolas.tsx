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

  const carregar = () => TransportRepository.obterEscolas().then(setEscolas).catch(() => {});
  useEffect(() => { carregar(); }, [versao]);

  if (escolas.length === 0) return null;

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
      <p className="text-[11px] text-slate-400">Depois que o aluno embarca, o responsável acompanha a van até a escola pela barra (sem mapa). Marque onde a escola fica.</p>
      <ul className="space-y-2">
        {escolas.map((e) => (
          <li key={e.nome} className="rounded-xl bg-slate-950 border border-slate-800 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-semibold text-slate-100">{e.nome}</span>
              <span className={`text-[10px] font-bold ${e.local ? 'text-emerald-400' : 'text-amber-300'}`}>{e.local ? 'Local marcado' : 'Local não marcado'}</span>
              {editando !== e.nome && (
                <button type="button" onClick={() => { setEditando(e.nome); setLocal(e.local); setErro(null); }} className="px-3 py-2 rounded-xl bg-indigo-500/20 border border-indigo-400/40 text-indigo-200 text-xs font-bold min-h-[44px] cursor-pointer">
                  {e.local ? 'Alterar local' : 'Marcar local da escola'}
                </button>
              )}
            </div>
            {editando === e.nome && (
              <div className="space-y-2">
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

/** Sugere a ordem das paradas pelas distâncias; o motorista pode mover cada parada antes de aplicar. */
export const RotaSugerida: React.FC<{ sentido: 'IDA' | 'VOLTA'; onAplicado: () => void }> = ({ sentido, onAplicado }) => {
  const [sug, setSug] = useState<SugestaoRota | null>(null);
  const [ordem, setOrdem] = useState<SugestaoRota['paradas']>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const abrir = async () => {
    setCarregando(true); setErro(null);
    try { const s = await TransportRepository.obterSugestaoRota(sentido); setSug(s); setOrdem(s.paradas); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao sugerir.'); }
    finally { setCarregando(false); }
  };
  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= ordem.length) return;
    const nova = [...ordem]; [nova[i], nova[j]] = [nova[j], nova[i]]; setOrdem(nova);
  };
  const aplicar = async () => {
    setSalvando(true); setErro(null);
    try { await TransportRepository.aplicarOrdemRota(ordem.map((p) => p.id)); setSug(null); onAplicado(); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao aplicar.'); }
    finally { setSalvando(false); }
  };

  if (!sug) {
    return (
      <div>
        <button type="button" onClick={abrir} disabled={carregando} className="px-3 py-2 rounded-xl bg-cyan-500/15 border border-cyan-400/40 text-cyan-200 text-xs font-bold min-h-[44px] cursor-pointer disabled:opacity-50">
          {carregando ? 'Calculando…' : 'Sugerir rota'}
        </button>
        {erro && <p role="alert" className="text-[11px] text-rose-300 mt-1">{erro}</p>}
      </div>
    );
  }

  return (
    <section aria-label="Rota sugerida" className="bg-slate-900 border border-cyan-400/30 rounded-2xl p-4 space-y-3">
      <div>
        <h3 className="text-xs font-bold text-cyan-300">Rota sugerida ({sug.sentido === 'VOLTA' ? 'volta' : 'ida'})</h3>
        {sug.partida && <p className="text-[11px] text-slate-400">Ordem calculada {PARTIDA[sug.partida] || ''}{sug.sentido === 'IDA' && sug.escolaDefinida ? ', terminando na escola' : ''}.</p>}
        {typeof sug.kmSugerido === 'number' && <p className="text-[11px] text-slate-400">Distância em linha reta: ~{sug.kmSugerido} km (ordem atual: ~{sug.kmAtual} km).</p>}
        <p className="text-[11px] text-slate-500">Use as setas para mudar a ordem como preferir e depois aplique.</p>
      </div>
      {sug.semLocal > 0 && <p className="text-[11px] text-amber-300">{sug.semLocal} aluno(s) sem local marcado ficam no fim. Marque o local de cada um para entrarem no cálculo.</p>}
      {sug.sentido === 'IDA' && sug.escolaDefinida === false && <p className="text-[11px] text-amber-300">Marque o local da escola para a rota terminar nela.</p>}
      <ol className="space-y-2">
        {ordem.map((p, i) => (
          <li key={p.id} className="flex items-center gap-2 rounded-xl bg-slate-950 border border-slate-800 px-3 py-2">
            <span className="w-6 text-center text-sm font-black text-cyan-300">{i + 1}</span>
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
      <div className="flex gap-2 flex-wrap">
        <button type="button" onClick={aplicar} disabled={salvando} className="px-4 py-2 rounded-xl bg-cyan-400 text-slate-950 text-xs font-black min-h-[44px] cursor-pointer disabled:opacity-50">{salvando ? 'Aplicando…' : 'Aplicar esta ordem'}</button>
        <button type="button" onClick={() => setOrdem(sug.paradas)} className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold min-h-[44px] cursor-pointer">Voltar à sugestão</button>
        <button type="button" onClick={() => setSug(null)} className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold min-h-[44px] cursor-pointer">Fechar</button>
      </div>
    </section>
  );
};
