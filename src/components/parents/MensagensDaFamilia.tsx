import React, { useCallback, useEffect, useState } from 'react';
import { TransportRepository, subscribeToDatabaseChanges } from '../../services/api';
import type { MensagemApp } from '../../services/api';
import { Conversa } from '../shared/Conversa';

/** Cartão "Mensagens" do responsável: conversa só dele com o motorista + avisos da van. */
export const MensagensDaFamilia: React.FC = () => {
  const [aberto, setAberto] = useState(false);
  const [naoLidas, setNaoLidas] = useState(0);
  const [motorista, setMotorista] = useState<string>('o motorista');
  const [mensagens, setMensagens] = useState<MensagemApp[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const contar = useCallback(() => { TransportRepository.naoLidasDaFamilia().then(setNaoLidas).catch(() => {}); }, []);
  const abrir = useCallback(async () => {
    try {
      const c = await TransportRepository.conversaDaFamilia();
      setMotorista(c.motorista.nome); setMensagens(c.mensagens); setErro(null); setNaoLidas(0);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível abrir as mensagens.'); }
  }, []);

  useEffect(() => {
    contar();
    const unsub = subscribeToDatabaseChanges((ev) => { if (ev === 'MENSAGENS_ATUALIZADAS') { if (aberto) abrir(); else contar(); } });
    const t = setInterval(() => { if (aberto) abrir(); else contar(); }, 45_000);
    return () => { unsub(); clearInterval(t); };
  }, [aberto, abrir, contar]);

  useEffect(() => { if (aberto) abrir(); }, [aberto, abrir]);

  return (
    <>
      <button type="button" onClick={() => setAberto(true)}
        className="w-full text-left bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 min-h-[56px] cursor-pointer flex items-center justify-between gap-3">
        <span>
          <span className="block text-sm font-extrabold text-slate-100">💬 Mensagens com o motorista</span>
          <span className="block text-[11px] text-slate-400">Conversa privada e avisos da van.</span>
        </span>
        {naoLidas > 0 && <span aria-label={`${naoLidas} mensagens novas`} className="min-w-[24px] h-6 px-2 rounded-full bg-cyan-500 text-slate-950 text-xs font-black flex items-center justify-center">{naoLidas}</span>}
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col p-3" role="dialog" aria-modal="true" aria-label="Mensagens com o motorista">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
            <button type="button" onClick={() => { setAberto(false); contar(); }} aria-label="Fechar mensagens" className="w-11 h-11 rounded-xl bg-slate-800 text-slate-200 cursor-pointer">←</button>
            <div className="min-w-0">
              <h2 className="text-sm font-extrabold text-slate-100 truncate">{motorista}</h2>
              <p className="text-[11px] text-slate-400">Só você e o motorista veem esta conversa.</p>
            </div>
          </div>
          {erro && <p role="alert" className="text-xs text-rose-300 pt-2">{erro}</p>}
          <div className="flex-1 min-h-0 pt-1">
            <Conversa
              mensagens={mensagens}
              eu="RESPONSAVEL"
              vazio="Nenhuma mensagem ainda. Escreva abaixo para falar com o motorista."
              onEnviar={async (texto) => { await TransportRepository.enviarDaFamilia(texto); await abrir(); }}
            />
          </div>
        </div>
      )}
    </>
  );
};
