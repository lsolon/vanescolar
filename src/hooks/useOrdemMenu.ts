import { useCallback, useState } from 'react';

/**
 * Ordem dos menus do painel do motorista (Mais e Rotas e ajustes), guardada só neste aparelho.
 * Não guarda dado de aluno: apenas a lista de ids dos blocos na ordem escolhida.
 */
export function useOrdemMenu(chave: string) {
  const storageKey = `vanescolar_ordem_${chave}`;
  const [ordem, setOrdem] = useState<string[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(storageKey) || '[]');
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  });

  /** Ids salvos primeiro (na ordem salva); ids novos ou nunca movidos mantêm a ordem padrão no fim. */
  const ordenar = useCallback(<T extends { id: string }>(itens: T[]): T[] => {
    const pos = (id: string) => { const i = ordem.indexOf(id); return i === -1 ? Number.MAX_SAFE_INTEGER : i; };
    return itens.map((it, i) => ({ it, i })).sort((a, b) => (pos(a.it.id) - pos(b.it.id)) || (a.i - b.i)).map(x => x.it);
  }, [ordem]);

  const mover = useCallback((idsAtuais: string[], id: string, delta: -1 | 1) => {
    const i = idsAtuais.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= idsAtuais.length) return;
    const nova = [...idsAtuais];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    setOrdem(nova);
    try { localStorage.setItem(storageKey, JSON.stringify(nova)); } catch { /* sem armazenamento: vale só até fechar o app */ }
  }, [storageKey]);

  const restaurar = useCallback(() => {
    setOrdem([]);
    try { localStorage.removeItem(storageKey); } catch { /* ignora */ }
  }, [storageKey]);

  return { ordenar, mover, restaurar, personalizada: ordem.length > 0 };
}
