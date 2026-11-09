/**
 * ============================================================================
 * CONSUMO DE COMBUSTÍVEL ESTIMADO (consumo.ts)
 * ----------------------------------------------------------------------------
 * O motorista informa uma vez quantos km a van faz com 1 litro (km/L). O app usa os km que o GPS
 * já registra em cada trecho do histórico (Ida/Volta) para estimar, por dia, semana, quinzena e mês:
 *   km rodados, litros gastos (km ÷ km/L) e custo (litros × preço médio do litro).
 *
 * O preço do litro vem dos abastecimentos que o motorista já lança no Financeiro (nada novo para digitar).
 * Sem abastecimento lançado, o app mostra só km e litros.
 *
 * Períodos (fuso de Brasília): semana = segunda a domingo; quinzena = dia 1 a 15 ou dia 16 ao fim do mês.
 *
 * PRIVACIDADE (LGPD de menores): só entram data, sentido, nome da viagem e km. Nenhum dado de aluno.
 *
 * Lógica pura (sem servidor), para ser testável.
 * ============================================================================
 */

import { dataValida } from './mensalidades';
import { abastecimentos, type Lancamento } from './financeiro';

export const KM_POR_LITRO_MIN = 1;
export const KM_POR_LITRO_MAX = 50;
/** Preço médio do litro: abastecimentos dos últimos dias; sem nenhum, o último que existir. */
export const JANELA_PRECO_DIAS = 60;

export interface ConfigConsumo {
  km_por_litro: number;
  atualizado_em: string;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Lê o km/L digitado. Aceita "9,5" e "9.5" (aqui o ponto é decimal, ao contrário dos valores em reais).
 * Entre 1 e 50 km/L.
 */
export function lerKmPorLitro(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < KM_POR_LITRO_MIN || n > KM_POR_LITRO_MAX) return null;
  return r2(n);
}

export type ResultadoConfig = { ok: true; km_por_litro: number } | { ok: false; erro: string };

export function validarConfig(e: { km_por_litro?: unknown }): ResultadoConfig {
  const n = lerKmPorLitro(e?.km_por_litro);
  if (n === null) return { ok: false, erro: `Informe quantos km a van faz com 1 litro (entre ${KM_POR_LITRO_MIN} e ${KM_POR_LITRO_MAX}). Ex.: 9,5.` };
  return { ok: true, km_por_litro: n };
}

// ---------------------------------------------------------------------------
// Datas (AAAA-MM-DD, sem fuso: o servidor já entrega no fuso de Brasília)
// ---------------------------------------------------------------------------

const paraUTC = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const deUTC = (t: number) => new Date(t).toISOString().slice(0, 10);
const somarDias = (d: string, n: number) => deUTC(paraUTC(d) + n * 86_400_000);
const diasDoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

/** Segunda-feira da semana de `d`. */
export function inicioDaSemana(d: string): string {
  const dow = new Date(paraUTC(d)).getUTCDay(); // 0 = domingo
  return somarDias(d, -((dow + 6) % 7));
}

export interface Intervalo { de: string; ate: string }

export function intervalos(hoje: string): { dia: Intervalo; semana: Intervalo; quinzena: Intervalo; mes: Intervalo } {
  const ano = +hoje.slice(0, 4), mes = +hoje.slice(5, 7), dia = +hoje.slice(8, 10);
  const ini = inicioDaSemana(hoje);
  const pref = hoje.slice(0, 8);
  const ultimo = diasDoMes(ano, mes);
  return {
    dia: { de: hoje, ate: hoje },
    semana: { de: ini, ate: somarDias(ini, 6) },
    quinzena: dia <= 15 ? { de: `${pref}01`, ate: `${pref}15` } : { de: `${pref}16`, ate: `${pref}${String(ultimo).padStart(2, '0')}` },
    mes: { de: `${pref}01`, ate: `${pref}${String(ultimo).padStart(2, '0')}` }
  };
}

// ---------------------------------------------------------------------------
// Preço do litro (vem dos abastecimentos do Financeiro)
// ---------------------------------------------------------------------------

/**
 * Preço médio do litro (R$ gastos ÷ litros) nos abastecimentos dos últimos JANELA_PRECO_DIAS dias.
 * Sem nenhum na janela, usa o abastecimento mais recente. Sem abastecimento, null.
 */
export function precoMedioLitro(lancamentos: Lancamento[], hoje: string): number | null {
  const abs = abastecimentos(lancamentos).filter((l) => l.valor > 0 && (l.litros ?? 0) > 0);
  if (abs.length === 0) return null;
  const corte = somarDias(hoje, -JANELA_PRECO_DIAS);
  const recentes = abs.filter((l) => l.data >= corte && l.data <= hoje);
  const base = recentes.length ? recentes : [abs[abs.length - 1]];
  const litros = base.reduce((s, l) => s + (l.litros as number), 0);
  const valor = base.reduce((s, l) => s + l.valor, 0);
  return litros > 0 ? r2(valor / litros) : null;
}

// ---------------------------------------------------------------------------
// Consumo por período
// ---------------------------------------------------------------------------

