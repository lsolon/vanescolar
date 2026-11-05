import React, { useEffect, useRef, useState } from 'react';
import type { MensagemApp } from '../../services/api';

const TZ = 'America/Sao_Paulo';
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const diaChave = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });
const diaTitulo = (iso: string) => {
  const d = diaChave(iso);
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  const ontem = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: TZ });
  return d === hoje ? 'Hoje' : d === ontem ? 'Ontem' : d.split('-').reverse().slice(0, 2).join('/');
};
export const MAX_MSG = 500;

interface Props {
  mensagens: MensagemApp[];
  /** Quem está usando: define o lado das mensagens. */
  eu: 'MOTORISTA' | 'RESPONSAVEL';
  onEnviar: (texto: string) => Promise<void>;
  /** Mensagens prontas (só o motorista): um toque envia. */
  rapidas?: { id: string; texto: string }[];
  onRapida?: (id: string) => Promise<void>;
  vazio?: string;
  placeholder?: string;
  /** Mostra "Lida" nas mensagens enviadas por mim. */
  mostrarLeitura?: boolean;
}

export const Conversa: React.FC<Props> = ({ mensagens, eu, onEnviar, rapidas, onRapida, vazio = 'Nenhuma mensagem ainda.', placeholder = 'Escreva uma mensagem…', mostrarLeitura = true }) => {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => { fim.current?.scrollIntoView?.({ block: 'end' }); }, [mensagens.length]);

  const enviar = async (fn: () => Promise<void>, limpar = false) => {
    if (enviando) return;
    setEnviando(true); setErro(null);
    try { await fn(); if (limpar) setTexto(''); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível enviar.'); }
    finally { setEnviando(false); }
  };
  const enviarTexto = () => { const t = texto.trim(); if (t) enviar(() => onEnviar(t), true); };

  let diaAnterior = '';
  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-1.5 px-1 py-2" role="log" aria-live="polite" aria-label="Mensagens">
        {mensagens.length === 0 && <p className="text-center text-xs text-slate-500 py-8">{vazio}</p>}
        {mensagens.map((m) => {
          const dia = diaChave(m.criado_em);
          const cabecalho = dia !== diaAnterior ? diaTitulo(m.criado_em) : null;
          diaAnterior = dia;
          const meu = m.de === eu;
          return (
            <React.Fragment key={m.id}>
              {cabecalho && <div className="text-center text-[10px] text-slate-500 py-1">{cabecalho}</div>}
              <div className={`flex ${meu ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words border ${
                  m.aviso ? 'bg-amber-500/10 border-amber-500/40 text-amber-100'
                    : meu ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-50' : 'bg-slate-800 border-slate-700 text-slate-100'}`}>
                  {m.aviso && <div className="text-[10px] font-black uppercase tracking-wide text-amber-300 mb-0.5">Aviso para toda a van</div>}
                  {m.texto}
                  <div className="mt-0.5 text-[10px] text-slate-400 text-right">
                    {hora(m.criado_em)}{mostrarLeitura && meu && !m.aviso ? (m.lida ? ' · Lida' : ' · Enviada') : ''}
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
        <div ref={fim} />
      </div>

      {rapidas && rapidas.length > 0 && onRapida && (
        <div className="flex gap-1.5 overflow-x-auto pb-1.5 pt-1" aria-label="Mensagens prontas">
          {rapidas.map((r) => (
            <button key={r.id} type="button" disabled={enviando} onClick={() => enviar(() => onRapida(r.id))}
              className="shrink-0 whitespace-nowrap px-3 py-2 min-h-[40px] rounded-full bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 cursor-pointer disabled:opacity-50">
              {r.texto.replace(/\.$/, '')}
            </button>
          ))}
        </div>
      )}

      {erro && <p role="alert" className="text-xs text-rose-300 pb-1">{erro}</p>}
      <div className="flex items-end gap-2 pt-1">
        <div className="flex-1">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value.slice(0, MAX_MSG))}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarTexto(); } }}
            rows={2}
            maxLength={MAX_MSG}
            placeholder={placeholder}
            aria-label="Escrever mensagem"
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 resize-none"
          />
          {texto.length > 400 && <p className="text-[10px] text-slate-500 text-right">{texto.length}/{MAX_MSG}</p>}
        </div>
        <button type="button" onClick={enviarTexto} disabled={enviando || !texto.trim()}
          className="px-4 py-2 min-h-[44px] rounded-xl bg-cyan-500 text-slate-950 text-sm font-black cursor-pointer disabled:opacity-40">
          {enviando ? '…' : 'Enviar'}
        </button>
      </div>
      <p className="text-[10px] text-slate-500 pt-1">Não envie endereço completo nem localização: use só para combinar a rotina da van.</p>
    </div>
  );
};
