import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Persistence, FileStore, FirestoreStore, chooseStoreKind, paraRegistros, dosRegistros, DocName } from './persistence';

// "Firestore" falso em memória, só para testar a lógica sem rede. Conta leituras e escritas.
function fakeFirestore() {
  const data = new Map<string, any>();
  const log = { writes: [] as string[], deletes: [] as string[], listagens: 0 };
  const db = {
    collection: (c: string) => ({
      doc: (id: string) => ({
        get: async () => ({ exists: data.has(`${c}/${id}`), data: () => data.get(`${c}/${id}`) }),
        set: async (v: any) => { log.writes.push(`${c}/${id}`); data.set(`${c}/${id}`, v); },
        delete: async () => { log.deletes.push(`${c}/${id}`); data.delete(`${c}/${id}`); }
      }),
      get: async () => {
        log.listagens++;
        const docs = [...data.entries()].filter(([k]) => k.startsWith(`${c}/`)).map(([k, v]) => ({ id: k.slice(c.length + 1), data: () => v }));
        return { docs };
      }
    })
  };
  return { db, data, log };
}

const snap = (n = 1): Record<DocName, any> => ({
  users: [{ id: 1, email: 'a@a.com', n }, { id: 2, email: 'b@b.com', n }],
  invitations: [{ code: 'ABC', createdAt: '2026-01-01', used: false }],
  state: {
    paradas: [{ id: 2, nome: 'B' }, { id: 1, nome: 'A' }],
    trips: { '1': { viagem: { id: 1001 }, mensagens: [] }, '2': { viagem: { id: 1002 }, mensagens: [{ texto: 'oi' }] } }
  },
  settings: { adminEmails: ['x@x.com'] },
  mensalidades: {
    configs: { '1:201': { valor: 300, vencimento_dia: 5 } },
    pagamentos: [{ id_motorista: 1, id_aluno: 201, mes: '2026-11', valor: 300, forma: 'PIX', pago_em: '2026-11-05', registrado_em: 'x' }]
  }
});

test('registros: ida e volta preservam o conteúdo de cada assunto', () => {
  const s = snap();
  for (const name of Object.keys(s) as DocName[]) {
    const volta = dosRegistros(name, paraRegistros(name, s[name]));
    if (name === 'state') {
      assert.deepEqual(volta.paradas.map((p: any) => p.id), [1, 2], 'paradas voltam ordenadas por id');
      assert.deepEqual(volta.trips, s.state.trips);
    } else {
      assert.deepEqual(volta, s[name]);
    }
  }
});

test('FirestoreStore: salva por registro e recarrega tudo', async () => {
  const { db, data } = fakeFirestore();
  const p1 = new Persistence(new FirestoreStore(db), 10);
  p1.attach(() => snap(1) as any);
  await p1.flush();
  assert.ok(data.has('vanescolar_users/u-1') && data.has('vanescolar_users/u-2'), 'um documento por usuário');
  assert.ok(data.has('vanescolar_users/__meta'));
  assert.ok(data.has('vanescolar_state/parada-1') && data.has('vanescolar_state/trip-2'));

  const p2 = new Persistence(new FirestoreStore(db), 10);
  const loaded = await p2.load();
  assert.deepEqual(loaded.users, snap(1).users);
  assert.deepEqual(loaded.settings, { adminEmails: ['x@x.com'] });
  assert.deepEqual(loaded.mensalidades, snap().mensalidades);
  assert.equal(loaded.state.paradas.length, 2);
});

test('Persistence: só regrava o registro que mudou (mais a revisão)', async () => {
  const { db, log } = fakeFirestore();
  let s = snap(1);
  const p = new Persistence(new FirestoreStore(db), 10);
  p.attach(() => s as any);
  await p.flush();
  log.writes.length = 0;
  await p.flush();
  assert.equal(log.writes.length, 0, 'sem mudança, sem escrita');
  s = { ...s, users: [{ ...s.users[0], n: 2 }, s.users[1]] };
  await p.flush();
  assert.deepEqual(log.writes.sort(), ['vanescolar_users/__meta', 'vanescolar_users/u-1']);
});

