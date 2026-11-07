import React, { useState } from 'react';
import { TransportRepository, FilhoResumo } from '../../services/api';
import { CampoHora } from '../shared/CampoHora';

type Motorista = { id: number; nome: string };
const campo = 'w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-cyan-400 min-h-[44px]';

/** Escolha do motorista: já vinculados (sem pedir o código de novo) ou um código novo. */
const EscolhaMotorista: React.FC<{
  motoristas: Motorista[];
  motoristaId: number | '';
  setMotoristaId: (v: number | '') => void;
  codigo: string;
  setCodigo: (v: string) => void;
}> = ({ motoristas, motoristaId, setMotoristaId, codigo, setCodigo }) => {
  const usandoCodigo = motoristas.length === 0 || motoristaId === '';
  return (
    <div className="space-y-2">
      {motoristas.length > 0 && (
        <label className="text-[11px] text-slate-300 block">
          Motorista
          <select value={motoristaId} onChange={(e) => setMotoristaId(e.target.value === '' ? '' : Number(e.target.value))} className={`${campo} mt-1`}>
            {motoristas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            <option value="">Outro motorista (digitar código)</option>
          </select>
        </label>
      )}
      {usandoCodigo && (
        <label className="text-[11px] text-slate-300 block">
          Código do motorista
          <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ex.: MOT-1A2B3C" autoCapitalize="characters" autoCorrect="off" className={`${campo} mt-1 font-mono tracking-wider`} />
          <span className="text-[10px] text-slate-500">Peça ao motorista. Você só digita uma vez por motorista.</span>
        </label>
      )}
    </div>
  );
};

/** Formulário para cadastrar um filho: dados, escola, horários, local de embarque e motorista. */
export const AdicionarFilho: React.FC<{ motoristas: Motorista[]; onSalvo: () => void; onCancelar?: () => void; primeiro?: boolean }> = ({ motoristas, onSalvo, onCancelar, primeiro }) => {
  const [nome, setNome] = useState('');
  const [escola, setEscola] = useState('');
  const [endereco, setEndereco] = useState('');
  const [ref, setRef] = useState('');
  const [turno, setTurno] = useState<'MANHA' | 'TARDE' | ''>('');
  const [tel, setTel] = useState('');
  const [codigo, setCodigo] = useState('');
  const [motoristaId, setMotoristaId] = useState<number | ''>(motoristas[0]?.id ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (!turno) { setErro('Escolha o turno: manhã ou tarde.'); return; }
    setSalvando(true);
    try {
      await TransportRepository.cadastrarFilho({
        nomeAluno: nome.trim(), escola: escola.trim(), endereco: endereco.trim(), pontoReferencia: ref.trim(),
        turno, telefone: tel.trim() || undefined,
        ...(motoristaId !== '' && motoristas.length > 0 ? { motoristaId } : { codigoMotorista: codigo.trim() })
      });
      onSalvo();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível cadastrar.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="space-y-3">
      <h2 className="text-base font-bold text-slate-100">{primeiro ? 'Cadastre seu filho(a)' : 'Adicionar filho(a)'}</h2>
      {primeiro && <p className="text-xs text-slate-400">Informe os dados e o código que o motorista passou. Ele confirma o lugar do seu filho na van.</p>}
      <label className="text-[11px] text-slate-300 block">Nome do filho(a)
        <input required value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} className={`${campo} mt-1`} autoComplete="off" />
      </label>
      <label className="text-[11px] text-slate-300 block">Escola
        <input required value={escola} onChange={(e) => setEscola(e.target.value)} maxLength={120} className={`${campo} mt-1`} autoComplete="off" />
      </label>
      <div className="space-y-1" role="group" aria-label="Turno">
        <span className="text-[11px] text-slate-300">Turno do seu filho(a) na van</span>
        <div className="grid grid-cols-2 gap-2">
          {([['MANHA', 'Manhã'], ['TARDE', 'Tarde']] as const).map(([v, nome]) => (
            <button key={v} type="button" aria-pressed={turno === v} onClick={() => setTurno(v)}
              className={`py-3 rounded-xl text-sm font-bold border min-h-[48px] cursor-pointer ${turno === v ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200' : 'bg-slate-900 border-slate-700 text-slate-300'}`}>{nome}</button>
          ))}
        </div>
        <span className="text-[10px] text-slate-500">Os horários de entrada e saída da escola são definidos pelo motorista.</span>
      </div>
      <label className="text-[11px] text-slate-300 block">Endereço de embarque
        <input required value={endereco} onChange={(e) => setEndereco(e.target.value)} maxLength={200} placeholder="Rua, número, bairro" className={`${campo} mt-1`} autoComplete="street-address" />
      </label>
      <label className="text-[11px] text-slate-300 block">Ponto de referência (opcional)
        <input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={120} className={`${campo} mt-1`} />
      </label>
      <label className="text-[11px] text-slate-300 block">Seu telefone / WhatsApp (opcional)
        <input value={tel} onChange={(e) => setTel(e.target.value)} inputMode="tel" maxLength={20} placeholder="(21) 98765-4321" className={`${campo} mt-1`} autoComplete="tel" />
      </label>
      <EscolhaMotorista motoristas={motoristas} motoristaId={motoristaId} setMotoristaId={setMotoristaId} codigo={codigo} setCodigo={setCodigo} />
      {erro && <p role="alert" className="text-xs text-rose-300">{erro}</p>}
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={salvando} className="flex-1 py-3 rounded-xl bg-cyan-400 text-slate-950 text-sm font-black min-h-[48px] cursor-pointer disabled:opacity-50">{salvando ? 'Enviando…' : 'Cadastrar e enviar ao motorista'}</button>
        {onCancelar && <button type="button" onClick={onCancelar} className="px-4 py-3 rounded-xl bg-slate-800 text-slate-300 text-sm font-bold min-h-[48px] cursor-pointer">Cancelar</button>}
      </div>
    </form>
  );
};

/** Barra com os filhos (quando há mais de um) e o botão de adicionar. */
export const BarraFilhos: React.FC<{ filhos: FilhoResumo[]; ativo: number | null; onEscolher: (id: number) => void; onAdicionar: () => void }> = ({ filhos, ativo, onEscolher, onAdicionar }) => (
  <nav aria-label="Filhos" className="flex items-center gap-2 overflow-x-auto pb-1">
    {filhos.map((f) => (
      <button key={f.id_aluno} type="button" aria-pressed={f.id_aluno === ativo} onClick={() => onEscolher(f.id_aluno)}
        className={`shrink-0 px-3 py-2 rounded-xl text-xs font-bold border min-h-[44px] cursor-pointer ${f.id_aluno === ativo ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200' : 'bg-slate-900 border-slate-700 text-slate-300'}`}>
        {f.nome_aluno.split(' ')[0]}
        {f.vinculo !== 'CONFIRMADO' && <span className="ml-1 text-amber-300" aria-label="aguardando">•</span>}
      </button>
    ))}
    <button type="button" onClick={onAdicionar} className="shrink-0 px-3 py-2 rounded-xl text-xs font-bold border border-dashed border-slate-600 text-slate-300 min-h-[44px] cursor-pointer">+ Filho</button>
  </nav>
);

/** Situação do vínculo do filho em foco: aguardando, recusado (trocar de motorista) e excluir. */
export const SituacaoVinculo: React.FC<{ filho: FilhoResumo; motoristas: Motorista[]; onMudou: () => void }> = ({ filho, motoristas, onMudou }) => {
  const [trocando, setTrocando] = useState(false);
  const [motoristaId, setMotoristaId] = useState<number | ''>(motoristas[0]?.id ?? '');
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const trocar = async () => {
    setErro(null); setOcupado(true);
    try {
      await TransportRepository.trocarMotoristaDoFilho(filho.id_aluno, motoristaId !== '' && motoristas.length > 0 ? { motoristaId } : { codigoMotorista: codigo.trim() });
      setTrocando(false); setCodigo(''); onMudou();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao trocar.'); } finally { setOcupado(false); }
  };
  const excluir = async () => {
    if (!window.confirm(`Excluir ${filho.nome_aluno.split(' ')[0]} do app? Isso apaga o cadastro.`)) return;
    try { await TransportRepository.excluirFilho(filho.id_aluno); onMudou(); } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao excluir.'); }
  };

  const confirmado = filho.vinculo === 'CONFIRMADO';
  return (
    <section aria-label="Motorista do filho" className={`rounded-2xl p-3 border text-xs space-y-2 ${confirmado ? 'bg-slate-900 border-slate-800' : 'bg-amber-400/10 border-amber-400/40'}`}>
      <p className="text-slate-200">
        {filho.vinculo === 'PENDENTE' && <>Aguardando {filho.motorista || 'o motorista'} confirmar o lugar de {filho.nome_aluno.split(' ')[0]} na van.</>}
        {filho.vinculo === 'RECUSADO' && <>{filho.motorista || 'O motorista'} não manteve {filho.nome_aluno.split(' ')[0]} na van. Escolha outro motorista ou exclua o cadastro.</>}
        {confirmado && <>Motorista: <strong>{filho.motorista || '—'}</strong></>}
      </p>
      <div className="flex gap-3 flex-wrap">
        <button type="button" onClick={() => setTrocando((v) => !v)} className="text-cyan-300 underline min-h-[44px] cursor-pointer">{trocando ? 'Cancelar' : 'Trocar de motorista'}</button>
        <button type="button" onClick={excluir} className="text-rose-300 underline min-h-[44px] cursor-pointer">Excluir filho</button>
      </div>
      {trocando && (
        <div className="space-y-2">
          <EscolhaMotorista motoristas={motoristas.filter((m) => m.nome !== filho.motorista || motoristas.length === 1)} motoristaId={motoristaId} setMotoristaId={setMotoristaId} codigo={codigo} setCodigo={setCodigo} />
          <button type="button" disabled={ocupado} onClick={trocar} className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 font-bold min-h-[44px] cursor-pointer disabled:opacity-50">{ocupado ? 'Enviando…' : 'Enviar ao novo motorista'}</button>
        </div>
      )}
      {erro && <p role="alert" className="text-rose-300">{erro}</p>}
    </section>
  );
};
