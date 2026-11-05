/**
 * ============================================================================
 * FINANCEIRO DO MOTORISTA (financeiro.ts)
 * ----------------------------------------------------------------------------
 * Despesas, receitas extras, custos fixos e consumo de combustível da van.
 * Lógica pura (sem servidor), para ser testável.
 *
 * LUCRO = mensalidades recebidas + receitas extras − despesas − custos fixos
 *
 * CONSUMO (método "tanque cheio a tanque cheio"): entre dois abastecimentos em que
 * o tanque foi completado, km rodados ÷ litros colocados (somando os abastecimentos
 * parciais do meio e o do tanque cheio final).
 *
 * Datas "AAAA-MM-DD", competências "AAAA-MM". Valores em reais, litros em L (m³ para GNV).
 * ============================================================================
 */

import { mesDe, somarMeses, mesValido, dataValida } from './mensalidades';
import type { Pagamento } from './mensalidades';

export { mesDe, somarMeses, mesValido, dataValida };

export type TipoLancamento = 'DESPESA' | 'RECEITA';

export const CATEGORIAS_DESPESA = [
  'COMBUSTIVEL', 'MANUTENCAO', 'PECAS', 'PNEUS', 'LAVAGEM', 'PEDAGIO_ESTACIONAMENTO',
  'MULTA', 'SEGURO', 'IPVA_LICENCIAMENTO', 'FINANCIAMENTO', 'MONITOR', 'OUTROS'
] as const;
export const CATEGORIAS_RECEITA = ['FRETE_EXTRA', 'PASSEIO', 'OUTRA_RECEITA'] as const;
export type CategoriaDespesa = typeof CATEGORIAS_DESPESA[number];
export type CategoriaReceita = typeof CATEGORIAS_RECEITA[number];

export const COMBUSTIVEIS = ['GASOLINA', 'ETANOL', 'DIESEL', 'GNV'] as const;
export type Combustivel = typeof COMBUSTIVEIS[number];

export interface Lancamento {
  id: number;
  id_motorista: number;
  data: string;                 // AAAA-MM-DD
  tipo: TipoLancamento;
  categoria: string;
  valor: number;                // R$ total
  km?: number;                  // leitura do odômetro
  litros?: number;              // só abastecimento
  valor_litro?: number;         // R$/L (ou R$/m³)
  combustivel?: Combustivel;
  tanque_cheio?: boolean;       // completou o tanque
  posto?: string;
  obs?: string;
  criado_em: string;            // ISO
}

export interface CustoFixo {
  id: number;
  id_motorista: number;
  nome: string;
  valor_mensal: number;
  desde: string;                // AAAA-MM (inclusive)
  ate?: string;                 // AAAA-MM (inclusive); vazio = continua
}

export interface FinanceiroDB {
  lancamentos: Lancamento[];
  custos_fixos: CustoFixo[];
}
export const novoFinanceiroDB = (): FinanceiroDB => ({ lancamentos: [], custos_fixos: [] });

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function proximoId(lista: Array<{ id: number }>): number {
  return lista.reduce((m, x) => Math.max(m, x.id), 0) + 1;
}

// ---------------------------------------------------------------------------
// Validação de entrada
// ---------------------------------------------------------------------------

export function lerNumero(v: unknown, { min = 0, max = Infinity, exclusivoMin = true } = {}): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  if (exclusivoMin ? n <= min : n < min) return null;
  if (n > max) return null;
  return n;
}

export interface EntradaLancamento {
  tipo?: unknown; data?: unknown; categoria?: unknown; valor?: unknown; km?: unknown; litros?: unknown;
  valor_litro?: unknown; combustivel?: unknown; tanque_cheio?: unknown; posto?: unknown; obs?: unknown;
}

export type ResultadoValidacao = { ok: true; dados: Omit<Lancamento, 'id' | 'id_motorista' | 'criado_em'> } | { ok: false; erro: string };

