import React, { useState } from 'react';
import { TransportRepository } from '../../services/api';
import type { PrefsProximidade } from '../../services/api';

const ESTILOS: { id: 'A' | 'B' | 'C'; nome: string; desc: string }[] = [
  { id: 'A', nome: 'Estrada reta', desc: 'Simples e leve' },
  { id: 'B', nome: 'Estrada curva', desc: 'Mais visual' },
  { id: 'C', nome: 'Minutos em destaque', desc: 'Número grande' }
];
const AVISOS = [3, 5, 10, 15, 20, 30];

export const PreferenciasProximidade: React.FC<{ prefs: PrefsProximidade; onChange: (p: PrefsProximidade) => void }> = ({ prefs, onChange }) => {
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState(true);

  const salvar = async (novo: PrefsProximidade) => {
    const anterior = prefs;
    onChange(novo); // mostra na hora; volta atrás se o servidor recusar
    setSalvando(true);
    setErro(null);
    try {
      await TransportRepository.salvarPreferenciasProximidade(novo);
    } catch (e: any) {
      onChange(anterior);
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-slate-800">
      <button type="button" onClick={() => setAberto(!aberto)} className="text-xs text-cyan-400 hover:underline cursor-pointer" aria-expanded={aberto}>
        {aberto ? 'Esconder opções da barra' : 'Personalizar barra e aviso'}
      </button>
      {aberto && (
        <div className="mt-3 space-y-3">
          <fieldset>
            <legend className="text-[11px] font-semibold text-slate-300 mb-1.5">Estilo da barra</legend>
            <div className="grid grid-cols-3 gap-2">
              {ESTILOS.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => salvar({ ...prefs, estilo: e.id })}
                  aria-pressed={prefs.estilo === e.id}
                  className={`rounded-xl border px-2 py-2 text-left cursor-pointer min-h-[44px] ${prefs.estilo === e.id ? 'border-cyan-400 bg-cyan-400/10' : 'border-slate-700 bg-slate-950'}`}
                >
                  <span className="block text-xs font-semibold text-slate-100">{e.nome}</span>
                  <span className="block text-[10px] text-slate-400">{e.desc}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="aviso-min" className="block text-[11px] font-semibold text-slate-300 mb-1.5">Avisar quando a van estiver a</label>
            <select
              id="aviso-min"
              value={prefs.avisoMin}
              onChange={(e) => salvar({ ...prefs, avisoMin: Number(e.target.value) })}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white min-h-[44px]"
            >
              {AVISOS.map((m) => <option key={m} value={m}>{m} minutos de chegar</option>)}
            </select>
          </div>
          {salvando && <p className="text-[11px] text-slate-400">Salvando…</p>}
          {erro && <p role="alert" className="text-[11px] text-rose-300">{erro}</p>}
        </div>
      )}
    </div>
  );
};
