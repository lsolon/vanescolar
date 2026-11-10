import test from 'node:test';
import assert from 'node:assert/strict';
import { lerKmPorLitro, validarConfig, intervalos, inicioDaSemana, precoMedioLitro, estimarConsumo, type TrechoParaConsumo } from './consumo';
import type { Lancamento } from './financeiro';

const abast = (o: Partial<Lancamento> & { id: number; data: string; valor: number; litros: number; km: number }): Lancamento => ({
  id_motorista: 1, tipo: 'DESPESA', categoria: 'COMBUSTIVEL', criado_em: '2026-01-01T00:00:00Z', ...o
});

test('Consumo: km/L aceita vírgula e ponto como decimal e recusa fora de 1 a 50', () => {
  assert.equal(lerKmPorLitro('9,5'), 9.5);
  assert.equal(lerKmPorLitro('9.5'), 9.5, 'ponto é decimal aqui (não é milhar)');
  assert.equal(lerKmPorLitro(10), 10);
  assert.equal(lerKmPorLitro(' 8,25 '), 8.25);
  assert.equal(lerKmPorLitro('10.55'), 10.55);
  assert.equal(lerKmPorLitro(''), null);
  assert.equal(lerKmPorLitro(undefined), null);
  assert.equal(lerKmPorLitro('abc'), null);
  assert.equal(lerKmPorLitro(0), null);
  assert.equal(lerKmPorLitro(0.5), null);
  assert.equal(lerKmPorLitro(51), null);
  assert.equal(lerKmPorLitro(-3), null);
  assert.equal(lerKmPorLitro(NaN), null);
  assert.equal(lerKmPorLitro(Infinity), null);
});

test('Consumo: validarConfig devolve o número ou uma mensagem em português', () => {
  assert.deepEqual(validarConfig({ km_por_litro: '9,5' }), { ok: true, km_por_litro: 9.5 });
  const ruim = validarConfig({ km_por_litro: 'x' });
  assert.equal(ruim.ok, false);
  if (!ruim.ok) assert.match(ruim.erro, /km a van faz com 1 litro/);
  assert.equal(validarConfig({}).ok, false);
});

test('Consumo: semana de segunda a domingo, quinzena 1–15 ou 16–fim, mês inteiro', () => {
  assert.equal(inicioDaSemana('2026-11-09'), '2026-11-09', 'segunda');
  assert.equal(inicioDaSemana('2026-11-15'), '2026-11-09', 'domingo volta para a segunda anterior');
  assert.equal(inicioDaSemana('2026-11-01'), '2026-10-26', 'semana cruza o mês');
  const a = intervalos('2026-11-12');
  assert.deepEqual(a.semana, { de: '2026-11-09', ate: '2026-11-15' });
  assert.deepEqual(a.quinzena, { de: '2026-11-01', ate: '2026-11-15' });
  assert.deepEqual(a.mes, { de: '2026-11-01', ate: '2026-11-30' });
  assert.deepEqual(a.dia, { de: '2026-11-12', ate: '2026-11-12' });
  const b = intervalos('2026-11-22');
  assert.deepEqual(b.quinzena, { de: '2026-11-16', ate: '2026-11-30' });
  assert.deepEqual(intervalos('2026-11-15').quinzena, { de: '2026-11-01', ate: '2026-11-15' }, 'dia 15 ainda é a 1ª quinzena');
  assert.deepEqual(intervalos('2026-11-16').quinzena, { de: '2026-11-16', ate: '2026-11-30' });
  assert.equal(intervalos('2026-02-20').quinzena.ate, '2026-02-28');
  assert.equal(intervalos('2024-02-20').quinzena.ate, '2024-02-29', 'ano bissexto');
  assert.equal(intervalos('2026-12-31').mes.ate, '2026-12-31');
});

test('Consumo: preço do litro vem dos abastecimentos recentes; sem recentes, do último; sem nenhum, nulo', () => {
  assert.equal(precoMedioLitro([], '2026-11-12'), null);
  const lista = [
    abast({ id: 1, data: '2026-10-20', valor: 300, litros: 50, km: 1000 }),   // 6,00
    abast({ id: 2, data: '2026-11-05', valor: 330, litros: 50, km: 1500 })    // 6,60
  ];
  assert.equal(precoMedioLitro(lista, '2026-11-12'), 6.3, 'média ponderada (R$ ÷ litros) dos dois');
  const antigos = [abast({ id: 1, data: '2026-01-10', valor: 280, litros: 40, km: 100 }), abast({ id: 2, data: '2026-02-10', valor: 320, litros: 40, km: 600 })];
  assert.equal(precoMedioLitro(antigos, '2026-11-12'), 8, 'fora da janela: usa o último abastecimento (320 ÷ 40)');
  // despesa que não é combustível, ou abastecimento sem km, não entra
  const ruido: Lancamento[] = [
    { id: 9, id_motorista: 1, data: '2026-11-10', tipo: 'DESPESA', categoria: 'LAVAGEM', valor: 50, criado_em: 'x' },
    { id: 10, id_motorista: 1, data: '2026-11-10', tipo: 'DESPESA', categoria: 'COMBUSTIVEL', valor: 100, litros: 10, criado_em: 'x' }
  ];
  assert.equal(precoMedioLitro(ruido, '2026-11-12'), null);
});

