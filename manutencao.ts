/**
 * ============================================================================
 * MANUTENÇÃO DA VAN POR KM E POR DATA (manutencao.ts)
 * ----------------------------------------------------------------------------
 * O motorista cadastra o que precisa de revisão (óleo, pneus, freios...) com um
 * intervalo em km e/ou em meses. O app diz quanto falta e avisa quando está perto
 * ou vencido. Lógica pura (sem servidor), para ser testável.
 *
 * KM ATUAL = o maior km conhecido: leituras do painel nos abastecimentos do Financeiro e
 * os km informados nos próprios serviços. Nada de GPS: o app não calcula km andados.
 *
 * Datas "AAAA-MM-DD" (fuso de Brasília, vindas do servidor).
 * ============================================================================
 */

import { dataValida } from './mensalidades';
import { lerNumero } from './financeiro';

export interface ItemManutencao {
  id: number;
  nome: string;
  intervalo_km?: number;
  intervalo_meses?: number;
  ultimo_km?: number;
  ultima_data?: string;
  criado_em: string;
}

export const MAX_ITENS = 30;
const KM_MAX = 3_000_000;

/** Sugestões que o motorista pode usar como ponto de partida (ele ajusta os números). */
export const SUGESTOES: { nome: string; intervalo_km?: number; intervalo_meses?: number }[] = [
  { nome: 'Troca de óleo e filtro', intervalo_km: 10000, intervalo_meses: 12 },
  { nome: 'Pneus: rodízio e alinhamento', intervalo_km: 10000 },
  { nome: 'Pastilhas e discos de freio', intervalo_km: 30000 },
  { nome: 'Correia dentada', intervalo_km: 60000, intervalo_meses: 48 },
  { nome: 'Filtro de ar e de combustível', intervalo_km: 15000 },
  { nome: 'Bateria', intervalo_meses: 36 },
  { nome: 'Vistoria e licenciamento', intervalo_meses: 12 },
];

const texto = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

const paraUTC = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));

/** Dias de `a` até `b` (positivo se `b` é depois). */
export const diasEntre = (a: string, b: string) => Math.round((paraUTC(b) - paraUTC(a)) / 86_400_000);

