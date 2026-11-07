// Testes de configuração de produção: sobem o próprio servidor (porta 3000, desligado antes) com DEMO_MODE=false.
// Rodar: node --import tsx segredos.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const PORT = 3000; // o servidor usa porta fixa 3000: não rodar junto com a suíte da API
const BASE = `http://localhost:${PORT}`;
const SECRET = 'x'.repeat(40);

function subir(env: Record<string, string>) {
  const limpo: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !/^(DEMO_MODE|SESSION_SECRET|ADMIN_PASSWORD|PORT|FIREBASE_SERVICE_ACCOUNT|DATA_DIR)$/.test(k)) limpo[k] = v;
  }
  const proc = spawn('npx', ['tsx', 'server.ts'], { env: { ...limpo, NODE_ENV: 'production', PORT: String(PORT), ...env }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let saida = '';
  proc.stdout.on('data', (d) => (saida += d));
  proc.stderr.on('data', (d) => (saida += d));
  return { proc, saida: () => saida };
}

// Mata o grupo de processos (npx + tsx + node) e espera a porta liberar.
async function parar(proc: ReturnType<typeof spawn>) {
  try { process.kill(-proc.pid!, 'SIGTERM'); } catch {}
  for (let i = 0; i < 30; i++) {
    try { await fetch(`${BASE}/api/health`); } catch { return; }
    await new Promise((x) => setTimeout(x, 300));
  }
}

async function esperarSaude(ms = 30000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return await r.json(); } catch {}
    await new Promise((x) => setTimeout(x, 300));
  }
  throw new Error('servidor não subiu');
}

async function loginAdmin(password: string) {
  const r = await fetch(`${BASE}/api/admin/auth`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'leandrosolon@gmail.com', password })
  });
  return r.status;
}

test('Produção sem SESSION_SECRET: o servidor sobe usando segredo gerado dinamicamente', async () => {
  const { proc, saida } = subir({ DEMO_MODE: 'false', NODE_ENV: 'production', ADMIN_PASSWORD: 'uma-senha-forte-123' });
  try {
    await esperarSaude();
    assert.match(saida(), /SESSION_SECRET/);
  } finally { await parar(proc); }
});

test('Produção sem ADMIN_PASSWORD: a senha pública de teste não vale', async () => {
  const { proc } = subir({ DEMO_MODE: 'false', SESSION_SECRET: SECRET });
  try {
    const saude = await esperarSaude();
    assert.equal(saude.demoMode, false);
    assert.notEqual(await loginAdmin('senha-de-teste-admin'), 200);
    assert.notEqual(await loginAdmin('123456abcd'), 200);
    assert.notEqual(await loginAdmin(''), 200);
  } finally { await parar(proc); }
});

test('Produção com ADMIN_PASSWORD igual a uma senha pública: também recusada', async () => {
  const { proc } = subir({ DEMO_MODE: 'false', SESSION_SECRET: SECRET, ADMIN_PASSWORD: 'senha-de-teste-admin' });
  try {
    await esperarSaude();
    assert.notEqual(await loginAdmin('senha-de-teste-admin'), 200);
  } finally { await parar(proc); }
});

test('Produção com ADMIN_PASSWORD própria: só ela funciona', async () => {
  const { proc } = subir({ DEMO_MODE: 'false', SESSION_SECRET: SECRET, ADMIN_PASSWORD: 'uma-senha-forte-123' });
  try {
    await esperarSaude();
    assert.equal(await loginAdmin('uma-senha-forte-123'), 200);
    assert.notEqual(await loginAdmin('senha-de-teste-admin'), 200);
  } finally { await parar(proc); }
});
