import test from 'node:test';
import assert from 'node:assert/strict';
import * as F from './financeiro';

let seq = 0;
const lan = (p: Partial<F.Lancamento>): F.Lancamento => ({
  id: ++seq, id_motorista: 1, data: '2026-11-01', tipo: 'DESPESA', categoria: 'OUTROS', valor: 0, criado_em: 'x', ...p
});
const abast = (data: string, km: number, litros: number, valor: number, cheio = false) =>
  lan({ data, km, litros, valor, categoria: 'COMBUSTIVEL', combustivel: 'DIESEL', tanque_cheio: cheio, valor_litro: valor / litros });

test('consumo: tanque cheio a tanque cheio soma os abastecimentos parciais do meio', () => {
  const r = F.calcularConsumo([
    abast('2026-10-01', 1000, 40, 240, true),
    abast('2026-10-10', 1300, 20, 120),          // parcial
    abast('2026-10-20', 1500, 30, 180, true)     // fecha o ciclo
  ]);
  assert.equal(r.ciclos.length, 1);
  assert.equal(r.ciclos[0].km, 500);
  assert.equal(r.ciclos[0].litros, 50);          // 20 + 30 (os 40 L do primeiro enchimento não entram)
  assert.equal(r.ciclos[0].km_por_litro, 10);
  assert.equal(r.ciclos[0].valor, 300);
  assert.equal(r.ciclos[0].custo_por_km, 0.6);
  assert.equal(r.media_km_por_litro, 10);
});

test('consumo: sem dois tanques cheios ainda não há ciclo; média é ponderada por km', () => {
  assert.equal(F.calcularConsumo([abast('2026-10-01', 1000, 40, 240, true)]).media_km_por_litro, null);
  const r = F.calcularConsumo([
    abast('2026-10-01', 1000, 40, 240, true),
    abast('2026-10-10', 1400, 40, 240, true),    // 400 km / 40 L = 10
    abast('2026-10-20', 1500, 20, 120, true)     // 100 km / 20 L = 5
  ]);
  assert.equal(r.ciclos.length, 2);
  assert.equal(r.media_km_por_litro, 8.33);      // 500 km / 60 L, e não a média simples (7,5)
});

test('consumo: quilometragem que volta atrás gera aviso e não distorce a média', () => {
  const r = F.calcularConsumo([abast('2026-10-01', 2000, 40, 240, true), abast('2026-10-10', 1500, 30, 180, true)]);
  assert.equal(r.ciclos.length, 0);
  assert.ok(r.aviso);
});

test('km rodados no mês usa a última leitura do mês anterior como ponto de partida', () => {
  const l = [abast('2026-10-25', 1000, 30, 180, true), abast('2026-11-10', 1300, 30, 180), lan({ data: '2026-11-28', km: 1600, valor: 50 })];
  assert.equal(F.kmRodadosNoMes(l, '2026-11'), 600);
  assert.equal(F.kmRodadosNoMes(l, '2026-12'), null);
  assert.equal(F.kmRodadosNoMes([abast('2026-11-10', 1300, 30, 180)], '2026-11'), null, 'uma leitura só não dá diferença');
});

test('resumo do mês: lucro = mensalidades + extras − despesas − custos fixos', () => {
  const db = F.novoFinanceiroDB();
  db.lancamentos.push(
    abast('2026-10-28', 1000, 40, 240, true),
    abast('2026-11-12', 1400, 50, 300, true),
    lan({ data: '2026-11-15', categoria: 'MANUTENCAO', valor: 200 }),
    lan({ data: '2026-11-20', tipo: 'RECEITA', categoria: 'PASSEIO', valor: 400 }),
    lan({ id_motorista: 2, data: '2026-11-20', tipo: 'RECEITA', categoria: 'PASSEIO', valor: 9999 }) // outro motorista
  );
  db.custos_fixos.push({ id: 1, id_motorista: 1, nome: 'Seguro', valor_mensal: 250, desde: '2026-01' });
  db.custos_fixos.push({ id: 2, id_motorista: 1, nome: 'Parcela', valor_mensal: 900, desde: '2026-01', ate: '2026-10' }); // já acabou
  const pg: any[] = [
    { id_motorista: 1, id_aluno: 201, mes: '2026-11', valor: 1000, forma: 'PIX', pago_em: '2026-11-05' },
    { id_motorista: 1, id_aluno: 202, mes: '2026-11', valor: 500, forma: 'PIX', pago_em: '2026-11-06' },
    { id_motorista: 1, id_aluno: 201, mes: '2026-10', valor: 777, forma: 'PIX', pago_em: '2026-10-05' } // outro mês
  ];
  const r = F.resumoDoMes(db, pg, 1, '2026-11');
  assert.equal(r.receita_mensalidades, 1500);
  assert.equal(r.receita_extras, 400);
  assert.equal(r.receita_total, 1900);
  assert.equal(r.despesas_variaveis, 500);       // 300 combustível + 200 manutenção
  assert.equal(r.custos_fixos, 250);
  assert.equal(r.despesas_total, 750);
  assert.equal(r.lucro, 1150);
  assert.equal(r.margem_pct, 60.5);
  assert.deepEqual(r.combustivel, { litros: 50, valor: 300, preco_medio_litro: 6, abastecimentos: 1 });
  assert.equal(r.km_rodados, 400);
  assert.equal(r.custo_por_km, 1.875);
  assert.equal(r.lucro_por_km, 2.875);
  assert.equal(r.combustivel_por_km, 0.75);
  assert.equal(r.por_categoria[0].categoria, 'COMBUSTIVEL');
  assert.ok(r.por_categoria.some((c) => c.categoria === 'CUSTOS_FIXOS' && c.valor === 250));
});

