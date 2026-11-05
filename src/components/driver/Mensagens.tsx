import React, { useCallback, useEffect, useState } from 'react';
import { TransportRepository, subscribeToDatabaseChanges } from '../../services/api';
import type { MensagemApp, ResumoMensagensMotorista } from '../../services/api';
import { Conversa } from '../shared/Conversa';

const hora = (iso: string) => {
  const d = new Date(iso);
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) === hoje
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
};

/** Total de mensagens não lidas (para o contador da aba), atualizado por evento e a cada minuto. */
export function useNaoLidasMotorista(ativo = true): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    const buscar = () => TransportRepository.resumoMensagensMotorista().then((r) => { if (vivo) setN(r.total_nao_lidas); }).catch(() => {});
    buscar();
    const unsub = subscribeToDatabaseChanges((ev) => { if (ev === 'MENSAGENS_ATUALIZADAS') buscar(); });
    const t = setInterval(buscar, 60_000);
    return () => { vivo = false; unsub(); clearInterval(t); };
  }, [ativo]);
  return n;
}

type Tela = { tipo: 'lista' } | { tipo: 'familia'; id: number } | { tipo: 'aviso' };

export const Mensagens: React.FC<{ onMudou?: () => void }> = ({ onMudou }) => {
  const [tela, setTela] = useState<Tela>({ tipo: 'lista' });
  const [resumo, setResumo] = useState<ResumoMensagensMotorista | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [familia, setFamilia] = useState<{ id: number; nome: string; filhos: string[] } | null>(null);
  const [mensagens, setMensagens] = useState<MensagemApp[]>([]);

  const carregarResumo = useCallback(async () => {
    try { setResumo(await TransportRepository.resumoMensagensMotorista()); setErro(null); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível carregar as mensagens.'); }
  }, []);
  const carregarConversa = useCallback(async (id: number) => {
    try {
      const c = await TransportRepository.conversaComFamilia(id);
      setFamilia(c.familia); setMensagens(c.mensagens); setErro(null);
      onMudou?.();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível abrir a conversa.'); }
  }, [onMudou]);

  useEffect(() => { carregarResumo(); }, [carregarResumo]);
  useEffect(() => { if (tela.tipo === 'familia') { setFamilia(null); setMensagens([]); carregarConversa(tela.id); } }, [tela, carregarConversa]);
  useEffect(() => {
    const atualizar = () => { carregarResumo(); if (tela.tipo === 'familia') carregarConversa(tela.id); };
    const unsub = subscribeToDatabaseChanges((ev) => { if (ev === 'MENSAGENS_ATUALIZADAS') atualizar(); });
    const t = setInterval(atualizar, 30_000);
    return () => { unsub(); clearInterval(t); };
  }, [tela, carregarResumo, carregarConversa]);

  const voltar = () => { setTela({ tipo: 'lista' }); carregarResumo(); onMudou?.(); };

  if (!resumo && !erro) return <p className="text-xs text-slate-400 p-4">Carregando mensagens…</p>;
  if (erro && !resumo) return <p role="alert" className="text-xs text-rose-300 p-4">{erro}</p>;
  const r = resumo!;

  if (tela.tipo === 'familia') {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col p-3" role="dialog" aria-modal="true" aria-label="Conversa com a família">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
          <button type="button" onClick={voltar} aria-label="Voltar para a lista" className="w-10 h-10 rounded-xl bg-slate-800 text-slate-200 cursor-pointer">←</button>
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold text-slate-100 truncate">{familia?.nome ?? 'Família'}</h2>
            <p className="text-[11px] text-slate-400 truncate">{familia ? `Aluno(s): ${familia.filhos.join(', ')}` : ''}</p>
          </div>
        </div>
        {erro && <p role="alert" className="text-xs text-rose-300 pt-2">{erro}</p>}
        <div className="flex-1 min-h-0 pt-1">
        <Conversa
          mensagens={mensagens}
          eu="MOTORISTA"
          rapidas={r.rapidas}
          vazio="Nenhuma mensagem ainda. Use uma mensagem pronta ou escreva abaixo."
          onEnviar={async (texto) => { await TransportRepository.enviarParaFamilia(tela.id, { texto }); await carregarConversa(tela.id); }}
          onRapida={async (id) => { await TransportRepository.enviarParaFamilia(tela.id, { rapida: id }); await carregarConversa(tela.id); }}
        />
        </div>
      </div>
    );
  }

  if (tela.tipo === 'aviso') {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col p-3" role="dialog" aria-modal="true" aria-label="Aviso para toda a van">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
          <button type="button" onClick={voltar} aria-label="Voltar para a lista" className="w-10 h-10 rounded-xl bg-slate-800 text-slate-200 cursor-pointer">←</button>
          <div>
            <h2 className="text-sm font-extrabold text-amber-200">Aviso para toda a van</h2>
            <p className="text-[11px] text-slate-400">Chega para {r.total_familias} {r.total_familias === 1 ? 'família' : 'famílias'}. Eles não respondem aqui.</p>
          </div>
        </div>
        <div className="flex-1 min-h-0 pt-1">
        <Conversa
          mensagens={r.avisos}
          eu="MOTORISTA"
          mostrarLeitura={false}
          rapidas={r.rapidas}
          vazio="Nenhum aviso nos últimos dias."
          onEnviar={async (texto) => {
            if (!window.confirm(`Enviar para ${r.total_familias} ${r.total_familias === 1 ? 'família' : 'famílias'}?\n\n${texto}`)) return;
            await TransportRepository.enviarAvisoDaVan({ texto }); await carregarResumo();
          }}
          onRapida={async (id) => {
            const t = r.rapidas.find((x) => x.id === id)?.texto ?? '';
            if (!window.confirm(`Enviar para ${r.total_familias} ${r.total_familias === 1 ? 'família' : 'famílias'}?\n\n${t}`)) return;
            await TransportRepository.enviarAvisoDaVan({ rapida: id }); await carregarResumo();
          }}
        />
        </div>
        <p className="text-[10px] text-slate-500">Lido por: {r.avisos.length ? `${r.avisos[r.avisos.length - 1].lida_por ?? 0} de ${r.total_familias} (último aviso)` : '—'}</p>
      </div>
    );
  }

  return (
    <section aria-label="Mensagens" className="space-y-3">
      <button type="button" onClick={() => setTela({ tipo: 'aviso' })}
        className="w-full text-left bg-amber-500/10 border border-amber-500/40 rounded-2xl p-4 min-h-[56px] cursor-pointer">
        <span className="text-sm font-extrabold text-amber-200">📢 Aviso para toda a van</span>
        <span className="block text-[11px] text-slate-400">Um recado só para todas as famílias (ex.: atraso, sem aula).</span>
      </button>

      <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 pt-1">Conversas com as famílias</h2>
      {r.familias.length === 0 && (
        <p className="text-xs text-slate-400 bg-slate-900 border border-slate-800 rounded-2xl p-4">Nenhuma família vinculada ainda. Quando você confirmar um aluno, a conversa com o responsável aparece aqui.</p>
      )}
      <ul className="space-y-2">
        {r.familias.map((f) => (
          <li key={f.id}>
            <button type="button" onClick={() => setTela({ tipo: 'familia', id: f.id })}
              className="w-full text-left bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-3 min-h-[64px] cursor-pointer flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-100 truncate">{f.nome}</span>
                  {f.ultima && <span className="text-[10px] text-slate-500 shrink-0">{hora(f.ultima.criado_em)}</span>}
                </div>
                <p className="text-[11px] text-slate-400 truncate">Aluno(s): {f.filhos.join(', ')}</p>
                <p className={`text-xs truncate ${f.nao_lidas ? 'text-slate-100 font-semibold' : 'text-slate-500'}`}>
                  {f.ultima ? `${f.ultima.de === 'MOTORISTA' ? 'Você: ' : ''}${f.ultima.texto}` : 'Sem mensagens'}
                </p>
              </div>
              {f.nao_lidas > 0 && <span aria-label={`${f.nao_lidas} não lidas`} className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-cyan-500 text-slate-950 text-[11px] font-black flex items-center justify-center">{f.nao_lidas}</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
