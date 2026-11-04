import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Persistence, FileStore, FirestoreStore, chooseStoreKind, DocName } from './persistence';

// "Firestore" falso em memória, só para testar a lógica sem rede.
function fakeFirestore() {
  const data = new Map<string, any>();
  const writes: string[] = [];
  const db = {
    collection: (c: string) => ({
      doc: (id: string) => ({
        get: async () => ({ exists: data.has(`${c}/${id}`), data: () => data.get(`${c}/${id}`) }),
        set: async (v: any) => { writes.push(id); data.set(`${c}/${id}`, v); }
      })
    })
  };
  return { db, data, writes };
}

const snap = (n: number) => ({
  users: [{ id: 1, email: 'a@a.com', n }],
  invitations: [],
  state: { paradas: [{ id: 1 }], mensagens: [] },
  settings: { adminEmails: ['x@x.com'] }
});

test('FirestoreStore: salva e recarrega todos os documentos', async () => {
  const { db, writes } = fakeFirestore();
  const p1 = new Persistence(new FirestoreStore(db), 10);
  p1.attach(() => snap(1) as any);
  await p1.flush();
  assert.equal(writes.length, 4);

  const p2 = new Persistence(new FirestoreStore(db), 10);
  const loaded = await p2.load();
  assert.deepEqual(loaded.users, [{ id: 1, email: 'a@a.com', n: 1 }]);
  assert.deepEqual(loaded.settings, { adminEmails: ['x@x.com'] });
});

test('Persistence: só regrava documentos que mudaram', async () => {
  const { db, writes } = fakeFirestore();
  let n = 1;
  const p = new Persistence(new FirestoreStore(db), 10);
  p.attach(() => snap(n) as any);
  await p.flush();
  writes.length = 0;
  await p.flush();
  assert.equal(writes.length, 0, 'sem mudança, sem escrita');
  n = 2;
  await p.flush();
  assert.deepEqual(writes, ['users'], 'só o documento alterado');
});

test('Persistence: scheduleSave agrupa várias mudanças em uma gravação', async () => {
  const { db, writes } = fakeFirestore();
  const p = new Persistence(new FirestoreStore(db), 20);
  p.attach(() => snap(1) as any);
  p.scheduleSave(); p.scheduleSave(); p.scheduleSave();
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(writes.length, 4);
});

test('FileStore: sobrevive a "reinício" e escolhe armazenamento pelo ambiente', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vanpersist-'));
  const p1 = new Persistence(new FileStore(dir), 10);
  p1.attach(() => snap(7) as any);
  await p1.flush();
  const p2 = new Persistence(new FileStore(dir), 10);
  assert.equal((await p2.load()).users[0].n, 7);

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
  const { db, writes } = fakeFirestore();
  const p = new Persistence(new FirestoreStore(db), 10);
  p.attach(() => snap(1) as any);
  p.disable('falha_ao_ler_firestore');
  p.scheduleSave();
  await p.flush();
  assert.equal(writes.length, 0);
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
