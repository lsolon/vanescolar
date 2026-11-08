/**
 * ============================================================================
 * MENSALIDADES (mensalidades.ts)
 * ----------------------------------------------------------------------------
 * Lógica pura do controle de cobrança: o motorista define o valor e o dia de
 * vencimento de cada aluno e dá baixa manual nos pagamentos (PIX, dinheiro...).
 * Sem integração bancária. Sem dependência do servidor, para ser testável.
 *
 * Competência = mês de referência no formato "AAAA-MM".
 * Datas sempre no fuso de Brasília (evita o bug de `new Date('AAAA-MM-DD')`,
 * que cai no dia anterior no Brasil).
 * ============================================================================
 */

export type FormaPagamento = 'PIX' | 'DINHEIRO' | 'TRANSFERENCIA' | 'OUTRO';
export const FORMAS: FormaPagamento[] = ['PIX', 'DINHEIRO', 'TRANSFERENCIA', 'OUTRO'];

export type StatusMensalidade = 'PAGO' | 'EM_ABERTO' | 'ATRASADO' | 'SEM_VALOR';

export interface ConfigMensalidade {
  valor: number;          // reais
  vencimento_dia: number; // 1..28
  desde?: string;         // AAAA-MM: primeira competência cobrada (atrasos só contam a partir daqui)
}

export interface Pagamento {
  id_motorista: number;
  id_aluno: number;
  mes: string;            // AAAA-MM
  valor: number;
  forma: FormaPagamento;
  pago_em: string;        // AAAA-MM-DD
  registrado_em: string;  // ISO
}

/** Aviso do responsável ("já paguei pelo Pix"). Não é baixa: o motorista confere no banco e confirma. */
export interface AvisoPagamento {
  id_motorista: number;
  id_aluno: number;
  mes: string;            // AAAA-MM
  avisado_em: string;     // ISO
}

export interface MensalidadesDB {
  configs: Record<string, ConfigMensalidade>; // chave `${motorista}:${aluno}`
  pagamentos: Pagamento[];
  avisos?: AvisoPagamento[]; // ausente em dados antigos
}

export const novoMensalidadesDB = (): MensalidadesDB => ({ configs: {}, pagamentos: [] });
export const chaveConfig = (motorista: number, aluno: number) => `${motorista}:${aluno}`;

/** Data de hoje (AAAA-MM-DD) no fuso de Brasília. */
export function hojeBrasil(agora: Date = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
  return p; // en-CA => AAAA-MM-DD
}

export const mesDe = (data: string) => data.slice(0, 7);
export const mesValido = (m: unknown): m is string => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
export const dataValida = (d: unknown): d is string => {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const [y, m, dia] = d.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, dia));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === dia;
};

/** Lê um valor em reais (aceita "150", "150,50"); retorna null se inválido. */
export function lerValor(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0 || n > 100000) return null;
  return Math.round(n * 100) / 100;
}

export function lerVencimento(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 28 ? n : null;
}

export const dataVencimento = (mes: string, dia: number) => `${mes}-${String(dia).padStart(2, '0')}`;