test('Persistence: registro removido do estado é apagado do armazenamento', async () => {
  const { db, data, log } = fakeFirestore();
  let s = snap(1);
  const p = new Persistence(new FirestoreStore(db), 10);
  p.attach(() => s as any);
  await p.flush();
  s = { ...s, state: { ...s.state, paradas: [{ id: 1, nome: 'A' }] } };
  await p.flush();
  assert.deepEqual(log.deletes, ['vanescolar_state/parada-2']);
  assert.equal(data.has('vanescolar_state/parada-2'), false);
});

test('Persistence: scheduleSave agrupa várias mudanças em uma gravação', async () => {
  const { db, log } = fakeFirestore();
  const p = new Persistence(new FirestoreStore(db), 20);
  p.attach(() => snap(1) as any);
  p.scheduleSave(); p.scheduleSave(); p.scheduleSave();
  await new Promise((r) => setTimeout(r, 150));
  const antes = log.writes.length;
  assert.ok(antes > 0);
  await p.flush();
  assert.equal(log.writes.length, antes, 'nada novo para gravar');
});

test('Migração: lê o formato antigo (um documento grande por assunto), grava no novo e não apaga o antigo', async () => {
  const { db, data } = fakeFirestore();
  const antigo = snap(9);
  for (const name of Object.keys(antigo)) data.set(`vanescolar/${name}`, { json: JSON.stringify(antigo[name as DocName]) });

  const p = new Persistence(new FirestoreStore(db), 10);
  const loaded = await p.load();
  assert.equal(loaded.users[0].n, 9, 'leu do formato antigo');
  p.attach(() => antigo as any);
  await p.flush();
  assert.ok(data.has('vanescolar_users/u-1'), 'migrou para o formato novo');
  assert.ok(data.has('vanescolar/users'), 'formato antigo preservado (dá para voltar à versão anterior)');

  const p2 = new Persistence(new FirestoreStore(db), 10);
  assert.equal((await p2.load()).users[0].n, 9, 'segunda partida já lê o formato novo');
});

test('Migração: depois de inicializado, apagar tudo NÃO ressuscita os dados antigos', async () => {
  const { db, data } = fakeFirestore();
  data.set('vanescolar/users', { json: JSON.stringify([{ id: 1, email: 'velho@x.com' }]) });
  let s: any = { ...snap(1), users: [{ id: 1, email: 'velho@x.com' }] };
  const p = new Persistence(new FirestoreStore(db), 10);
  await p.load();
  p.attach(() => s);
  await p.flush();
  s = { ...s, users: [] }; // limpeza total feita pelo admin
  await p.flush();
  const p2 = new Persistence(new FirestoreStore(db), 10);
  assert.deepEqual((await p2.load()).users, [], 'continua vazio');
});

test('Várias instâncias: reloadIfChanged só relê o que outra instância alterou', async () => {
  const { db, log } = fakeFirestore();
  let sA = snap(1);
  const a = new Persistence(new FirestoreStore(db), 10);
  a.attach(() => sA as any);
  await a.flush();
  const b = new Persistence(new FirestoreStore(db), 10);
  await b.load();

  log.listagens = 0;
  assert.deepEqual(await b.reloadIfChanged(['users', 'invitations']), {}, 'nada mudou');
  assert.equal(log.listagens, 0, 'sem mudança não lista a coleção');

  sA = { ...sA, users: [...sA.users, { id: 3, email: 'c@c.com', n: 1 }] };
  await a.flush();
  const novo = await b.reloadIfChanged(['users', 'invitations']);
  assert.equal(novo.users.length, 3, 'viu o usuário novo');
  assert.equal(novo.invitations, undefined, 'convites não mudaram');
  assert.deepEqual(await b.reloadIfChanged(['users']), {}, 'depois de reler, está em dia');
  assert.deepEqual(await a.reloadIfChanged(['users']), {}, 'quem gravou não relê o próprio dado');
});

