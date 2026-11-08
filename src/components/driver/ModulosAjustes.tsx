import React, { useState } from 'react';
import type { ModuloMotorista } from '../../services/api';

/**
 * Mais > Rotas e ajustes > Módulos: o motorista liga só o que usa, para o app ficar enxuto.
 * Desligar esconde o recurso, mas não apaga nada: os dados ficam guardados e voltam ao ligar de novo.
 */
export const ModulosAjustes: React.FC<{
  lista: ModuloMotorista[] | null;
  onAlterar: (chave: string, ativo: boolean) => Promise<void>;
}> = ({ lista, onAlterar }) => {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const alternar = async (m: ModuloMotorista) => {
    setOcupado(m.chave); setErro(null);
    try { await onAlterar(m.chave, !m.ativo); }
    catch (e: any) { setErro(e?.message || 'Não foi possível alterar.'); }
    finally { setOcupado(null); }
  };

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3" aria-label="Módulos">
      <div>
        <h3 className="text-sm font-bold text-slate-100">Módulos</h3>
        <p className="text-[11px] text-slate-400">Ligue só o que você usa. Desligar apenas esconde: nada é apagado.</p>
      </div>
      {!lista && <p className="text-xs text-slate-400">Carregando…</p>}
      {lista && (
        <ul className="space-y-2">
          {lista.map((m) => (
            <li key={m.chave} className="flex items-center gap-3 rounded-xl bg-slate-950/60 border border-slate-800 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-100">{m.nome}</p>
                <p className="text-[11px] text-slate-400">{m.descricao}</p>
              </div>
              <button
                type="button" role="switch" aria-checked={m.ativo} aria-label={`${m.nome}: ${m.ativo ? 'ligado' : 'desligado'}`}
                disabled={ocupado === m.chave} onClick={() => alternar(m)}
                className={`relative shrink-0 w-12 h-7 rounded-full transition-colors cursor-pointer disabled:opacity-60 ${m.ativo ? 'bg-emerald-500' : 'bg-slate-700'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white transition-transform ${m.ativo ? 'translate-x-5' : ''}`} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {erro && <p role="alert" className="text-xs text-rose-300">{erro}</p>}
    </section>
  );
};