/** Valida e normaliza um lançamento. Num abastecimento, completa o que faltar entre litros, R$/litro e total. */
export function validarLancamento(e: EntradaLancamento, hoje: string): ResultadoValidacao {
  const tipo = e.tipo;
  if (tipo !== 'DESPESA' && tipo !== 'RECEITA') return { ok: false, erro: 'Informe se é despesa ou receita.' };
  const data = e.data === undefined || e.data === '' ? hoje : e.data;
  if (!dataValida(data)) return { ok: false, erro: 'Data inválida.' };
  if (data > hoje) return { ok: false, erro: 'A data não pode ser futura.' };
  const categoria = String(e.categoria ?? '');
  const permitidas: readonly string[] = tipo === 'DESPESA' ? CATEGORIAS_DESPESA : CATEGORIAS_RECEITA;
  if (!permitidas.includes(categoria)) return { ok: false, erro: 'Categoria inválida.' };

  const km = e.km === undefined || e.km === '' || e.km === null ? undefined : lerNumero(e.km, { min: 0, max: 3_000_000 });
  if (km === null) return { ok: false, erro: 'Quilometragem inválida.' };

  let valor = lerNumero(e.valor, { max: 1_000_000 });
  const texto = (v: unknown, max: number) => { const t = String(v ?? '').trim().slice(0, max); return t || undefined; };
  const base = { tipo, data, categoria, km: km ?? undefined, posto: texto(e.posto, 60), obs: texto(e.obs, 200) } as const;

  if (categoria === 'COMBUSTIVEL') {
    const litros = lerNumero(e.litros, { max: 500 });
    let valorLitro = lerNumero(e.valor_litro, { max: 50 });
    const comb = e.combustivel === undefined || e.combustivel === '' ? undefined : String(e.combustivel);
    if (comb !== undefined && !(COMBUSTIVEIS as readonly string[]).includes(comb)) return { ok: false, erro: 'Combustível inválido.' };
    if (litros === null) return { ok: false, erro: 'Informe os litros abastecidos.' };
    if (valor === null && valorLitro === null) return { ok: false, erro: 'Informe o valor total ou o preço por litro.' };
    if (valor === null) valor = r2(litros * (valorLitro as number));
    if (valorLitro === null) valorLitro = r3(valor / litros);
    if (km === undefined) return { ok: false, erro: 'Informe a quilometragem do painel para calcular o consumo.' };
    return {
      ok: true,
      dados: { ...base, valor: r2(valor), litros: r3(litros), valor_litro: r3(valorLitro), combustivel: comb as Combustivel | undefined, tanque_cheio: e.tanque_cheio === true }
    };
  }

  if (valor === null) return { ok: false, erro: 'Informe um valor maior que zero.' };
  return { ok: true, dados: { ...base, valor: r2(valor) } };
}

// ---------------------------------------------------------------------------
// Consumo (tanque cheio a tanque cheio)
// ---------------------------------------------------------------------------

export interface CicloConsumo {
  inicio: string;           // data do tanque cheio inicial
  fim: string;              // data do tanque cheio final
  km: number;
  litros: number;
  valor: number;
  km_por_litro: number;
  custo_por_km: number;     // R$/km de combustível
  abastecimentos: number;
}

const ordenarPorTempo = (a: Lancamento, b: Lancamento) =>
  a.data.localeCompare(b.data) || (a.km ?? 0) - (b.km ?? 0) || a.id - b.id;

export const abastecimentos = (lista: Lancamento[]) =>
  lista.filter((l) => l.tipo === 'DESPESA' && l.categoria === 'COMBUSTIVEL' && l.litros && l.litros > 0 && l.km !== undefined).sort(ordenarPorTempo);

export interface ResultadoConsumo {
  ciclos: CicloConsumo[];
  media_km_por_litro: number | null;   // ponderada: km total ÷ litros total dos ciclos
  custo_medio_por_km: number | null;
  aviso: string | null;
}

export function calcularConsumo(lista: Lancamento[]): ResultadoConsumo {
  const abs = abastecimentos(lista);
  const ciclos: CicloConsumo[] = [];
  let aviso: string | null = null;
  let ancora: Lancamento | null = null; // último tanque cheio
  let acLitros = 0, acValor = 0, acQtd = 0;

  for (const a of abs) {
    if (ancora) { acLitros += a.litros!; acValor += a.valor; acQtd++; }
    if (a.tanque_cheio) {
      if (ancora) {
        const km = (a.km as number) - (ancora.km as number);
        if (km > 0 && acLitros > 0) {
          ciclos.push({
            inicio: ancora.data, fim: a.data, km: r2(km), litros: r3(acLitros), valor: r2(acValor),
            km_por_litro: r2(km / acLitros), custo_por_km: r3(acValor / km), abastecimentos: acQtd
          });
        } else {
          aviso = 'Há uma quilometragem menor ou igual à do abastecimento anterior. Confira os valores do painel.';
        }
      }
      ancora = a; acLitros = 0; acValor = 0; acQtd = 0;
    }
  }
  const kmTotal = ciclos.reduce((s, c) => s + c.km, 0);
  const litrosTotal = ciclos.reduce((s, c) => s + c.litros, 0);
  const valorTotal = ciclos.reduce((s, c) => s + c.valor, 0);
  return {
    ciclos,
    media_km_por_litro: litrosTotal > 0 ? r2(kmTotal / litrosTotal) : null,
    custo_medio_por_km: kmTotal > 0 ? r3(valorTotal / kmTotal) : null,
    aviso
  };
}

