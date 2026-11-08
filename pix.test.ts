import test from 'node:test';
import assert from 'node:assert/strict';
import * as PIX from './pix';

/** Lê um BR Code como lista de campos (id, valor) para conferir a estrutura. */
function ler(payload: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < payload.length) {
    const id = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    out[id] = payload.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  return out;
}

test('CRC16: vetor de referência do padrão CCITT-FALSE', () => {
  assert.equal(PIX.crc16('123456789'), '29B1');
});

test('chave CPF e CNPJ: aceita com máscara, recusa dígito verificador errado e sequências repetidas', () => {
  assert.equal(PIX.normalizarChavePix('CPF', '529.982.247-25'), '52998224725');
  assert.equal(PIX.normalizarChavePix('CPF', '529.982.247-24'), null);
  assert.equal(PIX.normalizarChavePix('CPF', '111.111.111-11'), null);
  assert.equal(PIX.normalizarChavePix('CNPJ', '11.222.333/0001-81'), '11222333000181');
  assert.equal(PIX.normalizarChavePix('CNPJ', '11.222.333/0001-82'), null);
});

test('chave celular: normaliza para +55, aceita 10 e 11 dígitos e recusa DDD ou formato inválido', () => {
  assert.equal(PIX.normalizarChavePix('CELULAR', '(21) 97268-2614'), '+5521972682614');
  assert.equal(PIX.normalizarChavePix('CELULAR', '+55 21 97268-2614'), '+5521972682614');
  assert.equal(PIX.normalizarChavePix('CELULAR', '2133334444'), '+552133334444');
  assert.equal(PIX.normalizarChavePix('CELULAR', '(21) 87268-2614'), null, '11 dígitos precisam começar com 9 depois do DDD');
  assert.equal(PIX.normalizarChavePix('CELULAR', '(05) 97268-2614'), null);
  assert.equal(PIX.normalizarChavePix('CELULAR', '12345'), null);
});

test('chave e-mail e aleatória', () => {
  assert.equal(PIX.normalizarChavePix('EMAIL', '  Fulano+Pix@Exemplo.com '), 'fulano+pix@exemplo.com');
  assert.equal(PIX.normalizarChavePix('EMAIL', 'sem-arroba'), null);
  assert.equal(PIX.normalizarChavePix('ALEATORIA', '123E4567-E89B-12D3-A456-426614174000'), '123e4567-e89b-12d3-a456-426614174000');
  assert.equal(PIX.normalizarChavePix('ALEATORIA', 'não-é-uuid'), null);
});

test('chave: tipo desconhecido, entrada que não é texto e texto enorme são recusados', () => {
  assert.equal(PIX.normalizarChavePix('FOGUETE', 'a@b.com'), null);
  assert.equal(PIX.normalizarChavePix('EMAIL', 123 as any), null);
  assert.equal(PIX.normalizarChavePix('EMAIL', 'a'.repeat(200) + '@b.com'), null);
  assert.equal(PIX.normalizarChavePix('__proto__', 'x'), null);
});

test('textoPix: tira acento e símbolos, usa maiúsculas e corta no limite', () => {
  assert.equal(PIX.textoPix('José da Conceição-Ávila', 25), 'JOSE DA CONCEICAO AVILA');
  assert.equal(PIX.textoPix('São Gonçalo do Amarante', 15), 'SAO GONCALO DO');
  assert.equal(PIX.textoPix(undefined, 10), '');
});

test('lerConfigPix: valida tudo e devolve a configuração normalizada', () => {
  const ok = PIX.lerConfigPix({ tipo: 'CELULAR', chave: '(21) 97268-2614', nome: 'Solon Transporte', cidade: 'Rio de Janeiro' });
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual(ok.config, { tipo: 'CELULAR', chave: '+5521972682614', nome: 'SOLON TRANSPORTE', cidade: 'RIO DE JANEIRO' });
  assert.equal(PIX.lerConfigPix({ tipo: 'CPF', chave: '123', nome: 'Fulano', cidade: 'Rio' }).ok, false);
  assert.equal(PIX.lerConfigPix({ tipo: 'EMAIL', chave: 'a@b.com', nome: '', cidade: 'Rio' }).ok, false);
  assert.equal(PIX.lerConfigPix({ tipo: 'EMAIL', chave: 'a@b.com', nome: 'Fulano', cidade: '' }).ok, false);
  assert.equal(PIX.lerConfigPix({}).ok, false);
});

test('copia e cola: estrutura, valor, identificador e CRC conferem', () => {
  const config: PIX.ConfigPix = { tipo: 'EMAIL', chave: 'motorista@exemplo.com', nome: 'SOLON TRANSPORTE', cidade: 'RIO DE JANEIRO' };
  const code = PIX.gerarCopiaECola({ config, valor: 350, txid: PIX.txidMensalidade(12, '2026-11') });
  const campos = ler(code);
  assert.equal(campos['00'], '01');
  assert.equal(campos['52'], '0000');
  assert.equal(campos['53'], '986');
  assert.equal(campos['54'], '350.00');
  assert.equal(campos['58'], 'BR');
  assert.equal(campos['59'], 'SOLON TRANSPORTE');
  assert.equal(campos['60'], 'RIO DE JANEIRO');
  assert.deepEqual(ler(campos['26']), { '00': 'br.gov.bcb.pix', '01': 'motorista@exemplo.com' });
  assert.equal(ler(campos['62'])['05'], 'VAN12M202611');
  assert.equal(code.slice(-8, -4), '6304');
  assert.equal(code.slice(-4), PIX.crc16(code.slice(0, -4)), 'o CRC cobre tudo antes dele');
});

test('copia e cola: sem valor e sem identificador usa "***"; valor inválido é recusado', () => {
  const config: PIX.ConfigPix = { tipo: 'CPF', chave: '52998224725', nome: 'Fulano', cidade: 'Rio' };
  const campos = ler(PIX.gerarCopiaECola({ config }));
  assert.equal('54' in campos, false);
  assert.equal(ler(campos['62'])['05'], '***');
  assert.throws(() => PIX.gerarCopiaECola({ config, valor: 0 }), /inválido/i);
  assert.throws(() => PIX.gerarCopiaECola({ config, valor: -5 }), /inválido/i);
  assert.throws(() => PIX.gerarCopiaECola({ config, valor: NaN }), /inválido/i);
  // identificador fora do padrão cai no "***" em vez de gerar código quebrado
  assert.equal(ler(ler(PIX.gerarCopiaECola({ config, txid: 'com espaço!' }))['62'])['05'], '***');
});

test('txid da mensalidade: só letras e números, até 25 caracteres', () => {
  const t = PIX.txidMensalidade(123456789, '2026-11');
  assert.match(t, /^[A-Za-z0-9]{1,25}$/);
  assert.equal(t, 'VAN123456789M202611');
});
