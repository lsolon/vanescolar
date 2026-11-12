/**
 * ============================================================================
 * MERCADO PAGO (mercadopago.ts)
 * ----------------------------------------------------------------------------
 * Cobrança recorrente do motorista por assinatura (API "preapproval"). O motorista cadastra o cartão no
 * checkout do Mercado Pago, que cobra todo mês. O app nunca vê nem guarda dados de cartão.
 *
 * Usa só `fetch` (sem biblioteca nova) e recebe o `fetch` por parâmetro, para testar sem rede.
 * O Access Token vem do servidor (Secrets do AI Studio), nunca do código nem do navegador.
 * ============================================================================
 */
import crypto from 'node:crypto';
import { lerStatusMP, type StatusMP } from './assinatura';

export const API_MP = 'https://api.mercadopago.com';
/** Só os testes mudam isto (MP_API_URL) para apontar para um Mercado Pago de mentira. Em produção fica o endereço oficial. */
const baseMP = () => String(process.env.MP_API_URL || API_MP).replace(/\/+$/, '');

export type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

export class ErroMP extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export interface AssinaturaMPResposta {
  id: string;
  status: StatusMP | null;
  externalReference: string | null;
  /** Endereço do checkout do Mercado Pago, só vem ao criar. */
  initPoint: string | null;
  valor: number | null;
}

function ler(d: any): AssinaturaMPResposta {
  const valor = Number(d?.auto_recurring?.transaction_amount);
  return {
    id: String(d?.id ?? ''),
    status: lerStatusMP(d?.status),
    externalReference: d?.external_reference != null ? String(d.external_reference) : null,
    initPoint: typeof d?.init_point === 'string' ? d.init_point : null,
    valor: Number.isFinite(valor) ? valor : null
  };
}

async function chamar(f: Fetch, token: string, metodo: string, caminho: string, corpo?: unknown): Promise<any> {
  const res = await f(`${baseMP()}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {})
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Não repassa o corpo do erro inteiro ao navegador: pode trazer dados internos. Fica só um resumo.
    const motivo = typeof d?.message === 'string' ? d.message.slice(0, 160) : '';
    // O Mercado Pago costuma explicar o motivo real em `cause` (ex.: campo inválido). Só código e descrição curta.
    const causas = Array.isArray(d?.cause)
      ? d.cause.slice(0, 3).map((c: any) => [c?.code, typeof c?.description === 'string' ? c.description.slice(0, 120) : ''].filter(Boolean).join(' ')).filter(Boolean).join('; ')
      : '';
    throw new ErroMP(`Mercado Pago recusou o pedido (${res.status})${motivo ? `: ${motivo}` : ''}${causas ? ` [${causas}]` : ''}`, res.status);
  }
  return d;
}

export interface NovaAssinatura {
  motivo: string;
  referencia: string;
  emailPagador: string;
  valor: number;
  /** Para onde o Mercado Pago devolve o motorista depois do checkout. */
  voltarPara: string;
  /** Se o teste grátis ainda não acabou, a primeira cobrança só acontece depois dele (início da cobrança no futuro). */
  diasGratis?: number;
  /** Relógio (só para testes). */
  agoraMs?: number;
  /** Endereço que recebe os avisos (webhook). */
  notificacao?: string;
}

/** Cria a assinatura pendente e devolve o endereço do checkout. Cobrança mensal em reais. */
export async function criarAssinatura(f: Fetch, token: string, n: NovaAssinatura): Promise<AssinaturaMPResposta> {
  const dias = Math.floor(Number(n.diasGratis) || 0);
  const d = await chamar(f, token, 'POST', '/preapproval', {
    reason: n.motivo,
    external_reference: n.referencia,
    payer_email: n.emailPagador,
    back_url: n.voltarPara,
    ...(n.notificacao ? { notification_url: n.notificacao } : {}),
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: n.valor,
      currency_id: 'BRL',
      // Assinatura sem plano: o teste grátis é a cobrança começar só depois dele (start_date no futuro).
      ...(dias > 0 ? { start_date: new Date((n.agoraMs ?? Date.now()) + dias * 86400000).toISOString() } : {})
    },
    status: 'pending'
  });
  const r = ler(d);
  if (!r.id || !r.initPoint) throw new ErroMP('O Mercado Pago não devolveu o endereço de pagamento.', 502);
  return r;
}

export async function buscarAssinatura(f: Fetch, token: string, id: string): Promise<AssinaturaMPResposta> {
  if (!/^[A-Za-z0-9]{8,64}$/.test(id)) throw new ErroMP('Identificador de assinatura inválido.', 400);
  return ler(await chamar(f, token, 'GET', `/preapproval/${id}`));
}

export async function cancelarAssinatura(f: Fetch, token: string, id: string): Promise<AssinaturaMPResposta> {
  if (!/^[A-Za-z0-9]{8,64}$/.test(id)) throw new ErroMP('Identificador de assinatura inválido.', 400);
  return ler(await chamar(f, token, 'PUT', `/preapproval/${id}`, { status: 'cancelled' }));
}

/** Muda o valor mensal de uma assinatura existente (subir de plano quando passa do limite de alunos). */
export async function mudarValor(f: Fetch, token: string, id: string, valor: number): Promise<AssinaturaMPResposta> {
  if (!/^[A-Za-z0-9]{8,64}$/.test(id)) throw new ErroMP('Identificador de assinatura inválido.', 400);
  return ler(await chamar(f, token, 'PUT', `/preapproval/${id}`, { auto_recurring: { transaction_amount: valor, currency_id: 'BRL' } }));
}

/**
 * Confere a assinatura digital do aviso (webhook) do Mercado Pago.
 * Modelo do cabeçalho `x-signature`: "ts=...,v1=...". Texto assinado: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 * com HMAC-SHA256 em hexadecimal e a chave secreta do painel de desenvolvedor.
 */
export function assinaturaDoAvisoValida(p: { segredo: string; xSignature?: string; xRequestId?: string; dataId?: string; agoraMs?: number; toleranciaMs?: number }): boolean {
  if (!p.segredo || !p.xSignature || !p.dataId) return false;
  let ts = '', v1 = '';
  for (const parte of p.xSignature.split(',')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    const k = parte.slice(0, i).trim(), v = parte.slice(i + 1).trim();
    if (k === 'ts') ts = v; else if (k === 'v1') v1 = v;
  }
  if (!ts || !/^[a-f0-9]{64}$/i.test(v1)) return false;
  // O Mercado Pago manda o id em minúsculas quando é alfanumérico.
  const id = /^[A-Za-z0-9]+$/.test(p.dataId) ? p.dataId.toLowerCase() : p.dataId;
  const texto = `id:${id};request-id:${p.xRequestId ?? ''};ts:${ts};`;
  const esperado = crypto.createHmac('sha256', p.segredo).update(texto).digest('hex');
  const a = Buffer.from(esperado, 'hex'), b = Buffer.from(v1.toLowerCase(), 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  // Aviso muito antigo é descartado (reenvio malicioso). O timestamp pode vir em segundos ou em milissegundos.
  if (p.toleranciaMs !== undefined) {
    const n = Number(ts);
    const tsMs = n < 1e12 ? n * 1000 : n;
    if (!Number.isFinite(tsMs) || Math.abs((p.agoraMs ?? Date.now()) - tsMs) > p.toleranciaMs) return false;
  }
  return true;
}
