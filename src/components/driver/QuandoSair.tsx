import React, { useState } from 'react';
import { TransportRepository } from '../../services/api';
import type { QuandoSair as Resultado, PrevisaoRota } from '../../services/api';

const hhmm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min` : `${min} min`);

/** Ferramenta do início do turno: usa o GPS do celular e diz a que horas sair para chegar no primeiro ponto a tempo. */
export const QuandoSair: React.FC<{ sentido: 'IDA' | 'VOLTA' }> = ({ sentido }) => {
  const [ocupado, setOcupado] = useState(false);
  const [r, setR] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const calcular = () => {
    setErro(null); setR(null);
    if (!navigator.geolocation) { setErro('Este navegador não oferece GPS.'); return; }
    setOcupado(true);
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        try { setR(await TransportRepository.quandoSair({ latitude: p.coords.latitude, longitude: p.coords.longitude }, sentido)); }
        catch (e: any) { setErro(e?.message || 'Não foi possível calcular agora.'); }
        finally { setOcupado(false); }
      },
      (e) => {
        setOcupado(false);
        setErro(e.code === e.PERMISSION_DENIED ? 'GPS bloqueado. Permita a localização no navegador e tente de novo.' : 'Não consegui obter sua localização. Tente de novo.');
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  const cor = r?.situacao === 'atrasado' ? 'border-rose-500/40 bg-rose-500/10' : r?.situacao === 'saia_agora' ? 'border-amber-400/40 bg-amber-400/10' : 'border-emerald-500/30 bg-emerald-500/10';
  const destinoTxt = r ? (r.sentido === 'IDA' ? `ao primeiro aluno (${r.destino})` : `à escola (${r.destino})`) : '';

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3" aria-label="Quando sair">
      <div>
        <h3 className="text-sm font-bold text-slate-100">Quando preciso sair?</h3>
        <p className="text-[11px] text-slate-400">Toque no começo do turno, de onde você estiver. O app calcula o tempo até {sentido === 'IDA' ? 'o primeiro aluno' : 'a escola'} e diz a hora de sair.</p>
      </div>
      <button type="button" onClick={calcular} disabled={ocupado} className="w-full py-3 rounded-xl bg-cyan-500 text-slate-950 text-sm font-bold min-h-[48px] cursor-pointer disabled:opacity-50">
        {ocupado ? 'Pegando o GPS…' : 'Calcular a partir de onde estou'}
      </button>
      {erro && <p role="alert" className="text-xs text-rose-300">{erro}</p>}
      {r && (
        <>
        <div className={`rounded-xl border p-3 space-y-1.5 ${cor}`} role="status">
          <p className="text-xs text-slate-300">
            Até {destinoTxt}: <b className="text-slate-100">{r.distanciaKm.toString().replace('.', ',')} km</b>, cerca de <b className="text-slate-100">{hhmm(r.minutosAteLa)}</b> (já contei {r.margemMin} min de folga).
          </p>
          {r.sairAs ? (
            <>
              <p className="text-xs text-slate-300">{r.sentido === 'IDA' ? 'Horário combinado' : 'Chegar na escola ({r.folgaChegadaMin} min antes da saída)'}: <b className="text-slate-100">{r.horarioAlvo}</b></p>
              <p className="text-lg font-black text-slate-50">Saia às {r.sairAs}</p>
              <p className="text-xs font-bold text-slate-200">
                {r.situacao === 'ha_tempo' && `Faltam ${hhmm(r.faltamMin ?? 0)} para sair (agora são ${r.agora}).`}
                {r.situacao === 'saia_agora' && 'Saia agora!'}
                {r.situacao === 'atrasado' && `Você já está ${hhmm(Math.abs(r.faltamMin ?? 0))} atrasado para esse horário. Avise a família.`}
              </p>
            </>
          ) : (
            <p className="text-xs text-amber-200">Este {r.sentido === 'IDA' ? 'aluno' : 'ponto'} ainda não tem horário definido, então não dá para dizer a hora de sair. Defina o horário da escola (Ajustes) ou o horário do aluno.</p>
          )}
        </div>
        <PrevisaoDaRota rota={r.rota} sentido={r.sentido} />
        </>
      )}
    </section>
  );
};

/** Texto sugerido para a família; o motorista revisa e pode editar antes de enviar. */
function rascunho(sentido: 'IDA' | 'VOLTA', filhos: { nome: string; previsto: string; combinado: string | null; atrasoMin: number; porEscola: boolean }[], escolaChegada?: string): string {
  const max = Math.max(...filhos.map((f) => f.atrasoMin));
  const nomes = filhos.map((f) => f.nome).join(' e ');
  const quando = filhos.length === 1 && !filhos[0].porEscola
    ? `a previsão ${sentido === 'IDA' ? 'de passagem' : 'de chegada'} é ${filhos[0].previsto}${filhos[0].combinado ? ` (combinado ${filhos[0].combinado})` : ''}`
    : sentido === 'IDA' && escolaChegada ? `a chegada à escola está prevista para ${escolaChegada}` : `a previsão é ${filhos[0].previsto}`;
  return `Olá! A van de ${nomes} deve chegar com cerca de ${max} min de atraso hoje: ${quando}. Pedimos desculpas pelo transtorno.`;
}

/** Previsão da rota inteira. Não altera nenhum horário combinado: só mostra o atraso e deixa o motorista avisar as famílias afetadas. */
const PrevisaoDaRota: React.FC<{ rota: PrevisaoRota; sentido: 'IDA' | 'VOLTA' }> = ({ rota, sentido }) => {
  const afetados = rota.paradas.filter((p) => p.afetado);
  const familias = new Map<number, { nome: string; previsto: string; combinado: string | null; atrasoMin: number; porEscola: boolean }[]>();
  let semApp = 0;
  for (const p of afetados) {
    if (p.familia === null) { semApp++; continue; }
    const l = familias.get(p.familia) ?? [];
    l.push({ nome: p.nome, previsto: p.previsto, combinado: p.combinado, atrasoMin: p.atrasoMin ?? 0, porEscola: p.porEscola });
    familias.set(p.familia, l);
  }
  const [textos, setTextos] = useState<Record<number, string> | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  const abrir = () => {
    const t: Record<number, string> = {};
    familias.forEach((f, id) => { t[id] = rascunho(sentido, f, rota.escola?.chegada); });
    setResultado(null); setTextos(t);
  };
  const enviar = async () => {
    if (!textos) return;
    setEnviando(true); setResultado(null);
    let ok = 0; const falhas: number[] = [];
    for (const [id, texto] of Object.entries(textos)) {
      if (!texto.trim()) continue;
      try { await TransportRepository.enviarParaFamilia(Number(id), { texto: texto.trim() }); ok++; } catch { falhas.push(Number(id)); }
    }
    setEnviando(false);
    if (falhas.length) {
      setTextos(Object.fromEntries(Object.entries(textos).filter(([id]) => falhas.includes(Number(id))).map(([id, t]) => [Number(id), t])));
      setResultado(`${ok} enviada(s). ${falhas.length} não saiu(íram): toque em Enviar para tentar de novo.`);
    } else { setTextos(null); setResultado(`Aviso enviado para ${ok} família(s).`); }
  };

  const escola = rota.escola;
  const semAtraso = afetados.length === 0;
  return (
    <div className={`rounded-xl border p-3 space-y-2 ${semAtraso ? 'border-slate-800 bg-slate-950/40' : 'border-amber-400/40 bg-amber-400/10'}`} role="status" aria-label="Previsão da rota inteira">
      <p className="text-xs font-bold text-slate-100">Rota inteira, saindo agora</p>
      {escola && (
        <p className="text-xs text-slate-300">
          {sentido === 'IDA' ? 'Chegada à escola' : 'Chegada à escola para buscar os alunos'} ({escola.nome}): <b className="text-slate-100">{escola.chegada}</b>
          {escola.limite && sentido === 'IDA' && <> (limite {escola.limite})</>}.
        </p>
      )}
      {semAtraso
        ? <p className="text-xs text-emerald-300">Sem atraso previsto para as famílias (aviso a partir de {rota.toleranciaMin} min).</p>
        : <>
            <p className="text-xs text-amber-200">Atraso previsto de até <b>{rota.atrasoMaxMin} min</b>. O horário combinado no app não muda. {afetados.length} aluno(s) afetado(s):</p>
            <ul className="text-[11px] text-slate-300 space-y-0.5">
              {afetados.map((p) => (
                <li key={p.id}>{p.nome}: previsto <b className="text-slate-100">{p.previsto}</b>{p.combinado ? ` (combinado ${p.combinado})` : ''}, +{p.atrasoMin} min{p.porEscola ? ' (por causa da chegada à escola)' : ''}</li>
              ))}
            </ul>
          </>}
      {rota.aproximado && <p className="text-[11px] text-slate-500">Alguma parada ou a escola está sem ponto marcado no mapa; esse trecho foi estimado.</p>}
      {semApp > 0 && <p className="text-[11px] text-slate-400">{semApp} aluno(s) afetado(s) sem responsável no app: avise por outro meio.</p>}
      {!semAtraso && familias.size > 0 && !textos && (
        <button type="button" onClick={abrir} className="w-full py-2.5 rounded-xl bg-amber-400 text-slate-950 text-xs font-black min-h-[44px] cursor-pointer">Avisar as famílias afetadas ({familias.size})</button>
      )}
      {textos && (
        <div className="space-y-2" aria-label="Revisar mensagens">
          <p className="text-[11px] text-slate-400">Revise e edite se quiser. Cada família recebe só a sua mensagem, sem mapa nem endereço.</p>
          {Object.entries(textos).map(([id, texto]) => (
            <div key={id} className="space-y-1">
              <label className="text-[11px] font-bold text-slate-300" htmlFor={`aviso-${id}`}>Para: {familias.get(Number(id))?.map((f) => f.nome).join(' e ')}</label>
              <textarea id={`aviso-${id}`} value={texto} maxLength={500} rows={3} onChange={(e) => setTextos({ ...textos, [Number(id)]: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-400" />
            </div>
          ))}
          <div className="flex gap-2">
            <button type="button" onClick={enviar} disabled={enviando} className="flex-1 py-2.5 rounded-xl bg-cyan-500 text-slate-950 text-xs font-black min-h-[44px] cursor-pointer disabled:opacity-50">{enviando ? 'Enviando…' : 'Enviar'}</button>
            <button type="button" onClick={() => setTextos(null)} disabled={enviando} className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold min-h-[44px] cursor-pointer">Cancelar</button>
          </div>
        </div>
      )}
      {resultado && <p role="status" className="text-[11px] text-emerald-300">{resultado}</p>}
    </div>
  );
};
