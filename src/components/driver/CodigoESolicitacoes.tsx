import React, { useEffect, useState } from 'react';
import { TransportRepository } from '../../services/api';
import type { ParadaMotoristaSanitizada } from '../../types/database';
import { MensagemFamilia } from './NovoAluno';

/** Código do motorista: ele passa aos responsáveis, que o digitam uma única vez ao cadastrar o filho. */
export const CodigoMotorista: React.FC<{ nome?: string }> = ({ nome }) => {
  const [codigo, setCodigo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    TransportRepository.obterCodigoMotorista().then(setCodigo).catch((e) => setErro(e.message));
  }, []);

  const trocar = async () => {
    if (!window.confirm('Trocar o código? O antigo deixa de valer para novos cadastros. Quem já está vinculado continua na van.')) return;
    try { setCodigo(await TransportRepository.trocarCodigoMotorista()); setErro(null); } catch (e: any) { setErro(e.message); }
  };
  const copiar = async () => {
    if (!codigo) return;
    try { await navigator.clipboard.writeText(codigo); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch {}
  };
  // O link ?m= abre o app já com o nome do motorista e o código preenchido no cadastro do filho.
  const link = codigo ? `${window.location.origin}/?m=${codigo}` : '';
  const texto = codigo
    ? `Olá! Sou ${nome || 'o motorista'} do transporte escolar. Abra o VanEscolar por este link e crie sua conta: ${link}\nAo cadastrar seu filho, o código do motorista já vem preenchido (${codigo}).`
    : '';

  return (
    <section aria-label="Código do motorista" className="bg-slate-900 border border-amber-400/30 rounded-2xl p-4 space-y-2">
      <h3 className="text-xs font-bold text-amber-300">Seu código de motorista</h3>
      <p className="text-[11px] text-slate-400">Passe este código aos responsáveis. Eles o digitam uma vez só, ao cadastrar o filho, e você confirma o lugar de cada aluno na van.</p>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-lg font-black tracking-widest text-amber-300 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 select-all">{codigo || '······'}</span>
        <button type="button" onClick={copiar} disabled={!codigo} className="px-3 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold min-h-[44px] cursor-pointer disabled:opacity-50">{copiado ? 'Copiado!' : 'Copiar'}</button>
        <a
          href={codigo ? `https://wa.me/?text=${encodeURIComponent(texto)}` : undefined}
          target="_blank"
          rel="noreferrer"
          className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold min-h-[44px] inline-flex items-center"
        >
          WhatsApp
        </a>
        <button type="button" onClick={trocar} className="text-[11px] text-slate-400 underline cursor-pointer min-h-[44px]">Trocar código</button>
      </div>
      {codigo && <p className="text-[11px] text-slate-500 break-all">Link para as famílias: <span className="select-all text-slate-300">{link}</span></p>}
      {erro && <p role="alert" className="text-[11px] text-rose-300">{erro}</p>}
    </section>
  );
};

/** Bairro que aparece no cabeçalho ("Van do João • Freguesia") para o motorista e para as famílias. */
export const BairroDoMotorista: React.FC<{ inicial?: string; nome?: string; onSalvo?: (b: string) => void }> = ({ inicial = '', nome, onSalvo }) => {
  const [bairro, setBairro] = useState(inicial);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { setBairro(inicial); }, [inicial]);
  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true); setMsg(null);
    try {
      const b = await TransportRepository.salvarBairroMotorista(bairro);
      setBairro(b); onSalvo?.(b); setMsg({ ok: true, t: 'Salvo.' });
    } catch (err: any) { setMsg({ ok: false, t: err.message }); } finally { setSalvando(false); }
  };
  const primeiro = (nome || '').trim().split(/\s+/)[0];
  return (
    <form onSubmit={salvar} aria-label="Bairro do cabeçalho" className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
      <h3 className="text-xs font-bold text-amber-300">Bairro no cabeçalho</h3>
      <p className="text-[11px] text-slate-400">Aparece para você e para as famílias{primeiro ? `: "Van do ${primeiro}${bairro.trim() ? ` • ${bairro.trim()}` : ''}"` : ''}. Pode deixar em branco.</p>
      <div className="flex items-center gap-2">
        <input value={bairro} onChange={(e) => setBairro(e.target.value)} maxLength={40} placeholder="Ex.: Freguesia" aria-label="Bairro" className="flex-1 min-w-0 px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-amber-400 min-h-[44px]" />
        <button type="submit" disabled={salvando} className="px-3 py-2 rounded-xl bg-amber-400 text-slate-950 text-xs font-black min-h-[44px] cursor-pointer disabled:opacity-50">Salvar</button>
      </div>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-[11px] ${msg.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{msg.t}</p>}
    </form>
  );
};

