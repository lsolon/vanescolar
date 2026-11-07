import { TransportRepository } from './api';

/**
 * Log de uso (fase de testes): anota toques em botões e abas, mudanças em campos (só o tamanho do que foi digitado,
 * nunca o conteúdo), erros e quando o app vai para segundo plano. Só roda se o servidor estiver com o log ligado.
 * O servidor ainda troca nomes e números por marcadores antes de guardar.
 */
let iniciado = false;
export async function iniciarLogDeUso(): Promise<void> {
  if (iniciado || typeof window === 'undefined') return;
  if (!(await TransportRepository.logUsoAtivo())) return;
  iniciado = true;
  let sessao = '';
  try { sessao = sessionStorage.getItem('vanescolar_sessao_log') || ''; if (!sessao) { sessao = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('vanescolar_sessao_log', sessao); } } catch { sessao = Math.random().toString(36).slice(2, 10); }
  const fila: Record<string, unknown>[] = [];
  const enviar = () => { if (!fila.length) return; const lote = fila.splice(0, 40); TransportRepository.enviarLogUso(lote).catch(() => {}); };
  const anotar = (e: Record<string, unknown>) => { fila.push({ ...e, sessao }); if (fila.length > 200) fila.splice(0, fila.length - 200); if (fila.length >= 20) enviar(); };
  setInterval(enviar, 3000);
  anotar({ acao: 'abriu', rotulo: window.location.pathname });
  document.addEventListener('click', (ev) => {
    const el = (ev.target as Element | null)?.closest?.('button,a,[role="button"],[role="tab"],summary,label,select,input[type="checkbox"],input[type="radio"]') as HTMLElement | null;
    if (!el) return;
    const rotulo = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    anotar({ acao: 'clique', tag: el.tagName.toLowerCase(), id: el.id || undefined, rotulo });
  }, true);
  document.addEventListener('change', (ev) => {
    const el = ev.target as HTMLInputElement | null;
    if (!el || !('value' in el)) return;
    anotar({ acao: 'campo', tag: el.tagName.toLowerCase(), tipo: el.type, id: el.id || el.name || undefined, tam: String(el.value ?? '').length });
  }, true);
  window.addEventListener('error', (e) => anotar({ acao: 'erro', msg: String(e.message || 'erro') }));
  window.addEventListener('unhandledrejection', (e) => anotar({ acao: 'erro', msg: String((e.reason && e.reason.message) || e.reason || 'promessa rejeitada') }));
  document.addEventListener('visibilitychange', () => { anotar({ acao: 'visivel', rotulo: document.visibilityState }); if (document.visibilityState === 'hidden') enviar(); });
}
