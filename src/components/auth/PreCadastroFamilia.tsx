import React, { useEffect, useId, useState } from 'react';
import { TransportRepository } from '../../services/api';
import type { Turno } from '../../services/api';

/**
 * Ficha de adesão da família (página pública, sem login). Um formulário só, com dois jeitos de aparecer:
 * no celular, passo a passo (5 etapas, uma coisa por vez); em tela grande, a ficha inteira em uma página.
 * Os dois usam o mesmo estado, a mesma validação e o mesmo envio. Sem mapa, sem GPS.
 */

interface Autorizado { nome: string; tel: string }
interface AlunoForm { chave: number; nome: string; nasc: string; serie: string; escola: string; turno: Turno | ''; endereco: string; ref: string; aut: Autorizado[]; saude: string }
let proximaChave = 1;
const alunoVazio = (base?: Partial<AlunoForm>): AlunoForm => ({ chave: proximaChave++, nome: '', nasc: '', serie: '', escola: '', turno: '', endereco: '', ref: '', aut: [{ nome: '', tel: '' }, { nome: '', tel: '' }], saude: '', ...base });
const MAX_ALUNOS = 6;
const PARENTESCOS = ['Mãe', 'Pai', 'Avó / Avô', 'Tutor(a) legal', 'Outro responsável legal'];
const ETAPAS = ['Quem é o responsável?', 'Quem vai na van?', 'Cuidados com o aluno', 'Crie seu acesso', 'Confirme e aceite'];

const campoCls = 'w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-base text-slate-100 focus:outline-none focus:border-amber-400 min-h-[52px]';

