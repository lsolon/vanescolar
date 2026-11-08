import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { TransportRepository } from '../../services/api';
import type { MensalidadeFilho, PixDoFilho, PixFamilia, StatusMensalidade } from '../../services/api';

const brl = (n: number | null) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const curto = (m: string) => `${MESES[parseInt(m.slice(5), 10) - 1]}/${m.slice(2, 4)}`;
const ROTULO: Record<StatusMensalidade, { texto: string; cor: string }> = {
  PAGO: { texto: 'Pago', cor: 'text-emerald-300 border-emerald-400/40 bg-emerald-500/10' },
  EM_ABERTO: { texto: 'Em aberto', cor: 'text-sky-300 border-sky-400/40 bg-sky-500/10' },
  ATRASADO: { texto: 'Atrasado', cor: 'text-rose-300 border-rose-400/40 bg-rose-500/10' },
  SEM_VALOR: { texto: 'Não definido', cor: 'text-slate-300 border-slate-600 bg-slate-800/40' }
};

const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mesLongo = (m: string) => `${MESES_LONGOS[parseInt(m.slice(5), 10) - 1]} de ${m.slice(0, 4)}`;
const quando = (iso: string) => {
  const d = new Date(iso);
  const f = (o: Intl.DateTimeFormatOptions) => d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', ...o });
  return `${f({ day: '2-digit', month: '2-digit' })} às ${f({ hour: '2-digit', minute: '2-digit' })}`;
};

async function copiar(texto: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(texto); return true; } catch { /* cai no plano B */ }
  try {
    const t = document.createElement('textarea');
    t.value = texto; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(t);
    return ok;
  } catch { return false; }
}

/**
 * Painel de pagamento por Pix (módulo em teste): QR Code, código copia e cola e o aviso "já paguei".
 * Serve ao Pix de um filho e ao Pix único da família. Mostra só código, valor e nome do recebedor (sem mapa, GPS ou endereço).
 */
const PainelPix: React.FC<{
  rotuloBotao: string; valor: number; recebedor: string; copiaECola: string; detalhe?: React.ReactNode;
  avisadoEm?: string | null; textoAvisado?: string; onAvisar: () => Promise<void>;
}> = ({ rotuloBotao, valor, recebedor, copiaECola, detalhe, avisadoEm, textoAvisado, onAvisar }) => {
  const [aberto, setAberto] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    QRCode.toDataURL(copiaECola, { width: 240, margin: 2, errorCorrectionLevel: 'M' }).then((u) => { if (vivo) setQr(u); }).catch(() => { if (vivo) setQr(null); });
    return () => { vivo = false; };
  }, [aberto, copiaECola]);

  if (avisadoEm) {
    return <p role="status" className="text-[11px] text-amber-200 bg-amber-400/10 border border-amber-400/30 rounded-xl px-3 py-2">Você avisou em {quando(avisadoEm)} que pagou{textoAvisado ? ` ${textoAvisado}` : ''}. O motorista vai conferir e confirmar.</p>;
  }

  const avisar = async () => {
    setOcupado(true); setErro(null);
    try { await onAvisar(); } catch (e: any) { setErro(e.message); } finally { setOcupado(false); }
  };

  return (
    <div className="space-y-2">
      {!aberto ? (
        <button type="button" onClick={() => setAberto(true)} className="w-full px-4 py-3 min-h-[44px] rounded-xl bg-sky-600 text-white text-xs font-black cursor-pointer">{rotuloBotao}</button>
      ) : (
        <div className="rounded-xl border border-sky-400/30 bg-slate-950/60 p-3 space-y-3">
          <p className="text-xs text-slate-200">Pague {brl(valor)} para <span className="font-bold">{recebedor}</span>. No app do seu banco, escolha Pix e leia o QR Code ou use o código.</p>
          {detalhe}
          <div className="flex justify-center">
            {qr ? <img src={qr} alt="QR Code do Pix da mensalidade" width={240} height={240} className="rounded-xl bg-white" /> : <p className="text-[11px] text-slate-400">Gerando o QR Code…</p>}
          </div>
          <button type="button" onClick={async () => { setCopiado(await copiar(copiaECola)); setTimeout(() => setCopiado(false), 2500); }}
            className="w-full px-4 py-3 min-h-[44px] rounded-xl bg-slate-800 text-slate-100 text-xs font-bold cursor-pointer">{copiado ? 'Código copiado!' : 'Copiar código Pix'}</button>
          <div className="pt-2 border-t border-slate-800 space-y-2">
            <p className="text-[11px] text-slate-400">Depois de pagar, avise o motorista. Ele confere no banco e confirma aqui.</p>
            <button type="button" disabled={ocupado} onClick={avisar} className="w-full px-4 py-3 min-h-[44px] rounded-xl bg-emerald-600 text-white text-xs font-black cursor-pointer disabled:opacity-50">Já paguei</button>
          </div>
        </div>
      )}
      {erro && <p role="alert" className="text-[11px] text-rose-300">{erro}</p>}
    </div>
  );
};

