import test from 'node:test';
import assert from 'node:assert/strict';
import * as MOD from './modulos';

test('padrão: quem nunca mexeu mantém Mensalidades e Financeiro ligados e Manutenção desligada', () => {
  assert.deepEqual(MOD.modulosEfetivos(undefined), { mensalidades: true, financeiro: true, manutencao: false });
  assert.deepEqual(MOD.modulosEfetivos(null), { mensalidades: true, financeiro: true, manutencao: false });
  assert.deepEqual(MOD.modulosEfetivos({}), { mensalidades: true, financeiro: true, manutencao: false });
});

test('a escolha do motorista vale; chaves desconhecidas e valores que não são verdadeiro/falso são ignorados', () => {
  const ef = MOD.modulosEfetivos({ mensalidades: false, financeiro: 'sim' as any, inexistente: true });
  assert.deepEqual(ef, { mensalidades: false, financeiro: true, manutencao: false });
  assert.equal('inexistente' in ef, false);
});

test('listar: traz nome, descrição e se está ativo', () => {
  const l = MOD.listarModulos({ financeiro: false });
  assert.equal(l.length, MOD.MODULOS.length);
  assert.equal(l.find((m) => m.chave === 'financeiro')?.ativo, false);
  assert.equal(l.find((m) => m.chave === 'mensalidades')?.ativo, true);
  for (const m of l) { assert.ok(m.nome.length > 0); assert.ok(m.descricao.length > 0); }
});

test('alterar: devolve cópia nova, não mexe na original e valida a entrada', () => {
  const antes = { mensalidades: true };
  const depois = MOD.alterarModulo(antes, 'mensalidades', false);
  assert.deepEqual(depois, { mensalidades: false, financeiro: true, manutencao: false });
  assert.deepEqual(antes, { mensalidades: true });
  assert.throws(() => MOD.alterarModulo({}, 'foguete', true), /desconhecido/i);
  assert.throws(() => MOD.alterarModulo({}, 'financeiro', 'sim'), /ligado ou desligado/i);
  assert.throws(() => MOD.alterarModulo({}, '__proto__', true), /desconhecido/i);
});

test('recursos novos entram desligados: todo módulo fora da lista original tem padrão falso', () => {
  const originais = ['mensalidades', 'financeiro'];
  for (const m of MOD.MODULOS) {
    if (!originais.includes(m.chave)) assert.equal(m.padrao, false, `${m.chave} deve começar desligado`);
  }
});
