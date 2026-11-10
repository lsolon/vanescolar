import test from 'node:test';
import assert from 'node:assert/strict';
import { preverRota, difMin, type EntradaCalculo, type ParadaCalculo } from './atrasoRota';

const P = (id: number, combinado: number | null, extra: Partial<ParadaCalculo> = {}): ParadaCalculo => ({ id, nome: `A${id}`, familia: 100 + id, local: { latitude: id, longitude: 0 }, combinadoMin: combinado, ...extra });
const base = (o: Partial<EntradaCalculo>): EntradaCalculo => ({
  sentido: 'IDA', agoraMin: 6 * 60, origem: { latitude: 0, longitude: 0 },
  paradas: [], escola: { latitude: 9, longitude: 0 }, trecho: () => 10, minPorParada: 4, trechoPadraoMin: 5, ...o
});

test('difMin é circular perto da meia-noite', () => {
  assert.equal(difMin(5, 1435), 10);
  assert.equal(difMin(1435, 5), -10);
});

test('ida no prazo: ninguém afetado', () => {
  // sai às 6:00: 1º às 6:10 (combinado 6:10), 2º às 6:25 (espera o combinado), escola às 6:39 (limite 6:45)
  const r = preverRota(base({ paradas: [P(1, 370, { limiteEscolaMin: 405 }), P(2, 385, { limiteEscolaMin: 405 })] }));
  assert.equal(r.afetados, 0);
  assert.equal(r.escola?.chegadaMin, 399); // 6:39, antes do limite de 6:45
});

test('ida atrasada: o atraso se acumula e afeta quem vem depois', () => {
  // combinados 6:05 e 6:15; a van chega às 6:10 e 6:24 → 5 e 9 min de atraso
  const r = preverRota(base({ paradas: [P(1, 365), P(2, 375)] }));
  assert.deepEqual(r.paradas.map((p) => p.atrasoMin), [5, 9]);
  assert.deepEqual(r.paradas.map((p) => p.afetado), [true, true]);
  assert.equal(r.atrasoMaxMin, 9);
});

test('abaixo da tolerância de 5 min não avisa', () => {
  const r = preverRota(base({ paradas: [P(1, 366)] }));
  assert.equal(r.paradas[0].atrasoMin, 4);
  assert.equal(r.afetados, 0);
});

test('ida cedo: a van espera o horário combinado e não adianta os seguintes', () => {
  // chega 6:10 mas o combinado é 6:30: espera; o 2º (combinado 6:40) sai de 6:34 + 10 = 6:44 → 4 min, abaixo da tolerância
  const r = preverRota(base({ paradas: [P(1, 390), P(2, 400)] }));
  assert.equal(r.paradas[0].previstoMin, 390);
  assert.equal(r.paradas[1].previstoMin, 404);
  assert.equal(r.afetados, 0);
});

test('ida: chegada à escola depois do limite afeta o aluno mesmo com a parada no horário', () => {
  // parada no horário (6:10), mas a escola só às 6:24 e o limite é 6:15 → 9 min
  const r = preverRota(base({ paradas: [P(1, 370, { limiteEscolaMin: 375 })] }));
  assert.equal(r.escola?.atrasoMin, 9);
  assert.equal(r.paradas[0].afetado, true);
  assert.equal(r.paradas[0].porEscola, true);
});

test('volta: espera a saída da escola e compara com o horário combinado', () => {
  // chega à escola 6:10 (saída 6:30): sai 6:30, 1ª casa 6:40 (combinado 6:40), 2ª 6:54 (combinado 6:45) → 9 min
  const r = preverRota(base({ sentido: 'VOLTA', saidaEscolaMin: 390, paradas: [P(1, 400), P(2, 405)] }));
  assert.deepEqual(r.paradas.map((p) => p.atrasoMin), [0, 9]);
  assert.deepEqual(r.paradas.map((p) => p.afetado), [false, true]);
  assert.equal(r.escola?.chegadaMin, 370);
});

test('sem horário combinado ou sem ponto: não afeta e marca como aproximado', () => {
  const r = preverRota(base({ paradas: [P(1, null), P(2, 380, { local: null })] }));
  assert.equal(r.paradas[0].atrasoMin, null);
  assert.equal(r.aproximado, true);
});
