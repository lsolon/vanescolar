import React, { useEffect, useRef, useState } from 'react';
import type { ProximidadeVan } from '../../services/api';

type Estilo = 'A' | 'B' | 'C';

const VanIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg width="34" height="22" viewBox="0 0 34 22" aria-hidden="true" className={className}>
    <rect x="1" y="3" width="26" height="13" rx="3" fill="currentColor" />
    <path d="M27 7h3.5a2.5 2.5 0 0 1 2.2 1.3L34 12v4h-7z" fill="currentColor" />
    <rect x="5" y="6" width="5" height="4" rx="1" fill="#0f172a" />
    <rect x="12" y="6" width="5" height="4" rx="1" fill="#0f172a" />
    <rect x="19" y="6" width="5" height="4" rx="1" fill="#0f172a" />
    <circle cx="9" cy="17" r="3.2" fill="#e2e8f0" />
    <circle cx="26" cy="17" r="3.2" fill="#e2e8f0" />
  </svg>
);

export function textoProximidade(p: ProximidadeVan | null): { titulo: string; sub: string } {
  if (!p) return { titulo: 'Sem informações da van agora', sub: 'Assim que a rota começar, você acompanha por aqui.' };
  switch (p.estado) {
    case 'aguardando': return { titulo: 'Van aguardando partida', sub: 'Você será avisado quando ela estiver a caminho.' };
    case 'a_caminho':
      if (p.adiantada && p.horarioPrevisto) return { titulo: `Passa às ${p.horarioPrevisto} · ~${p.minutos} min`, sub: 'A van segue o horário combinado.' };
      return { titulo: `Van a caminho · ~${p.minutos} min`, sub: 'Acompanhe a van pela barra.' };
    case 'proxima':
      if (p.adiantada && p.horarioPrevisto) return { titulo: `Próxima parada é a sua · às ${p.horarioPrevisto} (~${p.minutos} min)`, sub: 'A van segue o horário combinado.' };
      return { titulo: `A próxima parada é a sua · ~${p.minutos} min`, sub: 'A van está chegando ao seu ponto.' };
    case 'embarcou':
      if (p.destino) return { titulo: `Aluno a bordo · ~${p.minutos} min até ${p.destino === 'casa' ? 'sua casa' : 'a escola'}`, sub: p.destino === 'casa' ? 'A van está levando o aluno para casa.' : 'A van segue para a escola.' };
      return { titulo: 'Aluno a bordo', sub: 'A van segue para a escola.' };
    case 'entregue': return { titulo: 'Aluno entregue', sub: 'Rota concluída para o seu aluno.' };
    case 'ausente': return { titulo: 'Ausência registrada', sub: 'A van não vai parar hoje.' };
    default: return { titulo: 'Rota encerrada', sub: 'Até a próxima viagem.' };
  }
}

const SEGMENTOS = 4;

/** Semáforo da chegada: cor + ícone + texto (a cor nunca é a única informação). Sem mapa nem localização. */
export function textoSemaforo(p: ProximidadeVan | null): { cor: 'verde' | 'amarelo' | 'vermelho' | 'cinza'; icone: string; titulo: string; detalhe: string } | null {
  if (!p || !p.rotaAtiva) return null;
  const abs = Math.abs(p.diferencaMin ?? 0);
  if (p.estado === 'proxima' && p.chegou) return { cor: 'verde', icone: '●', titulo: 'A van chegou ao seu ponto', detalhe: p.horarioPrevisto ? `Horário combinado: ${p.horarioPrevisto}` : '' };
  if ((p.estado === 'a_caminho' || p.estado === 'proxima') && p.semaforo) {
    const comb = p.horarioPrevisto ? `combinado ${p.horarioPrevisto}` : '';
    const chega = p.chegadaPrevista ? `Chega por volta das ${p.chegadaPrevista}` : '';
    if (p.semaforo === 'verde') return { cor: 'verde', icone: '●', titulo: 'No horário', detalhe: [chega, comb].filter(Boolean).join(' · ') };
    if (p.semaforo === 'amarelo') return { cor: 'amarelo', icone: '▲', titulo: `Adiantada (~${abs} min antes)`, detalhe: [chega, comb].filter(Boolean).join(' · ') + ' — esteja pronto antes do horário' };
    return { cor: 'vermelho', icone: '■', titulo: `Atrasada (~${abs} min)`, detalhe: [chega, comb].filter(Boolean).join(' · ') };
  }
  if ((p.estado === 'a_caminho' || p.estado === 'proxima') && !p.estimativaPrecisa) return { cor: 'cinza', icone: '○', titulo: 'Previsão ainda sem localização exata', detalhe: 'O motorista ainda não marcou o ponto de embarque ou o GPS não está ativo.' };
  if (p.estado === 'embarcou' && p.destino && p.chegadaPrevista) {
    const alvo = p.destino === 'casa' ? 'em casa' : 'na escola';
    if (p.semaforo === 'vermelho') return { cor: 'vermelho', icone: '■', titulo: `Pode chegar depois da entrada (~${abs} min)`, detalhe: `Chega ${alvo} por volta das ${p.chegadaPrevista}` };
    return { cor: p.semaforo === 'verde' ? 'verde' : 'cinza', icone: p.semaforo === 'verde' ? '●' : '○', titulo: `Chega ${alvo} por volta das ${p.chegadaPrevista}`, detalhe: `~${p.minutos} min de viagem` };
  }
  return null;
}
const COR_SEMAFORO = {
  verde: 'bg-emerald-500/15 border-emerald-400/50 text-emerald-200',
  amarelo: 'bg-amber-500/15 border-amber-400/50 text-amber-200',
  vermelho: 'bg-rose-500/15 border-rose-400/50 text-rose-200',
  cinza: 'bg-slate-800/60 border-slate-600 text-slate-300'
} as const;

