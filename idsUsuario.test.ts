import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proximoIdUsuario, idsDuplicados, ID_MINIMO_USUARIO } from './idsUsuario';
import { paraRegistros } from './persistence';

type U = { id: number; email: string };

/** Simula o servidor: cria contas, remove uma e cria outra, várias vezes, e confere que nenhum id se repete. */
test('Ids de usuário: remover uma conta e criar outra não repete id (bug da ficha recusada)', () => {
  const users: U[] = [];
  const paradas: any[] = [];
  let marca = 0;
  const criar = (email: string) => { const id = proximoIdUsuario(users, paradas, marca); marca = id; users.push({ id, email }); return id; };

  const a = criar('a@x.com'); const b = criar('b@x.com'); const c = criar('c@x.com');
  assert.deepEqual([a, b, c], [201, 202, 203]);
  // Conta do meio é removida (recusa de pedido da ficha). Com a regra antiga, a próxima ganharia 203 de novo.
  users.splice(users.findIndex((u) => u.id === b), 1);
  const d = criar('d@x.com');
  assert.ok(![a, c].includes(d), 'não pode repetir id de conta existente');
  assert.equal(idsDuplicados(users).length, 0);
  // Remove a conta de MAIOR id: sem a marca d'água o id seria reutilizado.
  users.splice(users.findIndex((u) => u.id === d), 1);
  const e = criar('e@x.com');
  assert.ok(e > d, 'id apagado não volta');
});

test('Ids de usuário: id ainda referenciado por um aluno nunca é reutilizado, mesmo sem a conta e sem marca d\'água', () => {
  const users: U[] = [{ id: 201, email: 'a@x.com' }];
  const paradas = [{ vinculado_usuario_id: 205 }, { usuario_pre_id: 207 }, { id_motorista: 3 }];
  assert.equal(proximoIdUsuario(users, paradas, 0), 208);
});

test('Ids de usuário: nunca abaixo do piso e tolera marca d\'água inválida', () => {
  assert.equal(proximoIdUsuario([], [], 0), ID_MINIMO_USUARIO + 1);
  assert.equal(proximoIdUsuario([], [], NaN), ID_MINIMO_USUARIO + 1);
  assert.equal(proximoIdUsuario([{ id: 1 }, { id: 2 }], [], 0), ID_MINIMO_USUARIO + 1);
});

test('Ids de usuário: muitas criações e remoções aleatórias nunca geram colisão no banco (chave u-<id>)', () => {
  const users: U[] = [];
  let marca = 0;
  let semente = 12345;
  const rnd = () => { semente = (semente * 1103515245 + 12345) & 0x7fffffff; return semente / 0x7fffffff; };
  for (let i = 0; i < 2000; i++) {
    if (users.length > 0 && rnd() < 0.45) users.splice(Math.floor(rnd() * users.length), 1);
    else { const id = proximoIdUsuario(users, [], marca); marca = id; users.push({ id, email: `u${i}@x.com` }); }
    assert.equal(idsDuplicados(users).length, 0);
  }
  // Cada usuário tem o seu registro: nenhum sobrescreve outro no armazenamento.
  assert.equal(Object.keys(paraRegistros('users', users)).length, users.length);
});

test('Ids de usuário: idsDuplicados acusa ids repetidos', () => {
  assert.deepEqual(idsDuplicados([{ id: 1 }, { id: 2 }, { id: 2 }, { id: 3 }, { id: 3 }, { id: 3 }]).sort(), [2, 3]);
  assert.deepEqual(idsDuplicados([]), []);
});
