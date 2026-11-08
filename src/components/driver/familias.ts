import type { LinhaMensalidadeMotorista, StatusMensalidade } from '../../services/api';

export interface FamiliaMensalidade {
  chave: string;
  responsavel_nome: string;
  whatsapp: string;
  filhos: LinhaMensalidadeMotorista[];
  /** Soma dos valores mensais dos filhos (em centavos, para não errar na soma). */
  total: number;
  pagos: number;
  status: StatusMensalidade;
  avisou: boolean;
}

const PESO: Record<StatusMensalidade, number> = { ATRASADO: 0, EM_ABERTO: 1, SEM_VALOR: 2, PAGO: 3 };

/** Situação da família: a pior entre os filhos (atrasado > em aberto > sem valor); só é "Pago" quando todos pagaram. */
export function statusDaFamilia(filhos: LinhaMensalidadeMotorista[]): StatusMensalidade {
  return filhos.reduce<StatusMensalidade>((pior, f) => (PESO[f.status] < PESO[pior] ? f.status : pior), 'PAGO');
}

/** Agrupa as linhas por responsável. Quem avisou que pagou vem primeiro; depois os mais urgentes. */
export function agruparPorFamilia(linhas: LinhaMensalidadeMotorista[]): FamiliaMensalidade[] {
  const mapa = new Map<string, LinhaMensalidadeMotorista[]>();
  for (const l of linhas) {
    const chave = l.familia ?? `a${l.id_aluno}`;
    mapa.set(chave, [...(mapa.get(chave) ?? []), l]);
  }
  const familias = [...mapa.entries()].map(([chave, filhos]): FamiliaMensalidade => {
    const ordenados = [...filhos].sort((a, b) => PESO[a.status] - PESO[b.status] || a.aluno.localeCompare(b.aluno, 'pt-BR'));
    return {
      chave,
      responsavel_nome: ordenados.find((f) => f.responsavel_nome)?.responsavel_nome ?? '',
      whatsapp: ordenados.find((f) => f.whatsapp)?.whatsapp ?? '',
      filhos: ordenados,
      total: ordenados.reduce((s, f) => s + Math.round((f.valor ?? 0) * 100), 0) / 100,
      pagos: ordenados.filter((f) => f.status === 'PAGO').length,
      status: statusDaFamilia(ordenados),
      avisou: ordenados.some((f) => f.status !== 'PAGO' && !!f.aviso_em)
    };
  });
  return familias.sort((a, b) => Number(b.avisou) - Number(a.avisou) || PESO[a.status] - PESO[b.status] || a.responsavel_nome.localeCompare(b.responsavel_nome, 'pt-BR'));
}
