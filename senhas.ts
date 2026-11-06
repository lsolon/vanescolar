/**
 * SENHAS: scrypt com salt aleatório por usuário, formato "s1$<salt>$<hash>".
 * Hashes antigos (salt fixo, sem "$") ainda são aceitos e migrados no próximo login.
 */
import crypto from 'crypto';

const LEGACY_SALT = 'salt-van-escolar';

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  return `s1$${salt}$${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password: unknown, stored: string): boolean {
  if (typeof password !== 'string' || !password || !stored) return false;
  if (stored.startsWith('s1$')) {
    const [, salt, hash] = stored.split('$');
    return !!salt && !!hash && safeEqual(hash, crypto.scryptSync(password, salt, 64).toString('hex'));
  }
  return safeEqual(stored, crypto.scryptSync(password, LEGACY_SALT, 64).toString('hex'));
}

/** Se o hash ainda é do formato antigo, regrava no formato novo (chamar após senha correta). */
export function upgradePasswordHash(user: { passwordHash: string }, password: string) {
  if (user.passwordHash && !user.passwordHash.startsWith('s1$')) user.passwordHash = hashPassword(password);
}