/** Alunos que os responsáveis cadastraram com o seu código: o motorista confirma o lugar na van ou recusa. */
export const SolicitacoesPendentes: React.FC<{ pendentes: ParadaMotoristaSanitizada[]; totalNaVan: number; onMudou: () => void }> = ({ pendentes, totalNaVan, onMudou }) => {
  const [posicoes, setPosicoes] = useState<Record<string, number>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [convites, setConvites] = useState<Record<string, { nome: string; mensagem: string; whatsapp?: string }>>({});
  if (pendentes.length === 0 && Object.keys(convites).length === 0) return null;

  const agir = async (id: number | string, fn: () => Promise<unknown>) => {
    setOcupado(String(id)); setErro(null);
    try { await fn(); onMudou(); } catch (e: any) { setErro(e.message); } finally { setOcupado(null); }
  };

  // Depois de aprovar, o motorista já recebe a mensagem com o código para a família entrar no app.
  const aprovar = async (p: ParadaMotoristaSanitizada, pos: number) => {
    const id = String(p.parada_id);
    setOcupado(id); setErro(null);
    try {
      await TransportRepository.confirmarAluno(p.parada_id, pos);
      try {
        const c = await TransportRepository.obterConviteDoAluno(p.parada_id);
        if (c.disponivel && c.mensagem) setConvites((m) => ({ ...m, [id]: { nome: p.nome_completo_para_chamada || p.nome_aluno_sanitizado, mensagem: c.mensagem!, whatsapp: c.whatsapp } }));
      } catch { /* o convite também fica no cartão do aluno */ }
      onMudou();
    } catch (e: any) { setErro(e.message); } finally { setOcupado(null); }
  };

  return (
    <section aria-label="Solicitações de novos alunos" className="bg-amber-400/10 border border-amber-400/40 rounded-2xl p-4 space-y-3">
      {Object.entries(convites).map(([id, c]) => (
        <div key={id} className="bg-emerald-500/10 border border-emerald-400/40 rounded-xl p-3">
          <MensagemFamilia titulo={`${c.nome} aprovado. Envie o convite para a família entrar no app.`} whatsapp={c.whatsapp} mensagem={c.mensagem}
            onFechar={() => setConvites((m) => { const n = { ...m }; delete n[id]; return n; })} />
        </div>
      ))}
      {pendentes.length > 0 && <h3 className="text-sm font-bold text-amber-200">Novos alunos aguardando ({pendentes.length})</h3>}
      {pendentes.map((p) => {
        const id = String(p.parada_id);
        const pos = posicoes[id] ?? totalNaVan + 1;
        return (
          <div key={id} className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2">
            <div className="text-xs text-slate-200">
              <strong>{p.nome_completo_para_chamada || p.nome_aluno_sanitizado}</strong>
              <div className="text-slate-400">{p.endereco_mascarado}</div>
              <div className="text-slate-500">{p.escola_nome ? `${p.escola_nome} · ` : ''}{p.turno ? `${p.turno === 'MANHA' ? 'manhã' : p.turno === 'NOITE' ? 'noite' : 'tarde'} · ` : ''}entra {p.escola_entrada || '--:--'}, sai {p.escola_saida || '--:--'}</div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-[11px] text-slate-300 flex items-center gap-1.5">
                Lugar na van
                <select
                  value={pos}
                  onChange={(e) => setPosicoes({ ...posicoes, [id]: Number(e.target.value) })}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs min-h-[44px]"
                >
                  {Array.from({ length: totalNaVan + 1 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n}º{n === totalNaVan + 1 ? ' (no fim)' : ''}</option>
                  ))}
                </select>
              </label>
              <button type="button" disabled={ocupado === id} onClick={() => aprovar(p, pos)} className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold min-h-[44px] cursor-pointer disabled:opacity-50">Confirmar</button>
              <button type="button" disabled={ocupado === id} onClick={() => agir(p.parada_id, () => TransportRepository.removerAlunoDaVan(p.parada_id))} className="px-3 py-2 rounded-xl bg-slate-800 text-rose-300 text-xs font-bold min-h-[44px] cursor-pointer disabled:opacity-50">Recusar</button>
            </div>
          </div>
        );
      })}
      {erro && <p role="alert" className="text-[11px] text-rose-300">{erro}</p>}
    </section>
  );
};
