import React, { useEffect, useState } from 'react';
import { TransportRepository } from '../../services/api';

/** Chave pública VAPID (base64url) -> bytes, no formato que o navegador pede. */
function chaveParaBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

const suportado = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/**
 * "Avisos no celular": o responsável liga neste aparelho. A mensagem que chega é genérica
 * (sem nome de criança, endereço ou mapa). Fica escondido se o aparelho não suporta ou o servidor ainda não tem as chaves.
 */
export const AvisosCelular: React.FC = () => {
  const [chave, setChave] = useState<string | null>(null);
  const [ligado, setLigado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!suportado()) return;
    let vivo = true;
    (async () => {
      try {
        const est = await TransportRepository.pushEstado();
        if (!vivo || !est.disponivel || !est.chavePublica) return;
        setChave(est.chavePublica);
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (vivo) setLigado(!!sub && est.aparelhos > 0 && Notification.permission === 'granted');
      } catch { /* sem o recurso, a seção simplesmente não aparece */ }
    })();
    return () => { vivo = false; };
  }, []);

  if (!chave) return null;

  const ligar = async () => {
    setOcupado(true); setMsg(null);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== 'granted') { setMsg('Os avisos estão bloqueados. Libere as notificações do VanEscolar nas configurações do navegador e tente de novo.'); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(chave) });
      await TransportRepository.pushLigar(sub.toJSON());
      setLigado(true);
      setMsg('Pronto! Este aparelho vai receber os avisos da van.');
    } catch (e: any) {
      setMsg(e?.message || 'Não foi possível ligar os avisos agora.');
    } finally { setOcupado(false); }
  };

  const desligar = async () => {
    setOcupado(true); setMsg(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      await TransportRepository.pushDesligar(sub?.endpoint);
      await sub?.unsubscribe();
      setLigado(false);
    } catch (e: any) {
      setMsg(e?.message || 'Não foi possível desligar agora.');
    } finally { setOcupado(false); }
  };

  const testar = async () => {
    setMsg(null);
    try { await TransportRepository.pushTeste(); setMsg('Teste enviado. Ele chega em instantes.'); }
    catch (e: any) { setMsg(e?.message || 'Não foi possível enviar o teste agora.'); }
  };

  return (
    <div className="mt-3 pt-3 border-t border-slate-800" aria-label="Avisos no celular">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-slate-300">Avisos no celular</p>
          <p className="text-[10px] text-slate-400">Receba "a van está chegando" mesmo com o app fechado. O aviso não mostra nome nem endereço.</p>
        </div>
        <button
          type="button" role="switch" aria-checked={ligado} aria-label={`Avisos no celular: ${ligado ? 'ligado' : 'desligado'}`}
          disabled={ocupado} onClick={ligado ? desligar : ligar}
          className={`shrink-0 relative w-12 h-7 rounded-full border cursor-pointer min-h-[44px] min-w-[48px] ${ligado ? 'bg-cyan-500 border-cyan-400' : 'bg-slate-800 border-slate-600'} disabled:opacity-60`}
        >
          <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${ligado ? 'left-6' : 'left-1'}`} />
        </button>
      </div>
      {ligado && <button type="button" onClick={testar} className="mt-2 text-xs text-cyan-400 hover:underline cursor-pointer">Enviar aviso de teste</button>}
      {msg && <p role="status" className="mt-2 text-[11px] text-slate-300">{msg}</p>}
      <p className="mt-2 text-[10px] text-slate-500">No iPhone, os avisos só funcionam depois de adicionar o app à tela inicial.</p>
    </div>
  );
};
