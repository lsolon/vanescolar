import React, { useEffect, useState } from 'react';
import { TransportRepository } from '../../services/api';
import type { Turno, EstadoPreCadastro } from '../../services/api';
import { SeletorLocal, LocalMarcado } from '../shared/SeletorLocal';

const campo = 'w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-amber-400 min-h-[44px]';
const linkWhats = (whatsapp: string | undefined, mensagem: string) => `https://wa.me/${whatsapp || ''}?text=${encodeURIComponent(mensagem)}`;

/** Mensagem pronta para a família: abrir o WhatsApp, copiar ou fechar. */
export const MensagemFamilia: React.FC<{ whatsapp?: string; mensagem: string; titulo?: string; onFechar?: () => void }> = ({ whatsapp, mensagem, titulo, onFechar }) => {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => { try { await navigator.clipboard.writeText(mensagem); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* sem permissão */ } };
  return (
    <div className="space-y-2">
      {titulo && <p className="text-sm font-bold text-emerald-300">{titulo}</p>}
      <pre className="whitespace-pre-wrap text-[11px] text-slate-200 bg-slate-950 border border-slate-800 rounded-xl p-3 font-sans">{mensagem}</pre>
      <div className="flex gap-2 flex-wrap">
        <a href={linkWhats(whatsapp, mensagem)} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold min-h-[44px] inline-flex items-center">Enviar no WhatsApp</a>
        <button type="button" onClick={copiar} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold min-h-[44px] cursor-pointer">{copiado ? 'Copiado!' : 'Copiar mensagem'}</button>
        {onFechar && <button type="button" onClick={onFechar} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold min-h-[44px] cursor-pointer">Fechar</button>}
      </div>
    </div>
  );
};

/** Convite de uma família que ainda não se vinculou: reenviar a mensagem com o código. */
export const ConviteFamilia: React.FC<{ paradaId: number | string }> = ({ paradaId }) => {
  const [dados, setDados] = useState<{ disponivel: boolean; mensagem?: string; whatsapp?: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const abrir = async () => {
    setErro(null);
    try { setDados(await TransportRepository.obterConviteDoAluno(paradaId)); } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao carregar.'); }
  };
  if (!dados) return (
    <div>
      <button type="button" onClick={abrir} className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-emerald-200 text-[11px] font-bold min-h-[36px] cursor-pointer">Convite da família</button>
      {erro && <p role="alert" className="text-[11px] text-rose-300 mt-1">{erro}</p>}
    </div>
  );
  return dados.disponivel && dados.mensagem
    ? <MensagemFamilia whatsapp={dados.whatsapp} mensagem={dados.mensagem} onFechar={() => setDados(null)} />
    : <p className="text-[11px] text-slate-400">A família já se vinculou ao aluno. <button type="button" onClick={() => setDados(null)} className="underline cursor-pointer">Fechar</button></p>;
};

/** O motorista cadastra o aluno de uma vez, com os dados que a família passou. Ao salvar, sai a mensagem pronta de WhatsApp. */
export const NovoAlunoMotorista: React.FC<{ onCriado: () => void }> = ({ onCriado }) => {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [escola, setEscola] = useState('');
  const [turno, setTurno] = useState<Turno | ''>('');
  const [nomeResp, setNomeResp] = useState('');
  const [tel, setTel] = useState('');
  const [endereco, setEndereco] = useState('');
  const [ref, setRef] = useState('');
  const [marcarMapa, setMarcarMapa] = useState(false);
  const [local, setLocal] = useState<LocalMarcado | null>(null);
  const [autorizou, setAutorizou] = useState(false);
  const [escolas, setEscolas] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<{ whatsapp: string; mensagem: string; avisos: string[] } | null>(null);

  useEffect(() => { if (aberto) TransportRepository.obterEscolas().then((l) => setEscolas(l.map((e) => e.nome))).catch(() => {}); }, [aberto]);

  const limpar = () => { setNome(''); setEscola(''); setTurno(''); setNomeResp(''); setTel(''); setEndereco(''); setRef(''); setMarcarMapa(false); setLocal(null); setAutorizou(false); setErro(null); };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (!turno) { setErro('Escolha o turno: manhã ou tarde.'); return; }
    if (!autorizou) { setErro('Confirme que o responsável autorizou o uso dos dados.'); return; }
    setSalvando(true);
    try {
      const r = await TransportRepository.cadastrarAlunoPeloMotorista({
        nomeAluno: nome.trim(), escola: escola.trim(), turno, nomeResponsavel: nomeResp.trim(), telefoneResponsavel: tel.trim(),
        endereco: endereco.trim(), pontoReferencia: ref.trim() || undefined, autorizacaoResponsavel: true,
        ...(marcarMapa && local ? { latitude: local.latitude, longitude: local.longitude } : {})
      });
      const avisos: string[] = [];
      if (r.semHorarioDaEscola) avisos.push('Falta definir os horários dessa escola e turno (Ajustes → Horários da escola, por turno).');
      if (r.semPontoNoMapa) avisos.push('Falta marcar o ponto de embarque no mapa (toque em "Marcar local de embarque" no cartão do aluno).');
      setResultado({ whatsapp: r.whatsapp, mensagem: r.mensagem, avisos });
      limpar(); onCriado();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível cadastrar.');
    } finally { setSalvando(false); }
  };

  if (resultado) return (
    <section aria-label="Aluno cadastrado" className="bg-emerald-500/10 border border-emerald-400/40 rounded-2xl p-4 space-y-3">
      <MensagemFamilia titulo="Aluno cadastrado. Envie a mensagem para a família." whatsapp={resultado.whatsapp} mensagem={resultado.mensagem} />
      {resultado.avisos.length > 0 && (
        <ul className="text-[11px] text-amber-200 space-y-1 list-disc pl-4">{resultado.avisos.map((a) => <li key={a}>{a}</li>)}</ul>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={() => { setResultado(null); setAberto(true); }} className="px-4 py-2 rounded-xl bg-amber-400 text-slate-950 text-xs font-bold min-h-[44px] cursor-pointer">Cadastrar outro aluno</button>
        <button type="button" onClick={() => { setResultado(null); setAberto(false); }} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold min-h-[44px] cursor-pointer">Concluir</button>
      </div>
    </section>
  );

  if (!aberto) return (
    <button type="button" onClick={() => setAberto(true)} className="w-full py-3 rounded-2xl bg-amber-400 text-slate-950 text-sm font-black min-h-[48px] cursor-pointer">+ Cadastrar aluno</button>
  );

  return (
    <form onSubmit={enviar} aria-label="Cadastrar aluno" className="bg-slate-900 border border-amber-400/30 rounded-2xl p-4 space-y-3">
      <h3 className="text-sm font-bold text-amber-200">Cadastrar aluno</h3>
      <p className="text-[11px] text-slate-400">Preencha com o que a família passou. Ao salvar, o app monta a mensagem de WhatsApp com o código para ela acompanhar a van.</p>
      <label className="text-[11px] text-slate-300 block">Nome do aluno
        <input required value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} autoComplete="off" className={`${campo} mt-1`} />
      </label>
      <label className="text-[11px] text-slate-300 block">Escola
        <input required value={escola} onChange={(e) => setEscola(e.target.value)} maxLength={120} list="escolas-do-motorista" autoComplete="off" className={`${campo} mt-1`} />
        <datalist id="escolas-do-motorista">{escolas.map((n) => <option key={n} value={n} />)}</datalist>
      </label>
      <div className="space-y-1" role="group" aria-label="Turno">
        <span className="text-[11px] text-slate-300">Turno</span>
        <div className="grid grid-cols-2 gap-2">
          {([['MANHA', 'Manhã'], ['TARDE', 'Tarde']] as const).map(([v, n]) => (
            <button key={v} type="button" aria-pressed={turno === v} onClick={() => setTurno(v)}
              className={`py-3 rounded-xl text-sm font-bold border min-h-[48px] cursor-pointer ${turno === v ? 'bg-amber-400/20 border-amber-400 text-amber-200' : 'bg-slate-950 border-slate-700 text-slate-300'}`}>{n}</button>
          ))}
        </div>
      </div>
      <label className="text-[11px] text-slate-300 block">Nome do responsável
        <input required value={nomeResp} onChange={(e) => setNomeResp(e.target.value)} maxLength={80} autoComplete="off" className={`${campo} mt-1`} />
      </label>
      <label className="text-[11px] text-slate-300 block">WhatsApp do responsável
        <input required value={tel} onChange={(e) => setTel(e.target.value)} inputMode="tel" maxLength={20} placeholder="(21) 98765-4321" autoComplete="off" className={`${campo} mt-1`} />
      </label>
      <label className="text-[11px] text-slate-300 block">Endereço de embarque
        <input required value={endereco} onChange={(e) => setEndereco(e.target.value)} maxLength={200} placeholder="Rua, número, bairro" autoComplete="off" className={`${campo} mt-1`} />
      </label>
      <label className="text-[11px] text-slate-300 block">Ponto de referência (opcional)
        <input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={120} autoComplete="off" className={`${campo} mt-1`} />
      </label>
      <div className="space-y-2">
        <button type="button" onClick={() => setMarcarMapa((v) => !v)} className="text-[11px] text-amber-300 underline cursor-pointer min-h-[36px]">{marcarMapa ? 'Marcar o ponto depois' : 'Marcar o ponto de embarque no mapa agora (opcional)'}</button>
        {marcarMapa && <SeletorLocal valor={local} onChange={setLocal} />}
      </div>
      <label className="flex items-start gap-2 text-[11px] text-slate-300 cursor-pointer">
        <input type="checkbox" checked={autorizou} onChange={(e) => setAutorizou(e.target.checked)} className="mt-0.5 w-5 h-5 shrink-0" />
        <span>O responsável autorizou o uso destes dados (nome, endereço e telefone) só para o transporte escolar.</span>
      </label>
      {erro && <p role="alert" className="text-xs text-rose-300">{erro}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={salvando} className="flex-1 py-3 rounded-xl bg-amber-400 text-slate-950 text-sm font-black min-h-[48px] cursor-pointer disabled:opacity-50">{salvando ? 'Salvando…' : 'Salvar e gerar mensagem'}</button>
        <button type="button" onClick={() => { setAberto(false); limpar(); }} className="px-4 py-3 rounded-xl bg-slate-800 text-slate-300 text-sm font-bold min-h-[48px] cursor-pointer">Cancelar</button>
      </div>
    </form>
  );
};

/** Link de pré-cadastro: a família preenche sozinha, sem login, e o motorista confere e aprova. */
export const ConvidarFamilias: React.FC<{ nomeMotorista?: string }> = ({ nomeMotorista }) => {
  const [aberto, setAberto] = useState(false);
  const [est, setEst] = useState<EstadoPreCadastro | null>(null);
  const [regras, setRegras] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    TransportRepository.obterPreCadastro().then((e) => { setEst(e); setRegras(e.regras); }).catch((e) => setErro(e.message));
  }, [aberto]);

  const agir = async (fn: () => Promise<EstadoPreCadastro>, msg?: string) => {
    setOcupado(true); setErro(null); setOk(null);
    try { const e = await fn(); setEst(e); setRegras(e.regras); if (msg) setOk(msg); } catch (e) { setErro(e instanceof Error ? e.message : 'Falha.'); } finally { setOcupado(false); }
  };
  const url = est?.link?.url;
  const mensagem = url ? `Olá! Aqui é ${nomeMotorista?.split(' ')[0] || 'o motorista'} do transporte escolar. Para cadastrar seu filho(a), preencha este formulário rápido pelo celular:\n${url}` : '';
  const copiar = async () => { if (!url) return; try { await navigator.clipboard.writeText(url); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* sem permissão */ } };

  if (!aberto) return (
    <button type="button" onClick={() => setAberto(true)} className="w-full py-3 rounded-2xl bg-slate-800 border border-amber-400/40 text-amber-200 text-sm font-bold min-h-[48px] cursor-pointer">Enviar formulário de cadastro para a família</button>
  );

  return (
    <section aria-label="Formulário de cadastro para a família" className="bg-slate-900 border border-amber-400/30 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-amber-200">Formulário de cadastro para a família</h3>
        <button type="button" onClick={() => setAberto(false)} className="text-[11px] text-slate-400 underline cursor-pointer min-h-[36px]">Fechar</button>
      </div>
      <p className="text-[11px] text-slate-400">A família abre o link no celular, sem criar conta, preenche os dados do aluno e dá o aceite. O pedido aparece aqui como "Novo aluno aguardando" para você conferir e aprovar.</p>

      {est?.link ? (
        <div className="space-y-2">
          <p className="font-mono text-[11px] text-slate-200 bg-slate-950 border border-slate-800 rounded-xl p-2 break-all select-all">{url}</p>
          <p className="text-[11px] text-slate-500">Vale até {new Date(est.link.expiraEm).toLocaleDateString('pt-BR')} · {est.link.envios} de {est.link.maxEnvios} envios</p>
          <div className="flex gap-2 flex-wrap">
            <a href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold min-h-[44px] inline-flex items-center">Enviar no WhatsApp</a>
            <button type="button" onClick={copiar} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold min-h-[44px] cursor-pointer">{copiado ? 'Copiado!' : 'Copiar link'}</button>
            <button type="button" disabled={ocupado} onClick={() => { if (window.confirm('Desativar o link? Quem ainda não preencheu precisará de um novo link.')) agir(() => TransportRepository.desativarLinkPreCadastro(), 'Link desativado.'); }} className="px-4 py-2 rounded-xl bg-slate-800 text-rose-300 text-xs font-bold min-h-[44px] cursor-pointer disabled:opacity-50">Desativar</button>
          </div>
          <button type="button" disabled={ocupado} onClick={() => { if (window.confirm('Gerar um link novo? O link anterior deixa de valer.')) agir(() => TransportRepository.gerarLinkPreCadastro(), 'Link novo gerado. O anterior não vale mais.'); }} className="text-[11px] text-slate-400 underline cursor-pointer min-h-[36px]">Gerar link novo</button>
        </div>
      ) : (
        <button type="button" disabled={ocupado} onClick={() => agir(() => TransportRepository.gerarLinkPreCadastro())} className="px-4 py-3 rounded-xl bg-amber-400 text-slate-950 text-sm font-black min-h-[48px] cursor-pointer disabled:opacity-50">Gerar link do formulário</button>
      )}

      <div className="space-y-2 pt-1">
        <label className="text-[11px] text-slate-300 block">Regras do transporte (a família precisa aceitar)
          <textarea value={regras} onChange={(e) => setRegras(e.target.value)} maxLength={800} rows={5}
            placeholder="Ex.: horários combinados, tolerância de espera, quem pode receber o aluno, avisar ausência com antecedência…"
            className={`${campo} mt-1 min-h-[110px]`} />
        </label>
        <p className="text-[10px] text-slate-500">Opcional. Se você escrever, o formulário pede o aceite e o app registra a data. Quem já preencheu mantém o texto que aceitou.</p>
        <button type="button" disabled={ocupado || regras.trim() === (est?.regras ?? '')} onClick={() => agir(() => TransportRepository.salvarRegrasServico(regras), 'Regras salvas.')} className="px-4 py-2 rounded-xl bg-amber-400/20 border border-amber-400/40 text-amber-200 text-xs font-bold min-h-[44px] cursor-pointer disabled:opacity-50">Salvar regras</button>
      </div>
      {erro && <p role="alert" className="text-[11px] text-rose-300">{erro}</p>}
      {ok && <p role="status" className="text-[11px] text-emerald-300">{ok}</p>}
    </section>
  );
};