export function somarMeses(mes: string, delta: number): string {
  const [y, m] = mes.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

export function statusDoMes(config: ConfigMensalidade | undefined, pagamento: Pagamento | undefined, mes: string, hoje: string): StatusMensalidade {
  if (pagamento) return 'PAGO';
  if (!config) return 'SEM_VALOR';
  return hoje > dataVencimento(mes, config.vencimento_dia) ? 'ATRASADO' : 'EM_ABERTO';
}

export interface LinhaMensalidade {
  id_aluno: number;
  valor: number | null;
  vencimento_dia: number | null;
  status: StatusMensalidade;
  pago_em: string | null;
  valor_pago: number | null;
  forma: FormaPagamento | null;
  meses_em_atraso: number; // competências anteriores ou atual vencidas e sem pagamento (a partir do 1º pagamento/configuração)
}

export function pagamentoDe(db: MensalidadesDB, motorista: number, aluno: number, mes: string) {
  return db.pagamentos.find((p) => p.id_motorista === motorista && p.id_aluno === aluno && p.mes === mes);
}

/** Quantos meses (até o mês consultado, inclusive) estão vencidos e sem baixa, olhando no máximo 12 meses para trás. */
function mesesEmAtraso(db: MensalidadesDB, motorista: number, aluno: number, config: ConfigMensalidade | undefined, mes: string, hoje: string): number {
  if (!config) return 0;
  let n = 0;
  const desde = config.desde ?? mes;
  for (let i = 0; i < 12; i++) {
    const m = somarMeses(mes, -i);
    if (m < desde) break;
    if (m > mesDe(hoje)) continue;
    if (!pagamentoDe(db, motorista, aluno, m) && hoje > dataVencimento(m, config.vencimento_dia)) n++;
    else if (pagamentoDe(db, motorista, aluno, m)) break; // sequência de atraso termina no último mês pago
  }
  return n;
}

export function linhaDoAluno(db: MensalidadesDB, motorista: number, aluno: number, mes: string, hoje: string): LinhaMensalidade {
  const config = db.configs[chaveConfig(motorista, aluno)];
  const pg = pagamentoDe(db, motorista, aluno, mes);
  return {
    id_aluno: aluno,
    valor: config?.valor ?? null,
    vencimento_dia: config?.vencimento_dia ?? null,
    status: statusDoMes(config, pg, mes, hoje),
    pago_em: pg?.pago_em ?? null,
    valor_pago: pg?.valor ?? null,
    forma: pg?.forma ?? null,
    meses_em_atraso: mesesEmAtraso(db, motorista, aluno, config, mes, hoje)
  };
}

export interface ResumoMensalidades {
  mes: string;
  previsto: number;   // soma dos valores configurados
  recebido: number;   // soma dos pagamentos do mês
  a_vencer: number;   // em aberto, ainda no prazo
  atrasado: number;   // vencido sem pagamento
  qtd_pagos: number;
  qtd_a_vencer: number;
  qtd_atrasados: number;
  qtd_sem_valor: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function resumir(linhas: LinhaMensalidade[], mes: string): ResumoMensalidades {
  const r: ResumoMensalidades = { mes, previsto: 0, recebido: 0, a_vencer: 0, atrasado: 0, qtd_pagos: 0, qtd_a_vencer: 0, qtd_atrasados: 0, qtd_sem_valor: 0 };
  for (const l of linhas) {
    if (l.valor) r.previsto += l.valor;
    if (l.status === 'PAGO') { r.recebido += l.valor_pago ?? 0; r.qtd_pagos++; }
    else if (l.status === 'EM_ABERTO') { r.a_vencer += l.valor ?? 0; r.qtd_a_vencer++; }
    else if (l.status === 'ATRASADO') { r.atrasado += l.valor ?? 0; r.qtd_atrasados++; }
    else r.qtd_sem_valor++;
  }
  r.previsto = r2(r.previsto); r.recebido = r2(r.recebido); r.a_vencer = r2(r.a_vencer); r.atrasado = r2(r.atrasado);
  return r;
}

const mesmoAviso = (a: AvisoPagamento, motorista: number, aluno: number, mes: string) => a.id_motorista === motorista && a.id_aluno === aluno && a.mes === mes;

export function avisoDe(db: MensalidadesDB, motorista: number, aluno: number, mes: string): AvisoPagamento | undefined {
  return (db.avisos ?? []).find((a) => mesmoAviso(a, motorista, aluno, mes));
}

/** Registra o aviso do responsável. Avisar de novo não muda nada: vale o primeiro aviso. */
export function registrarAviso(db: MensalidadesDB, motorista: number, aluno: number, mes: string, agora: Date = new Date()): AvisoPagamento {
  const existente = avisoDe(db, motorista, aluno, mes);
  if (existente) return existente;
  const novo: AvisoPagamento = { id_motorista: motorista, id_aluno: aluno, mes, avisado_em: agora.toISOString() };
  db.avisos = [...(db.avisos ?? []), novo];
  return novo;
}

export function descartarAviso(db: MensalidadesDB, motorista: number, aluno: number, mes: string): boolean {
  const antes = (db.avisos ?? []).length;
  db.avisos = (db.avisos ?? []).filter((a) => !mesmoAviso(a, motorista, aluno, mes));
  return db.avisos.length < antes;
}

/**
 * Qual mês o responsável deve pagar agora: o mais antigo ainda sem pagamento (atrasado ou em aberto)
 * entre os últimos 6 meses, respeitando o mês em que a cobrança começou. Sem valor definido ou tudo pago: null.
 */
export function mesParaPagar(db: MensalidadesDB, motorista: number, aluno: number, hoje: string): string | null {
  const config = db.configs[chaveConfig(motorista, aluno)];
  if (!config) return null;
  const atual = mesDe(hoje);
  for (let i = 5; i >= 0; i--) {
    const m = somarMeses(atual, -i);
    if (config.desde && m < config.desde) continue;
    const st = statusDoMes(config, pagamentoDe(db, motorista, aluno, m), m, hoje);
    if (st === 'ATRASADO' || st === 'EM_ABERTO') return m;
  }
  return null;
}

/** Dá baixa (ou substitui a baixa existente) de uma competência. O aviso do responsável, se houver, deixa de ser necessário. */
export function registrarPagamento(db: MensalidadesDB, p: Omit<Pagamento, 'registrado_em'>, agora: Date = new Date()): Pagamento {
  descartarAviso(db, p.id_motorista, p.id_aluno, p.mes);
  db.pagamentos = db.pagamentos.filter((x) => !(x.id_motorista === p.id_motorista && x.id_aluno === p.id_aluno && x.mes === p.mes));
  const novo: Pagamento = { ...p, registrado_em: agora.toISOString() };
  db.pagamentos.push(novo);
  return novo;
}

export function desfazerPagamento(db: MensalidadesDB, motorista: number, aluno: number, mes: string): boolean {
  const antes = db.pagamentos.length;
  db.pagamentos = db.pagamentos.filter((x) => !(x.id_motorista === motorista && x.id_aluno === aluno && x.mes === mes));
  return db.pagamentos.length < antes;
}

/** Remove configuração e histórico de um aluno (ex.: ao excluir o filho). */
export function removerAluno(db: MensalidadesDB, motorista: number, aluno: number) {
  delete db.configs[chaveConfig(motorista, aluno)];
  db.pagamentos = db.pagamentos.filter((x) => !(x.id_motorista === motorista && x.id_aluno === aluno));
  db.avisos = (db.avisos ?? []).filter((a) => !(a.id_motorista === motorista && a.id_aluno === aluno));
}
