import test from 'node:test';
import assert from 'node:assert/strict';
import * as MOD from './modulos';

test('padrão: quem nunca mexeu mantém Mensalidades e Financeiro ligados e Manutenção desligada', () => {
  assert.deepEqual(MOD.modulosEfetivos(undefined), { mensalidades: true, financeiro: true, manutencao: false, consumo: false, 'pagamento-pix': false });
  assert.deepEqual(MOD.modulosEfetivos(null), { mensalidades: true, financeiro: true, manutencao: false, consumo: false, 'pagamento-pix': false });
  assert.deepEqual(MOD.modulosEfetivos({}), { mensalidades: true, financeiro: true, manutencao: false, consumo: false, 'pagamento-pix': false });
});

test('a escolha do motorista vale; chaves desconhecidas e valores que não são verdadeiro/falso são ignorados', () => {
  const ef = MOD.modulosEfetivos({ mensalidades: false, financeiro: 'sim' as any, inexistente: true });
  assert.deepEqual(ef, { mensalidades: false, financeiro: true, manutencao: false, consumo: false, 'pagamento-pix': false });
  assert.equal('inexistente' in ef, false);
});

test('listar: traz nome, descrição e se está ativo (sem os módulos restritos para quem não foi liberado)', () => {
  const l = MOD.listarModulos({ financeiro: false });
  assert.equal(l.length, MOD.MODULOS.filter((m) => !m.restrito).length);
  assert.equal(l.some((m) => m.chave === 'pagamento-pix'), false);
  assert.equal(l.find((m) => m.chave === 'financeiro')?.ativo, false);
  assert.equal(l.find((m) => m.chave === 'mensalidades')?.ativo, true);
  for (const m of l) { assert.ok(m.nome.length > 0); assert.ok(m.descricao.length > 0); }
});

test('alterar: devolve cópia nova, não mexe na original e valida a entrada', () => {
  const antes = { mensalidades: true };
  const depois = MOD.alterarModulo(antes, 'mensalidades', false);
  assert.deepEqual(depois, { mensalidades: false, financeiro: true, manutencao: false, consumo: false, 'pagamento-pix': false });
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

test('módulo restrito (pagamento-pix): só aparece, liga e funciona para a conta liberada', () => {
  const lib = ['pagamento-pix'];
  assert.equal(MOD.listarModulos({}, lib).some((m) => m.chave === 'pagamento-pix'), true);
  assert.equal(MOD.listarModulos({}, lib).find((m) => m.chave === 'pagamento-pix')?.ativo, false, 'liberado não significa ligado');
  assert.equal('restrito' in MOD.listarModulos({}, lib)[0], false, 'a tela não recebe o detalhe interno');
  // não liberado: recusa com a mesma mensagem de módulo inexistente
  assert.throws(() => MOD.alterarModulo({}, 'pagamento-pix', true), /desconhecido/i);
  assert.throws(() => MOD.alterarModulo({}, 'pagamento-pix', true, ['outro']), /desconhecido/i);
  assert.equal(MOD.alterarModulo({}, 'pagamento-pix', true, lib)['pagamento-pix'], true);
});

test('moduloAtivo: restrito exige estar ligado E liberado; perder a liberação desliga na prática', () => {
  const ligado = { 'pagamento-pix': true };
  assert.equal(MOD.moduloAtivo(ligado, 'pagamento-pix', ['pagamento-pix']), true);
  assert.equal(MOD.moduloAtivo(ligado, 'pagamento-pix', []), false, 'saiu da lista: não funciona mais, mesmo ligado');
  assert.equal(MOD.moduloAtivo({}, 'pagamento-pix', ['pagamento-pix']), false, 'liberado mas nunca ligado');
  assert.equal(MOD.moduloAtivo({}, 'mensalidades'), true);
  assert.equal(MOD.moduloAtivo({ financeiro: false }, 'financeiro'), false);
  assert.equal(MOD.moduloAtivo({}, 'foguete'), false);
});

test('liberadosPara: lê a lista do servidor sem diferenciar maiúsculas; sem variável ou sem e-mail, ninguém é liberado', () => {
  const env = { PIX_BETA_EMAILS: ' Leandrosolon+Mot@Gmail.com , outro@exemplo.com;mais@exemplo.com ' };
  assert.deepEqual(MOD.liberadosPara('leandrosolon+mot@gmail.com', env), ['pagamento-pix']);
  assert.deepEqual(MOD.liberadosPara('LEANDROSOLON+MOT@GMAIL.COM', env), ['pagamento-pix']);
  assert.deepEqual(MOD.liberadosPara('mais@exemplo.com', env), ['pagamento-pix']);
  assert.deepEqual(MOD.liberadosPara('leandrosolon@gmail.com', env), [], 'o e-mail sem o +mot não é o mesmo');
  assert.deepEqual(MOD.liberadosPara('qualquer@exemplo.com', {}), []);
  assert.deepEqual(MOD.liberadosPara('qualquer@exemplo.com', { PIX_BETA_EMAILS: '' }), []);
  assert.deepEqual(MOD.liberadosPara('', env), []);
  assert.deepEqual(MOD.liberadosPara(undefined, env), []);
  assert.deepEqual(MOD.lerListaEmails('a@b.com, a@b.com ; semarroba'), ['a@b.com'], 'sem repetição e sem lixo');
});
