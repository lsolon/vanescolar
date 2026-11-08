/**
 * ============================================================================
 * AVISOS NO CELULAR (push) — lógica pura (push.ts)
 * ----------------------------------------------------------------------------
 * PRIVACIDADE (LGPD de menores): a mensagem enviada pelos servidores de push
 * (Google, Apple, Mozilla) é GENÉRICA. Nunca leva nome de criança, endereço,
 * escola, coordenada nem mapa — só "a van chega em ~N min" e registros de
 * embarque/entrega. Os detalhes continuam só dentro do app, depois do login.
 *
 * A assinatura (endpoint + chaves) identifica o aparelho; guardamos o mínimo e
 * apagamos quando o aparelho some (resposta 404/410) ou a pessoa desliga.
 * ============================================================================
 */

export interface AssinaturaPush {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Quantos aparelhos cada responsável pode ter ligados. */
export const MAX_ASSINATURAS = 5;

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

/** Valida a assinatura enviada pelo navegador; devolve só os campos esperados ou null. */
export function validarAssinatura(v: unknown): AssinaturaPush | null {
  if (!v || typeof v !== 'object') return null;
  const { endpoint, keys } = v as any;
  if (typeof endpoint !== 'string' || endpoint.length > 600) return null;
  let url: URL;
  try { url = new URL(endpoint); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  if (!keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') return null;
  if (keys.p256dh.length < 20 || keys.p256dh.length > 200 || !BASE64URL.test(keys.p256dh)) return null;
  if (keys.auth.length < 8 || keys.auth.length > 64 || !BASE64URL.test(keys.auth)) return null;
  return { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

/** Acrescenta (ou atualiza, se o aparelho já estava) sem passar do limite: o mais antigo sai. */
export function adicionarAssinatura(lista: AssinaturaPush[] | undefined, nova: AssinaturaPush): AssinaturaPush[] {
  const resto = (lista ?? []).filter((a) => a.endpoint !== nova.endpoint);
  return [...resto, nova].slice(-MAX_ASSINATURAS);
}

export function removerAssinatura(lista: AssinaturaPush[] | undefined, endpoint: string): AssinaturaPush[] {
  return (lista ?? []).filter((a) => a.endpoint !== endpoint);
}

export type TipoAviso = 'van_chegando' | 'embarque' | 'entrega' | 'teste';

export interface MensagemPush {
  titulo: string;
  corpo: string;
  /** Mesma etiqueta substitui o aviso anterior na tela do celular (não empilha). */
  tag: string;
}

/** Texto genérico do aviso. `minutos` só vale para "van_chegando". */
export function montarMensagem(tipo: TipoAviso, minutos?: number): MensagemPush {
  switch (tipo) {
    case 'van_chegando': {
      const m = Math.max(1, Math.round(Number(minutos) || 1));
      return { titulo: 'A van está chegando', corpo: m <= 1 ? 'Chega em cerca de 1 minuto.' : `Chega em cerca de ${m} minutos.`, tag: 'van-chegando' };
    }
    case 'embarque': return { titulo: 'Embarque registrado', corpo: 'O motorista registrou o embarque. Abra o app para ver.', tag: 'embarque' };
    case 'entrega': return { titulo: 'Entrega registrada', corpo: 'O motorista registrou a entrega. Abra o app para ver.', tag: 'entrega' };
    default: return { titulo: 'Avisos ligados', corpo: 'Este aparelho vai receber os avisos da van.', tag: 'teste' };
  }
}

/** Chave para não repetir o mesmo aviso no mesmo dia, para o mesmo responsável, aluno e sentido. */
export function chaveAviso(userId: number, alunoId: number, sentido: string, tipo: TipoAviso, dia: string): string {
  return `${userId}|${alunoId}|${sentido}|${tipo}|${dia}`;
}

/** Guarda curta de "já avisei hoje": só mantém as chaves do dia atual. */
export class AvisosFeitos {
  private dia = '';
  private chaves = new Set<string>();
  /** Registra e diz se é a primeira vez (true = pode enviar). */
  marcar(chave: string, dia: string): boolean {
    if (dia !== this.dia) { this.dia = dia; this.chaves.clear(); }
    if (this.chaves.has(chave)) return false;
    this.chaves.add(chave);
    return true;
  }
}