const T = (data: string, sentido: 'IDA' | 'VOLTA', km: number | null, extra: Partial<TrechoParaConsumo> = {}): TrechoParaConsumo =>
  ({ data, sentido, km, iniciado_em: `${data}T10:00:00Z`, ...extra });

test('Consumo: soma km, litros (km ÷ km/L) e custo por dia, semana, quinzena e mês', () => {
  const hoje = '2026-11-12'; // quinta-feira
  const trechos = [
    T('2026-10-31', 'IDA', 50),                                  // fora do mês
    T('2026-11-02', 'IDA', 20),                                  // mês e quinzena, fora da semana
    T('2026-11-09', 'IDA', 30), T('2026-11-09', 'VOLTA', 30),    // semana
    T('2026-11-12', 'IDA', 25.5, { viagem: 'Manhã 1', iniciado_em: '2026-11-12T09:00:00Z' }),
    T('2026-11-12', 'VOLTA', null, { iniciado_em: '2026-11-12T12:00:00Z' }) // sem GPS
  ];
  const r = estimarConsumo(trechos, { sentido: 'VOLTA', viagem: 'Tarde 1', km: 10 }, 10, 6, hoje);

  assert.equal(r.km_por_litro, 10);
  assert.equal(r.preco_litro, 6);
  assert.deepEqual([r.dia.km, r.dia.litros, r.dia.custo, r.dia.trechos, r.dia.sem_gps], [35.5, 3.55, 21.3, 2, 1]);
  assert.deepEqual([r.semana.km, r.semana.litros, r.semana.custo, r.semana.trechos, r.semana.sem_gps], [95.5, 9.55, 57.3, 4, 1]);
  assert.deepEqual([r.quinzena.km, r.quinzena.litros, r.quinzena.custo], [115.5, 11.55, 69.3]);
  assert.deepEqual([r.mes.km, r.mes.litros, r.mes.custo], [115.5, 11.55, 69.3]);
  assert.deepEqual(r.semana, { ...r.semana, de: '2026-11-09', ate: '2026-11-15' });

  assert.deepEqual(r.dias.map((d) => [d.data, d.km]), [['2026-11-12', 35.5], ['2026-11-09', 60], ['2026-11-02', 20]], 'mais novo primeiro, só dias com viagem');

  // viagens de hoje na ordem em que aconteceram; o trecho em andamento é o último
  assert.deepEqual(r.trechos_de_hoje.map((t) => [t.sentido, t.viagem, t.km, t.em_andamento]), [
    ['IDA', 'Manhã 1', 25.5, false],
    ['VOLTA', null, null, false],
    ['VOLTA', 'Tarde 1', 10, true]
  ]);
  assert.equal(r.trechos_de_hoje[0].litros, 2.55);
  assert.equal(r.trechos_de_hoje[0].custo, 15.3);
  assert.equal(r.trechos_de_hoje[1].litros, null, 'sem GPS: não inventa litros');
});

test('Consumo: sem preço do litro o custo fica nulo; sem viagens tudo zera', () => {
  const r = estimarConsumo([T('2026-11-12', 'IDA', 12)], null, 8, null, '2026-11-12');
  assert.equal(r.dia.litros, 1.5);
  assert.equal(r.dia.custo, null);
  assert.equal(r.dias[0].custo, null);
  assert.equal(r.trechos_de_hoje[0].custo, null);
  const vazio = estimarConsumo([], null, 8, 6, '2026-11-12');
  assert.deepEqual([vazio.dia.km, vazio.dia.litros, vazio.dia.custo, vazio.mes.km], [0, 0, 0, 0]);
  assert.deepEqual(vazio.dias, []);
  assert.deepEqual(vazio.trechos_de_hoje, []);
});

test('Consumo: trecho em andamento sem km ainda não aparece; datas futuras e lixo não quebram', () => {
  const r = estimarConsumo([T('2026-11-20', 'IDA', 99)], { sentido: 'IDA', km: 0 }, 10, 6, '2026-11-12');
  assert.equal(r.mes.km, 0, 'viagem com data futura não conta');
  assert.equal(r.trechos_de_hoje.length, 0);
  assert.throws(() => estimarConsumo([], null, 10, 6, '12/11/2026'));
});

test('Consumo: a semana que cruza o mês conta o dia do mês anterior só na semana', () => {
  // 2026-11-01 é domingo: a semana vai de 26/10 a 01/11
  const trechos = [T('2026-10-28', 'IDA', 40), T('2026-11-01', 'IDA', 10)];
  const r = estimarConsumo(trechos, null, 10, null, '2026-11-01');
  assert.equal(r.semana.km, 50);
  assert.equal(r.mes.km, 10);
  assert.equal(r.quinzena.km, 10);
});
