import test from 'node:test';
import assert from 'node:assert/strict';
import { PASSOS_MOTORISTA, PASSOS_RESPONSAVEL } from './guiaPassos';

const ABAS = ['diario', 'mapa', 'mensagens', 'mais', 'cadastro', 'mensalidades', 'financeiro', 'ajustes'];
const textoDe = (p: { titulo: string; texto: string; itens?: string[] }) => [p.titulo, p.texto, ...(p.itens || [])].join(' ');

test('Guia: passos com id único, título, texto e abas válidas', () => {
  for (const passos of [PASSOS_MOTORISTA, PASSOS_RESPONSAVEL]) {
    assert.ok(passos.length >= 5);
    assert.equal(new Set(passos.map((p) => p.id)).size, passos.length, 'ids únicos');
    for (const p of passos) {
      assert.ok(p.titulo.trim() && p.texto.trim(), `passo ${p.id} sem texto`);
      if (p.aba) assert.ok(ABAS.includes(p.aba), `aba inválida em ${p.id}`);
    }
  }
  assert.ok(PASSOS_RESPONSAVEL.every((p) => !p.aba), 'o guia do responsável não navega em abas do motorista');
});

test('Guia: privacidade — nada promete mapa, GPS ou endereço de criança ao responsável', () => {
  for (const p of PASSOS_RESPONSAVEL) {
    const t = textoDe(p).toLowerCase();
    if (/\b(mapa|gps|coordenad|posição da van)/.test(t)) {
      assert.match(t, /\b(não|nunca|sem)\b/, `passo ${p.id} fala de mapa/GPS sem negar`);
    }
  }
  const motorista = PASSOS_MOTORISTA.map(textoDe).join(' ').toLowerCase();
  assert.match(motorista, /nunca recebe mapa/);
  assert.match(motorista, /só o motorista|só você marca/);
});
