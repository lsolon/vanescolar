import test from 'node:test';
import assert from 'node:assert/strict';
import { sentidoPorHorario, minutosAgoraBrasil } from './sentidoAuto';

const h = (s: string) => { const [a, b] = s.split(':').map(Number); return a * 60 + b; };
const turno = [{ escola_entrada: '07:30', escola_saida: '12:00' }];

test('manhã: antes e perto da entrada é Ida; perto da saída é Volta', () => {
  assert.equal(sentidoPorHorario(turno, h('06:00')), 'IDA');
  assert.equal(sentidoPorHorario(turno, h('07:30')), 'IDA');
  assert.equal(sentidoPorHorario(turno, h('08:00')), 'IDA', 'um pouco atrasado ainda é a ida');
  assert.equal(sentidoPorHorario(turno, h('11:00')), 'VOLTA');
  assert.equal(sentidoPorHorario(turno, h('12:30')), 'VOLTA');
  assert.equal(sentidoPorHorario(turno, h('20:00')), 'VOLTA');
});

test('a virada fica no meio entre a entrada e a saída', () => {
  assert.equal(sentidoPorHorario(turno, h('09:44')), 'IDA');
  assert.equal(sentidoPorHorario(turno, h('09:46')), 'VOLTA');
});

test('vários alunos e escolas: vale o horário mais próximo de agora', () => {
  const dois = [{ escola_entrada: '07:30', escola_saida: '12:00' }, { escola_entrada: '13:00', escola_saida: '17:30' }];
  assert.equal(sentidoPorHorario(dois, h('12:10')), 'VOLTA');
  assert.equal(sentidoPorHorario(dois, h('12:50')), 'IDA');
  assert.equal(sentidoPorHorario(dois, h('12:30')), 'IDA', 'empate: o que ainda vai acontecer');
  assert.equal(sentidoPorHorario(dois, h('17:00')), 'VOLTA');
});

test('sem horários informados: antes do meio-dia Ida, depois Volta; horário inválido é ignorado', () => {
  assert.equal(sentidoPorHorario([], h('07:00')), 'IDA');
  assert.equal(sentidoPorHorario([{}], h('15:00')), 'VOLTA');
  assert.equal(sentidoPorHorario([{ escola_entrada: '99:99', escola_saida: 'x' }], h('15:00')), 'VOLTA');
  assert.equal(sentidoPorHorario([{ escola_entrada: '07:30' }], h('15:00')), 'IDA', 'só a entrada é conhecida');
});

test('minutosAgoraBrasil usa o fuso de Brasília', () => {
  assert.equal(minutosAgoraBrasil(new Date('2026-11-05T15:30:00Z')), 12 * 60 + 30);
  assert.equal(minutosAgoraBrasil(new Date('2026-11-05T02:00:00Z')), 23 * 60);
});
