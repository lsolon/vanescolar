import test from 'node:test';
import assert from 'node:assert/strict';
import { validarItem, validarServico, statusDoItem, kmAtualDe, listarStatus, resumoManutencao, somarMesesData, diasEntre, avisoKm, proximoIdItem, type ItemManutencao } from './manutencao';

const HOJE = '2026-11-08';
const base = (o: Partial<ItemManutencao> = {}): ItemManutencao => ({ id: 1, nome: 'Troca de óleo', intervalo_km: 10000, ultimo_km: 50000, criado_em: '2026-01-01T00:00:00Z', ...o });

test('Manutenção: datas somam meses sem estourar o fim do mês e contam dias', () => {
  assert.equal(somarMesesData('2026-01-31', 1), '2026-02-28');
  assert.equal(somarMesesData('2024-01-31', 1), '2024-02-29');
  assert.equal(somarMesesData('2026-11-08', 12), '2027-11-08');
  assert.equal(somarMesesData('2026-12-15', 2), '2027-02-15');
  assert.equal(diasEntre('2026-11-08', '2026-11-18'), 10);
  assert.equal(diasEntre('2026-11-08', '2026-11-01'), -7);
});

test('Manutenção: validar item exige nome e ao menos um intervalo, recusa lixo e data futura', () => {
  const ok = validarItem({ nome: '  Troca   de óleo ', intervalo_km: '10000', ultimo_km: 48000, ultima_data: '2026-05-01' }, HOJE);
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual(ok.dados, { nome: 'Troca de óleo', intervalo_km: 10000, ultimo_km: 48000, ultima_data: '2026-05-01' });
  assert.equal(validarItem({ nome: 'x', intervalo_km: 1000 }, HOJE).ok, false, 'nome curto');
  assert.equal(validarItem({ nome: 'Pneus' }, HOJE).ok, false, 'sem intervalo');
  assert.equal(validarItem({ nome: 'Pneus', intervalo_km: -5 }, HOJE).ok, false);
  assert.equal(validarItem({ nome: 'Pneus', intervalo_km: 'abc' }, HOJE).ok, false);
  assert.equal(validarItem({ nome: 'Pneus', intervalo_km: 10_000_000 }, HOJE).ok, false);
  assert.equal(validarItem({ nome: 'Bateria', intervalo_meses: 1.5 }, HOJE).ok, false, 'meses inteiros');
  assert.equal(validarItem({ nome: 'Bateria', intervalo_meses: 200 }, HOJE).ok, false);
  assert.equal(validarItem({ nome: 'Bateria', intervalo_meses: 36, ultima_data: '2027-01-01' }, HOJE).ok, false, 'futuro');
  assert.equal(validarItem({ nome: 'Bateria', intervalo_meses: 36, ultima_data: '31/12/2025' }, HOJE).ok, false, 'formato');
  assert.equal(validarItem({ nome: 'Pneus', intervalo_km: 10000, ultimo_km: 0 }, HOJE).ok, true, 'km zero vale (van nova)');
  const so_meses = validarItem({ nome: 'Vistoria', intervalo_meses: 12 }, HOJE);
  assert.ok(so_meses.ok);
  if (so_meses.ok) assert.equal('intervalo_km' in so_meses.dados, false);
});

test('Manutenção: marcar como feito pede o km quando há intervalo em km e usa hoje como data padrão', () => {
  const it = base();
  assert.deepEqual(validarServico({ km: 61000 }, it, HOJE), { ok: true, km: 61000, data: HOJE });
  assert.equal(validarServico({}, it, HOJE).ok, false, 'sem km');
  assert.equal(validarServico({ km: 'x' }, it, HOJE).ok, false);
  assert.equal(validarServico({ km: 61000, data: '2026-12-01' }, it, HOJE).ok, false, 'futuro');
  assert.equal(validarServico({ km: 61000, data: 'ontem' }, it, HOJE).ok, false);
  const so_data = base({ intervalo_km: undefined, intervalo_meses: 12, ultimo_km: undefined });
  assert.deepEqual(validarServico({}, so_data, HOJE), { ok: true, data: HOJE });
});

