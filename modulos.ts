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
  /**
   * Em teste (beta): só aparece, só liga e só funciona para as contas liberadas pelo servidor
   * (variável de ambiente, ver `liberadosPara`). Para as demais contas é como se não existisse.
   */
  restrito?: boolean;
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
  },
  {
    chave: 'manutencao',
    nome: 'Manutenção',
    descricao: 'Revisões da van por km e por data (óleo, pneus, freios...), com aviso de quanto falta.',
    padrao: false
  },
  {
    chave: 'consumo',
    nome: 'Consumo de combustível',
    descricao: 'Informe quantos km a van faz por litro e veja o gasto estimado por dia, semana, quinzena e mês.',
    padrao: false
  },
  {
    chave: 'pagamento-pix',
    nome: 'Pagamento por Pix (teste)',
    descricao: 'O responsável vê o QR Code Pix da mensalidade e avisa que pagou; você confere no banco e confirma.',
    padrao: false,
    restrito: true
  }
];

/** Variável de ambiente (nome) com os e-mails liberados para cada módulo restrito. */
export const VARIAVEL_BETA: Readonly<Record<string, string>> = { 'pagamento-pix': 'PIX_BETA_EMAILS' };

/** Lê uma lista de e-mails separados por vírgula, ponto e vírgula ou espaço. Tudo em minúsculas, sem repetição. */
export function lerListaEmails(texto: string | undefined | null): string[] {
  return [...new Set(String(texto ?? '').split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@')))];
}

/**
 * Chaves dos módulos restritos que ESTA conta pode usar. `env` traz as variáveis do servidor
 * (ex.: { PIX_BETA_EMAILS: 'a@b.com' }). Sem variável, ninguém é liberado.
 */
export function liberadosPara(email: string | undefined | null, env: Record<string, string | undefined> = {}): string[] {
  const e = String(email ?? '').trim().toLowerCase();
  if (!e) return [];
  return MODULOS.filter((m) => m.restrito && lerListaEmails(env[VARIAVEL_BETA[m.chave] ?? '']).includes(e)).map((m) => m.chave);
}

const disponivel = (m: ModuloDef, liberados: readonly string[]) => !m.restrito || liberados.includes(m.chave);

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

/** Módulo realmente em uso: ligado pelo motorista E, se for restrito, liberado para a conta. */
export function moduloAtivo(salvos: ModulosSalvos, chave: string, liberados: readonly string[] = []): boolean {
  const m = MODULOS.find((x) => x.chave === chave);
  return !!m && disponivel(m, liberados) && modulosEfetivos(salvos)[chave] === true;
}

/** Lista para a tela. Módulos restritos não liberados para a conta não aparecem. */
export function listarModulos(salvos: ModulosSalvos, liberados: readonly string[] = []): ModuloEstado[] {
  const ef = modulosEfetivos(salvos);
  return MODULOS.filter((m) => disponivel(m, liberados)).map(({ restrito: _r, ...m }) => ({ ...m, ativo: ef[m.chave] }));
}

/** Devolve a escolha atualizada (sem alterar a original). Lança erro para chave desconhecida. */
export function alterarModulo(salvos: ModulosSalvos, chave: unknown, ativo: unknown, liberados: readonly string[] = []): Record<string, boolean> {
  if (!chaveModuloValida(chave)) throw new Error('Módulo desconhecido.');
  const def = MODULOS.find((m) => m.chave === chave)!;
  if (!disponivel(def, liberados)) throw new Error('Módulo desconhecido.');
  if (typeof ativo !== 'boolean') throw new Error('Informe se o módulo fica ligado ou desligado.');
  return { ...modulosEfetivos(salvos), [chave]: ativo };
}
