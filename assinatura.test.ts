import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as A from './assinatura';
import * as MP from './mercadopago';

const DIA = 24 * 60 * 60 * 1000;
const T0 = Date.parse('2026-11-12T12:00:00Z');

test('planos: faixa pelo total de alunos (manhã + tarde somados)', () => {
  assert.equal(A.planoPorAlunos(0).valor, 99);
  assert.equal(A.planoPorAlunos(10).valor, 99);
  assert.equal(A.planoPorAlunos(11).valor, 149);
  assert.equal(A.planoPorAlunos(20).valor, 149);
  assert.equal(A.planoPorAlunos(21).valor, 199);
  assert.equal(A.planoPorAlunos(30).valor, 199);
  assert.equal(A.planoPorAlunos(31).valor, 250);
  assert.equal(A.planoPorAlunos(40).chave, 'ilimitado');
  assert.equal(A.planoPorAlunos(NaN).valor, 99);
});

test('teste de 30 dias: conta os dias e bloqueia no 31º', () => {
  const a = A.garantirTeste(undefined, T0);
  assert.equal(a.testeInicio, new Date(T0).toISOString());
  assert.deepEqual([A.situacao(a, T0).estado, A.situacao(a, T0).diasRestantes], ['TESTE', 30]);
  assert.equal(A.situacao(a, T0 + 29 * DIA).diasRestantes, 1);
  assert.equal(A.situacao(a, T0 + 30 * DIA - 1).estado, 'TESTE');
  const s = A.situacao(a, T0 + 30 * DIA);
  assert.equal(s.estado, 'BLOQUEADA');
  assert.equal(s.bloqueadaDesde, new Date(T0 + 30 * DIA).toISOString());
  assert.equal(s.excluirApos, new Date(T0 + 60 * DIA).toISOString());
});

test('garantirTeste não reinicia o teste de quem já tem data', () => {
  const a = A.garantirTeste(undefined, T0);
  assert.equal(A.garantirTeste(a, T0 + 10 * DIA), a);
  assert.equal(A.garantirTeste({ testeInicio: 'lixo' }, T0).testeInicio, new Date(T0).toISOString());
});

test('dias extras do administrador adiam o bloqueio; isenta nunca bloqueia', () => {
  const a: A.Assinatura = { testeInicio: new Date(T0).toISOString(), diasExtras: 15 };
  assert.equal(A.situacao(a, T0 + 44 * DIA).estado, 'TESTE');
  assert.equal(A.situacao(a, T0 + 45 * DIA).estado, 'BLOQUEADA');
  assert.equal(A.situacao({ ...a, isento: true }, T0 + 500 * DIA).estado, 'ISENTA');
});

test('assinatura autorizada libera; pausada ou cancelada depois do teste bloqueia desde então', () => {
  const base = A.garantirTeste(undefined, T0);
  const mp: A.AssinaturaMP = { id: 'abc12345', status: 'pending', plano: 'ate10', valor: 99, atualizadoEm: '' };
  let a: A.Assinatura = { ...base, mp };
  // aguardando pagamento: continua no teste
  assert.equal(A.situacao(a, T0 + 5 * DIA).estado, 'TESTE');
  assert.equal(A.situacao(a, T0 + 5 * DIA).aguardandoPagamento, true);
  // teste acabou e o motorista não concluiu o pagamento: bloqueia
  assert.equal(A.situacao(a, T0 + 31 * DIA).estado, 'BLOQUEADA');
  // pagou
  a = A.aplicarStatusMP(a, 'authorized', T0 + 40 * DIA);
  assert.equal(A.situacao(a, T0 + 100 * DIA).estado, 'ATIVA');
  // cancelou: bloqueia a partir do cancelamento e a exclusão conta dali
  a = A.aplicarStatusMP(a, 'cancelled', T0 + 100 * DIA);
  const s = A.situacao(a, T0 + 101 * DIA);
  assert.equal(s.estado, 'BLOQUEADA');
  assert.equal(s.bloqueadaDesde, new Date(T0 + 100 * DIA).toISOString());
  assert.equal(s.excluirApos, new Date(T0 + 130 * DIA).toISOString());
  // aviso repetido de "cancelada" não empurra a data de exclusão
  const a2 = A.aplicarStatusMP(a, 'cancelled', T0 + 110 * DIA);
  assert.equal(a2.mp?.encerradaEm, a.mp?.encerradaEm);
  // voltou a autorizar: libera e limpa a data de encerramento
  const a3 = A.aplicarStatusMP(a, 'authorized', T0 + 120 * DIA);
  assert.equal(A.situacao(a3, T0 + 121 * DIA).estado, 'ATIVA');
  assert.equal(a3.mp?.encerradaEm, undefined);
});

