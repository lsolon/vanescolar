import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronDown } from 'lucide-react';

/** Setas de subir/descer, usadas quando o motorista está reordenando os menus. */
export function SetasOrdem({ nome, onSubir, onDescer, primeira, ultima }: { nome: string; onSubir: () => void; onDescer: () => void; primeira: boolean; ultima: boolean }) {
  const cls = 'w-11 h-11 flex items-center justify-center rounded-xl bg-slate-800 border border-slate-700 text-amber-300 cursor-pointer disabled:opacity-30 disabled:cursor-default';
  return (
    <span className="flex items-center gap-1 shrink-0">
      <button type="button" aria-label={`Subir ${nome}`} disabled={primeira} onClick={onSubir} className={cls}><ArrowUp className="w-4 h-4" /></button>
      <button type="button" aria-label={`Descer ${nome}`} disabled={ultima} onClick={onDescer} className={cls}><ArrowDown className="w-4 h-4" /></button>
    </span>
  );
}

/** Botão "Reordenar / Concluir" + "Voltar ao padrão" que fica acima de uma lista de menus. */
export function BarraReordenar({ editando, onAlternar, personalizada, onRestaurar }: { editando: boolean; onAlternar: () => void; personalizada: boolean; onRestaurar: () => void }) {
  return (
    <div className="flex items-center justify-end gap-2">
      {editando && personalizada && (
        <button type="button" onClick={onRestaurar} className="px-3 py-2 min-h-[44px] rounded-xl text-xs font-bold text-slate-400 cursor-pointer">Voltar ao padrão</button>
      )}
      <button type="button" onClick={onAlternar} className={`px-3 py-2 min-h-[44px] rounded-xl border text-xs font-bold cursor-pointer ${editando ? 'bg-amber-400 text-slate-950 border-amber-400' : 'bg-slate-900 text-slate-300 border-slate-800'}`}>
        {editando ? 'Concluir' : 'Reordenar'}
      </button>
    </div>
  );
}

/**
 * Bloco recolhível de "Mais > Rotas e ajustes": começa fechado, só com o título.
 * O conteúdo continua montado (só escondido), então o que foi digitado não se perde ao recolher.
 * Com `acoes` (modo reordenar), mostra as setas no lugar da seta de abrir e mantém o bloco fechado.
 */
export function SecaoRecolhivel({ titulo, descricao, acoes, children }: { titulo: string; descricao?: string; acoes?: ReactNode; children: ReactNode }) {
  const [aberta, setAberta] = useState(false);
  const mostrar = aberta && !acoes;
  return (
    <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
      <div className="flex items-center gap-2 pr-2">
        <button
          type="button"
          aria-expanded={mostrar}
          disabled={!!acoes}
          onClick={() => setAberta(v => !v)}
          className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 min-h-[52px] text-left cursor-pointer active:scale-[0.99] disabled:cursor-default"
        >
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-slate-100">{titulo}</span>
            {descricao && <span className="block text-[11px] text-slate-400">{descricao}</span>}
          </span>
          {!acoes && <ChevronDown className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${aberta ? 'rotate-180' : ''}`} />}
        </button>
        {acoes}
      </div>
      <div hidden={!mostrar} className="px-2 pb-2 space-y-2">
        {children}
      </div>
    </div>
  );
}
