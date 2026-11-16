import test from 'node:test';
import assert from 'node:assert/strict';
import { VisitasLp, codigoLpValido, pareceRobo, type VisitaLp, type VisitasStore } from './visitasLp';

const CEL = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';

test('Link da landing: só códigos curtos de letras minúsculas e números valem', () => {
  assert.equal(codigoLpValido('ab12cd3'), true);
  assert.equal(codigoLpValido('abc'), false);
  assert.equal(codigoLpValido('AB12CD3'), false);
  assert.equal(codigoLpValido('ab12;drop'), false);
  assert.equal(codigoLpValido(undefined), false);
  assert.equal(codigoLpValido('a'.repeat(17)), false);
});

test('Link da landing: pré-visualização do WhatsApp, buscadores e ferramentas parecem robô; celular comum não', () => {
  assert.equal(pareceRobo(CEL), false);
  assert.equal(pareceRobo('WhatsApp/2.23.20.0 A'), true);
  assert.equal(pareceRobo('facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'), true);
  assert.equal(pareceRobo('Googlebot/2.1 (+http://www.google.com/bot.html)'), true);
  assert.equal(pareceRobo('curl/8.0.1'), true);
  assert.equal(pareceRobo(undefined), true);
});

test('Link da landing: conta aberturas por código, ignora repetição em 1 minuto e separa robô', async () => {
  const v = new VisitasLp(null);
  const t0 = Date.parse('2026-11-16T10:00:00Z');
  assert.equal(await v.registrar('ab12cd3', false, t0), true);
  assert.equal(await v.registrar('ab12cd3', false, t0 + 10_000), false, 'repetida em 10 s');
  assert.equal(await v.registrar('ab12cd3', false, t0 + 120_000), true);
  assert.equal(await v.registrar('ab12cd3', true, t0 + 130_000), true, 'robô tem contador próprio');
  assert.equal(await v.registrar('zz99yy8', false, t0 + 200_000), true);
  const r = await v.resumo();
  assert.deepEqual(r.map((x) => x.codigo), ['zz99yy8', 'ab12cd3'], 'mais recente primeiro');
  const a = r.find((x) => x.codigo === 'ab12cd3')!;
  assert.equal(a.aberturas, 2);
  assert.equal(a.aberturasRobo, 1);
  assert.equal(a.primeiraAbertura, '2026-11-16T10:00:00.000Z');
  assert.equal(a.ultimaAbertura, '2026-11-16T10:02:00.000Z');
});

test('Link da landing: robô sozinho aparece com 0 aberturas e sem datas', async () => {
  const v = new VisitasLp(null);
  await v.registrar('so0robo1', true);
  assert.deepEqual(await v.resumo(), [{ codigo: 'so0robo1', primeiraAbertura: null, ultimaAbertura: null, aberturas: 0, aberturasRobo: 1 }]);
});

test('Link da landing: grava no armazenamento e recarrega depois de reiniciar', async () => {
  const guardado: VisitaLp[] = [];
  const store: VisitasStore = { carregar: async () => guardado.slice(), gravar: async (x) => { guardado.push(x); }, limpar: async () => { guardado.length = 0; } };
  await new VisitasLp(store).registrar('ab12cd3', false);
  assert.equal(guardado.length, 1);
  assert.deepEqual(Object.keys(guardado[0]).sort(), ['bot', 'codigo', 't'], 'só código, horário e robô: nada de IP nem aparelho');
  const depois = new VisitasLp(store);
  assert.equal((await depois.resumo())[0].aberturas, 1);
  await depois.limpar();
  assert.equal((await depois.resumo()).length, 0);
});