test('cancelar durante o teste não tira o que sobrou do teste', () => {
  let a: A.Assinatura = { ...A.garantirTeste(undefined, T0), mp: { id: 'abc12345', status: 'authorized', plano: 'ate10', valor: 99, atualizadoEm: '' } };
  a = A.aplicarStatusMP(a, 'cancelled', T0 + 3 * DIA);
  const s = A.situacao(a, T0 + 4 * DIA);
  assert.equal(s.estado, 'TESTE');
  assert.equal(s.diasRestantes, 26);
  // passado o teste, o bloqueio conta do fim do teste (o cancelamento foi antes)
  const b = A.situacao(a, T0 + 31 * DIA);
  assert.equal(b.estado, 'BLOQUEADA');
  assert.equal(b.bloqueadaDesde, new Date(T0 + 30 * DIA).toISOString());
});

test('sem registro ou data ilegível não bloqueia por engano', () => {
  assert.equal(A.situacao(undefined, T0).estado, 'TESTE');
  assert.equal(A.situacao({ testeInicio: 'xx' }, T0).estado, 'TESTE');
});

test('status do Mercado Pago desconhecido é ignorado', () => {
  assert.equal(A.lerStatusMP('authorized'), 'authorized');
  assert.equal(A.lerStatusMP('AUTHORIZED'), 'authorized');
  assert.equal(A.lerStatusMP('qualquer'), null);
  assert.equal(A.lerStatusMP(undefined), null);
});

test('precisa subir de plano quando passa do limite contratado', () => {
  const a: A.Assinatura = { testeInicio: '', mp: { id: 'abc12345', status: 'authorized', plano: 'ate10', valor: 99, atualizadoEm: '' } };
  assert.equal(A.precisaSubirPlano(a, 10), false);
  assert.equal(A.precisaSubirPlano(a, 11), true);
  assert.equal(A.precisaSubirPlano({ ...a, mp: { ...a.mp!, plano: 'ilimitado', valor: 250 } }, 80), false);
  assert.equal(A.precisaSubirPlano(undefined, 80), false);
});

test('referência do motorista: ida e volta, recusa formato estranho', () => {
  assert.equal(A.referenciaDoMotorista(42), 'van-42');
  assert.equal(A.motoristaDaReferencia('van-42'), 42);
  assert.equal(A.motoristaDaReferencia('van-42; DROP'), null);
  assert.equal(A.motoristaDaReferencia(undefined), null);
});

// ---------------- Mercado Pago ----------------

function falso(resp: { ok?: boolean; status?: number; corpo: any }) {
  const chamadas: { url: string; init: any }[] = [];
  const f: MP.Fetch = async (url, init) => { chamadas.push({ url, init }); return { ok: resp.ok ?? true, status: resp.status ?? 200, json: async () => resp.corpo }; };
  return { f, chamadas };
}

