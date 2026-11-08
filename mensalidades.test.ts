import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from './mensalidades';

const db = () => {
  const d = M.novoMensalidadesDB();
  d.configs[M.chaveConfig(1, 201)] = { valor: 300, vencimento_dia: 10 };
  d.configs[M.chaveConfig(1, 202)] = { valor: 250.5, vencimento_dia: 5 };
  return d;
};

test('hojeBrasil usa o fuso de Brasília (01:00 UTC ainda é o dia anterior no Brasil)', () => {
  assert.equal(M.hojeBrasil(new Date('2026-11-02T01:00:00Z')), '2026-11-01');
  assert.equal(M.hojeBrasil(new Date('2026-11-02T12:00:00Z')), '2026-11-02');
});

test('status: em aberto até o vencimento, atrasado depois, pago com baixa', () => {
  const d = db();
  assert.equal(M.linhaDoAluno(d, 1, 201, '2026-11', '2026-11-10').status, 'EM_ABERTO'); // no dia do vencimento ainda não atrasou
  assert.equal(M.linhaDoAluno(d, 1, 201, '2026-11', '2026-11-11').status, 'ATRASADO');
  M.registrarPagamento(d, { id_motorista: 1, id_aluno: 201, mes: '2026-11', valor: 300, forma: 'PIX', pago_em: '2026-11-11' });
  assert.equal(M.linhaDoAluno(d, 1, 201, '2026-11', '2026-11-11').status, 'PAGO');
  assert.equal(M.linhaDoAluno(d, 1, 999, '2026-11', '2026-11-11').status, 'SEM_VALOR');
});

test('mês futuro fica em aberto e não conta atraso', () => {
  const l = M.linhaDoAluno(db(), 1, 201, '2027-01', '2026-11-20');
  assert.equal(l.status, 'EM_ABERTO');
  assert.equal(l.meses_em_atraso, 0);
});

test('meses em atraso contam até o último mês pago', () => {
  const d = db();
  d.configs[M.chaveConfig(1, 201)].desde = '2026-01';
  M.registrarPagamento(d, { id_motorista: 1, id_aluno: 201, mes: '2026-08', valor: 300, forma: 'PIX', pago_em: '2026-08-09' });
  assert.equal(M.linhaDoAluno(d, 1, 201, '2026-11', '2026-11-20').meses_em_atraso, 3); // set, out, nov
});

test('atraso não retroage antes da primeira competência cobrada', () => {
  const d = db();
  d.configs[M.chaveConfig(1, 201)].desde = '2026-10';
  assert.equal(M.linhaDoAluno(d, 1, 201, '2026-11', '2026-11-20').meses_em_atraso, 2); // out e nov
  delete d.configs[M.chaveConfig(1, 201)].desde;
  assert.equal(M.linhaDoAluno(d, 1, 201, '2026-11', '2026-11-20').meses_em_atraso, 1); // só o mês consultado
});

test('baixa repetida substitui a anterior e desfazer remove', () => {
  const d = db();
  const p = { id_motorista: 1, id_aluno: 201, mes: '2026-11', valor: 300, forma: 'PIX' as const, pago_em: '2026-11-05' };
  M.registrarPagamento(d, p);
  M.registrarPagamento(d, { ...p, forma: 'DINHEIRO' });
  assert.equal(d.pagamentos.length, 1);
  assert.equal(d.pagamentos[0].forma, 'DINHEIRO');
  assert.equal(M.desfazerPagamento(d, 1, 201, '2026-11'), true);
  assert.equal(M.desfazerPagamento(d, 1, 201, '2026-11'), false);
});

test('motoristas são isolados: baixa de um não aparece para o outro', () => {
  const d = db();
  d.configs[M.chaveConfig(2, 201)] = { valor: 100, vencimento_dia: 1 };
  M.registrarPagamento(d, { id_motorista: 1, id_aluno: 201, mes: '2026-11', valor: 300, forma: 'PIX', pago_em: '2026-11-05' });
  assert.equal(M.linhaDoAluno(d, 2, 201, '2026-11', '2026-11-05').status, 'ATRASADO');
});

test('resumo soma recebido, a vencer e atrasado', () => {
  const d = db();
  M.registrarPagamento(d, { id_motorista: 1, id_aluno: 201, mes: '2026-11', valor: 300, forma: 'PIX', pago_em: '2026-11-03' });
  const linhas = [201, 202, 203].map((a) => M.linhaDoAluno(d, 1, a, '2026-11', '2026-11-08'));
  const r = M.resumir(linhas, '2026-11');
  assert.equal(r.recebido, 300);
  assert.equal(r.atrasado, 250.5); // 202 venceu dia 5
  assert.equal(r.previsto, 550.5);
  assert.equal(r.qtd_sem_valor, 1);
});

