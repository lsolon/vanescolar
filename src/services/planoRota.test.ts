import test from 'node:test';
import assert from 'node:assert/strict';
import { encaixarAlunos, ordemDasAncoras, agendarOrdem, AlunoPlano } from './rotaRuas';

// 3 alunos (0,1,2) + escola (3). Tempos simétricos em minutos.
const D = [
  [0, 6, 20, 30],
  [6, 0, 15, 25],
  [20, 15, 0, 10],
  [30, 25, 10, 0]
];
const hm = (h: number, m: number) => h * 60 + m;

test('âncora: horários fixos não mudam e o aluno novo se encaixa entre eles com horário calculado', () => {
  // A (0) às 06:38, C (2) às 07:00, B (1) novo. Entrada 07:40, chegada limite 07:25.
  const alunos: AlunoPlano[] = [{ nome: 'A', ancoraMin: hm(6, 38) }, { nome: 'B', ancoraMin: null }, { nome: 'C', ancoraMin: hm(7, 5) }];
  const p = encaixarAlunos('IDA', alunos, D, hm(7, 25), ordemDasAncoras(alunos));
  assert.deepEqual(p.ordem, [0, 1, 2]);
  assert.equal(p.horarios[0], hm(6, 38));
  assert.equal(p.horarios[2], hm(7, 5));
  assert.equal(p.horarios[1], hm(6, 38) + 1 + 6); // A + 1 min parado + 6 min até B
  assert.equal(p.avisos.length, 0);
});

test('aviso quando depois do último aluno a van não chega à escola a tempo', () => {
  const alunos: AlunoPlano[] = [{ nome: 'A', ancoraMin: hm(7, 20) }];
  const D1 = [[0, 30], [30, 0]];
  const p = encaixarAlunos('IDA', alunos, D1, hm(7, 25), [0]); // 07:20 + 1 + 30 = 07:51 > 07:25
  assert.equal(p.avisos.length, 1);
  assert.equal(p.avisos[0].tipo, 'escola');
  assert.equal(p.avisos[0].faltamMin, 26);
});

test('aviso quando o intervalo entre duas âncoras é menor que o trajeto', () => {
  const alunos: AlunoPlano[] = [{ nome: 'A', ancoraMin: hm(6, 38) }, { nome: 'C', ancoraMin: hm(6, 45) }];
  const D2 = [[0, 20, 30], [20, 0, 10], [30, 10, 0]];
  const r = agendarOrdem('IDA', [0, 1], alunos, D2, hm(7, 25));
  assert.equal(r.avisos[0].tipo, 'trecho'); // A→C leva 20 min, só há 7
  assert.equal(r.avisos[0].faltamMin, 14);
});

test('sem âncoras: usa a ordem base e calcula de trás para frente a partir da chegada à escola', () => {
  const alunos: AlunoPlano[] = [{ nome: 'A', ancoraMin: null }, { nome: 'B', ancoraMin: null }, { nome: 'C', ancoraMin: null }];
  const p = encaixarAlunos('IDA', alunos, D, hm(7, 25), [0, 1, 2]);
  assert.deepEqual(p.ordem, [0, 1, 2]);
  assert.equal(p.horarios[2], hm(7, 25) - 10 - 1);
  assert.equal(p.horarios[1], p.horarios[2] - 15 - 1);
  assert.equal(p.horarios[0], p.horarios[1] - 6 - 1);
});

test('volta: horários avançam a partir da saída da escola e a âncora é respeitada', () => {
  const alunos: AlunoPlano[] = [{ nome: 'A', ancoraMin: null }, { nome: 'B', ancoraMin: hm(12, 40) }, { nome: 'C', ancoraMin: null }];
  const p = encaixarAlunos('VOLTA', alunos, D, hm(12, 10), ordemDasAncoras(alunos));
  assert.equal(p.horarios[1], hm(12, 40));
  assert.ok(p.ordem.indexOf(1) >= 0 && p.ordem.length === 3);
  assert.ok(p.avisos.every((a) => a.tipo === 'trecho'));
});