test('criarAssinatura: corpo do pedido, teste grátis e endereço do checkout', async () => {
  const { f, chamadas } = falso({ corpo: { id: '2c93808472abcdef', status: 'pending', init_point: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=2c93808472abcdef', external_reference: 'van-7', auto_recurring: { transaction_amount: 149 } } });
  const r = await MP.criarAssinatura(f, 'APP_USR-segredo', { motivo: 'VanEscolar - 11 a 20 alunos', referencia: 'van-7', emailPagador: 'a@b.com', valor: 149, voltarPara: 'https://x.app/app?assinatura=retorno', diasGratis: 12, agoraMs: Date.UTC(2026, 10, 12), notificacao: 'https://x.app/api/webhooks/mercadopago' });
  assert.equal(r.initPoint?.startsWith('https://www.mercadopago.com.br/'), true);
  assert.equal(r.status, 'pending');
  const c = chamadas[0];
  assert.equal(c.url, 'https://api.mercadopago.com/preapproval');
  assert.equal(c.init.method, 'POST');
  assert.equal(c.init.headers.Authorization, 'Bearer APP_USR-segredo');
  const corpo = JSON.parse(c.init.body);
  assert.equal(corpo.status, 'pending');
  assert.equal(corpo.external_reference, 'van-7');
  assert.equal(corpo.auto_recurring.transaction_amount, 149);
  assert.equal(corpo.auto_recurring.currency_id, 'BRL');
  assert.equal(corpo.auto_recurring.start_date, '2026-11-24T00:00:00.000Z');
  assert.equal(corpo.auto_recurring.free_trial, undefined);
  assert.equal(corpo.card_token_id, undefined);
});

test('criarAssinatura: sem dias de teste não manda free_trial; sem endereço de checkout dá erro', async () => {
  const { f, chamadas } = falso({ corpo: { id: '2c93808472abcdef', init_point: 'https://mp/x' } });
  await MP.criarAssinatura(f, 't', { motivo: 'm', referencia: 'van-1', emailPagador: 'a@b.com', valor: 99, voltarPara: 'https://x' });
  assert.equal(JSON.parse(chamadas[0].init.body).auto_recurring.start_date, undefined);
  const sem = falso({ corpo: { id: '2c93808472abcdef' } });
  await assert.rejects(() => MP.criarAssinatura(sem.f, 't', { motivo: 'm', referencia: 'van-1', emailPagador: 'a@b.com', valor: 99, voltarPara: 'https://x' }), /endereço de pagamento/);
});

test('erro do Mercado Pago vira mensagem curta, sem repassar o corpo todo', async () => {
  const { f } = falso({ ok: false, status: 400, corpo: { message: 'payer_email invalido', cause: [{ segredo: 'x' }] } });
  await assert.rejects(() => MP.buscarAssinatura(f, 't', 'abcdefgh12'), (e: any) => e instanceof MP.ErroMP && e.status === 400 && /payer_email/.test(e.message) && !/segredo/.test(e.message));
});

test('buscar, cancelar e mudar valor: caminhos e identificador validado (sem injeção na URL)', async () => {
  const b = falso({ corpo: { id: 'abcdefgh12', status: 'authorized', external_reference: 'van-3' } });
  const r = await MP.buscarAssinatura(b.f, 't', 'abcdefgh12');
  assert.deepEqual([r.status, r.externalReference], ['authorized', 'van-3']);
  assert.equal(b.chamadas[0].url, 'https://api.mercadopago.com/preapproval/abcdefgh12');
  await assert.rejects(() => MP.buscarAssinatura(b.f, 't', '../payments/1'), /inválido/);
  const c = falso({ corpo: { id: 'abcdefgh12', status: 'cancelled' } });
  assert.equal((await MP.cancelarAssinatura(c.f, 't', 'abcdefgh12')).status, 'cancelled');
  assert.deepEqual(JSON.parse(c.chamadas[0].init.body), { status: 'cancelled' });
  const m = falso({ corpo: { id: 'abcdefgh12', status: 'authorized', auto_recurring: { transaction_amount: 199 } } });
  assert.equal((await MP.mudarValor(m.f, 't', 'abcdefgh12', 199)).valor, 199);
  assert.equal(m.chamadas[0].init.method, 'PUT');
});

function assinar(segredo: string, id: string, req: string, ts: string) {
  return `ts=${ts},v1=${crypto.createHmac('sha256', segredo).update(`id:${id};request-id:${req};ts:${ts};`).digest('hex')}`;
}

test('webhook: assinatura válida passa; adulterada, sem segredo ou de outro id falha', () => {
  const segredo = 'segredo-do-painel';
  const ts = '1704908010';
  const x = assinar(segredo, 'abcdefgh12', 'req-1', ts);
  assert.equal(MP.assinaturaDoAvisoValida({ segredo, xSignature: x, xRequestId: 'req-1', dataId: 'abcdefgh12' }), true);
  assert.equal(MP.assinaturaDoAvisoValida({ segredo, xSignature: x, xRequestId: 'req-1', dataId: 'ABCDEFGH12' }), true); // id em maiúsculas é normalizado
  assert.equal(MP.assinaturaDoAvisoValida({ segredo, xSignature: x, xRequestId: 'req-2', dataId: 'abcdefgh12' }), false);
  assert.equal(MP.assinaturaDoAvisoValida({ segredo, xSignature: x, xRequestId: 'req-1', dataId: 'outroid999' }), false);
  assert.equal(MP.assinaturaDoAvisoValida({ segredo: 'errado', xSignature: x, xRequestId: 'req-1', dataId: 'abcdefgh12' }), false);
  assert.equal(MP.assinaturaDoAvisoValida({ segredo: '', xSignature: x, xRequestId: 'req-1', dataId: 'abcdefgh12' }), false);
  assert.equal(MP.assinaturaDoAvisoValida({ segredo, xSignature: 'ts=1,v1=zz', xRequestId: 'req-1', dataId: 'abcdefgh12' }), false);
  assert.equal(MP.assinaturaDoAvisoValida({ segredo, xSignature: undefined, xRequestId: 'req-1', dataId: 'abcdefgh12' }), false);
});

test('webhook: aviso velho demais é recusado quando há tolerância; ts em segundos ou milissegundos', () => {
  const segredo = 's';
  const agora = Date.parse('2026-11-12T12:00:00Z');
  const recente = String(Math.floor(agora / 1000) - 60);
  assert.equal(MP.assinaturaDoAvisoValida({ segredo, xSignature: assinar(segredo, 'abcdefgh12', 'r', recente), xRequestId: 'r', dataId: 'abcdefgh12', agoraMs: agora, toleranciaMs: 10 * 60 * 1000 }), true);
  const velho = String(Math.floor(agora / 1000) - 3600);
  assert.equal(MP.assinaturaDoAvisoValida({ segredo, xSignature: assinar(segredo, 'abcdefgh12', 'r', velho), xRequestId: 'r', dataId: 'abcdefgh12', agoraMs: agora, toleranciaMs: 10 * 60 * 1000 }), false);
  const ms = String(agora - 1000);
  assert.equal(MP.assinaturaDoAvisoValida({ segredo, xSignature: assinar(segredo, 'abcdefgh12', 'r', ms), xRequestId: 'r', dataId: 'abcdefgh12', agoraMs: agora, toleranciaMs: 10 * 60 * 1000 }), true);
});