export const SemaforoChegada: React.FC<{ proximidade: ProximidadeVan | null }> = ({ proximidade }) => {
  const s = textoSemaforo(proximidade);
  if (!s) return null;
  return (
    <div role="status" aria-label={`Semáforo da van: ${s.titulo}`} data-semaforo={s.cor} className={`mt-3 flex items-start gap-3 rounded-xl border px-3 py-2 ${COR_SEMAFORO[s.cor]}`}>
      <span aria-hidden="true" className="text-lg leading-none mt-0.5">{s.icone}</span>
      <div className="min-w-0">
        <p className="text-sm font-black leading-tight">{s.titulo}</p>
        {s.detalhe && <p className="text-xs opacity-90 mt-0.5">{s.detalhe}</p>}
      </div>
    </div>
  );
};

export const ProximidadeBar: React.FC<{ proximidade: ProximidadeVan | null; estilo: Estilo }> = ({ proximidade, estilo }) => {
  const prog = proximidade ? ((proximidade.estado === 'entregue' || (proximidade.estado === 'embarcou' && !proximidade.destino)) ? 1 : proximidade.progresso) : 0;
  const { titulo, sub } = textoProximidade(proximidade);
  const pct = Math.round(prog * 100);

  // Estrada curva (B): posição da van sobre o caminho SVG
  const pathRef = useRef<SVGPathElement>(null);
  const [pos, setPos] = useState({ x: 24, y: 70, len: 0, total: 1 });
  useEffect(() => {
    const el = pathRef.current;
    if (!el) return;
    const total = el.getTotalLength();
    const pt = el.getPointAtLength(total * prog);
    setPos({ x: pt.x, y: pt.y, len: total * prog, total });
  }, [prog, estilo]);

  const D = 'M 24 70 C 130 10, 210 10, 310 52 S 500 98, 612 38';
  const paradasDots = [0, 1, 2, 3];
  const ativa = proximidade?.rotaAtiva;

  return (
    <div>
      {estilo === 'A' && (
        <div className="relative h-14 mx-4" role="img" aria-label={`Van a ${pct}% do caminho`}>
          <div className="absolute left-0 right-0 top-9 h-1.5 rounded-full bg-slate-800" />
          <div className="absolute left-0 top-9 h-1.5 rounded-full bg-cyan-400 transition-all duration-700" style={{ width: `${pct}%` }} />
          {paradasDots.map((i) => (
            <span key={i} className={`absolute w-2.5 h-2.5 rounded-full border-2 -translate-x-1/2 -translate-y-1/2 ${i / SEGMENTOS <= prog && prog > 0 ? 'bg-cyan-400 border-cyan-400' : 'bg-slate-950 border-slate-600'}`} style={{ left: `${(i / SEGMENTOS) * 100}%`, top: 40 }} />
          ))}
          <span className="absolute -translate-x-1/2 -translate-y-1/2 text-emerald-400 text-lg" style={{ left: '100%', top: 40 }} aria-hidden="true">⌂</span>
          <span className="absolute top-1 -translate-x-1/2 text-cyan-300 transition-all duration-700" style={{ left: `${pct}%` }}><VanIcon /></span>
        </div>
      )}

      {estilo === 'B' && (
        <svg viewBox="0 0 640 100" className="w-full block" role="img" aria-label={`Van a ${pct}% do caminho`}>
          <path ref={pathRef} d={D} fill="none" stroke="#1e293b" strokeWidth="12" strokeLinecap="round" />
          <path d={D} fill="none" stroke="#22d3ee" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${pos.len} 3000`} style={{ transition: 'stroke-dasharray .7s' }} />
          <path d={D} fill="none" stroke="#475569" strokeWidth="1.5" strokeDasharray="2 8" strokeLinecap="round" />
          {pathRef.current && paradasDots.map((i) => {
            const pt = pathRef.current!.getPointAtLength((pos.total * i) / SEGMENTOS);
            const on = i / SEGMENTOS <= prog && prog > 0;
            return <circle key={i} cx={pt.x} cy={pt.y} r="6" strokeWidth="2" fill={on ? '#22d3ee' : '#020617'} stroke={on ? '#22d3ee' : '#475569'} />;
          })}
          <circle cx="612" cy="38" r="9" fill="#34d399" />
          <g transform={`translate(${pos.x - 17},${pos.y - 26})`} style={{ color: '#67e8f9', transition: 'transform .7s' }}>
            <VanIcon />
          </g>
        </svg>
      )}

      {estilo === 'C' && (
        <div className="flex items-center gap-4">
          <div className="min-w-[64px] text-center">
            <div className="text-3xl font-black text-cyan-300 font-mono leading-none">
              {proximidade?.minutos != null ? proximidade.minutos : '–'}
            </div>
            <div className="text-[11px] text-slate-400">min</div>
          </div>
          <div className="flex-1 relative h-14 mr-2">
            <span className="absolute top-0 -translate-x-1/2 text-cyan-300 transition-all duration-700" style={{ left: `${pct}%` }}><VanIcon /></span>
            <div className="absolute left-0 right-0 top-8 flex gap-1">
              {Array.from({ length: SEGMENTOS }).map((_, i) => {
                const f = Math.max(0, Math.min(1, prog * SEGMENTOS - i));
                return (
                  <div key={i} className="flex-1 h-2.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-cyan-400 transition-all duration-700" style={{ width: `${f * 100}%` }} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <p className={`mt-3 text-sm font-semibold ${ativa ? 'text-slate-100' : 'text-slate-300'}`}>{titulo}</p>
      <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
      <SemaforoChegada proximidade={proximidade} />
    </div>
  );
};
