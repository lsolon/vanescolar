import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { PreCadastroFamilia } from './components/auth/PreCadastroFamilia';
import './index.css';

// Link de pré-cadastro enviado pelo motorista (?pre=CODIGO): página pública, sem login e sem carregar o painel.
const tokenPre = new URLSearchParams(window.location.search).get('pre');
createRoot(document.getElementById('root')!).render(tokenPre ? <PreCadastroFamilia token={tokenPre} /> : <App />);

// App instalável (PWA): só em produção e em conexão segura. O service worker nunca guarda dados da API.
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
