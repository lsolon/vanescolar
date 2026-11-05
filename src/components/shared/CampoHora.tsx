import React from 'react';

interface Props {
  value: string;               // "HH:MM" ou ""
  onChange: (v: string) => void;
  label: string;
  id?: string;
  /** Hora sugerida ao escolher só os minutos */
  horaPadrao?: string;
}

const H = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const M = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

/**
 * Seletor de horário em duas listas (hora e minuto). Evita o seletor nativo do celular, cujo botão
 * de confirmar ("Definir") ficava escondido atrás da barra do navegador.
 */
export const CampoHora: React.FC<Props> = ({ value, onChange, label, id, horaPadrao = '07' }) => {
  const [h, m] = value && value.includes(':') ? value.split(':') : ['', ''];
  const mudar = (nh: string, nm: string) => {
    if (!nh && !nm) return onChange('');
    onChange(`${nh || horaPadrao}:${nm || '00'}`);
  };
  const cls = 'flex-1 min-w-0 px-2 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-cyan-400 min-h-[44px]';
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1">
      <select id={id} aria-label={`${label} — hora`} value={h} onChange={(e) => mudar(e.target.value, m)} className={cls}>
        <option value="">--</option>
        {H.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <span className="text-slate-400 font-bold" aria-hidden="true">:</span>
      <select aria-label={`${label} — minuto`} value={m} onChange={(e) => mudar(h, e.target.value)} className={cls}>
        <option value="">--</option>
        {M.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
    </div>
  );
};
