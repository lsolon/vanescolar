/**
 * Envio de e-mails (Gmail SMTP com senha de app) e tokens de uso único.
 * Variáveis: GMAIL_USER, GMAIL_APP_PASSWORD, APP_URL (ex.: https://vanescolar.ai.studio).
 */
import nodemailer from 'nodemailer';
import crypto from 'crypto';

export interface MailMessage { to: string; subject: string; text: string; html: string }

export interface Mailer {
  configured: boolean;
  send(msg: MailMessage): Promise<boolean>;
}

/** Caixa de saída em memória, usada só em DEMO_MODE/testes quando o SMTP não está configurado. */
export const outbox: MailMessage[] = [];

export function createMailer(env = process.env, demo = false): Mailer {
  const user = env.GMAIL_USER;
  const pass = (env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  if (user && pass) {
    const transport = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
    return {
      configured: true,
      async send(msg) {
        try {
          await transport.sendMail({ from: `"VanEscolar" <${user}>`, ...msg });
          return true;
        } catch (e: any) {
          console.error('[MAIL] falha ao enviar:', e?.code || e?.message);
          return false;
        }
      }
    };
  }
  return {
    configured: false,
    async send(msg) {
      if (demo) { outbox.push(msg); return true; }
      console.warn('[MAIL] GMAIL_USER/GMAIL_APP_PASSWORD não configurados; e-mail não enviado.');
      return false;
    }
  };
}

// ---------------------------------------------------------------------------
// Tokens de uso único (guardamos só o hash; o token em si vai apenas no e-mail)
// ---------------------------------------------------------------------------
export type TokenKind = 'verify' | 'reset';
interface TokenRec { userId: number; kind: TokenKind; exp: number }
const tokens = new Map<string, TokenRec>();
const hash = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

export function issueToken(userId: number, kind: TokenKind, ttlMs: number): string {
  // um token ativo por usuário/tipo
  for (const [h, r] of tokens) if (r.userId === userId && r.kind === kind) tokens.delete(h);
  const token = crypto.randomBytes(32).toString('base64url');
  tokens.set(hash(token), { userId, kind, exp: Date.now() + ttlMs });
  return token;
}

/** Valida e CONSOME o token (uso único). */
export function consumeToken(token: unknown, kind: TokenKind): number | null {
  if (typeof token !== 'string' || token.length < 20) return null;
  const h = hash(token);
  const rec = tokens.get(h);
  if (!rec || rec.kind !== kind) return null;
  tokens.delete(h);
  return Date.now() <= rec.exp ? rec.userId : null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function layout(nome: string, intro: string, botao: string, link: string, rodape: string): { html: string; text: string } {
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#1e293b">
<h2 style="color:#b45309">VanEscolar</h2><p>Olá, ${esc(nome)}!</p><p>${esc(intro)}</p>
<p style="margin:24px 0"><a href="${esc(link)}" style="background:#f59e0b;color:#0f172a;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">${esc(botao)}</a></p>
<p style="font-size:12px;color:#64748b">Se o botão não funcionar, copie este endereço no navegador:<br>${esc(link)}</p>
<p style="font-size:12px;color:#64748b">${esc(rodape)}</p></div>`;
  return { html, text: `Olá, ${nome}!\n\n${intro}\n\n${botao}: ${link}\n\n${rodape}` };
}