/** Soma meses a uma data; se o dia não existir no mês de destino, usa o último dia (31/01 + 1 mês = 28/02). */
export function somarMesesData(data: string, n: number): string {
  const y = +data.slice(0, 4), m = +data.slice(5, 7) - 1, d = +data.slice(8, 10);
  const alvo = new Date(Date.UTC(y, m + n, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  const dia = Math.min(d, ultimo);
  return `${alvo.getUTCFullYear()}-${String(alvo.getUTCMonth() + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Validação de entrada
// ---------------------------------------------------------------------------

export type ResultadoItem = { ok: true; dados: Omit<ItemManutencao, 'id' | 'criado_em'> } | { ok: false; erro: string };

export function validarItem(e: { nome?: unknown; intervalo_km?: unknown; intervalo_meses?: unknown; ultimo_km?: unknown; ultima_data?: unknown }, hoje: string): ResultadoItem {
  const nome = texto(e?.nome, 60);
  if (nome.length < 2) return { ok: false, erro: 'Informe o nome do serviço (ex.: Troca de óleo).' };
  const vazio = (v: unknown) => v === undefined || v === null || v === '';
  const ikm = vazio(e.intervalo_km) ? undefined : lerNumero(e.intervalo_km, { min: 0, max: 500_000 });
  if (ikm === null) return { ok: false, erro: 'Intervalo em km inválido.' };
  const imes = vazio(e.intervalo_meses) ? undefined : lerNumero(e.intervalo_meses, { min: 0, max: 120 });
  if (imes === null || (imes !== undefined && !Number.isInteger(imes))) return { ok: false, erro: 'Intervalo em meses inválido (número inteiro, até 120).' };
  if (ikm === undefined && imes === undefined) return { ok: false, erro: 'Informe o intervalo em km, em meses, ou os dois.' };
  const ukm = vazio(e.ultimo_km) ? undefined : lerNumero(e.ultimo_km, { min: 0, max: KM_MAX, exclusivoMin: false });
  if (ukm === null) return { ok: false, erro: 'Km do último serviço inválido.' };
  let udata: string | undefined;
  if (!vazio(e.ultima_data)) {
    if (!dataValida(e.ultima_data)) return { ok: false, erro: 'Data do último serviço inválida.' };
    if (e.ultima_data > hoje) return { ok: false, erro: 'A data do último serviço não pode ser no futuro.' };
    udata = e.ultima_data;
  }
  return { ok: true, dados: { nome, ...(ikm !== undefined ? { intervalo_km: ikm } : {}), ...(imes !== undefined ? { intervalo_meses: imes } : {}), ...(ukm !== undefined ? { ultimo_km: ukm } : {}), ...(udata ? { ultima_data: udata } : {}) } };
}

export type ResultadoServico = { ok: true; km?: number; data: string } | { ok: false; erro: string };

/** "Marquei como feito": a data padrão é hoje; o km é obrigatório quando o serviço tem intervalo em km. */
export function validarServico(e: { km?: unknown; data?: unknown }, item: ItemManutencao, hoje: string): ResultadoServico {
  const data = e?.data === undefined || e.data === null || e.data === '' ? hoje : e.data;
  if (!dataValida(data)) return { ok: false, erro: 'Data inválida.' };
  if (data > hoje) return { ok: false, erro: 'A data do serviço não pode ser no futuro.' };
  const vazio = e?.km === undefined || e.km === null || e.km === '';
  if (vazio) {
    if (item.intervalo_km !== undefined) return { ok: false, erro: 'Informe o km do painel quando o serviço foi feito.' };
    return { ok: true, data };
  }
  const km = lerNumero(e.km, { min: 0, max: KM_MAX, exclusivoMin: false });
  if (km === null) return { ok: false, erro: 'Quilometragem inválida.' };
  return { ok: true, km, data };
}

// ---------------------------------------------------------------------------
// Situação de cada item
// ---------------------------------------------------------------------------

export type Situacao = 'EM_DIA' | 'ATENCAO' | 'VENCIDO' | 'SEM_DADOS';

export interface StatusItem extends ItemManutencao {
  situacao: Situacao;
  /** negativo = passou do km */
  faltam_km: number | null;
  /** negativo = passou da data */
  faltam_dias: number | null;
  proximo_km: number | null;
  proxima_data: string | null;
}

const PESO: Record<Situacao, number> = { VENCIDO: 0, ATENCAO: 1, SEM_DADOS: 2, EM_DIA: 3 };

/** Perto do km: faltam menos de 10% do intervalo (mínimo 500 km). Perto da data: faltam 30 dias ou menos. */
export const avisoKm = (intervalo: number) => Math.max(500, Math.round(intervalo * 0.1));
export const AVISO_DIAS = 30;

export function statusDoItem(item: ItemManutencao, kmAtual: number | null, hoje: string): StatusItem {
  let faltamKm: number | null = null, proximoKm: number | null = null;
  if (item.intervalo_km !== undefined && item.ultimo_km !== undefined && kmAtual !== null) {
    proximoKm = item.ultimo_km + item.intervalo_km;
    faltamKm = proximoKm - kmAtual;
  }
  let faltamDias: number | null = null, proximaData: string | null = null;
  if (item.intervalo_meses !== undefined && item.ultima_data) {
    proximaData = somarMesesData(item.ultima_data, item.intervalo_meses);
    faltamDias = diasEntre(hoje, proximaData);
  }
  let situacao: Situacao;
  if (faltamKm === null && faltamDias === null) situacao = 'SEM_DADOS';
  else if ((faltamKm !== null && faltamKm <= 0) || (faltamDias !== null && faltamDias <= 0)) situacao = 'VENCIDO';
  else if ((faltamKm !== null && faltamKm <= avisoKm(item.intervalo_km as number)) || (faltamDias !== null && faltamDias <= AVISO_DIAS)) situacao = 'ATENCAO';
  else situacao = 'EM_DIA';
  return { ...item, situacao, faltam_km: faltamKm, faltam_dias: faltamDias, proximo_km: proximoKm, proxima_data: proximaData };
}

/** Maior km conhecido: leituras dos abastecimentos (`kms`) e km dos serviços já feitos. */
export function kmAtualDe(kms: Array<number | undefined>, itens: ItemManutencao[]): number | null {
  const todos = [...kms, ...itens.map((i) => i.ultimo_km)].filter((k): k is number => typeof k === 'number' && Number.isFinite(k) && k >= 0);
  return todos.length ? Math.max(...todos) : null;
}

/** Mais urgente primeiro; dentro da mesma situação, quem tem menos km (ou dias) restantes. */
export function listarStatus(itens: ItemManutencao[], kmAtual: number | null, hoje: string): StatusItem[] {
  const urgencia = (s: StatusItem) => Math.min(s.faltam_km ?? Infinity, (s.faltam_dias ?? Infinity) * 30);
  return itens.map((i) => statusDoItem(i, kmAtual, hoje)).sort((a, b) => PESO[a.situacao] - PESO[b.situacao] || urgencia(a) - urgencia(b) || a.nome.localeCompare(b.nome));
}

export function resumoManutencao(lista: StatusItem[]) {
  return { total: lista.length, vencidos: lista.filter((s) => s.situacao === 'VENCIDO').length, atencao: lista.filter((s) => s.situacao === 'ATENCAO').length };
}

export function proximoIdItem(itens: ItemManutencao[]): number {
  return itens.reduce((m, x) => Math.max(m, x.id), 0) + 1;
}