test('Escala: nenhum registro chega perto de 1 MB mesmo com milhares de usuários e alunos', async () => {
  const { db, data } = fakeFirestore();
  const grande = snap(1);
  grande.users = Array.from({ length: 3000 }, (_, i) => ({ id: i + 1, email: `u${i}@x.com`, passwordHash: 'h'.repeat(128), fullName: 'Fulano de Tal' }));
  grande.state.paradas = Array.from({ length: 5000 }, (_, i) => ({ id: i + 1, nome_aluno: 'Aluno', endereco_real: 'Rua X, 1' }));
  const p = new Persistence(new FirestoreStore(db), 10);
  p.attach(() => grande as any);
  await p.flush();
  const maior = Math.max(...[...data.values()].map((d) => String(d.json).length));
  assert.ok(maior < 10_000, `maior registro tem ${maior} caracteres`);
  assert.equal([...data.keys()].filter((k) => k.startsWith('vanescolar_users/u-')).length, 3000);
  const p2 = new Persistence(new FirestoreStore(db), 10);
  const l = await p2.load(['users', 'state']);
  assert.equal(l.users.length, 3000);
  assert.equal(l.state.paradas.length, 5000);
});

test('FileStore: sobrevive a "reinício", migra arquivos antigos e escolhe armazenamento pelo ambiente', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vanpersist-'));
  const p1 = new Persistence(new FileStore(dir), 10);
  p1.attach(() => snap(7) as any);
  await p1.flush();
  const p2 = new Persistence(new FileStore(dir), 10);
  assert.equal((await p2.load()).users[0].n, 7);

  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'vanpersist-'));
  fs.writeFileSync(path.join(dir2, 'users.json'), JSON.stringify([{ id: 5, email: 'legado@x.com' }]));
  const p3 = new Persistence(new FileStore(dir2), 10);
  assert.equal((await p3.load()).users[0].email, 'legado@x.com', 'lê o arquivo do formato antigo');

  assert.equal(chooseStoreKind({} as any), 'memory');
  assert.equal(chooseStoreKind({ DATA_DIR: '/x' } as any), 'file');
  assert.equal(chooseStoreKind({ FIREBASE_SERVICE_ACCOUNT: '{}' } as any), 'firestore');
  assert.equal(chooseStoreKind({ PERSISTENCE: 'memory', DATA_DIR: '/x' } as any), 'memory');
});

test('Persistence em memória: não grava nada e não quebra', async () => {
  const p = new Persistence(null);
  p.attach(() => snap(1) as any);
  p.scheduleSave();
  await p.flush();
  assert.deepEqual(await p.load(), {});
  assert.equal(p.kind, 'memory');
});

test('Persistence.disable: para de gravar e informa o motivo (não sobrescreve dados reais)', async () => {
  const { db, log } = fakeFirestore();
  const p = new Persistence(new FirestoreStore(db), 10);
  p.attach(() => snap(1) as any);
  p.disable('falha_ao_ler_firestore');
  p.scheduleSave();
  await p.flush();
  assert.equal(log.writes.length, 0);
  assert.equal(p.kind, 'memory');
  assert.equal(p.reason, 'falha_ao_ler_firestore');
});

test('createPersistence: credencial incompleta informa o campo ausente (sem vazar valores)', async () => {
  const { createPersistence } = await import('./persistence');
  const orig = console.error; console.error = () => {};
  try {
    const p1 = await createPersistence({ FIREBASE_SERVICE_ACCOUNT: '{"apiKey":"abc"}' } as any);
    assert.equal(p1.kind, 'memory');
    assert.equal(p1.reason, 'credencial_campo_ausente_type');
    const p2 = await createPersistence({ FIREBASE_SERVICE_ACCOUNT: 'isto nao e json' } as any);
    assert.equal(p2.reason, 'FIREBASE_SERVICE_ACCOUNT_nao_e_json_valido');
    const p3 = await createPersistence({ FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ type: 'service_account', project_id: 'x', client_email: 'a@b.c', private_key: 'chave-quebrada' }) } as any);
    assert.equal(p3.reason, 'credencial_private_key_formato_invalido');
  } finally { console.error = orig; }
});