// ---- Máscaras e conferências simples (o servidor confere tudo de novo) ----
const soDigitos = (v: string) => v.replace(/\D/g, '');
const mascaraCpf = (v: string) => { const d = soDigitos(v).slice(0, 11); return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2'); };
const mascaraData = (v: string) => { const d = soDigitos(v).slice(0, 8); return d.replace(/^(\d{2})(\d)/, '$1/$2').replace(/^(\d{2})\/(\d{2})(\d)/, '$1/$2/$3'); };
const cpfOk = (v: string) => {
  const d = soDigitos(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dig = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dig(9) === Number(d[9]) && dig(10) === Number(d[10]);
};
const telOk = (v: string) => { let d = soDigitos(v); if (d.length >= 12 && d.startsWith('55')) d = d.slice(2); return d.length === 10 || d.length === 11; };
const dataOk = (v: string) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (!m) return false;
  const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(a, mes - 1, d);
  return dt.getFullYear() === a && dt.getMonth() === mes - 1 && dt.getDate() === d && dt.getTime() <= Date.now() && a >= new Date().getFullYear() - 100;
};
const idadeDe = (v: string): number | null => {
  if (!dataOk(v)) return null;
  const [d, m, a] = v.split('/').map(Number);
  const h = new Date();
  let i = h.getFullYear() - a;
  if (h.getMonth() + 1 < m || (h.getMonth() + 1 === m && h.getDate() < d)) i--;
  return i;
};

/** true quando a tela é larga o bastante para a ficha única (a partir de 900 px). */
const useTelaGrande = () => {
  const consulta = '(min-width: 900px)';
  const [grande, setGrande] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(consulta).matches);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(consulta);
    const f = () => setGrande(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return grande;
};

const Campo: React.FC<{ rotulo: string; valor: string; onChange: (v: string) => void; type?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']; autoComplete?: string; maxLength?: number; placeholder?: string; ajuda?: string; opcional?: boolean }> = ({ rotulo, valor, onChange, type = 'text', inputMode, autoComplete = 'off', maxLength, placeholder, ajuda, opcional }) => {
  const id = useId();
  return (
    <div className="space-y-1 min-w-0">
      <label htmlFor={id} className="block text-sm text-slate-300">{rotulo}{opcional ? <span className="text-slate-500"> (opcional)</span> : null}</label>
      <input id={id} type={type} value={valor} onChange={(e) => onChange(e.target.value)} inputMode={inputMode} autoComplete={autoComplete} maxLength={maxLength} placeholder={placeholder} className={campoCls} />
      {ajuda && <p className="text-xs text-slate-500">{ajuda}</p>}
    </div>
  );
};

const Aceite: React.FC<{ marcado: boolean; onChange: (v: boolean) => void; children: React.ReactNode }> = ({ marcado, onChange, children }) => (
  <label className="flex items-start gap-3 text-sm text-slate-200 cursor-pointer rounded-xl border border-slate-700 p-3">
    <input type="checkbox" checked={marcado} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 w-6 h-6 shrink-0" />
    <span className="space-y-1">{children}</span>
  </label>
);

export const PreCadastroFamilia: React.FC<{ token: string }> = ({ token }) => {
  const grande = useTelaGrande();
  const [estado, setEstado] = useState<'carregando' | 'invalido' | 'form' | 'enviado'>('carregando');
  const [info, setInfo] = useState<{ motorista: string; regras: string | null } | null>(null);
  const [etapa, setEtapa] = useState(0);
  // Responsável (uma vez só)
  const [nomeResp, setNomeResp] = useState('');
  const [cpf, setCpf] = useState('');
  const [parentesco, setParentesco] = useState('');
  const [tel, setTel] = useState('');
  const [endResp, setEndResp] = useState('');
  const [emergNome, setEmergNome] = useState('');
  const [emergTel, setEmergTel] = useState('');
  const [financeiro, setFinanceiro] = useState(true);
  // Alunos (irmãos no mesmo envio)
  const [alunos, setAlunos] = useState<AlunoForm[]>([alunoVazio()]);
  // Acesso
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [senha2, setSenha2] = useState('');
  // Aceites
  const [aceiteRegras, setAceiteRegras] = useState(false);
  const [aceiteLgpd, setAceiteLgpd] = useState(false);
  const [aceiteSaude, setAceiteSaude] = useState(false);
  const [avisosWhats, setAvisosWhats] = useState(false);
  const [declaro, setDeclaro] = useState(false);
  const [website, setWebsite] = useState(''); // isca anti-robô: fica escondida
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [qtdEnviada, setQtdEnviada] = useState(1);

  const mudar = (chave: number, nome: keyof AlunoForm, valor: string) => setAlunos((l) => l.map((a) => (a.chave === chave ? { ...a, [nome]: valor } : a)));
  const mudarAut = (chave: number, i: number, nome: keyof Autorizado, valor: string) => setAlunos((l) => l.map((a) => (a.chave === chave ? { ...a, aut: a.aut.map((x, j) => (j === i ? { ...x, [nome]: valor } : x)) } : a)));
  // O próximo aluno já vem com escola, endereço e referência do anterior (irmãos costumam ser iguais).
  const adicionar = () => setAlunos((l) => l.length >= MAX_ALUNOS ? l : [...l, alunoVazio({ escola: l[l.length - 1].escola, endereco: l[l.length - 1].endereco, ref: l[l.length - 1].ref })]);
  const remover = (chave: number) => setAlunos((l) => l.filter((a) => a.chave !== chave));
  const temSaude = alunos.some((a) => a.saude.trim().length > 0);

  useEffect(() => {
    TransportRepository.abrirPreCadastro(token).then((d) => { setInfo(d); setEstado('form'); }).catch(() => setEstado('invalido'));
  }, [token]);

  // ---- Validação por etapa (a mesma no celular e na ficha única) ----
  const quem = (i: number) => (alunos.length > 1 ? `Aluno ${i + 1}: ` : '');
  const validar = (n: number): string | null => {
    if (n === 0) {
      if (nomeResp.trim().length < 2) return 'Informe o seu nome completo.';
      if (!cpfOk(cpf)) return 'CPF inválido. Confira os 11 números.';
      if (!parentesco) return 'Escolha o parentesco com o aluno.';
      if (!telOk(tel)) return 'Informe o seu WhatsApp com DDD.';
      if (endResp.trim().length < 8) return 'Informe o seu endereço completo (para o contrato).';
      if (emergNome.trim().length < 2 || !telOk(emergTel)) return 'Informe o nome e o telefone com DDD de um contato de emergência.';
    }
    if (n === 1) {
      for (let i = 0; i < alunos.length; i++) {
        const a = alunos[i];
        if (a.nome.trim().length < 2) return `${quem(i)}Informe o nome do aluno.`;
        if (!dataOk(a.nasc)) return `${quem(i)}Informe a data de nascimento (dd/mm/aaaa).`;
        if (a.serie.trim().length < 1) return `${quem(i)}Informe a série ou o ano.`;
        if (a.escola.trim().length < 2) return `${quem(i)}Informe a escola.`;
        if (!a.turno) return `${quem(i)}Escolha o turno: manhã, tarde ou noite.`;
        if (a.endereco.trim().length < 3) return `${quem(i)}Informe o endereço de embarque.`;
      }
    }
    if (n === 2) {
      for (let i = 0; i < alunos.length; i++) {
        for (const x of alunos[i].aut) {
          const vazio = !x.nome.trim() && !x.tel.trim();
          if (!vazio && (x.nome.trim().length < 2 || !telOk(x.tel))) return `${quem(i)}Pessoa autorizada: informe o nome e o telefone com DDD, ou deixe em branco.`;
        }
      }
    }
    if (n === 3) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return 'Informe um e-mail válido. Ele será o seu usuário.';
      if (senha.length < 10) return 'A senha deve ter no mínimo 10 caracteres.';
      if (senha !== senha2) return 'As senhas não são iguais.';
    }
    if (n === 4) {
      if (info?.regras && !aceiteRegras) return 'Para continuar, aceite as regras do transporte.';
      if (!aceiteLgpd) return 'Para continuar, marque a autorização do uso dos dados.';
      if (temSaude && !aceiteSaude) return 'Para guardar as informações de saúde, marque o consentimento específico. Ou apague o campo de saúde.';
      if (!declaro) return 'Confirme que você é o responsável legal e que as informações são verdadeiras.';
    }
    return null;
  };

  const continuar = () => {
    const e = validar(etapa);
    if (e) { setErro(e); return; }
    setErro(null); setEtapa((n) => Math.min(n + 1, ETAPAS.length - 1));
  };
  const voltar = () => { setErro(null); setEtapa((n) => Math.max(n - 1, 0)); };

  const enviar = async (ev?: React.FormEvent) => {
    ev?.preventDefault();
    setErro(null);
    for (let n = 0; n < ETAPAS.length; n++) {
      const e = validar(n);
      if (e) { setErro(e); if (!grande) setEtapa(n); return; }
    }
    setEnviando(true);
    try {
      await TransportRepository.enviarPreCadastro(token, {
        adesao: true,
        alunos: alunos.map((a) => ({
          nomeAluno: a.nome, escola: a.escola, turno: a.turno, endereco: a.endereco, pontoReferencia: a.ref,
          dataNascimento: a.nasc, serie: a.serie,
          autorizados: a.aut.filter((x) => x.nome.trim() || x.tel.trim()).map((x) => ({ nome: x.nome, telefone: x.tel })),
          saude: a.saude
        })),
        nomeResponsavel: nomeResp, telefoneResponsavel: tel, cpf, parentesco, enderecoResponsavel: endResp,
        contatoEmergenciaNome: emergNome, contatoEmergenciaTelefone: emergTel, responsavelFinanceiro: financeiro,
        email: email.trim(), senha, senhaRepetida: senha2,
        aceiteLgpd: true, ...(info?.regras ? { aceiteRegras: true } : {}), aceiteSaude: temSaude && aceiteSaude, avisosWhatsapp: avisosWhats, declaracaoResponsavel: true, website
      });
      setQtdEnviada(alunos.length);
      setSenha(''); setSenha2('');
      setEstado('enviado');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível enviar.');
    } finally { setEnviando(false); }
  };

  const moldura = (filho: React.ReactNode, largura = 'max-w-md') => (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex justify-center p-4">
      <div className={`w-full ${largura} space-y-4 py-4`}>{filho}</div>
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
      <h1 className="text-xl font-black text-emerald-300">Adesão enviada!</h1>
      <p className="text-sm text-slate-200">{qtdEnviada > 1 ? `Recebemos os ${qtdEnviada} alunos. ` : ''}O motorista vai conferir o seu cadastro e o do aluno. Enquanto ele não aprovar, o seu acesso ao aplicativo fica bloqueado. Depois da aprovação, você entra com o e-mail e a senha que acabou de criar.</p>
      <p className="text-xs text-slate-400">Você já pode fechar esta página.</p>
    </div>
  );

  // ================= Blocos (usados nos dois jeitos de aparecer) =================
  const blocoResponsavel = (
    <div className="space-y-4">
      <Campo rotulo="Nome completo" valor={nomeResp} onChange={setNomeResp} maxLength={80} autoComplete="name" />
      <div className={grande ? 'grid grid-cols-2 gap-4' : 'space-y-4'}>
        <Campo rotulo="CPF" valor={cpf} onChange={(v) => setCpf(mascaraCpf(v))} inputMode="numeric" placeholder="000.000.000-00" autoComplete="off" />
        <div className="space-y-1 min-w-0">
          <label htmlFor="par" className="block text-sm text-slate-300">Parentesco com o aluno</label>
          <select id="par" value={parentesco} onChange={(e) => setParentesco(e.target.value)} className={campoCls}>
            <option value="">Escolha…</option>
            {PARENTESCOS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <Campo rotulo="WhatsApp (com DDD)" valor={tel} onChange={setTel} inputMode="tel" maxLength={20} placeholder="(21) 98765-4321" autoComplete="tel" />
      <Campo rotulo="Seu endereço (para o contrato)" valor={endResp} onChange={setEndResp} maxLength={200} placeholder="Rua, número, bairro, CEP" autoComplete="street-address" ajuda="Usado só no contrato. Não é o ponto de embarque do aluno." />
      <div className={grande ? 'grid grid-cols-2 gap-4' : 'space-y-4'}>
        <Campo rotulo="Contato de emergência (outra pessoa)" valor={emergNome} onChange={setEmergNome} maxLength={80} placeholder="Nome e parentesco" />
        <Campo rotulo="Telefone do contato" valor={emergTel} onChange={setEmergTel} inputMode="tel" maxLength={20} />
      </div>
      <label className="flex items-start gap-3 text-sm text-slate-200 cursor-pointer">
        <input type="checkbox" checked={financeiro} onChange={(e) => setFinanceiro(e.target.checked)} className="mt-0.5 w-6 h-6 shrink-0" />
        <span>Sou também quem paga a mensalidade.</span>
      </label>
    </div>
  );

  /** Pessoas autorizadas a receber o aluno e informações de saúde (opcionais). */
  const cuidadosDe = (al: AlunoForm, i: number) => (
    <>
      {alunos.length > 1 && <h3 className="text-sm font-bold text-amber-300">Aluno {i + 1}{al.nome.trim() ? `: ${al.nome.trim().split(/\s+/)[0]}` : ''}</h3>}
      <div className="space-y-3">
        <div>
          <p className="text-sm font-bold text-slate-100">Quem mais pode receber o aluno? <span className="font-normal text-slate-500">(opcional)</span></p>
          <p className="text-xs text-slate-500">Informe só quem concordou em ter o nome e o telefone aqui.</p>
        </div>
        {al.aut.map((x, j) => (
          <div key={j} className={grande ? 'grid grid-cols-2 gap-3' : 'space-y-3'}>
            <Campo rotulo={`Pessoa autorizada ${j + 1}`} valor={x.nome} onChange={(v) => mudarAut(al.chave, j, 'nome', v)} maxLength={80} placeholder="Nome e parentesco" />
            <Campo rotulo="Telefone" valor={x.tel} onChange={(v) => mudarAut(al.chave, j, 'tel', v)} inputMode="tel" maxLength={20} />
          </div>
        ))}
      </div>
      <div className="space-y-1">
        <label htmlFor={`saude-${al.chave}`} className="block text-sm font-bold text-slate-100">Saúde: algo que o motorista deva saber? <span className="font-normal text-slate-500">(opcional, dado sensível)</span></label>
        <p className="text-xs text-slate-500">Alergia, remédio, necessidade de apoio. Só guardamos com o seu consentimento específico, na etapa final.</p>
        <textarea id={`saude-${al.chave}`} rows={3} maxLength={300} value={al.saude} onChange={(e) => mudar(al.chave, 'saude', e.target.value)} className={`${campoCls} resize-y`} />
      </div>
    </>
  );

  const blocoAlunos = (
    <div className="space-y-4">
      {alunos.map((al, i) => {
        const idade = idadeDe(al.nasc);
        return (
          <fieldset key={al.chave} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            <legend className="px-2 text-sm font-bold text-amber-300">{alunos.length > 1 ? `Aluno ${i + 1}` : 'Aluno(a)'}</legend>
            <Campo rotulo="Nome completo do aluno" valor={al.nome} onChange={(v) => mudar(al.chave, 'nome', v)} maxLength={80} />
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Nascimento" valor={al.nasc} onChange={(v) => mudar(al.chave, 'nasc', mascaraData(v))} inputMode="numeric" placeholder="dd/mm/aaaa" />
              <Campo rotulo="Série / ano" valor={al.serie} onChange={(v) => mudar(al.chave, 'serie', v)} maxLength={40} placeholder="Ex.: 3º ano" />
            </div>
            {idade !== null && (
              <p className="text-xs rounded-lg bg-sky-500/10 border border-sky-400/30 text-sky-200 px-3 py-2">
                {idade < 18 ? 'Menor de 18 anos: você, como responsável legal, dá os aceites por ele (LGPD, art. 14).' : 'Maior de 18 anos: o próprio aluno dá os aceites e pode ser o responsável financeiro.'}
              </p>
            )}
            <Campo rotulo="Escola" valor={al.escola} onChange={(v) => mudar(al.chave, 'escola', v)} maxLength={120} />
            <div className="space-y-1" role="group" aria-label={`Turno${alunos.length > 1 ? ` do aluno ${i + 1}` : ''}`}>
              <span className="text-sm text-slate-300">Turno do aluno na van</span>
              <div className="grid grid-cols-3 gap-3">
                {([['MANHA', 'Manhã'], ['TARDE', 'Tarde'], ['NOITE', 'Noite']] as const).map(([v, n]) => (
                  <button key={v} type="button" aria-pressed={al.turno === v} onClick={() => mudar(al.chave, 'turno', v)}
                    className={`py-4 rounded-xl text-base font-bold border min-h-[56px] cursor-pointer ${al.turno === v ? 'bg-amber-400/20 border-amber-400 text-amber-200' : 'bg-slate-900 border-slate-700 text-slate-300'}`}>{n}</button>
                ))}
              </div>
            </div>
            <Campo rotulo="Endereço de embarque" valor={al.endereco} onChange={(v) => mudar(al.chave, 'endereco', v)} maxLength={200} placeholder="Rua, número, bairro" />
            <Campo rotulo="Ponto de referência" valor={al.ref} onChange={(v) => mudar(al.chave, 'ref', v)} maxLength={120} opcional />
            <p className="text-xs rounded-lg bg-amber-400/10 border border-amber-400/30 text-amber-100 px-3 py-2">O endereço do aluno fica guardado só no app do motorista. Quem acompanha pelo app não vê endereço, mapa nem localização.</p>
            {grande && <div className="space-y-4 border-t border-slate-800 pt-4">{cuidadosDe(al, i)}</div>}
            {i > 0 && (
              <button type="button" onClick={() => remover(al.chave)} className="w-full py-3 rounded-xl bg-slate-800 text-slate-300 text-sm font-bold min-h-[48px] cursor-pointer">Remover o aluno {i + 1}</button>
            )}
          </fieldset>
        );
      })}
      {alunos.length < MAX_ALUNOS && (
        <button type="button" onClick={adicionar} className="w-full py-4 rounded-xl bg-amber-400/10 border border-amber-400/50 text-amber-200 text-base font-bold min-h-[56px] cursor-pointer">+ Adicionar outro aluno (irmão)</button>
      )}
    </div>
  );

  const blocoCuidados = <div className="space-y-6">{alunos.map((al, i) => <div key={al.chave} className="space-y-4">{cuidadosDe(al, i)}</div>)}</div>;

  const blocoAcesso = (
    <div className="space-y-4">
      <div className={grande ? 'grid grid-cols-3 gap-4' : 'space-y-4'}>
        <Campo rotulo="E-mail (será o seu usuário)" valor={email} onChange={setEmail} type="email" maxLength={120} autoComplete="email" placeholder="voce@exemplo.com" />
        <Campo rotulo="Crie uma senha" valor={senha} onChange={setSenha} type="password" maxLength={128} autoComplete="new-password" ajuda="Mínimo de 10 caracteres." />
        <Campo rotulo="Repita a senha" valor={senha2} onChange={setSenha2} type="password" maxLength={128} autoComplete="new-password" />
      </div>
      <div className="rounded-xl bg-sky-500/10 border border-sky-400/30 text-sky-100 p-3 text-sm space-y-1">
        <p className="font-bold">O que você vai ver no app</p>
        <p>Se o aluno embarcou, foi entregue ou está ausente, a previsão de chegada, os horários, os avisos e a conversa com o motorista.</p>
      </div>
      <p className="text-sm rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-100 p-3"><strong>Por segurança das crianças,</strong> o app não mostra mapa nem a localização da van. O acesso é liberado quando o motorista aprovar a vaga.</p>
    </div>
  );

  const blocoAceites = (
    <div className="space-y-3">
      <div className="rounded-xl bg-sky-500/10 border border-sky-400/30 p-3 space-y-2 text-sm text-slate-100">
        <p className="font-bold text-sky-200">Seus dados, em palavras simples</p>
        <p>Usamos os dados desta ficha só para levar o aluno, falar com você, liberar o seu acesso e cobrar. Não vendemos nem repassamos a terceiros, salvo obrigação legal. O endereço do aluno só o motorista vê. Ficam guardados enquanto durar o contrato e pelo prazo exigido em lei.</p>
      </div>
      {info?.regras && (
        <section aria-label="Regras do transporte" className="bg-slate-900 border border-slate-700 rounded-xl p-3 space-y-2">
          <h2 className="text-sm font-bold text-slate-100">Regras do transporte</h2>
          <p className="text-sm text-slate-300 whitespace-pre-wrap">{info.regras}</p>
          <label className="flex items-start gap-3 text-sm text-slate-200 cursor-pointer pt-1">
            <input type="checkbox" checked={aceiteRegras} onChange={(e) => setAceiteRegras(e.target.checked)} className="mt-0.5 w-6 h-6 shrink-0" />
            <span>Li e aceito as regras do transporte escolar.</span>
          </label>
        </section>
      )}
      <Aceite marcado={aceiteLgpd} onChange={setAceiteLgpd}>
        <span className="block font-semibold">Autorizo o uso dos dados pessoais, meus e do(s) aluno(s), como explicado acima (LGPD, Lei 13.709/2018).</span>
        <span className="block text-slate-400 text-xs">Como responsável legal, autorizo o tratamento só para: levar o aluno, falar comigo sobre rotas e horários, manter o meu acesso ao app e emitir cobranças. Li os{' '}
          <a href="/termos.html" target="_blank" rel="noreferrer" className="underline text-amber-300">Termos de Uso</a> e a{' '}
          <a href="/privacidade.html" target="_blank" rel="noreferrer" className="underline text-amber-300">Política de Privacidade</a>.</span>
      </Aceite>
      {temSaude && (
        <Aceite marcado={aceiteSaude} onChange={setAceiteSaude}>
          <span className="block font-semibold">Autorizo guardar as informações de saúde do aluno, só para a segurança dele na van.</span>
          <span className="block text-slate-400 text-xs">É um dado sensível. Posso retirar este consentimento quando quiser.</span>
        </Aceite>
      )}
      <Aceite marcado={avisosWhats} onChange={setAvisosWhats}>
        <span className="block font-semibold">Quero receber avisos do transporte por WhatsApp <span className="font-normal text-slate-500">(opcional)</span></span>
      </Aceite>
      <Aceite marcado={declaro} onChange={setDeclaro}>
        <span className="block font-semibold">Declaro que sou o responsável legal pelo(s) aluno(s) menor(es), ou o próprio aluno maior de idade, e que as informações são verdadeiras.</span>
      </Aceite>
      <p className="text-xs text-slate-500">Seus direitos: você pode pedir acesso, correção ou exclusão dos dados e retirar qualquer consentimento a qualquer momento, sem custo, falando com o motorista. Guardamos a data e o texto que você aceitou.</p>
    </div>
  );

  const isca = (
    <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
      <label>Não preencha<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
    </div>
  );
  const mensagemErro = erro && <p role="alert" className="text-sm text-rose-300">{erro}</p>;
  const textoEnviar = enviando ? 'Enviando…' : alunos.length > 1 ? `Enviar adesão dos ${alunos.length} alunos` : 'Enviar adesão';

  // ================= Tela grande: ficha única =================
  if (grande) {
    const secao = (n: number, titulo: string, sub: string, filho: React.ReactNode) => (
      <section aria-label={titulo} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-5">
        <div className="flex items-start gap-3">
          <span className="shrink-0 w-8 h-8 rounded-full bg-amber-400 text-slate-950 font-black flex items-center justify-center text-sm">{n}</span>
          <div><h2 className="text-lg font-black text-slate-100">{titulo}</h2><p className="text-sm text-slate-400">{sub}</p></div>
        </div>
        {filho}
      </section>
    );
    return moldura(
      <form onSubmit={enviar} className="space-y-5" aria-label="Ficha de adesão ao transporte escolar" noValidate>
        <header className="space-y-2">
          <h1 className="text-3xl font-black text-amber-300">Ficha de adesão ao transporte escolar</h1>
          <p className="text-sm text-slate-300">{info?.motorista ? `Motorista: ${info.motorista}. ` : ''}Preencha uma única vez. Quando o motorista aprovar, o seu acesso ao app de acompanhamento é liberado. Tem mais de um filho? Cadastre todos nesta mesma ficha.</p>
        </header>
        {secao(1, 'Responsável legal', 'Quem assina a adesão, recebe os avisos e responde pelo pagamento.', blocoResponsavel)}
        {secao(2, 'Aluno(s) a transportar', 'Menor ou maior de idade. Para irmãos, use “Adicionar outro aluno”.', blocoAlunos)}
        {secao(3, 'Seu acesso ao acompanhamento', 'Cria o seu usuário. Só é liberado depois que o motorista aprovar a vaga.', blocoAcesso)}
        {secao(4, 'Aceites e consentimentos', 'Guardamos a data e o texto exato que você aceitou.', blocoAceites)}
        {isca}
        {mensagemErro}
        <button type="submit" disabled={enviando} className="w-full py-4 rounded-xl bg-amber-400 text-slate-950 text-lg font-black min-h-[56px] cursor-pointer disabled:opacity-50">{textoEnviar}</button>
        <p className="text-xs text-slate-500 text-center">Depois do envio, o motorista confirma a vaga e você entra no app com o e-mail e a senha que criou.</p>
      </form>,
      'max-w-3xl'
    );
  }

  // ================= Celular: passo a passo =================
  const ultima = etapa === ETAPAS.length - 1;
  const conteudo = [blocoResponsavel, blocoAlunos, blocoCuidados, blocoAcesso, blocoAceites][etapa];
  const sub = [
    'Seus dados, para o contrato e para os avisos do transporte.',
    'Aluno menor ou maior de idade. Tem irmãos? Adicione abaixo.',
    'Esta etapa é opcional. Você pode pular.',
    'Com este e-mail e senha você entra no app para acompanhar a van.',
    ''
  ][etapa];
  return moldura(
    <form onSubmit={(e) => { e.preventDefault(); if (ultima) enviar(); else continuar(); }} className="space-y-4" aria-label="Ficha de adesão da família" noValidate>
      <header className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-black text-amber-300">VanEscolar</h1>
          <span className="text-sm font-semibold text-slate-400">Etapa {etapa + 1} de {ETAPAS.length}</span>
        </div>
        <div className="flex gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={ETAPAS.length} aria-valuenow={etapa + 1} aria-label="Progresso">
          {ETAPAS.map((_, i) => <div key={i} className={`flex-1 h-1.5 rounded-full ${i <= etapa ? 'bg-amber-400' : 'bg-slate-700'}`} />)}
        </div>
        <h2 className="text-2xl font-black text-slate-100 pt-1">{ETAPAS[etapa]}</h2>
        {etapa === 0 && info?.motorista && <p className="text-sm text-slate-400">Cadastro do transporte escolar com {info.motorista}.</p>}
        {sub && <p className="text-sm text-slate-300">{sub}</p>}
      </header>
      {conteudo}
      {isca}
      {mensagemErro}
      <div className="flex gap-3 pt-1">
        {etapa > 0 && <button type="button" onClick={voltar} className="shrink-0 w-28 py-4 rounded-xl bg-slate-800 text-slate-200 text-base font-bold min-h-[56px] cursor-pointer">Voltar</button>}
        <button type="submit" disabled={enviando} className="flex-1 py-4 rounded-xl bg-amber-400 text-slate-950 text-lg font-black min-h-[56px] cursor-pointer disabled:opacity-50">{ultima ? textoEnviar : 'Continuar'}</button>
      </div>
      {etapa === 2 && <button type="button" onClick={() => { setErro(null); setEtapa(3); }} className="w-full py-3 text-amber-300 underline text-base font-semibold cursor-pointer">Pular esta etapa</button>}
      {ultima && <p className="text-xs text-slate-500 text-center">O motorista confirma a vaga e você entra no app com o e-mail e a senha que criou.</p>}
    </form>
  );
};
