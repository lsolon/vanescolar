/**
 * ============================================================================
 * ASSINATURA DO MOTORISTA (assinatura.ts)
 * ----------------------------------------------------------------------------
 * Teste grátis de 30 dias, planos por faixa de alunos e bloqueio quando o teste (ou a assinatura) acaba.
 * Quem paga é o motorista; a família usa de graça, mas perde o acesso se a van estiver suspensa.
 *
 * Lógica pura (sem servidor, sem relógio próprio): recebe "agora" por parâmetro, para ser testável.
 * A cobrança em si é do Mercado Pago (ver mercadopago.ts); aqui só guardamos o resultado.
 * ============================================================================
 */

/** Dias de teste grátis (campanha de fim de ano). */
export const DIAS_TESTE = 30;
/** Depois do bloqueio, quantos dias os dados ficam guardados antes de poderem ser excluídos. */
export const DIAS_ATE_EXCLUSAO = 30;

export interface PlanoDef {
  chave: 'ate10' | 'ate20' | 'ate30' | 'ilimitado';
  nome: string;
  /** Maior total de alunos cadastrados (manhã + tarde) que o plano cobre. null = sem limite. */
  ate: number | null;
  /** Valor mensal em reais. */
  valor: number;
}

/** Valores confirmados pelo Solon (8/11/2026) e iguais aos da landing page. */
export const PLANOS: readonly PlanoDef[] = [
  { chave: 'ate10', nome: 'Até 10 alunos', ate: 10, valor: 99 },
  { chave: 'ate20', nome: 'De 11 a 20 alunos', ate: 20, valor: 149 },
  { chave: 'ate30', nome: 'De 21 a 30 alunos', ate: 30, valor: 199 },
  { chave: 'ilimitado', nome: 'Sem limite de alunos', ate: null, valor: 250 }
];

/** Plano que cobre esse total de alunos (o menor que serve). */
export function planoPorAlunos(alunos: number): PlanoDef {
  const n = Math.max(0, Math.floor(Number.isFinite(alunos) ? alunos : 0));
  return PLANOS.find((p) => p.ate === null || n <= p.ate) ?? PLANOS[PLANOS.length - 1];
}

export function planoPorChave(chave: unknown): PlanoDef | undefined {
  return PLANOS.find((p) => p.chave === chave);
}

/** Situação da assinatura no Mercado Pago. */
export type StatusMP = 'pending' | 'authorized' | 'paused' | 'cancelled';

export interface AssinaturaMP {
  /** Id da assinatura (preapproval) no Mercado Pago. */
  id: string;
  status: StatusMP;
  plano: PlanoDef['chave'];
  valor: number;
  /** Quando o status mudou para pausada/cancelada (marca o início do bloqueio e da contagem para exclusão). */
  encerradaEm?: string;
  atualizadoEm: string;
}

/** O que guardamos no cadastro do motorista. Sem dados de cartão: isso fica só com o Mercado Pago. */
export interface Assinatura {
  /** Início do teste (ISO). */
  testeInicio: string;
  /** Dias a mais concedidos pelo administrador. */
  diasExtras?: number;
  /** Cortesia: nunca bloqueia (conta de teste, parceiros). Só o administrador liga. */
  isento?: boolean;
  mp?: AssinaturaMP;
}

export type EstadoAssinatura = 'ISENTA' | 'TESTE' | 'ATIVA' | 'BLOQUEADA';

export interface SituacaoAssinatura {
  estado: EstadoAssinatura;
  /** Só no teste: dias inteiros que faltam (hoje conta; no último dia vale 1). */
  diasRestantes: number | null;
  /** Fim do teste (ISO). */
  testeFim: string | null;
  /** Quando o bloqueio começou (ISO), se está bloqueada. */
  bloqueadaDesde: string | null;
  /** Data a partir da qual os dados podem ser excluídos (ISO), se está bloqueada. */
  excluirApos: string | null;
  /** Há uma assinatura iniciada no Mercado Pago aguardando o pagamento do motorista. */
  aguardandoPagamento: boolean;
}

const DIA_MS = 24 * 60 * 60 * 1000;

