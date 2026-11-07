import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { PreCadastroFamilia } from './components/auth/PreCadastroFamilia';
import './index.css';
import { iniciarLogDeUso } from './services/logUso';

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