/** O que o consumo precisa de cada trecho do histórico (nada de aluno). */
export interface TrechoParaConsumo {
  data: string;
  sentido: 'IDA' | 'VOLTA';
  viagem?: string | null;
  km: number | null;
  iniciado_em?: string;
  /** trecho que ainda não foi encerrado (km até agora) */
  em_andamento?: boolean;
}

export interface TotalPeriodo {
  de: string;
  ate: string;
  km: number;
  litros: number;
  custo: number | null;
  trechos: number;
  /** trechos sem km (GPS desligado): não entram na conta */
  sem_gps: number;
}

export interface DiaConsumo {
  data: string;
  km: number;
  litros: number;
  custo: number | null;
  trechos: number;
}

export interface TrechoDoDia {
  sentido: 'IDA' | 'VOLTA';
  viagem: string | null;
  km: number | null;
  litros: number | null;
  custo: number | null;
  /** trecho ainda em andamento (km até agora) */
  em_andamento: boolean;
}

export interface ResultadoConsumo {
  km_por_litro: number;
  preco_litro: number | null;
  dia: TotalPeriodo;
  semana: TotalPeriodo;
  quinzena: TotalPeriodo;
  mes: TotalPeriodo;
  /** do dia 1 do mês até hoje, do mais novo para o mais antigo; só dias com viagem */
  dias: DiaConsumo[];
  /** viagens de hoje, na ordem em que foram feitas */
  trechos_de_hoje: TrechoDoDia[];
}

const litrosDe = (km: number, kml: number) => km / kml;

function somar(trechos: TrechoParaConsumo[], iv: Intervalo, kml: number, preco: number | null): TotalPeriodo {
  const doPeriodo = trechos.filter((t) => t.data >= iv.de && t.data <= iv.ate);
  const comKm = doPeriodo.filter((t) => t.km !== null && t.km > 0);
  const km = comKm.reduce((s, t) => s + (t.km as number), 0);
  const litros = litrosDe(km, kml);
  return {
    de: iv.de, ate: iv.ate,
    km: r1(km), litros: r2(litros), custo: preco !== null ? r2(litros * preco) : null,
    trechos: comKm.length, sem_gps: doPeriodo.length - comKm.length
  };
}

/**
 * Calcula o consumo estimado. `emAndamento` é o trecho que ainda não foi encerrado (km até agora);
 * ele conta como parte de hoje para o motorista ver o consumo "ao vivo".
 */
export function estimarConsumo(
  trechos: TrechoParaConsumo[],
  emAndamento: { sentido: 'IDA' | 'VOLTA'; viagem?: string | null; km: number } | null,
  kmPorLitro: number,
  precoLitro: number | null,
  hoje: string
): ResultadoConsumo {
  if (!dataValida(hoje)) throw new Error('Data inválida.');
  // Viagem com data depois de hoje (relógio errado) não entra na conta.
  const todos: TrechoParaConsumo[] = trechos.filter((t) => t.data <= hoje);
  if (emAndamento && emAndamento.km > 0) todos.push({ data: hoje, sentido: emAndamento.sentido, viagem: emAndamento.viagem ?? null, km: emAndamento.km, em_andamento: true });
  const iv = intervalos(hoje);

  const porDia = new Map<string, TrechoParaConsumo[]>();
  for (const t of todos) {
    if (t.data < iv.mes.de || t.data > hoje) continue;
    (porDia.get(t.data) ?? porDia.set(t.data, []).get(t.data)!).push(t);
  }
  const dias: DiaConsumo[] = [...porDia.keys()].sort().reverse().map((data) => {
    const t = somar(porDia.get(data)!, { de: data, ate: data }, kmPorLitro, precoLitro);
    return { data, km: t.km, litros: t.litros, custo: t.custo, trechos: t.trechos };
  });

  // Ordem de execução: pelo horário de início; o trecho em andamento é o último.
  const deHoje = (porDia.get(hoje) ?? []).slice().sort((a, b) => Number(!!a.em_andamento) - Number(!!b.em_andamento) || (a.iniciado_em ?? '').localeCompare(b.iniciado_em ?? ''));
  const trechosDeHoje: TrechoDoDia[] = deHoje.map((t) => {
    const km = t.km !== null && t.km > 0 ? t.km : null;
    const l = km !== null ? litrosDe(km, kmPorLitro) : null;
    return {
      sentido: t.sentido, viagem: t.viagem ?? null,
      km: km !== null ? r1(km) : null, litros: l !== null ? r2(l) : null,
      custo: l !== null && precoLitro !== null ? r2(l * precoLitro) : null,
      em_andamento: !!t.em_andamento
    };
  });

  return {
    km_por_litro: kmPorLitro,
    preco_litro: precoLitro,
    dia: somar(todos, iv.dia, kmPorLitro, precoLitro),
    semana: somar(todos, iv.semana, kmPorLitro, precoLitro),
    quinzena: somar(todos, iv.quinzena, kmPorLitro, precoLitro),
    mes: somar(todos, iv.mes, kmPorLitro, precoLitro),
    dias,
    trechos_de_hoje: trechosDeHoje
  };
}
