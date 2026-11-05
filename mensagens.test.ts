import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from './mensagens';

const T0 = new Date('2026-11-05T12:00:00Z');
const em = (dias: number) => new Date(T0.getTime() + dias * 86400000);

test('texto: limpa, limita e recusa coordenadas', () => {
  assert.deepEqual(G.validarTexto('  oi  '), { ok: true, texto: 'oi' });
  assert.equal(G.validarTexto('   ').ok, false);
  assert.equal(G.validarTexto(42 as any).ok, false);
  assert.equal(G.validarTexto('a'.repeat(501)).ok, false);
  assert.equal(G.validarTexto('a'.repeat(500)).ok, true);
  assert.equal((G.validarTexto('oi\u0000 tudo') as any).texto, 'oi tudo');
  assert.equal(G.validarTexto('estou em -22.932145, -43.201234').ok, false);
  assert.equal(G.validarTexto('-22.932145 -43.201234').ok, false);
  assert.equal(G.validarTexto('chego às 7.30 e levo 2.5 kg').ok, true, 'números comuns passam');
});

test('mensagem rápida só vale para ids conhecidos e só quando permitida', () => {
  assert.equal((G.resolverTexto({ rapida: 'CHEGUEI' }, true) as any).texto, 'Cheguei no ponto de embarque.');
  assert.equal(G.resolverTexto({ rapida: 'NADA' }, true).ok, false);
  assert.equal(G.resolverTexto({ rapida: 'CHEGUEI' }, false).ok, false, 'responsável não usa prontas: cai no texto livre vazio');
  assert.equal((G.resolverTexto({ texto: 'oi' }, true) as any).texto, 'oi');
});

test('conversa é por família; avisos aparecem para todas; não lidas por lado', () => {
  const db = G.novoMensagensDB();
  G.enviar(db, { motorista: 1, familia: 10, de: 'RESPONSAVEL', texto: 'Bom dia' }, T0);
  G.enviar(db, { motorista: 1, familia: 11, de: 'RESPONSAVEL', texto: 'Segredo da família 11' }, T0);
  G.enviar(db, { motorista: 1, familia: 10, de: 'MOTORISTA', texto: 'Bom dia, tudo certo' }, T0);
  G.enviar(db, { motorista: 1, familia: null, de: 'MOTORISTA', texto: 'Amanhã sem aula' }, T0);
  G.enviar(db, { motorista: 2, familia: 10, de: 'MOTORISTA', texto: 'Outro motorista' }, T0);

  assert.deepEqual(G.feedDaFamilia(db, 1, 10, T0).map((m) => m.texto), ['Bom dia', 'Bom dia, tudo certo', 'Amanhã sem aula']);
  assert.deepEqual(G.feedDaFamilia(db, 1, 11, T0).map((m) => m.texto), ['Segredo da família 11', 'Amanhã sem aula']);
  assert.equal(G.feedDaFamilia(db, 1, 10, T0).some((m) => m.texto === 'Segredo da família 11'), false);
  assert.equal(G.feedDaFamilia(db, 1, 10, T0).some((m) => m.texto === 'Outro motorista'), false);

  assert.equal(G.naoLidasDoMotorista(db, 1, 10), 1);
  assert.equal(G.naoLidasDaFamilia(db, 1, 10, T0), 2, 'resposta do motorista + aviso');
  assert.equal(G.marcarLidasPeloMotorista(db, 1, 10, T0.toISOString()), 1);
  assert.equal(G.naoLidasDoMotorista(db, 1, 10), 0);
  assert.equal(G.naoLidasDoMotorista(db, 1, 11), 1, 'outra família continua não lida');
  G.marcarLidasPelaFamilia(db, 1, 10, T0.toISOString(), T0);
  assert.equal(G.naoLidasDaFamilia(db, 1, 10, T0), 0);
  assert.equal(G.naoLidasDaFamilia(db, 1, 11, T0), 1, 'aviso ainda não lido pela família 11');
});

test('aviso antigo some da lista; retenção apaga mensagens velhas', () => {
  const db = G.novoMensagensDB();
  G.enviar(db, { motorista: 1, familia: null, de: 'MOTORISTA', texto: 'Aviso velho' }, T0);
  assert.equal(G.avisosDaVan(db, 1, em(G.AVISO_VISIVEL_DIAS - 1)).length, 1);
  assert.equal(G.avisosDaVan(db, 1, em(G.AVISO_VISIVEL_DIAS + 1)).length, 0);
  G.enviar(db, { motorista: 1, familia: 10, de: 'RESPONSAVEL', texto: 'Recente' }, em(G.RETENCAO_DIAS + 1));
  assert.deepEqual(db.mensagens.map((m) => m.texto), ['Recente'], 'o aviso passou da retenção e foi apagado');
});

test('limite por conversa mantém as mais novas e não mexe em outro motorista', () => {
  const db = G.novoMensagensDB();
  G.enviar(db, { motorista: 2, familia: 10, de: 'MOTORISTA', texto: 'do outro' }, T0);
  for (let i = 0; i < G.MAX_POR_CONVERSA + 5; i++) G.enviar(db, { motorista: 1, familia: 10, de: 'RESPONSAVEL', texto: `m${i}` }, T0);
  const c = G.conversaDireta(db, 1, 10);
  assert.equal(c.length, G.MAX_POR_CONVERSA);
  assert.equal(c[0].texto, 'm5');
  assert.equal(c[c.length - 1].texto, `m${G.MAX_POR_CONVERSA + 4}`);
  assert.equal(G.conversaDireta(db, 2, 10).length, 1);
});
