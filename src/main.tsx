import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { PreCadastroFamilia } from './components/auth/PreCadastroFamilia';
import './index.css';
import { iniciarLogDeUso } from './services/logUso';
import { EVENTO_BLOQUEIO } from './components/assinatura/Assinatura';

// Assinatura vencida: o servidor responde 402 (com o código ASSINATURA_NECESSARIA ou VAN_SUSPENSA). Qualquer tela avisa a camada global.
const fetchOriginal = window.fetch.bind(window);
window.fetch = async (...args: Parameters<typeof fetch>) => {
  const res = await fetchOriginal(...args);
  if (res.status === 402) {
    res.clone().json().then((d) => {
      if (d?.codigo === 'ASSINATURA_NECESSARIA' || d?.codigo === 'VAN_SUSPENSA') window.dispatchEvent(new CustomEvent(EVENTO_BLOQUEIO, { detail: d }));
    }).catch(() => {});
  }
  return res;
};

// Link de pré-cadastro enviado pelo motorista (?pre=CODIGO): página pública, sem login e sem carregar o painel.
const tokenPre = new URLSearchParams(window.location.search).get('pre');
createRoot(document.getElementById('root')!).render(tokenPre ? <PreCadastroFamilia token={tokenPre} /> : <App />);

// App instalável (PWA): só em produção e em conexão segura. O service worker nunca guarda dados da API.
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Log de uso da fase de testes (só liga se o servidor estiver com LOG_USO / modo de teste).
iniciarLogDeUso();
