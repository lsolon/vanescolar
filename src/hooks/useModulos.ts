import { useCallback, useEffect, useState } from 'react';
import { TransportRepository } from '../services/api';
import type { ModuloMotorista } from '../services/api';

/**
 * Módulos que o motorista ligou ou desligou (Mais > Rotas e ajustes > Módulos).
 * Enquanto a lista não chega, ou se ela falhar, nada é escondido: só some o que o motorista desligou de fato.
 */
export function useModulos() {
  const [lista, setLista] = useState<ModuloMotorista[] | null>(null);

  const recarregar = useCallback(async () => {
    try { setLista(await TransportRepository.listarModulos()); } catch { /* sem lista: mostra tudo */ }
  }, []);

  useEffect(() => { void recarregar(); }, [recarregar]);

  const alterar = useCallback(async (chave: string, ativo: boolean) => {
    setLista(await TransportRepository.alterarModulo(chave, ativo));
  }, []);

  /** Módulo ligado? Sem lista, vale `padrao` (verdadeiro para os recursos que já existiam). */
  const ativo = useCallback((chave: string, padrao = true) => lista?.find((m) => m.chave === chave)?.ativo ?? padrao, [lista]);

  return { lista, ativo, alterar, recarregar };
}
