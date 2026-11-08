import test from 'node:test';
import assert from 'node:assert/strict';
import { validarAssinatura, adicionarAssinatura, removerAssinatura, montarMensagem, chaveAviso, AvisosFeitos, MAX_ASSINATURAS } from './push';

const ok = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } };

test('Push: assinatura válida passa e só os campos esperados ficam', () => {
  const r = validarAssinatura({ ...ok, extra: 'x', expirationTime: null });
  assert.deepEqual(r, ok);
});

test('Push: assinatura inválida é recusada (http, sem chaves, lixo)', () => {
  assert.equal(validarAssinatura(null), null);
  assert.equal(validarAssinatura('x'), null);
  assert.equal(validarAssinatura({ ...ok, endpoint: 'http://fcm.googleapis.com/x' }), null);
  assert.equal(validarAssinatura({ ...ok, endpoint: 'nao-e-url' }), null);
  assert.equal(validarAssinatura({ ...ok, endpoint: 'https://a.com/' + 'x'.repeat(700) }), null);
  assert.equal(validarAssinatura({ endpoint: ok.endpoint }), null);
  assert.equal(validarAssinatura({ ...ok, keys: { p256dh: '<script>', auth: ok.keys.auth } }), null);
  assert.equal(validarAssinatura({ ...ok, keys: { p256dh: ok.keys.p256dh, auth: 'a' } }), null);
});

test('Push: adicionar não duplica o aparelho, respeita o limite e remover funciona', () => {
  let l = adicionarAssinatura(undefined, ok);
  l = adicionarAssinatura(l, ok);
  assert.equal(l.length, 1);
  for (let i = 0; i < MAX_ASSINATURAS + 2; i++) l = adicionarAssinatura(l, { ...ok, endpoint: `https://x.com/${i}` });
  assert.equal(l.length, MAX_ASSINATURAS);
  assert.equal(l[l.length - 1].endpoint, `https://x.com/${MAX_ASSINATURAS + 1}`);
  assert.equal(removerAssinatura(l, l[0].endpoint).length, MAX_ASSINATURAS - 1);
  assert.deepEqual(removerAssinatura(undefined, 'x'), []);
});

test('Push: mensagens são genéricas (sem nome, endereço ou coordenada) e o plural está certo', () => {
  assert.equal(montarMensagem('van_chegando', 1).corpo, 'Chega em cerca de 1 minuto.');
  assert.equal(montarMensagem('van_chegando', 7.4).corpo, 'Chega em cerca de 7 minutos.');
  assert.equal(montarMensagem('van_chegando', 0).corpo, 'Chega em cerca de 1 minuto.');
  for (const t of ['van_chegando', 'embarque', 'entrega', 'teste'] as const) {
    const m = montarMensagem(t, 5);
    assert.ok(m.titulo && m.corpo && m.tag);
    assert.doesNotMatch(`${m.titulo} ${m.corpo}`, /rua|avenida|escola|lat|lon|\d{5}-?\d{3}/i);
  }
});

test('Push: o mesmo aviso não se repete no dia, mas volta no dia seguinte', () => {
  const f = new AvisosFeitos();
  const k = chaveAviso(1, 2, 'IDA', 'van_chegando', '2026-11-08');
  assert.equal(f.marcar(k, '2026-11-08'), true);
  assert.equal(f.marcar(k, '2026-11-08'), false);
  assert.equal(f.marcar(chaveAviso(1, 2, 'VOLTA', 'van_chegando', '2026-11-08'), '2026-11-08'), true);
  assert.equal(f.marcar(chaveAviso(1, 2, 'IDA', 'van_chegando', '2026-11-09'), '2026-11-09'), true);
  assert.equal(f.marcar(k, '2026-11-09'), true);
});