test('resumo de mês sem nada não quebra (sem divisão por zero)', () => {
  const r = F.resumoDoMes(F.novoFinanceiroDB(), [], 1, '2026-11');
  assert.equal(r.lucro, 0);
  assert.equal(r.margem_pct, null);
  assert.equal(r.km_rodados, null);
  assert.equal(r.custo_por_km, null);
  assert.equal(r.combustivel.preco_medio_litro, null);
});

test('série dos últimos meses termina no mês pedido, do mais antigo ao mais novo', () => {
  const s = F.serieDeMeses(F.novoFinanceiroDB(), [], 1, '2026-02', 4);
  assert.deepEqual(s.map((x) => x.mes), ['2025-11', '2025-12', '2026-01', '2026-02']);
});

test('validação: abastecimento completa o total a partir de litros × preço, e exige km', () => {
  const ok = F.validarLancamento({ tipo: 'DESPESA', categoria: 'COMBUSTIVEL', litros: '40,5', valor_litro: '5,99', km: 12000, combustivel: 'DIESEL', tanque_cheio: true }, '2026-11-05');
  assert.ok(ok.ok);
  if (ok.ok) { assert.equal(ok.dados.valor, 242.6); assert.equal(ok.dados.litros, 40.5); assert.equal(ok.dados.tanque_cheio, true); assert.equal(ok.dados.data, '2026-11-05'); }
  const total = F.validarLancamento({ tipo: 'DESPESA', categoria: 'COMBUSTIVEL', litros: 40, valor: 240, km: 1 }, '2026-11-05');
  assert.ok(total.ok && total.dados.valor_litro === 6);
  assert.equal(F.validarLancamento({ tipo: 'DESPESA', categoria: 'COMBUSTIVEL', litros: 40, valor: 240 }, '2026-11-05').ok, false, 'sem km');
  assert.equal(F.validarLancamento({ tipo: 'DESPESA', categoria: 'COMBUSTIVEL', valor: 240, km: 1 }, '2026-11-05').ok, false, 'sem litros');
});

test('validação: tipo, categoria, valor e data', () => {
  const v = (e: any) => F.validarLancamento(e, '2026-11-05');
  assert.equal(v({ tipo: 'X', categoria: 'OUTROS', valor: 1 }).ok, false);
  assert.equal(v({ tipo: 'DESPESA', categoria: 'FRETE_EXTRA', valor: 1 }).ok, false, 'categoria de receita em despesa');
  assert.equal(v({ tipo: 'RECEITA', categoria: 'PASSEIO', valor: 0 }).ok, false);
  assert.equal(v({ tipo: 'RECEITA', categoria: 'PASSEIO', valor: -5 }).ok, false);
  assert.equal(v({ tipo: 'DESPESA', categoria: 'OUTROS', valor: 10, data: '2026-12-01' }).ok, false, 'futura');
  assert.equal(v({ tipo: 'DESPESA', categoria: 'OUTROS', valor: 10, data: '2026-02-30' }).ok, false);
  assert.equal(v({ tipo: 'DESPESA', categoria: 'OUTROS', valor: 10, km: 'abc' }).ok, false);
  assert.ok(v({ tipo: 'DESPESA', categoria: 'PNEUS', valor: '1.250,00', obs: 'x'.repeat(500) }).ok);
});