/** Pix de um filho. */
const PagarPix: React.FC<{ alunoId: number; pix: PixDoFilho; onAvisou: () => void }> = ({ alunoId, pix, onAvisou }) => (
  <PainelPix rotuloBotao={`Pagar ${mesLongo(pix.mes)} por Pix · ${brl(pix.valor)}`} valor={pix.valor} recebedor={pix.recebedor} copiaECola={pix.copia_e_cola}
    avisadoEm={pix.avisado_em} textoAvisado={mesLongo(pix.mes)}
    onAvisar={async () => { await TransportRepository.avisarPagamentoPix(alunoId, pix.mes); onAvisou(); }} />
);

/** Pix único da família: um QR com a soma dos filhos; o aviso vale para todos de uma vez. */
const PagarPixFamilia: React.FC<{ grupo: PixFamilia; onAvisou: () => void }> = ({ grupo, onAvisou }) => (
  <PainelPix rotuloBotao={`Pagar tudo por Pix (${grupo.itens.length} filhos) · ${brl(grupo.total)}`} valor={grupo.total} recebedor={grupo.recebedor} copiaECola={grupo.copia_e_cola}
    detalhe={
      <ul className="text-[11px] text-slate-300 space-y-0.5" aria-label="O que este Pix paga">
        {grupo.itens.map((i) => <li key={i.id_aluno} className="flex justify-between gap-2"><span className="truncate">{i.aluno} · {mesLongo(i.mes)}</span><span className="shrink-0 font-bold">{brl(i.valor)}</span></li>)}
      </ul>
    }
    onAvisar={async () => { await TransportRepository.avisarPagamentoPixLote(grupo.itens.map((i) => ({ id_aluno: i.id_aluno, mes: i.mes }))); onAvisou(); }} />
);

/** Mensalidade dos filhos: o responsável vê o valor, o vencimento e o que já foi pago (e, no teste, paga por Pix). */
export const MensalidadeCard: React.FC = () => {
  const [filhos, setFilhos] = useState<MensalidadeFilho[] | null>(null);
  const [familias, setFamilias] = useState<PixFamilia[]>([]);
  const carregar = () => TransportRepository.minhasMensalidadesCompleto()
    .then((d) => { setFilhos(d.filhos); setFamilias(d.familia_pix); })
    .catch(() => { setFilhos([]); setFamilias([]); });
  useEffect(() => { void carregar(); }, []);
  if (!filhos || filhos.length === 0) return null;

  return (
    <section aria-label="Mensalidade" className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
      <h3 className="text-xs font-bold text-slate-200">Mensalidade</h3>
      {familias.map((g) => <PagarPixFamilia key={g.itens.map((i) => i.id_aluno).join('-')} grupo={g} onAvisou={() => { void carregar(); }} />)}
      {filhos.map((f) => {
        const r = ROTULO[f.status];
        return (
          <div key={f.id_aluno} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-100 truncate">{f.aluno}</p>
                <p className="text-[11px] text-slate-400">
                  {f.valor ? `${brl(f.valor)}${f.vencimento_dia ? ` · vence dia ${String(f.vencimento_dia).padStart(2, '0')}` : ''}` : 'O motorista ainda não definiu o valor.'}
                </p>
              </div>
              <span className={`shrink-0 px-2.5 py-1 rounded-full border text-[10px] font-black ${r.cor}`}>{r.texto}</span>
            </div>
            {f.meses_em_atraso > 0 && <p className="text-[11px] text-rose-300">Há {f.meses_em_atraso} mensalidade(s) vencida(s) sem pagamento registrado.</p>}
            {f.pix && <PagarPix alunoId={f.id_aluno} pix={f.pix} onAvisou={() => { void carregar(); }} />}
            <div className="flex gap-1.5 overflow-x-auto" aria-label="Últimos meses">
              {[...f.historico].reverse().map((h) => (
                <div key={h.mes} className={`shrink-0 w-14 text-center rounded-xl border py-1.5 ${ROTULO[h.status].cor}`}>
                  <p className="text-[10px] font-bold">{curto(h.mes)}</p>
                  <p className="text-[9px]">{h.status === 'PAGO' ? 'pago' : h.status === 'ATRASADO' ? 'atraso' : h.status === 'EM_ABERTO' ? 'aberto' : '—'}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <p className="text-[10px] text-slate-500">O pagamento é combinado direto com o motorista. Aqui você só acompanha.</p>
    </section>
  );
};
