import { TransportRepository } from './api';

/**
 * Google Analytics (GA4) — só nas telas públicas (landing, login e cadastro) e só com o aceite da pessoa.
 * - Nunca dentro do painel do motorista, do app da família nem da ficha de pré-cadastro (há dados de crianças).
 * - O endereço enviado é sempre virtual (ex.: /cadastro-motorista): os parâmetros ?m=, ?ind= e ?pre= nunca vão.
 * - Sem nome, e-mail, telefone ou código nos eventos; IP anonimizado; sem sinais do Google para publicidade.
 * - O ID de medição vem do servidor (variável GA_MEASUREMENT_ID). Sem ID, nada é carregado.
 */
const CHAVE_ACEITE = 'vanescolar.analytics';
type Aceite = 'sim' | 'nao' | null;

let gaId = '';
let carregado = false;
let pronto: Promise<string> | null = null;

export function lerAceiteAnalytics(): Aceite {
  try { const v = localStorage.getItem(CHAVE_ACEITE); return v === 'sim' || v === 'nao' ? v : null; } catch { return null; }
}

/** Consulta o servidor uma vez: devolve o ID de medição ('' = Analytics desligado). */
export function analyticsDisponivel(): Promise<string> {
  if (!pronto) pronto = TransportRepository.configPublica().then((c) => { gaId = c.gaId; return gaId; }).catch(() => '');
  return pronto;
}

function carregar() {
  if (carregado || !gaId) return;
  carregado = true;
  const w = window as any;
  w.dataLayer = w.dataLayer || [];
  w.gtag = function () { w.dataLayer.push(arguments); };
  w.gtag('js', new Date());
  w.gtag('config', gaId, { send_page_view: false, anonymize_ip: true, allow_google_signals: false, allow_ad_personalization_signals: false });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
  document.head.appendChild(s);
  esvaziarFila();
}

export async function definirAceiteAnalytics(aceitou: boolean): Promise<void> {
  try { localStorage.setItem(CHAVE_ACEITE, aceitou ? 'sim' : 'nao'); } catch { /* sem storage */ }
  if (aceitou) { await analyticsDisponivel(); carregar(); }
}

/** Liga o Analytics se a pessoa já aceitou antes neste aparelho. */
export async function iniciarAnalytics(): Promise<void> {
  if (lerAceiteAnalytics() !== 'sim') return;
  await analyticsDisponivel();
  carregar();
}

const fila: unknown[][] = [];
function enviar(...args: unknown[]) {
  if (carregado) { (window as any).gtag?.(...args); return; }
  // Aceitou antes, mas o script ainda está carregando: guarda e envia quando ligar.
  if (lerAceiteAnalytics() === 'sim' && fila.length < 20) fila.push(args);
}
function esvaziarFila() { while (fila.length) (window as any).gtag?.(...(fila.shift() as unknown[])); }

/** Visualização de tela pública, com caminho virtual (nunca a URL real). */
export function registrarTela(nome: string): void {
  const caminho = `/${nome.replace(/[^a-z0-9-]/gi, '').toLowerCase()}`;
  enviar('event', 'page_view', { page_location: `${window.location.origin}${caminho}`, page_path: caminho, page_title: caminho });
}

/** Evento de conversão. Só nomes fixos e parâmetros sem dados pessoais. */
export function registrarEvento(nome: 'cadastro_motorista' | 'cadastro_responsavel' | 'login' | 'indicacao_aberta', parametros: { papel?: 'motorista' | 'responsavel'; com_indicacao?: boolean } = {}): void {
  enviar('event', nome, parametros);
}
