import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularRotaPorRuas, geocodificarEndereco, horariosDaRota, PARADA_EMBARQUE_MIN } from './rotaRuas';

const escola = { latitude: -22.85, longitude: -43.20 };
const A = { latitude: -22.95, longitude: -43.20 }, B = { latitude: -22.90, longitude: -43.20 }, C = { latitude: -22.93, longitude: -43.00 };

test('ida: a ordem vem do OSRM, um trecho por aluno, o último vai à escola', async () => {
  // entrada: A, B, C, escola. A viagem devolvida: C → A → B → escola
  const f = async () => ({ ok: true, json: async () => ({
    code: 'Ok',
    waypoints: [{ waypoint_index: 1 }, { waypoint_index: 2 }, { waypoint_index: 0 }, { waypoint_index: 3 }],
    trips: [{ legs: [{ duration: 1500, distance: 20000 }, { duration: 300, distance: 5000 }, { duration: 600, distance: 9000 }] }]
  }) });
  const r = await calcularRotaPorRuas([A, B, C], escola, 'IDA', f as any);
  assert.ok(r);
  assert.deepEqual(r!.ordem, [2, 0, 1]);
  assert.deepEqual(r!.trechosMin, [25, 5, 10]);
  assert.ok(r!.fatorRuas >= 1.1 && r!.fatorRuas <= 3);
});

test('horários da ida somam os trechos de trás para frente a partir da chegada na escola', () => {
  // chega 07:15 (435). Trechos: C→A 25, A→B 5, B→escola 10; 1 min parado em cada aluno.
  const hs = horariosDaRota('IDA', [25, 5, 10], 435, 0);
  assert.equal(hs[2], 435 - 10 - PARADA_EMBARQUE_MIN);        // B
  assert.equal(hs[1], hs[2] - 5 - PARADA_EMBARQUE_MIN);       // A
  assert.equal(hs[0], hs[1] - 25 - PARADA_EMBARQUE_MIN);      // C
  assert.ok(hs[0] < hs[1] && hs[1] < hs[2]);
});

test('horários da volta somam os trechos a partir da saída da escola', () => {
  const hs = horariosDaRota('VOLTA', [8, 12, 30], 0, 720);
  assert.equal(hs[0], 728);
  assert.equal(hs[1], 728 + PARADA_EMBARQUE_MIN + 12);
  assert.equal(hs[2], hs[1] + PARADA_EMBARQUE_MIN + 30);
});

test('serviço fora do ar ou resposta inválida devolve null (nada é alterado)', async () => {
  assert.equal(await calcularRotaPorRuas([A], escola, 'IDA', (async () => ({ ok: false, json: async () => ({}) })) as any), null);
  assert.equal(await calcularRotaPorRuas([A], escola, 'IDA', (async () => { throw new Error('rede'); }) as any), null);
});

test('geocodificação: acha o ponto, recusa resultado longe da escola e não falha sem rede', async () => {
  const ok = (async () => ({ ok: true, json: async () => ([{ lat: '-22.93', lon: '-43.30' }]) })) as any;
  assert.deepEqual(await geocodificarEndereco('Rua Tirol, 890', escola, ok), { latitude: -22.93, longitude: -43.3 });
  const longe = (async () => ({ ok: true, json: async () => ([{ lat: '-3.1', lon: '-60.0' }]) })) as any;
  assert.equal(await geocodificarEndereco('Rua Tirol, 890', escola, longe), null);
  assert.equal(await geocodificarEndereco('Rua Tirol, 890', escola, (async () => { throw new Error('x'); }) as any), null);
});
