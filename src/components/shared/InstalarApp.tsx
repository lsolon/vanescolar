import React, { useEffect, useState } from 'react';

/** Evento do Chrome/Android que permite oferecer a instalação (não existe no iPhone). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const jaInstalado = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true);
const ehIPhone = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

/** Cartão "Instalar o app na tela inicial": botão no Android/Chrome e passo a passo no iPhone. */
export const InstalarApp: React.FC = () => {
  const [evento, setEvento] = useState<BeforeInstallPromptEvent | null>(null);
  const [instalado, setInstalado] = useState(jaInstalado());
  const [dispensado, setDispensado] = useState(() => {
    try { return localStorage.getItem('vanescolar_instalar_dispensado') === '1'; } catch { return false; }
  });

  useEffect(() => {
    const antes = (e: Event) => { e.preventDefault(); setEvento(e as BeforeInstallPromptEvent); };
    const depois = () => { setInstalado(true); setEvento(null); };
    window.addEventListener('beforeinstallprompt', antes);
    window.addEventListener('appinstalled', depois);
    return () => { window.removeEventListener('beforeinstallprompt', antes); window.removeEventListener('appinstalled', depois); };
  }, []);

  if (instalado || dispensado) return null;
  const iphone = ehIPhone();
  if (!evento && !iphone) return null; // navegador sem suporte: não mostra nada

  const dispensar = () => {
    setDispensado(true);
    try { localStorage.setItem('vanescolar_instalar_dispensado', '1'); } catch {}
  };
  const instalar = async () => {
    if (!evento) return;
    await evento.prompt();
    const r = await evento.userChoice;
    if (r.outcome === 'accepted') setInstalado(true);
    setEvento(null);
  };

  return (
    <section aria-label="Instalar o app" className="bg-slate-900 border border-amber-400/30 rounded-2xl p-4 flex items-start gap-3">
      <img src="/icons/icon-192.png" alt="" width={44} height={44} className="rounded-xl shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <h3 className="text-xs font-bold text-amber-300">Instale o VanEscolar no celular</h3>
        {iphone && !evento ? (
          <p className="text-[11px] text-slate-300">No Safari, toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>. O ícone fica ao lado dos seus outros aplicativos.</p>
        ) : (
          <p className="text-[11px] text-slate-300">Abre direto da tela inicial, em tela cheia, sem digitar o endereço.</p>
        )}
        <div className="flex items-center gap-2">
          {evento && <button type="button" onClick={instalar} className="px-4 py-2 min-h-[44px] rounded-xl bg-amber-400 text-slate-950 text-xs font-black cursor-pointer">Instalar</button>}
          <button type="button" onClick={dispensar} className="text-[11px] text-slate-400 underline min-h-[44px] cursor-pointer">Agora não</button>
        </div>
      </div>
    </section>
  );
};