function ms(iso: string | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** Fim do teste: início + 30 dias + dias extras do administrador. */
export function fimDoTeste(a: Assinatura): number | null {
  const ini = ms(a.testeInicio);
  if (ini === null) return null;
  const extras = Math.max(0, Math.floor(Number(a.diasExtras) || 0));
  return ini + (DIAS_TESTE + extras) * DIA_MS;
}

/**
 * Situação em um instante.
 * Regra: isenta nunca bloqueia; assinatura autorizada no Mercado Pago libera; dentro do prazo é teste;
 * fora disso (teste vencido sem assinar, ou assinatura pausada/cancelada) bloqueia.
 * Cancelar durante o teste não tira o que sobrou do teste.
 */
export function situacao(a: Assinatura | undefined | null, agora: number): SituacaoAssinatura {
  const vazio = { diasRestantes: null, testeFim: null, bloqueadaDesde: null, excluirApos: null, aguardandoPagamento: false };
  if (!a) return { estado: 'TESTE', ...vazio }; // sem registro (conta nova ainda não carimbada): não bloqueia por engano
  if (a.isento) return { estado: 'ISENTA', ...vazio };
  const fim = fimDoTeste(a);
  const testeFim = fim === null ? null : new Date(fim).toISOString();
  const aguardando = a.mp?.status === 'pending';
  if (a.mp?.status === 'authorized') return { estado: 'ATIVA', diasRestantes: null, testeFim, bloqueadaDesde: null, excluirApos: null, aguardandoPagamento: false };
  if (fim === null) return { estado: 'TESTE', ...vazio }; // data ilegível: não bloqueia por engano; o servidor recarimba
  const encerrada = ms(a.mp?.encerradaEm);
  // Assinatura que acabou (pausada/cancelada) depois do teste bloqueia desde então; dentro do teste, vale o que sobrou dele.
  if (agora < fim) {
    return { estado: 'TESTE', diasRestantes: Math.max(1, Math.ceil((fim - agora) / DIA_MS)), testeFim, bloqueadaDesde: null, excluirApos: null, aguardandoPagamento: aguardando };
  }
  const desde = encerrada !== null && encerrada > fim ? encerrada : fim;
  return {
    estado: 'BLOQUEADA',
    diasRestantes: null,
    testeFim,
    bloqueadaDesde: new Date(desde).toISOString(),
    excluirApos: new Date(desde + DIAS_ATE_EXCLUSAO * DIA_MS).toISOString(),
    aguardandoPagamento: aguardando
  };
}

export const estaBloqueada = (a: Assinatura | undefined | null, agora: number) => situacao(a, agora).estado === 'BLOQUEADA';

/** Carimba o início do teste de quem ainda não tem (contas novas e contas que já existiam antes desta função). */
export function garantirTeste(a: Assinatura | undefined | null, agora: number): Assinatura {
  if (a && ms(a.testeInicio) !== null) return a;
  return { ...(a ?? {}), testeInicio: new Date(agora).toISOString() };
}

/** Converte o status que o Mercado Pago devolve; qualquer outro valor vira null (ignorado). */
export function lerStatusMP(v: unknown): StatusMP | null {
  const s = String(v ?? '').toLowerCase();
  return s === 'pending' || s === 'authorized' || s === 'paused' || s === 'cancelled' ? s : null;
}

/** Aplica um status vindo do Mercado Pago. Pausada/cancelada marca o momento em que a assinatura acabou. */
export function aplicarStatusMP(a: Assinatura, status: StatusMP, agora: number): Assinatura {
  if (!a.mp) return a;
  const encerra = status === 'paused' || status === 'cancelled';
  const jaEncerrada = a.mp.status === 'paused' || a.mp.status === 'cancelled';
  return {
    ...a,
    mp: {
      ...a.mp,
      status,
      atualizadoEm: new Date(agora).toISOString(),
      ...(encerra ? { encerradaEm: jaEncerrada && a.mp.encerradaEm ? a.mp.encerradaEm : new Date(agora).toISOString() } : { encerradaEm: undefined })
    }
  };
}

/** O plano contratado cobre o total de alunos de hoje? Se não, o motorista precisa subir de plano. */
export function precisaSubirPlano(a: Assinatura | undefined | null, alunos: number): boolean {
  const contratado = planoPorChave(a?.mp?.plano);
  if (!contratado || contratado.ate === null) return false;
  return alunos > contratado.ate;
}

/** "ext-123" ⇄ id do motorista: o Mercado Pago devolve isto no campo external_reference. */
export const referenciaDoMotorista = (id: number) => `van-${id}`;
export function motoristaDaReferencia(ref: unknown): number | null {
  const m = /^van-(\d{1,12})$/.exec(String(ref ?? ''));
  return m ? Number(m[1]) : null;
}
