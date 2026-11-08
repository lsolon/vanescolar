/**
 * ============================================================================
 * PIX DIRETO (pix.ts)
 * ----------------------------------------------------------------------------
 * Lógica pura (sem servidor) do módulo "Pagamento por Pix": valida a chave Pix do
 * motorista e monta o código "Pix copia e cola" (BR Code estático, padrão do Banco
 * Central) que o app mostra como QR Code para o responsável.
 *
 * O dinheiro vai direto do responsável para a conta do motorista. O app NÃO recebe
 * aviso do banco: quem confirma que o dinheiro entrou é o motorista (baixa manual).
 * ============================================================================
 */

export type TipoChavePix = 'CPF' | 'CNPJ' | 'CELULAR' | 'EMAIL' | 'ALEATORIA';
export const TIPOS_CHAVE: readonly TipoChavePix[] = ['CPF', 'CNPJ', 'CELULAR', 'EMAIL', 'ALEATORIA'];
export const tipoChaveValido = (t: unknown): t is TipoChavePix => typeof t === 'string' && (TIPOS_CHAVE as readonly string[]).includes(t);

export interface ConfigPix {
  tipo: TipoChavePix;
  chave: string;   // já normalizada (ex.: CPF só com dígitos, celular com +55)
  nome: string;    // nome do recebedor no BR Code (até 25 caracteres, sem acento)
  cidade: string;  // cidade do recebedor (até 15 caracteres, sem acento)
}

const soDigitos = (s: string) => s.replace(/\D/g, '');

function cpfValido(d: string): boolean {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  for (const n of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const dv = ((soma * 10) % 11) % 10;
    if (dv !== Number(d[n])) return false;
  }
  return true;
}

function cnpjValido(d: string): boolean {
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((acc, p, i) => acc + p * Number(d[i]), 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

/** Valida e normaliza a chave conforme o tipo escolhido. Devolve null se inválida. */
export function normalizarChavePix(tipo: unknown, entrada: unknown): string | null {
  if (!tipoChaveValido(tipo) || typeof entrada !== 'string') return null;
  const txt = entrada.trim();
  if (!txt || txt.length > 100) return null;
  switch (tipo) {
    case 'CPF': { const d = soDigitos(txt); return cpfValido(d) ? d : null; }
    case 'CNPJ': { const d = soDigitos(txt); return cnpjValido(d) ? d : null; }
    case 'CELULAR': {
      let d = soDigitos(txt);
      if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
      if (d.length !== 10 && d.length !== 11) return null;
      if (Number(d.slice(0, 2)) < 11) return null;
      if (d.length === 11 && d[2] !== '9') return null;
      return `+55${d}`;
    }
    case 'EMAIL': {
      const e = txt.toLowerCase();
      return e.length <= 77 && /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(e) ? e : null;
    }
    case 'ALEATORIA': {
      const u = txt.toLowerCase();
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(u) ? u : null;
    }
  }
}

/** Texto aceito no BR Code: sem acento, só letras, números e espaço, em maiúsculas, no máximo `max` caracteres. */
export function textoPix(s: unknown, max: number): string {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, max)
    .trim();
}

/** Valida os campos do recebedor. Devolve a configuração pronta ou a mensagem de erro. */
export function lerConfigPix(b: { tipo?: unknown; chave?: unknown; nome?: unknown; cidade?: unknown }): { ok: true; config: ConfigPix } | { ok: false; erro: string } {
  if (!tipoChaveValido(b.tipo)) return { ok: false, erro: 'Escolha o tipo da chave Pix.' };
  const chave = normalizarChavePix(b.tipo, b.chave);
  if (!chave) return { ok: false, erro: 'A chave Pix não confere com o tipo escolhido. Confira e tente de novo.' };
  const nome = textoPix(b.nome, 25);
  if (nome.length < 2) return { ok: false, erro: 'Informe o nome que aparece para quem paga (até 25 letras).' };
  const cidade = textoPix(b.cidade, 15);
  if (cidade.length < 2) return { ok: false, erro: 'Informe a cidade (até 15 letras).' };
  return { ok: true, config: { tipo: b.tipo, chave, nome, cidade } };
}

/** CRC16/CCITT-FALSE (polinômio 0x1021, início 0xFFFF), em 4 dígitos hexadecimais maiúsculos. */
export function crc16(texto: string): string {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

const campo = (id: string, valor: string) => `${id}${String(valor.length).padStart(2, '0')}${valor}`;

/** Identificador da cobrança (só letras e números, até 25): ajuda o motorista a achar o Pix no extrato. */
export const txidMensalidade = (aluno: number, mes: string) => `VAN${aluno}M${mes.replace('-', '')}`.replace(/[^A-Za-z0-9]/g, '').slice(0, 25);

export interface DadosCopiaECola { config: ConfigPix; valor?: number; txid?: string }

/** Monta o "Pix copia e cola" (BR Code estático). Com `valor`, o app do banco já abre com o valor preenchido. */
export function gerarCopiaECola({ config, valor, txid }: DadosCopiaECola): string {
  const conta = campo('00', 'br.gov.bcb.pix') + campo('01', config.chave);
  let p = campo('00', '01') + campo('01', '11') + campo('26', conta) + campo('52', '0000') + campo('53', '986');
  if (valor !== undefined) {
    if (!Number.isFinite(valor) || valor <= 0 || valor > 9999999999.99) throw new Error('Valor inválido para o Pix.');
    p += campo('54', valor.toFixed(2));
  }
  p += campo('58', 'BR') + campo('59', textoPix(config.nome, 25) || 'RECEBEDOR') + campo('60', textoPix(config.cidade, 15) || 'BRASIL');
  p += campo('62', campo('05', txid && /^[A-Za-z0-9]{1,25}$/.test(txid) ? txid : '***'));
  p += '6304';
  return p + crc16(p);
}
