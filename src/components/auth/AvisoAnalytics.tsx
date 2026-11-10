import React, { useEffect, useState } from 'react';
import { analyticsDisponivel, definirAceiteAnalytics, lerAceiteAnalytics } from '../../services/analytics';

/** Aviso de medição de acessos (Google Analytics) nas telas públicas. Só aparece se o servidor tem o ID e a pessoa ainda não escolheu. */
export const AvisoAnalytics: React.FC = () => {
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    if (lerAceiteAnalytics() !== null) return;
    analyticsDisponivel().then((id) => { if (id) setVisivel(true); });
  }, []);
  if (!visivel) return null;
  const escolher = (aceitou: boolean) => { void definirAceiteAnalytics(aceitou); setVisivel(false); };
  return (
    <div role="dialog" aria-label="Medição de acessos" className="fixed inset-x-0 bottom-0 z-50 p-3">
      <div className="max-w-xl mx-auto bg-slate-900 border border-slate-700 rounded-2xl p-4 shadow-2xl space-y-3">
        <p className="text-xs text-slate-300">
          Usamos o Google Analytics, só nestas telas iniciais, para saber quantas pessoas visitam e criam conta. Não enviamos nome, e-mail, telefone nem dados de alunos. Você aceita?
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => escolher(true)} className="flex-1 px-3 py-2 rounded-xl bg-amber-400 text-slate-950 text-xs font-black min-h-[44px] cursor-pointer">Aceitar</button>
          <button type="button" onClick={() => escolher(false)} className="flex-1 px-3 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold min-h-[44px] cursor-pointer">Agora não</button>
        </div>
      </div>
    </div>
  );
};
