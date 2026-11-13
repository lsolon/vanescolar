export const EVENTO_BLOQUEIO = 'van-bloqueio';

const respostasVerificadas = new WeakSet<Response>();

/**
 * Assinatura vencida: o servidor responde 402 (com o código ASSINATURA_NECESSARIA ou VAN_SUSPENSA).
 * Qualquer tela avisa a camada global sem depender exclusivamente de sobrescrever window.fetch.
 */
export function verificarBloqueioAssinatura(res: Response): Response {
  if (typeof window !== 'undefined' && res.status === 402 && !respostasVerificadas.has(res)) {
    respostasVerificadas.add(res);
    res
      .clone()
      .json()
      .then((d) => {
        if (d?.codigo === 'ASSINATURA_NECESSARIA' || d?.codigo === 'VAN_SUSPENSA') {
          window.dispatchEvent(new CustomEvent(EVENTO_BLOQUEIO, { detail: d }));
        }
      })
      .catch(() => {});
  }
  return res;
}

/**
 * Wrapper de fetch para detectar bloqueio 402 mesmo em ambientes onde window.fetch é somente leitura.
 */
export async function fetchApp(...args: Parameters<typeof fetch>): Promise<Response> {
  const res = await globalThis.fetch(...args);
  return verificarBloqueioAssinatura(res);
}

/**
 * Instala um interceptor em window.fetch usando Object.defineProperty com guarda de configurabilidade.
 * Evita `window.fetch = ...`, que lança TypeError quando `fetch` no Window possui apenas getter.
 */
export function instalarInterceptorFetchSeguro(): void {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  try {
    const desc = Object.getOwnPropertyDescriptor(window, 'fetch');
    if (desc && desc.configurable === false) return;

    const fetchOriginal = window.fetch.bind(window);
    if ((fetchOriginal as { __vanBloqueioWrapped?: boolean }).__vanBloqueioWrapped) return;

    const fetchComBloqueio = async (...args: Parameters<typeof fetch>): Promise<Response> => {
      const res = await fetchOriginal(...args);
      return verificarBloqueioAssinatura(res);
    };
    (fetchComBloqueio as { __vanBloqueioWrapped?: boolean }).__vanBloqueioWrapped = true;

    Object.defineProperty(window, 'fetch', {
      value: fetchComBloqueio,
      configurable: true,
      writable: true,
      enumerable: desc ? desc.enumerable : true,
    });
  } catch {
    // Ambientes com window.fetch não configurável continuam cobertos via fetchApp nos serviços.
  }
}