test('Manutenção: situação por km (em dia, atenção, vencido) com limite de 10% (mínimo 500 km)', () => {
  assert.equal(avisoKm(10000), 1000);
  assert.equal(avisoKm(2000), 500);
  // próximo = 60000
  assert.equal(statusDoItem(base(), 55000, HOJE).situacao, 'EM_DIA');
  const aten = statusDoItem(base(), 59000, HOJE);
  assert.equal(aten.situacao, 'ATENCAO');
  assert.equal(aten.faltam_km, 1000);
  assert.equal(aten.proximo_km, 60000);
  assert.equal(statusDoItem(base(), 58999, HOJE).situacao, 'EM_DIA');
  assert.equal(statusDoItem(base(), 60000, HOJE).situacao, 'VENCIDO', 'no km exato já venceu');
  const venc = statusDoItem(base(), 61500, HOJE);
  assert.equal(venc.situacao, 'VENCIDO');
  assert.equal(venc.faltam_km, -1500);
});

test('Manutenção: situação por data e o pior dos dois critérios vale', () => {
  const doze = base({ intervalo_km: undefined, ultimo_km: undefined, intervalo_meses: 12, ultima_data: '2025-11-30' });
  const s = statusDoItem(doze, null, HOJE);
  assert.equal(s.proxima_data, '2026-11-30');
  assert.equal(s.faltam_dias, 22);
  assert.equal(s.situacao, 'ATENCAO');
  assert.equal(statusDoItem({ ...doze, ultima_data: '2025-12-31' }, null, HOJE).situacao, 'EM_DIA');
  assert.equal(statusDoItem({ ...doze, ultima_data: '2025-11-08' }, null, HOJE).situacao, 'VENCIDO', 'vence hoje');
  // km em dia, data vencida => vencido
  const misto = base({ intervalo_meses: 6, ultima_data: '2026-01-01' });
  const m = statusDoItem(misto, 52000, HOJE);
  assert.equal(m.faltam_km, 8000);
  assert.equal(m.situacao, 'VENCIDO');
});

test('Manutenção: sem dados suficientes não inventa alerta', () => {
  assert.equal(statusDoItem(base({ ultimo_km: undefined }), 55000, HOJE).situacao, 'SEM_DADOS', 'sem km do último serviço');
  assert.equal(statusDoItem(base(), null, HOJE).situacao, 'SEM_DADOS', 'sem km atual');
  assert.equal(statusDoItem(base({ intervalo_km: undefined, intervalo_meses: 12, ultimo_km: undefined }), 55000, HOJE).situacao, 'SEM_DADOS', 'sem data do último');
});

test('Manutenção: km atual é o maior conhecido (abastecimentos e serviços) e ignora lixo', () => {
  assert.equal(kmAtualDe([], []), null);
  assert.equal(kmAtualDe([undefined, 51000, 52000], []), 52000);
  assert.equal(kmAtualDe([52000], [base({ ultimo_km: 53000 })]), 53000);
  assert.equal(kmAtualDe([NaN as any, -5, 100], []), 100);
  assert.equal(kmAtualDe([0], []), 0);
});

test('Manutenção: lista ordena vencidos, atenção, sem dados e em dia; resumo conta', () => {
  const itens = [
    base({ id: 1, nome: 'Em dia', ultimo_km: 59000 }),                      // próximo 69000, faltam 10000 => em dia
    base({ id: 2, nome: 'Vencido', ultimo_km: 40000 }),                     // próximo 50000 => vencido
    base({ id: 3, nome: 'Sem dados', ultimo_km: undefined }),
    base({ id: 4, nome: 'Atenção', ultimo_km: 50000 }),                     // próximo 60000, faltam 800 => atenção
  ];
  const l = listarStatus(itens, 59200, HOJE);
  assert.deepEqual(l.map((s) => s.nome), ['Vencido', 'Atenção', 'Sem dados', 'Em dia']);
  assert.deepEqual(resumoManutencao(l), { total: 4, vencidos: 1, atencao: 1 });
  assert.equal(proximoIdItem(itens), 5);
  assert.equal(proximoIdItem([]), 1);
});
