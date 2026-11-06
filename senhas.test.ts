import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { hashPassword, verifyPassword, upgradePasswordHash } from './senhas';

const legado = (p: string) => crypto.scryptSync(p, 'salt-van-escolar', 64).toString('hex');

test('Senhas: cada hash tem salt próprio e a senha certa confere', () => {
  const a = hashPassword('senhaSegura123!');
  const b = hashPassword('senhaSegura123!');
  assert.match(a, /^s1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.notEqual(a, b, 'mesmo texto, salts diferentes');
  assert.equal(verifyPassword('senhaSegura123!', a), true);
  assert.equal(verifyPassword('outraSenha', a), false);
});

test('Senhas: entradas inválidas nunca conferem', () => {
  const h = hashPassword('abc12345678');
  assert.equal(verifyPassword('', h), false);
  assert.equal(verifyPassword(undefined, h), false);
  assert.equal(verifyPassword(123456, h), false);
  assert.equal(verifyPassword('abc12345678', ''), false);
  assert.equal(verifyPassword('abc12345678', 's1$$'), false);
});

test('Senhas: hash antigo (salt fixo) ainda entra e é migrado para o formato novo', () => {
  const user = { passwordHash: legado('senhaAntiga123') };
  assert.equal(verifyPassword('senhaErrada', user.passwordHash), false);
  assert.equal(verifyPassword('senhaAntiga123', user.passwordHash), true);
  upgradePasswordHash(user, 'senhaAntiga123');
  assert.ok(user.passwordHash.startsWith('s1$'));
  assert.equal(verifyPassword('senhaAntiga123', user.passwordHash), true);
  const antes = user.passwordHash;
  upgradePasswordHash(user, 'senhaAntiga123');
  assert.equal(user.passwordHash, antes, 'hash novo não é regravado');
});

test('Senhas: conta sem senha (login só por Google) nunca confere', () => {
  const user = { passwordHash: '' };
  assert.equal(verifyPassword('qualquer', user.passwordHash), false);
  upgradePasswordHash(user, 'qualquer');
  assert.equal(user.passwordHash, '');
});
