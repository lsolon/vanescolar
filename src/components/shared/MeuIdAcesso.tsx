import React, { useEffect, useState } from 'react';
import { TransportRepository } from '../../services/api';

/** Permite escolher um ID de acesso para entrar no app no lugar do e-mail (os dois continuam valendo). */
export const MeuIdAcesso: React.FC = () => {
  const [atual, setAtual] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [novo, setNovo] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    TransportRepository.obterConta().then((c) => { setAtual(c.loginId); setEmail(c.email); }).catch(() => {});
  }, []);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    setMsg(null);
    try {
      const id = await TransportRepository.definirMeuId(novo.trim());
      setAtual(id);
      setNovo('');
      setMsg({ ok: true, texto: 'ID salvo. Agora você pode entrar com ele ou com o e-mail.' });
    } catch (err) {
      setMsg({ ok: false, texto: err instanceof Error ? err.message : 'Não foi possível salvar o ID.' });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form onSubmit={salvar} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
      <h3 className="text-xs font-bold text-slate-200">ID de acesso</h3>
      <p className="text-[11px] text-slate-400">
        {atual ? <>Seu ID: <strong className="text-cyan-300">{atual}</strong>. </> : 'Você ainda não tem um ID. '}
        Você pode entrar no app com {atual ? 'ele' : 'um ID'} ou com o e-mail{email ? ` (${email})` : ''}.
      </p>
      <div className="flex gap-2">
        <input
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          placeholder={atual ? 'Novo ID' : 'Escolha um ID (ex.: tio.david)'}
          autoCapitalize="none"
          autoCorrect="off"
          maxLength={30}
          aria-label="ID de acesso"
          className="flex-1 min-w-0 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
        />
        <button type="submit" disabled={salvando || novo.trim().length < 3} className="px-3 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-bold disabled:opacity-50 cursor-pointer min-h-[44px]">
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
      <p className="text-[10px] text-slate-500">3 a 30 caracteres: letras minúsculas, números, ponto, traço ou sublinhado.</p>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-[11px] ${msg.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{msg.texto}</p>}
    </form>
  );
};