test('validações de entrada', () => {
  assert.equal(M.lerValor('350,50'), 350.5);
  assert.equal(M.lerValor('1.200,00'), 1200);
  assert.equal(M.lerValor(0), null);
  assert.equal(M.lerValor('abc'), null);
  assert.equal(M.lerVencimento(29), null);
  assert.equal(M.lerVencimento('10'), 10);
  assert.equal(M.mesValido('2026-13'), false);
  assert.equal(M.dataValida('2026-02-30'), false);
  assert.equal(M.somarMeses('2026-12', 1), '2027-01');
  assert.equal(M.somarMeses('2026-01', -1), '2025-12');
});

test('removerAluno apaga configuração e histórico', () => {
  const d = db();
  M.registrarPagamento(d, { id_motorista: 1, id_aluno: 201, mes: '2026-11', valor: 300, forma: 'PIX', pago_em: '2026-11-05' });
  M.removerAluno(d, 1, 201);
  assert.equal(d.pagamentos.length, 0);
  assert.equal(d.configs[M.chaveConfig(1, 201)], undefined);
});

test('aviso de pagamento: registra uma vez, não vira baixa e some quando o motorista confirma', () => {
  const d = db();
  const agora = new Date('2026-11-08T13:00:00Z');
  const a1 = M.registrarAviso(d, 1, 201, '2026-11', agora);
  const a2 = M.registrarAviso(d, 1, 201, '2026-11', new Date('2026-11-09T13:00:00Z'));
  assert.equal(a2.avisado_em, a1.avisado_em, 'avisar de novo mantém o primeiro aviso');
  assert.equal(d.avisos?.length, 1);
  assert.equal(M.linhaDoAluno(d, 1, 201, '2026-11', '2026-11-08').status, 'EM_ABERTO', 'aviso não dá baixa');
  assert.equal(M.avisoDe(d, 1, 202, '2026-11'), undefined, 'outra família não é afetada');
  assert.equal(M.avisoDe(d, 2, 201, '2026-11'), undefined, 'outro motorista não vê o aviso');
  M.registrarPagamento(d, { id_motorista: 1, id_aluno: 201, mes: '2026-11', valor: 300, forma: 'PIX', pago_em: '2026-11-08' });
  assert.equal(M.avisoDe(d, 1, 201, '2026-11'), undefined, 'confirmar apaga o aviso');
  assert.equal(M.linhaDoAluno(d, 1, 201, '2026-11', '2026-11-08').status, 'PAGO');
});

test('aviso de pagamento: descartar ("não recebi") e remover o aluno apagam só o que é dele; dados antigos sem avisos funcionam', () => {
  const d = db();
  const inicial = d.avisos;
  assert.equal(inicial, undefined, 'banco novo ou antigo começa sem lista');
  assert.equal(M.descartarAviso(d, 1, 201, '2026-11'), false);
  assert.equal(M.avisoDe(d, 1, 201, '2026-11'), undefined);
  M.registrarAviso(d, 1, 201, '2026-11');
  M.registrarAviso(d, 1, 201, '2026-10');
  M.registrarAviso(d, 1, 202, '2026-11');
  assert.equal(M.descartarAviso(d, 1, 201, '2026-11'), true);
  assert.equal(d.avisos?.length, 2);
  M.removerAluno(d, 1, 201);
  assert.deepEqual(d.avisos?.map((a) => `${a.id_aluno}:${a.mes}`), ['202:2026-11']);
});

test('mesParaPagar: o mais antigo sem pagamento nos últimos 6 meses, respeitando quando a cobrança começou', () => {
  const d = M.novoMensalidadesDB();
  d.configs[M.chaveConfig(1, 201)] = { valor: 300, vencimento_dia: 10, desde: '2026-09' };
  assert.equal(M.mesParaPagar(d, 1, 201, '2026-11-08'), '2026-09', 'não cobra antes do mês inicial');
  M.registrarPagamento(d, { id_motorista: 1, id_aluno: 201, mes: '2026-09', valor: 300, forma: 'PIX', pago_em: '2026-09-09' });
  assert.equal(M.mesParaPagar(d, 1, 201, '2026-11-08'), '2026-10');
  M.registrarPagamento(d, { id_motorista: 1, id_aluno: 201, mes: '2026-10', valor: 300, forma: 'PIX', pago_em: '2026-10-09' });
  assert.equal(M.mesParaPagar(d, 1, 201, '2026-11-08'), '2026-11', 'mês atual ainda no prazo também pode ser pago');
  M.registrarPagamento(d, { id_motorista: 1, id_aluno: 201, mes: '2026-11', valor: 300, forma: 'PIX', pago_em: '2026-11-08' });
  assert.equal(M.mesParaPagar(d, 1, 201, '2026-11-08'), null, 'tudo pago');
  assert.equal(M.mesParaPagar(d, 1, 999, '2026-11-08'), null, 'sem valor definido');
});
