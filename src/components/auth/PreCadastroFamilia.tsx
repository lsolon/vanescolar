import React, { useEffect, useState } from 'react';
import { TransportRepository } from '../../services/api';
import type { Turno } from '../../services/api';

const campo = 'w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-base text-slate-100 focus:outline-none focus:border-amber-400 min-h-[52px]';

/** Página pública da família: preenche os dados do aluno e do responsável e dá o aceite. Sem login, sem mapa, sem GPS. */
export const PreCadastroFamilia: React.FC<{ token: string }> = ({ token }) => {
  const [estado, setEstado] = useState<'carregando' | 'invalido' | 'form' | 'enviado'>('carregando');
  const [info, setInfo] = useState<{ motorista: string; regras: string | null } | null>(null);
  const [nome, setNome] = useState('');
  const [escola, setEscola] = useState('');
  const [turno, setTurno] = useState<Turno | ''>('');
  const [nomeResp, setNomeResp] = useState('');
  const [tel, setTel] = useState('');
  const [endereco, setEndereco] = useState('');
  const [ref, setRef] = useState('');
  const [website, setWebsite] = useState(''); // isca anti-robô: fica escondida
  const [aceiteLgpd, setAceiteLgpd] = useState(false);
  const [aceiteRegras, setAceiteRegras] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    TransportRepository.abrirPreCadastro(token).then((d) => { setInfo(d); setEstado('form'); }).catch(() => setEstado('invalido'));
  }, [token]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (!turno) { setErro('Escolha o turno: manhã, tarde ou noite.'); return; }
    if (!aceiteLgpd) { setErro('Para continuar, marque a autorização do uso dos dados.'); return; }
    if (info?.regras && !aceiteRegras) { setErro('Para continuar, marque que aceita as regras do transporte.'); return; }
    setEnviando(true);
    try {
      await TransportRepository.enviarPreCadastro(token, {
        nomeAluno: nome, escola, turno, nomeResponsavel: nomeResp, telefoneResponsavel: tel, endereco, pontoReferencia: ref,
        aceiteLgpd: true, ...(info?.regras ? { aceiteRegras: true } : {}), website
      });
      setEstado('enviado');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível enviar.');
    } finally { setEnviando(false); }
  };

  const moldura = (filho: React.ReactNode) => (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex justify-center p-4">
      <div className="w-full max-w-md space-y-4 py-4">{filho}</div>
    </main>
  );

  if (estado === 'carregando') return moldura(<p className="text-center text-slate-400 pt-16">Carregando…</p>);
  if (estado === 'invalido') return moldura(
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-2 mt-10">
      <h1 className="text-xl font-black text-amber-300">Link indisponível</h1>
      <p className="text-sm text-slate-300">Este link venceu ou foi desativado. Peça um novo link ao motorista.</p>
    </div>
  );
  if (estado === 'enviado') return moldura(
    <div className="bg-emerald-500/10 border border-emerald-400/40 rounded-2xl p-6 text-center space-y-3 mt-10">
      <h1 className="text-xl font-black text-emerald-300">Pedido enviado!</h1>
      <p className="text-sm text-slate-200">O motorista vai conferir os dados e avisar você pelo WhatsApp para acompanhar a van pelo aplicativo.</p>
      <p className="text-xs text-slate-400">Você já pode fechar esta página.</p>
    </div>
  );

  return moldura(
    <form onSubmit={enviar} className="space-y-4" aria-label="Cadastro da família">
      <header className="space-y-1">
        <h1 className="text-2xl font-black text-amber-300">VanEscolar</h1>
        <p className="text-sm text-slate-300">Cadastro do transporte escolar{info?.motorista ? ` com ${info.motorista}` : ''}. Leva cerca de 2 minutos.</p>
      </header>

      <label className="block text-sm text-slate-300">Nome do aluno(a)
        <input required value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} autoComplete="off" className={`${campo} mt-1`} />
      </label>
      <label className="block text-sm text-slate-300">Escola
        <input required value={escola} onChange={(e) => setEscola(e.target.value)} maxLength={120} autoComplete="off" className={`${campo} mt-1`} />
      </label>
      <div className="space-y-1" role="group" aria-label="Turno">
        <span className="text-sm text-slate-300">Turno do aluno na van</span>
        <div className="grid grid-cols-3 gap-3">
          {([['MANHA', 'Manhã'], ['TARDE', 'Tarde'], ['NOITE', 'Noite']] as const).map(([v, n]) => (
            <button key={v} type="button" aria-pressed={turno === v} onClick={() => setTurno(v)}
              className={`py-4 rounded-xl text-base font-bold border min-h-[56px] cursor-pointer ${turno === v ? 'bg-amber-400/20 border-amber-400 text-amber-200' : 'bg-slate-900 border-slate-700 text-slate-300'}`}>{n}</button>
          ))}
        </div>
      </div>
      <label className="block text-sm text-slate-300">Endereço de embarque
        <input required value={endereco} onChange={(e) => setEndereco(e.target.value)} maxLength={200} placeholder="Rua, número, bairro" autoComplete="off" className={`${campo} mt-1`} />
      </label>
      <label className="block text-sm text-slate-300">Ponto de referência (opcional)
        <input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={120} autoComplete="off" className={`${campo} mt-1`} />
      </label>
      <label className="block text-sm text-slate-300">Seu nome (responsável)
        <input required value={nomeResp} onChange={(e) => setNomeResp(e.target.value)} maxLength={80} autoComplete="name" className={`${campo} mt-1`} />
      </label>
      <label className="block text-sm text-slate-300">Seu WhatsApp
        <input required value={tel} onChange={(e) => setTel(e.target.value)} inputMode="tel" maxLength={20} placeholder="(21) 98765-4321" autoComplete="tel" className={`${campo} mt-1`} />
      </label>

      {/* isca anti-robô: invisível para quem usa o celular */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
        <label>Não preencha<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
      </div>

      {info?.regras && (
        <section aria-label="Regras do transporte" className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-2">
          <h2 className="text-sm font-bold text-slate-100">Regras do transporte</h2>
          <p className="text-sm text-slate-300 whitespace-pre-wrap">{info.regras}</p>
          <label className="flex items-start gap-3 text-sm text-slate-200 cursor-pointer pt-1">
            <input type="checkbox" checked={aceiteRegras} onChange={(e) => setAceiteRegras(e.target.checked)} className="mt-0.5 w-6 h-6 shrink-0" />
            <span>Li e aceito as regras do transporte escolar.</span>
          </label>
        </section>
      )}

      <label className="flex items-start gap-3 text-sm text-slate-200 cursor-pointer">
        <input type="checkbox" checked={aceiteLgpd} onChange={(e) => setAceiteLgpd(e.target.checked)} className="mt-0.5 w-6 h-6 shrink-0" />
        <span>Autorizo o uso dos dados do aluno e os meus (nome, endereço e telefone) somente para o transporte escolar. Li os{' '}
          <a href="/termos.html" target="_blank" rel="noreferrer" className="underline text-amber-300">Termos de Uso</a> e a{' '}
          <a href="/privacidade.html" target="_blank" rel="noreferrer" className="underline text-amber-300">Política de Privacidade</a>.</span>
      </label>

      {erro && <p role="alert" className="text-sm text-rose-300">{erro}</p>}
      <button type="submit" disabled={enviando} className="w-full py-4 rounded-xl bg-amber-400 text-slate-950 text-lg font-black min-h-[56px] cursor-pointer disabled:opacity-50">{enviando ? 'Enviando…' : 'Enviar cadastro'}</button>
      <p className="text-[11px] text-slate-500 text-center">Seus dados ficam só com o motorista e o aplicativo. Nada é mostrado a outras famílias.</p>
    </form>
  );
};
