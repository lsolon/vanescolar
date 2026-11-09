import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from './historico';

const T0 = new Date('2026-11-09T10:00:00Z'); // 07:00 em Brasília
const min = (m: number) => new Date(T0.getTime() + m * 60000);

test('trecho: soma km entre posições e ignora salto de GPS', () => {
  const t = H.novoTrecho('IDA', T0);
  H.somarPosicao(t, { latitude: -22.9, longitude: -43.2 });
  H.somarPosicao(t, { latitude: -22.91, longitude: -43.2 }); // ~1,1 km
  H.somarPosicao(t, { latitude: -22.5, longitude: -43.2 });  // salto de ~45 km: ignorado
  assert.ok(t.km > 1.0 && t.km < 1.2, `km=${t.km}`);
});

test('fechar: monta o registro só com nome abreviado, resultado e horas; sem endereço, telefone nem coordenadas', () => {
  const t = H.novoTrecho('IDA', T0);
  H.somarPosicao(t, { latitude: -22.9, longitude: -43.2 });
  H.somarPosicao(t, { latitude: -22.905, longitude: -43.2 });
  H.registrarStatus(t, 1, 'EMBARCOU', min(5));
  H.registrarStatus(t, 1, 'ENTREGUE', min(20));
  H.registrarStatus(t, 2, 'EMBARCOU', min(8));
  H.registrarStatus(t, 2, 'PENDENTE', min(9)); // marcou sem querer e desfez
  const paradas: any[] = [
    { id: 1, nome_aluno: 'Ana Maria Souza', nome_sanitizado: 'Ana M.', status_embarque: 'ENTREGUE', escola_destino: 'Escola X', endereco_real: 'Rua Secreta, 9', telefone: '21999990000', latitude: -22.9, longitude: -43.2 },
    { id: 2, nome_aluno: 'Bia Lima', status_embarque: 'PENDENTE', escola_destino: 'Escola X' },
    { id: 3, nome_aluno: 'Caio', nome_sanitizado: 'Caio .', status_embarque: 'AUSENTE', escola_destino: 'Escola X' },
  ];
  const h = H.fecharTrecho(t, paradas, min(25), true);
  assert.equal(h.data, '2026-11-09');
  assert.equal(h.duracao_min, 25);
  assert.equal(h.escola, 'Escola X');
  assert.deepEqual(h.totais, { previstos: 3, entregues: 1, ausentes: 1, nao_atendidos: 1 });
  assert.deepEqual(h.alunos[0], { nome: 'Ana M.', resultado: 'ENTREGUE', embarcou_em: '07:05', entregue_em: '07:20' });
  assert.equal(h.alunos[1].nome, 'Bia L.');
  assert.equal(h.alunos[1].embarcou_em, null, 'desfazer limpa a hora');
  const texto = JSON.stringify(H.paraRelatorio(h));
  for (const proibido of ['Secreta', '21999990000', 'latitude', 'longitude', 'ultima_pos', 'Souza']) assert.ok(!texto.includes(proibido), `vazou: ${proibido}`);
});

test('km fica nulo sem GPS', () => {
  const t = H.novoTrecho('VOLTA', T0);
  assert.equal(H.fecharTrecho(t, [], min(10), false).km, null);
});

test('acrescentar: mais novo primeiro, apaga o que passou de 180 dias e respeita o limite', () => {
  const mk = (dias: number): H.TrechoHistorico => ({ ...H.fecharTrecho(H.novoTrecho('IDA', new Date(T0.getTime() - dias * 86400000)), [], new Date(T0.getTime() - dias * 86400000 + 600000), false) });
  let lista: H.TrechoHistorico[] = [mk(200), mk(10)];
  lista = H.acrescentar(lista, mk(0), T0);
  assert.equal(lista.length, 2, 'o de 200 dias saiu');
  assert.ok(lista[0].encerrado_em > lista[1].encerrado_em);
  let muitos: H.TrechoHistorico[] = [];
  for (let i = 0; i < H.MAX_TRECHOS + 20; i++) muitos = H.acrescentar(muitos, mk(0), T0);
  assert.equal(muitos.length, H.MAX_TRECHOS);
});