/** Km rodados no mês: última leitura do mês menos a última leitura anterior ao mês (ou a primeira do mês). */
export function kmRodadosNoMes(lista: Lancamento[], mes: string): number | null {
  const leituras = lista.filter((l) => l.km !== undefined && l.km > 0).sort(ordenarPorTempo);
  const doMes = leituras.filter((l) => mesDe(l.data) === mes);
  if (doMes.length === 0) return null;
  const antes = leituras.filter((l) => l.data < `${mes}-01`);
  const ini = antes.length ? (antes[antes.length - 1].km as number) : (doMes[0].km as number);
  const fim = Math.max(...doMes.map((l) => l.km as number));
  const km = fim - ini;
  return km > 0 ? r2(km) : null;
}

// ---------------------------------------------------------------------------
// Resumo do mês
// ---------------------------------------------------------------------------

export interface ResumoMes {
  mes: string;
  receita_mensalidades: number;
  receita_extras: number;
  receita_total: number;
  despesas_variaveis: number;
  custos_fixos: number;
  despesas_total: number;
  lucro: number;
  margem_pct: number | null;           // lucro ÷ receita
  por_categoria: Array<{ categoria: string; valor: number }>;
  combustivel: { litros: number; valor: number; preco_medio_litro: number | null; abastecimentos: number };
  km_rodados: number | null;
  custo_por_km: number | null;         // despesas totais ÷ km
  lucro_por_km: number | null;
  combustivel_por_km: number | null;   // R$ de combustível ÷ km
}

export const custoFixoDoMes = (c: CustoFixo, mes: string) => mes >= c.desde && (!c.ate || mes <= c.ate);

export function resumoDoMes(db: FinanceiroDB, pagamentos: Pagamento[], motorista: number, mes: string): ResumoMes {
  const lan = db.lancamentos.filter((l) => l.id_motorista === motorista);
  const doMes = lan.filter((l) => mesDe(l.data) === mes);
  const receitaMens = pagamentos.filter((p) => p.id_motorista === motorista && mesDe(p.pago_em) === mes).reduce((s, p) => s + p.valor, 0);
  const receitaExtra = doMes.filter((l) => l.tipo === 'RECEITA').reduce((s, l) => s + l.valor, 0);
  const despesasLan = doMes.filter((l) => l.tipo === 'DESPESA');
  const fixos = db.custos_fixos.filter((c) => c.id_motorista === motorista && custoFixoDoMes(c, mes));
  const totalFixos = fixos.reduce((s, c) => s + c.valor_mensal, 0);
  const despVar = despesasLan.reduce((s, l) => s + l.valor, 0);

  const cat = new Map<string, number>();
  for (const l of despesasLan) cat.set(l.categoria, (cat.get(l.categoria) ?? 0) + l.valor);
  if (totalFixos > 0) cat.set('CUSTOS_FIXOS', totalFixos);
  const porCategoria = [...cat.entries()].map(([categoria, valor]) => ({ categoria, valor: r2(valor) })).sort((a, b) => b.valor - a.valor);

  const abs = abastecimentos(doMes);
  const litros = abs.reduce((s, l) => s + (l.litros as number), 0);
  const valorComb = despesasLan.filter((l) => l.categoria === 'COMBUSTIVEL').reduce((s, l) => s + l.valor, 0);

  const receita = receitaMens + receitaExtra;
  const despesas = despVar + totalFixos;
  const lucro = receita - despesas;
  const km = kmRodadosNoMes(lan, mes);

  return {
    mes,
    receita_mensalidades: r2(receitaMens),
    receita_extras: r2(receitaExtra),
    receita_total: r2(receita),
    despesas_variaveis: r2(despVar),
    custos_fixos: r2(totalFixos),
    despesas_total: r2(despesas),
    lucro: r2(lucro),
    margem_pct: receita > 0 ? Math.round((lucro / receita) * 1000) / 10 : null,
    por_categoria: porCategoria,
    combustivel: {
      litros: r3(litros),
      valor: r2(valorComb),
      preco_medio_litro: litros > 0 ? r3(abs.reduce((s, l) => s + l.valor, 0) / litros) : null,
      abastecimentos: abs.length
    },
    km_rodados: km,
    custo_por_km: km ? r3(despesas / km) : null,
    lucro_por_km: km ? r3(lucro / km) : null,
    combustivel_por_km: km ? r3(valorComb / km) : null
  };
}

/** Série dos últimos `n` meses (do mais antigo ao mais novo, terminando em `mes`). */
export function serieDeMeses(db: FinanceiroDB, pagamentos: Pagamento[], motorista: number, mes: string, n = 6) {
  return Array.from({ length: n }, (_, i) => somarMeses(mes, i - (n - 1))).map((m) => {
    const r = resumoDoMes(db, pagamentos, motorista, m);
    return { mes: m, receita: r.receita_total, despesas: r.despesas_total, lucro: r.lucro };
  });
}

export function removerDoMotorista(db: FinanceiroDB, motorista: number) {
  db.lancamentos = db.lancamentos.filter((l) => l.id_motorista !== motorista);
  db.custos_fixos = db.custos_fixos.filter((c) => c.id_motorista !== motorista);
}
