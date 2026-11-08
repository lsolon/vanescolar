import test from 'node:test';
import assert from 'node:assert/strict';
import { agruparPorFamilia, statusDaFamilia } from './familias';
import type { LinhaMensalidadeMotorista } from '../../services/api';

const l = (o: Partial<LinhaMensalidadeMotorista> & { id_aluno: number }): LinhaMensalidadeMotorista => ({
  aluno: `Aluno ${o.id_aluno}`, responsavel_nome: 'Resp', whatsapp: '', valor: 100, vencimento_dia: 10, status: 'EM_ABERTO',
  pago_em: null, valor_pago: null, forma: null, meses_em_atraso: 0, ...o
});

test('irmãos viram uma família; quem não tem chave fica sozinho', () => {
  const f = agruparPorFamilia([l({ id_aluno: 1, familia: 'r5' }), l({ id_aluno: 2, familia: 'r5' }), l({ id_aluno: 3 })]);
  assert.equal(f.length, 2);
  assert.equal(f.find((x) => x.chave === 'r5')?.filhos.length, 2);
  assert.ok(f.some((x) => x.chave === 'a3'));
});

test('total soma em centavos e a situação é a pior dos filhos', () => {
  const [f] = agruparPorFamilia([l({ id_aluno: 1, familia: 'r1', valor: 0.1 }), l({ id_aluno: 2, familia: 'r1', valor: 0.2, status: 'ATRASADO' })]);
  assert.equal(f.total, 0.3);
  assert.equal(f.status, 'ATRASADO');
});

test('só é Pago quando todos pagaram; conta pagos', () => {
  assert.equal(statusDaFamilia([l({ id_aluno: 1, status: 'PAGO' }), l({ id_aluno: 2, status: 'PAGO' })]), 'PAGO');
  const [f] = agruparPorFamilia([l({ id_aluno: 1, familia: 'x', status: 'PAGO' }), l({ id_aluno: 2, familia: 'x', status: 'EM_ABERTO' })]);
  assert.equal(f.status, 'EM_ABERTO');
  assert.equal(f.pagos, 1);
});

test('ordem: avisou primeiro, depois atrasados, em aberto, pagos', () => {
  const f = agruparPorFamilia([
    l({ id_aluno: 1, familia: 'a', status: 'PAGO', responsavel_nome: 'A' }),
    l({ id_aluno: 2, familia: 'b', status: 'ATRASADO', responsavel_nome: 'B' }),
    l({ id_aluno: 3, familia: 'c', status: 'EM_ABERTO', responsavel_nome: 'C', aviso_em: '2026-11-08T10:00:00Z' })
  ]);
  assert.deepEqual(f.map((x) => x.chave), ['c', 'b', 'a']);
});
