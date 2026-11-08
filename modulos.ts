/**
 * ============================================================================
 * MÓDULOS DO MOTORISTA (modulos.ts)
 * ----------------------------------------------------------------------------
 * Cada recurso "de escritório" (mensalidades, financeiro e, nas próximas fases,
 * manutenção, documentos...) é um módulo que o motorista liga ou desliga em
 * Mais > Rotas e ajustes > Módulos. Desligar só esconde o recurso do app: os dados
 * continuam guardados e voltam ao ligar de novo.
 *
 * Regra para recursos novos: entram com `padrao: false` (desligados). Os recursos que já
 * existiam antes dos módulos (mensalidades e financeiro) ficam ligados para quem já usa.
 *
 * Lógica pura (sem servidor), para ser testável. O servidor é a fonte da verdade:
 * a tela recebe a lista pronta pela API.
 * ============================================================================
 */

export interface ModuloDef {
  chave: string;
  nome: string;
  descricao: string;
  /** Ligado quando o motorista nunca mexeu nele. */
  padrao: boolean;
}

export interface ModuloEstado extends ModuloDef {
  ativo: boolean;
}

export type ModulosSalvos = Record<string, boolean> | undefined | null;

export const MODULOS: readonly ModuloDef[] = [
  {
    chave: 'mensalidades',
    nome: 'Mensalidades',
    descricao: 'Quem pagou e quem está em aberto, com cobrança pelo WhatsApp.',
    padrao: true
  },
  {
    chave: 'financeiro',
    nome: 'Financeiro',
    descricao: 'Receitas, despesas, custos fixos, abastecimento e lucro do mês.',
    padrao: true
  }
];

export const chaveModuloValida = (chave: unknown): chave is string =>
  typeof chave === 'string' && MODULOS.some((m) => m.chave === chave);

/** Estado de cada módulo conhecido: o que o motorista escolheu, ou o padrão. Chaves desconhecidas são ignoradas. */
export function modulosEfetivos(salvos: ModulosSalvos): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const m of MODULOS) {
    const v = salvos?.[m.chave];
    out[m.chave] = typeof v === 'boolean' ? v : m.padrao;
  }
  return out;
}

export function listarModulos(salvos: ModulosSalvos): ModuloEstado[] {
  const ef = modulosEfetivos(salvos);
  return MODULOS.map((m) => ({ ...m, ativo: ef[m.chave] }));
}

/** Devolve a escolha atualizada (sem alterar a original). Lança erro para chave desconhecida. */
export function alterarModulo(salvos: ModulosSalvos, chave: unknown, ativo: unknown): Record<string, boolean> {
  if (!chaveModuloValida(chave)) throw new Error('Módulo desconhecido.');
  if (typeof ativo !== 'boolean') throw new Error('Informe se o módulo fica ligado ou desligado.');
  return { ...modulosEfetivos(salvos), [chave]: ativo };
}
