import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Bloco recolhível de "Mais > Rotas e ajustes": começa fechado, só com o título.
 * O conteúdo continua montado (só escondido), então o que foi digitado não se perde ao recolher.
 */
export function SecaoRecolhivel({ titulo, descricao, children }: { titulo: string; descricao?: string; children: ReactNode }) {
  const [aberta, setAberta] = useState(false);
  return (
    <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
      <button
        type="button"
        aria-expanded={aberta}
        onClick={() => setAberta(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 min-h-[52px] text-left cursor-pointer active:scale-[0.99]"
      >
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-slate-100">{titulo}</span>
          {descricao && <span className="block text-[11px] text-slate-400">{descricao}</span>}
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${aberta ? 'rotate-180' : ''}`} />
      </button>
      <div hidden={!aberta} className="px-2 pb-2 space-y-2">
        {children}
      </div>
    </div>
  );
}
