import React, { useEffect, useState } from 'react';
import { TransportRepository } from '../../services/api';
import type { SugestaoRota, EscolaMotorista, PropostaCronograma, Viagem, ResumoViagens } from '../../services/api';
import { SeletorLocal, LocalMarcado } from '../shared/SeletorLocal';
import { CampoHora } from '../shared/CampoHora';
import type { Turno } from '../../services/api';
import { NOME_TURNO } from '../../services/api';

/** O motorista define onde fica cada escola: é o destino da barra de deslocamento do aluno a bordo. */
export const EscolasDoMotorista: React.FC<{ versao?: number }> = ({ versao }) => {
  const [escolas, setEscolas] = useState<EscolaMotorista[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [local, setLocal] = useState<LocalMarcado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [endereco, setEndereco] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [achado, setAchado] = useState<string | null>(null);

  const carregar = () => TransportRepository.obterEscolas().then(setEscolas).catch(() => {});
  useEffect(() => { carregar(); }, [versao]);

  if (escolas.length === 0) return null;

  const buscar = async () => {
    if (endereco.trim().length < 5) { setErro('Digite o endereço da escola (rua, número, bairro).'); return; }
    setBuscando(true); setErro(null); setAchado(null);
    const g = await TransportRepository.buscarEnderecoEscola(endereco);
    setBuscando(false);
    if (!g) { setErro('Não encontrei esse endereço. Toque no mapa para marcar o local da escola.'); return; }
    setLocal({ latitude: g.latitude, longitude: g.longitude });
    setAchado(g.nome);
  };

  const salvar = async (nome: string) => {
    if (!local) return;
    setSalvando(true); setErro(null);
    try { await TransportRepository.definirLocalEscola(nome, local.latitude, local.longitude); setEditando(null); setLocal(null); await carregar(); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao salvar.'); }
    finally { setSalvando(false); }
  };

  return (
    <section aria-label="Escolas" className="bg-slate-900 border border-indigo-400/30 rounded-2xl p-4 space-y-2">
      <h3 className="text-xs font-bold text-indigo-300">Local da escola</h3>
      <p className="text-[11px] text-slate-400">Depois que o aluno embarca, o responsável acompanha a van até a escola pela barra (sem mapa). Digite o endereço da escola ou marque no mapa.</p>
      <ul className="space-y-2">
        {escolas.map((e) => (
          <li key={e.nome} className="rounded-xl bg-slate-950 border border-slate-800 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-semibold text-slate-100">{e.nome}</span>
              <span className={`text-[10px] font-bold ${e.local ? 'text-emerald-400' : 'text-amber-300'}`}>{e.local ? 'Local marcado' : 'Local não marcado'}</span>
              {editando !== e.nome && (
                <button type="button" onClick={() => { setEditando(e.nome); setLocal(e.local); setErro(null); setEndereco(''); setAchado(null); }} className="px-3 py-2 rounded-xl bg-indigo-500/20 border border-indigo-400/40 text-indigo-200 text-xs font-bold min-h-[44px] cursor-pointer">
                  {e.local ? 'Alterar local' : 'Marcar local da escola'}
                </button>
              )}
            </div>
            {editando === e.nome && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input value={endereco} onChange={(ev) => setEndereco(ev.target.value)} onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); buscar(); } }}
                    placeholder="Endereço da escola (rua, número, bairro)" maxLength={200} aria-label="Endereço da escola"
                    className="flex-1 min-w-0 px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-cyan-400 min-h-[44px]" />
                  <button type="button" onClick={buscar} disabled={buscando} className="px-3 py-2 rounded-xl bg-amber-400/10 border border-amber-400/40 text-amber-200 text-xs font-bold min-h-[44px] cursor-pointer disabled:opacity-50">{buscando ? 'Buscando…' : 'Buscar no mapa'}</button>
                </div>
                {achado && <p className="text-[11px] text-emerald-300">Encontrado: {achado}. Confira no mapa e ajuste tocando, se precisar.</p>}
                <p className="text-[11px] text-slate-500">Ou toque direto no mapa (ou use o GPS no local) para marcar a escola.</p>
                <SeletorLocal valor={local} onChange={setLocal} />
                {erro && <p role="alert" className="text-[11px] text-rose-300">{erro}</p>}
                <div className="flex gap-2">
                  <button type="button" disabled={!local || salvando} onClick={() => salvar(e.nome)} className="px-3 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold min-h-[44px] cursor-pointer disabled:opacity-50">{salvando ? 'Salvando…' : 'Salvar local'}</button>
                  <button type="button" onClick={() => setEditando(null)} className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold min-h-[44px] cursor-pointer">Cancelar</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};


/** O motorista define uma vez a entrada e a saída de cada escola por turno; os alunos daquela escola e turno herdam. */
export const HorariosPorEscola: React.FC<{ versao?: number; onMudou?: () => void }> = ({ versao, onMudou }) => {
  const [escolas, setEscolas] = useState<EscolaMotorista[]>([]);
  const [nova, setNova] = useState('');
  const [editando, setEditando] = useState<{ nome: string; turno: Turno } | null>(null);
  const [entrada, setEntrada] = useState('');
  const [saida, setSaida] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = () => TransportRepository.obterEscolas().then(setEscolas).catch(() => {});
  useEffect(() => { carregar(); }, [versao]);

  const lista = [...escolas];
  const novoNome = nova.trim();
  if (novoNome.length >= 2 && !lista.some((e) => e.nome.trim().toLowerCase() === novoNome.toLowerCase())) lista.push({ nome: novoNome, local: null, horarios: {} });

  const abrir = (nome: string, turno: Turno, h?: { entrada: string; saida: string }) => {
    setEditando({ nome, turno }); setEntrada(h?.entrada || ''); setSaida(h?.saida || ''); setErro(null); setOk(null);
  };
  const salvar = async () => {
    if (!editando) return;
    setSalvando(true); setErro(null); setOk(null);
    try {
      const n = await TransportRepository.definirHorariosEscola(editando.nome, editando.turno, entrada, saida);
      setOk(n > 0 ? `Horários salvos. ${n} aluno(s) atualizado(s).` : 'Horários salvos. Os próximos alunos dessa escola e turno já entram com eles.');
      setEditando(null); setNova(''); await carregar(); onMudou?.();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao salvar.'); }
    finally { setSalvando(false); }
  };
  const remover = async (nome: string, turno: Turno) => {
    setErro(null); setOk(null);
    try { await TransportRepository.removerHorariosEscola(nome, turno); await carregar(); onMudou?.(); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao remover.'); }
  };

  return (
    <section aria-label="Horários por escola e turno" className="bg-slate-900 border border-amber-400/30 rounded-2xl p-4 space-y-3">
      <h3 className="text-xs font-bold text-amber-300">Horários da escola, por turno</h3>
      <p className="text-[11px] text-slate-400">Defina uma vez a entrada e a saída de cada escola em cada turno. Todo aluno dessa escola e turno usa esses horários, e a família não precisa digitar.</p>
      <div className="flex gap-2">
        <input value={nova} onChange={(e) => setNova(e.target.value)} maxLength={120} placeholder="Adicionar escola (nome)" aria-label="Nome da nova escola"
          className="flex-1 min-w-0 px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-400 min-h-[44px]" />
      </div>
      {lista.length === 0 && <p className="text-[11px] text-slate-500">Nenhuma escola ainda. Digite o nome acima ou cadastre um aluno.</p>}
      <ul className="space-y-2">
        {lista.map((e) => (
          <li key={e.nome} className="rounded-xl bg-slate-950 border border-slate-800 p-3 space-y-2">
            <div className="text-xs font-semibold text-slate-100">{e.nome}</div>
            {(['MANHA', 'TARDE', 'NOITE'] as Turno[]).map((t) => {
              const h = e.horarios?.[t];
              const aberto = editando?.nome === e.nome && editando.turno === t;
              return (
                <div key={t} className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11px] text-slate-300 w-14">{NOME_TURNO[t]}</span>
                    <span className={`text-[11px] font-mono flex-1 ${h ? 'text-slate-100' : 'text-slate-500'}`}>{h ? `entra ${h.entrada} · sai ${h.saida}` : 'Não definido'}</span>
                    {!aberto && <button type="button" onClick={() => abrir(e.nome, t, h)} className="px-3 py-2 rounded-xl bg-amber-400/10 border border-amber-400/40 text-amber-200 text-xs font-bold min-h-[44px] cursor-pointer">{h ? 'Alterar' : 'Definir'}</button>}
                    {!aberto && h && <button type="button" onClick={() => remover(e.nome, t)} className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold min-h-[44px] cursor-pointer">Remover</button>}
                  </div>
                  {aberto && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="text-[11px] text-slate-300 space-y-1"><span>Entrada na escola</span><CampoHora label={`Entrada ${NOME_TURNO[t]}`} value={entrada} onChange={setEntrada} horaPadrao={t === 'MANHA' ? '07' : t === 'TARDE' ? '13' : '19'} /></div>
                        <div className="text-[11px] text-slate-300 space-y-1"><span>Saída da escola</span><CampoHora label={`Saída ${NOME_TURNO[t]}`} value={saida} onChange={setSaida} horaPadrao={t === 'MANHA' ? '12' : t === 'TARDE' ? '17' : '22'} /></div>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" disabled={!entrada || !saida || salvando} onClick={salvar} className="px-3 py-2 rounded-xl bg-amber-400 text-slate-950 text-xs font-bold min-h-[44px] cursor-pointer disabled:opacity-50">{salvando ? 'Salvando…' : 'Salvar horários'}</button>
                        <button type="button" onClick={() => setEditando(null)} className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold min-h-[44px] cursor-pointer">Cancelar</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </li>
        ))}
      </ul>
      {erro && <p role="alert" className="text-[11px] text-rose-300">{erro}</p>}
      {ok && <p role="status" className="text-[11px] text-emerald-300">{ok}</p>}
    </section>
  );
};

const PARTIDA: Record<string, string> = {
  gps: 'a partir da sua posição atual',
  escola: 'a partir da escola',
  mais_distante: 'a partir do aluno mais distante da escola',
  primeira: 'a partir da primeira parada'
};

type Sent = 'IDA' | 'VOLTA';
const TEMA: Record<Sent, { nome: string; aba: string; titulo: string; borda: string; num: string; btn: string; sec: string }> = {
  IDA: { nome: 'Ida', aba: 'bg-cyan-500/20 text-cyan-200 border-cyan-400/60', titulo: 'text-cyan-300', borda: 'border-cyan-400/30', num: 'text-cyan-300', btn: 'bg-cyan-400 text-slate-950', sec: 'bg-cyan-500/15 border-cyan-400/40 text-cyan-200' },
  VOLTA: { nome: 'Volta', aba: 'bg-amber-500/20 text-amber-200 border-amber-400/60', titulo: 'text-amber-300', borda: 'border-amber-400/30', num: 'text-amber-300', btn: 'bg-amber-400 text-slate-950', sec: 'bg-amber-500/15 border-amber-400/40 text-amber-200' }
};

/** Duas rotas independentes (Ida em azul, Volta em âmbar): cada uma com sua ordem, sugestão automática e ajuste manual. */
export const RotasIdaVolta: React.FC<{ sentidoAtivo?: Sent; versao?: number; onAplicado: () => void }> = ({ sentidoAtivo = 'IDA', versao, onAplicado }) => {
  const [aba, setAba] = useState<Sent>(sentidoAtivo);
  const [sug, setSug] = useState<SugestaoRota | null>(null);
  const [ordem, setOrdem] = useState<SugestaoRota['paradas']>([]);
  const [editado, setEditado] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [prop, setProp] = useState<PropostaCronograma | null>(null);
  const [confirmaAuto, setConfirmaAuto] = useState(false);
  const [criandoAuto, setCriandoAuto] = useState(false);
  const t = TEMA[aba];

  const propor = async () => {
    setCriandoAuto(true); setErro(null); setOk(null); setProp(null);
    try { setProp(await TransportRepository.proporCronograma(aba)); setConfirmaAuto(false); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao montar o cronograma.'); setConfirmaAuto(false); }
    finally { setCriandoAuto(false); }
  };
  const fixar = async () => {
    if (!prop) return;
    setCriandoAuto(true); setErro(null);
    try {
      await TransportRepository.fixarCronograma(aba, prop.avisos.length > 0);
      setOk(`Cronograma de ${t.nome.toLowerCase()} fixado. Os responsáveis já veem os horários.`); setProp(null); await carregar('atual'); onAplicado();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao fixar.'); }
    finally { setCriandoAuto(false); }
  };

  const carregar = async (modo: 'atual' | 'sugestao') => {
    setCarregando(true); setErro(null); setOk(null);
    try {
      const s = await TransportRepository.obterSugestaoRota(aba, modo);
      setSug(s); setOrdem(s.paradas); setEditado((modo === 'sugestao' && s.mudou) || s.ordemSalva === false);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao carregar a rota.'); }
    finally { setCarregando(false); }
  };
  useEffect(() => { carregar('atual'); /* eslint-disable-next-line */ }, [aba, versao]);

  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= ordem.length) return;
    const nova = [...ordem]; [nova[i], nova[j]] = [nova[j], nova[i]]; setOrdem(nova); setEditado(true); setOk(null);
  };
  const aplicar = async () => {
    setSalvando(true); setErro(null);
    try {
      await TransportRepository.aplicarOrdemRota(ordem.map((p) => p.id), aba);
      setEditado(false); setOk(`Rota de ${t.nome.toLowerCase()} salva.`); onAplicado();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao aplicar.'); }
    finally { setSalvando(false); }
  };

  return (
    <section aria-label="Rotas de ida e volta" className={`bg-slate-900 border ${t.borda} rounded-2xl p-4 space-y-3`}>
      <div role="tablist" aria-label="Sentido da rota" className="grid grid-cols-2 gap-2">
        {(['IDA', 'VOLTA'] as Sent[]).map((sv) => (
          <button key={sv} type="button" role="tab" id={`aba-rota-${sv}`} aria-selected={aba === sv} onClick={() => setAba(sv)}
            className={`px-3 py-2 min-h-[44px] rounded-xl border text-xs font-black cursor-pointer ${aba === sv ? TEMA[sv].aba : 'bg-slate-950 border-slate-800 text-slate-400'}`}>
            {sv === 'IDA' ? '➜ ' : '↩ '}{TEMA[sv].nome}{sv === 'IDA' ? ' (casa → escola)' : ' (escola → casa)'}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-labelledby={`aba-rota-${aba}`} className="space-y-3">
        <div>
          <h3 className={`text-xs font-bold ${t.titulo}`}>Rota de {t.nome.toLowerCase()}</h3>
          {sug?.modo === 'sugestao' && sug.partida && <p className="text-[11px] text-slate-400">Ordem sugerida {PARTIDA[sug.partida] || ''}{aba === 'IDA' && sug.escolaDefinida ? ', terminando na escola' : ''}.</p>}
          {sug?.modo === 'sugestao' && typeof sug.kmSugerido === 'number' && <p className="text-[11px] text-slate-400">Distância em linha reta: ~{sug.kmSugerido} km (ordem atual: ~{sug.kmAtual} km).</p>}
          {sug?.modo !== 'sugestao' && sug?.ordemSalva === false && <p className="text-[11px] text-amber-200">A volta ainda não foi salva: por enquanto segue o inverso da ida. Ajuste com as setas e toque em Salvar para fixar.</p>}
          {sug?.modo !== 'sugestao' && sug?.ordemSalva !== false && <p className="text-[11px] text-slate-400">Ordem em uso nas próximas viagens. Use as setas ou peça uma sugestão.</p>}
        </div>
        {sug && sug.semLocal > 0 && <p className="text-[11px] text-amber-300">{sug.semLocal} aluno(s) sem local marcado ficam no fim da sugestão.</p>}
        {sug && !sug.escolaDefinida && <p className="text-[11px] text-amber-300">Marque o local da escola para a sugestão considerar o trajeto até ela.</p>}
        {ordem.length === 0 && !carregando && <p className="text-[11px] text-slate-500">Nenhum aluno confirmado nesta rota.</p>}
        <ol className="space-y-2">
          {ordem.map((p, i) => (
            <li key={p.id} className="flex items-center gap-2 rounded-xl bg-slate-950 border border-slate-800 px-3 py-2">
              <span className={`w-6 text-center text-sm font-black ${t.num}`}>{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-100 truncate">{p.nome}</p>
                <p className="text-[10px] text-slate-500 truncate">{p.fixa ? 'já atendido' : p.temLocal ? (p.endereco || '') : 'sem local marcado'}</p>
              </div>
              <button type="button" aria-label={`Subir ${p.nome}`} onClick={() => mover(i, -1)} disabled={i === 0 || p.fixa || !!ordem[i - 1]?.fixa} className="w-10 h-10 rounded-lg bg-slate-800 text-slate-200 text-sm cursor-pointer disabled:opacity-30">▲</button>
              <button type="button" aria-label={`Descer ${p.nome}`} onClick={() => mover(i, 1)} disabled={i === ordem.length - 1 || p.fixa} className="w-10 h-10 rounded-lg bg-slate-800 text-slate-200 text-sm cursor-pointer disabled:opacity-30">▼</button>
            </li>
          ))}
        </ol>
        {confirmaAuto && (
          <div role="alertdialog" aria-label="Montar cronograma" className="rounded-xl bg-slate-950 border border-amber-400/40 p-3 space-y-2">
            <p className="text-[11px] text-amber-200">Para calcular o caminho pelas ruas, o app usa o endereço de cada aluno <strong>uma única vez</strong>, apenas para achar o ponto no mapa. O endereço não fica guardado nesse serviço pelo app, e o responsável nunca vê mapa nem localização — só o horário aproximado. O app só mostra uma proposta: nada muda até você tocar em Fixar. Horários que você já fixou nunca são alterados.</p>
            <div className="flex gap-2">
              <button type="button" onClick={propor} disabled={criandoAuto} className={`px-4 py-2 rounded-xl text-xs font-black min-h-[44px] cursor-pointer disabled:opacity-50 ${t.btn}`}>{criandoAuto ? 'Calculando…' : 'Calcular proposta'}</button>
              <button type="button" onClick={() => setConfirmaAuto(false)} disabled={criandoAuto} className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold min-h-[44px] cursor-pointer">Cancelar</button>
            </div>
          </div>
        )}
        {prop && prop.sentido === aba && (
          <div className="rounded-xl bg-slate-950 border border-emerald-400/30 p-3 space-y-2">
            <p className="text-[11px] font-bold text-emerald-300">
              {prop.modo === 'montar' ? 'Proposta de cronograma' : prop.modo === 'encaixar' ? 'Proposta para encaixar alunos novos (horários fixos não mudam)' : 'Conferência do cronograma fixado'}
              {' — '}{aba === 'IDA' ? `chegada à escola até ${prop.limite}` : `chegue à escola até ${prop.chegarEscolaAte ?? '--:--'} · primeiro desembarque a partir de ${prop.limite}`}
            </p>
            <ol className="text-[11px] text-slate-300 space-y-0.5">
              {prop.paradas.map((p, i) => <li key={p.id}>{i + 1}. <strong>{p.horario}</strong> — {p.nome} <span className="text-slate-500">{p.fixo ? '(horário já fixado)' : '(novo horário)'}</span></li>)}
            </ol>
            {prop.avisos.map((a, i) => <p key={i} role="alert" className="text-[11px] text-rose-300">⚠ {a}</p>)}
            {prop.modo !== 'verificar' && (
              <div className="flex gap-2 flex-wrap">
                <button type="button" onClick={fixar} disabled={criandoAuto} className={`px-4 py-2 rounded-xl text-xs font-black min-h-[44px] cursor-pointer disabled:opacity-50 ${t.btn}`}>{criandoAuto ? 'Fixando…' : prop.avisos.length ? 'Fixar mesmo assim' : 'Fixar cronograma'}</button>
                <button type="button" onClick={() => setProp(null)} disabled={criandoAuto} className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold min-h-[44px] cursor-pointer">Descartar</button>
              </div>
            )}
            <p className="text-[11px] text-amber-200">Os tempos de trajeto são os de via livre. Na primeira semana, confira se os horários batem com a realidade e, se precisar, ajuste o horário de cada aluno à mão.</p>
          </div>
        )}
        {erro && <p role="alert" className="text-[11px] text-rose-300">{erro}</p>}
        {ok && <p role="status" className="text-[11px] text-emerald-300">{ok}</p>}
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={() => carregar('sugestao')} disabled={carregando || ordem.length < 2} className={`px-3 py-2 rounded-xl border text-xs font-bold min-h-[44px] cursor-pointer disabled:opacity-50 ${t.sec}`}>{carregando ? 'Calculando…' : 'Sugerir rota'}</button>
          <button type="button" onClick={aplicar} disabled={salvando || !editado} className={`px-4 py-2 rounded-xl text-xs font-black min-h-[44px] cursor-pointer disabled:opacity-40 ${t.btn}`}>{salvando ? 'Salvando…' : 'Salvar esta ordem'}</button>
          <button type="button" onClick={() => setConfirmaAuto(true)} disabled={criandoAuto || ordem.length < 1 || confirmaAuto} className={`px-3 py-2 rounded-xl border text-xs font-bold min-h-[44px] cursor-pointer disabled:opacity-50 ${t.sec}`}>Montar / encaixar cronograma (pelas ruas)</button>
          {editado && <button type="button" onClick={() => carregar('atual')} className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold min-h-[44px] cursor-pointer">Descartar</button>}
        </div>
      </div>
    </section>
  );
};

/** O motorista cria as viagens do dia ("Manhã 1", "Manhã 2"...): cada uma tem turno e escola principal. Cada aluno fica fixo em uma viagem. */
export const ViagensDoMotorista: React.FC<{ versao?: number; onMudou?: () => void }> = ({ versao, onMudou }) => {
  const [dados, setDados] = useState<ResumoViagens>({ viagens: [], semViagem: 0 });
  const [escolas, setEscolas] = useState<string[]>([]);
  const [aberto, setAberto] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [turno, setTurno] = useState<Turno | ''>('');
  const [escola, setEscola] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [apagando, setApagando] = useState<string | null>(null);

  const carregar = () => TransportRepository.obterViagens().then(setDados).catch(() => {});
  useEffect(() => { carregar(); TransportRepository.obterEscolas().then((l) => setEscolas(l.map((e) => e.nome))).catch(() => {}); }, [versao]);

  const limpar = () => { setAberto(false); setEditId(null); setNome(''); setTurno(''); setEscola(''); setErro(null); };
  const novaViagem = () => { limpar(); setAberto(true); };
  const editar = (v: Viagem) => { setErro(null); setAberto(true); setEditId(v.id); setNome(v.nome); setTurno(v.turno); setEscola(v.escola); };
  const salvar = async () => {
    setErro(null);
    if (!turno) { setErro('Escolha o turno: manhã, tarde ou noite.'); return; }
    setSalvando(true);
    try {
      const r = editId
        ? await TransportRepository.atualizarViagem(editId, { nome: nome.trim(), turno, escola: escola.trim() })
        : await TransportRepository.criarViagem({ nome: nome.trim(), turno, escola: escola.trim() });
      setDados(r); limpar(); onMudou?.();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao salvar.'); }
    finally { setSalvando(false); }
  };
  const apagar = async (id: string) => {
    setErro(null);
    try { setDados(await TransportRepository.apagarViagem(id)); setApagando(null); onMudou?.(); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao apagar.'); }
  };
  const campo = 'w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-400 min-h-[44px]';

  return (
    <section aria-label="Viagens" className="bg-slate-900 border border-amber-400/30 rounded-2xl p-4 space-y-3">
      <h3 className="text-xs font-bold text-amber-300">Viagens</h3>
      <p className="text-[11px] text-slate-400">Se você faz mais de uma viagem no mesmo turno, crie uma lista para cada uma (ex.: Manhã 1, Manhã 2). Cada aluno fica sempre na mesma viagem. Quem não tem viagem continua funcionando como antes.</p>
      {dados.viagens.length === 0 && !aberto && <p className="text-[11px] text-slate-500">Nenhuma viagem criada.</p>}
      <ul className="space-y-2">
        {dados.viagens.map((v) => (
          <li key={v.id} className="rounded-xl bg-slate-950 border border-slate-800 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-100">{v.nome} <span className="font-normal text-slate-400">· {NOME_TURNO[v.turno]}</span></div>
                <div className="text-[11px] text-slate-400 truncate">{v.escola} · {v.alunos} aluno(s)</div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => editar(v)} className="px-3 py-2 rounded-xl bg-amber-400/10 border border-amber-400/40 text-amber-200 text-xs font-bold min-h-[44px] cursor-pointer">Alterar</button>
                <button type="button" onClick={() => setApagando(apagando === v.id ? null : v.id)} className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold min-h-[44px] cursor-pointer">Apagar</button>
              </div>
            </div>
            {apagando === v.id && (
              <div className="p-2 rounded-xl bg-rose-950/40 border border-rose-500/30 text-[11px] text-rose-200 space-y-2">
                <p>Apagar {v.nome}? Os {v.alunos} aluno(s) não são apagados, só ficam sem viagem.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => apagar(v.id)} className="px-3 py-2 rounded-xl bg-rose-500/20 border border-rose-400 text-rose-100 font-bold min-h-[44px] cursor-pointer">Sim, apagar</button>
                  <button type="button" onClick={() => setApagando(null)} className="px-3 py-2 rounded-xl bg-slate-800 text-slate-200 font-bold min-h-[44px] cursor-pointer">Cancelar</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {dados.viagens.length > 0 && dados.semViagem > 0 && (
        <p className="text-[11px] text-amber-200/90">{dados.semViagem} aluno(s) ainda sem viagem. Escolha a viagem no cartão do aluno (Diário de Bordo).</p>
      )}
      {aberto ? (
        <div className="space-y-2 rounded-xl border border-slate-800 p-3">
          <label className="text-[11px] text-slate-300 block">Nome da viagem
            <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={40} placeholder="Ex.: Manhã 1" autoComplete="off" className={`${campo} mt-1`} />
          </label>
          <div className="space-y-1" role="group" aria-label="Turno da viagem">
            <span className="text-[11px] text-slate-300">Turno</span>
            <div className="grid grid-cols-3 gap-2">
              {(['MANHA', 'TARDE', 'NOITE'] as Turno[]).map((t) => (
                <button key={t} type="button" aria-pressed={turno === t} onClick={() => setTurno(t)}
                  className={`py-2.5 rounded-xl text-xs font-bold border min-h-[44px] cursor-pointer ${turno === t ? 'bg-amber-400/20 border-amber-400 text-amber-200' : 'bg-slate-950 border-slate-700 text-slate-300'}`}>{NOME_TURNO[t]}</button>
              ))}
            </div>
          </div>
          <label className="text-[11px] text-slate-300 block">Escola principal
            <input value={escola} onChange={(e) => setEscola(e.target.value)} maxLength={120} list="escolas-das-viagens" autoComplete="off" className={`${campo} mt-1`} />
            <datalist id="escolas-das-viagens">{escolas.map((n) => <option key={n} value={n} />)}</datalist>
          </label>
          {editId && <p className="text-[10px] text-slate-500">Se mudar o turno, os alunos da viagem passam para o turno novo.</p>}
          {erro && <p role="alert" className="text-[11px] text-rose-300">{erro}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={salvando} onClick={salvar} className="flex-1 px-3 py-2 rounded-xl bg-amber-400 text-slate-950 text-xs font-bold min-h-[44px] cursor-pointer disabled:opacity-50">{salvando ? 'Salvando…' : editId ? 'Salvar viagem' : 'Criar viagem'}</button>
            <button type="button" onClick={limpar} className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold min-h-[44px] cursor-pointer">Cancelar</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={novaViagem} className="w-full px-3 py-2.5 rounded-xl bg-amber-400/10 border border-amber-400/40 text-amber-200 text-xs font-bold min-h-[44px] cursor-pointer">+ Nova viagem</button>
      )}
      {!aberto && erro && <p role="alert" className="text-[11px] text-rose-300">{erro}</p>}
    </section>
  );
};

/** Com quantos minutos de antecedência a van chega à escola (10 a 30). Não altera os horários combinados com as famílias. */
export const FolgaChegadaEscola: React.FC<{ onMudou?: () => void }> = ({ onMudou }) => {
  const [lim, setLim] = useState({ minimo: 10, maximo: 30, padrao: 15 });
  const [minutos, setMinutos] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  useEffect(() => {
    TransportRepository.obterFolgaChegada().then((d) => { setLim({ minimo: d.minimo, maximo: d.maximo, padrao: d.padrao }); setMinutos(d.minutos); }).catch(() => setMinutos(15));
  }, []);
  const opcoes: number[] = [];
  for (let m = lim.minimo; m <= lim.maximo; m += 5) opcoes.push(m);
  const escolher = async (m: number) => {
    const anterior = minutos;
    setMinutos(m); setMsg(null);
    try { await TransportRepository.salvarFolgaChegada(m); setMsg({ ok: true, t: 'Salvo.' }); onMudou?.(); }
    catch (err: any) { setMinutos(anterior); setMsg({ ok: false, t: err.message }); }
  };
  return (
    <section aria-label="Chegada à escola" className="bg-slate-900 border border-amber-400/30 rounded-2xl p-4 space-y-2">
      <h3 className="text-xs font-bold text-amber-300">Chegada à escola</h3>
      <p className="text-[11px] text-slate-400">Com quantos minutos antes da entrada a van deve chegar à escola. Vale para a conta de "quando sair" e para os horários previstos. Não muda o horário combinado com as famílias. Padrão: {lim.padrao} min.</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Minutos de antecedência">
        {opcoes.map((m) => (
          <button key={m} type="button" role="radio" aria-checked={minutos === m} onClick={() => escolher(m)}
            className={`px-3 py-2 min-h-[44px] rounded-xl border text-xs font-bold cursor-pointer ${minutos === m ? 'bg-amber-400 text-slate-950 border-amber-400' : 'bg-slate-950 text-slate-300 border-slate-800'}`}>{m} min</button>
        ))}
      </div>
      {msg && <p role="status" className={`text-[11px] ${msg.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{msg.t}</p>}
    </section>
  );
};
