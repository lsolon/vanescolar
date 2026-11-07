import React, { useState } from 'react';
import { TransportRepository } from '../../services/api';
import type { QuandoSair as Resultado } from '../../services/api';

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
        <div className={`rounded-xl border p-3 space-y-1.5 ${cor}`} role="status">
          <p className="text-xs text-slate-300">
            Até {destinoTxt}: <b className="text-slate-100">{r.distanciaKm.toString().replace('.', ',')} km</b>, cerca de <b className="text-slate-100">{hhmm(r.minutosAteLa)}</b> (já contei {r.margemMin} min de folga).
          </p>
          {r.sairAs ? (
            <>
              <p className="text-xs text-slate-300">{r.sentido === 'IDA' ? 'Horário combinado' : 'Saída da escola'}: <b className="text-slate-100">{r.horarioAlvo}</b></p>
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
      )}
    </section>
  );
};
