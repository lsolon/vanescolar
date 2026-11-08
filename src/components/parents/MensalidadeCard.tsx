import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { TransportRepository } from '../../services/api';
import type { MensalidadeFilho, PixDoFilho, StatusMensalidade } from '../../services/api';

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

/** Pagar a mensalidade por Pix (módulo em teste): QR Code, código copia e cola e o aviso "já paguei". Sem mapa, GPS ou endereço. */
const PagarPix: React.FC<{ alunoId: number; pix: PixDoFilho; onAvisou: () => void }> = ({ alunoId, pix, onAvisou }) => {
  const [aberto, setAberto] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    QRCode.toDataURL(pix.copia_e_cola, { width: 240, margin: 2, errorCorrectionLevel: 'M' }).then((u) => { if (vivo) setQr(u); }).catch(() => { if (vivo) setQr(null); });
    return () => { vivo = false; };
  }, [aberto, pix.copia_e_cola]);

  if (pix.avisado_em) {
    return <p role="status" className="text-[11px] text-amber-200 bg-amber-400/10 border border-amber-400/30 rounded-xl px-3 py-2">Você avisou em {quando(pix.avisado_em)} que pagou {mesLongo(pix.mes)}. O motorista vai conferir e confirmar.</p>;
  }

  const avisar = async () => {
    setOcupado(true); setErro(null);
    try { await TransportRepository.avisarPagamentoPix(alunoId, pix.mes); onAvisou(); }
    catch (e: any) { setErro(e.message); } finally { setOcupado(false); }
  };

  return (
    <div className="space-y-2">
      {!aberto ? (
        <button type="button" onClick={() => setAberto(true)} className="w-full px-4 py-3 min-h-[44px] rounded-xl bg-sky-600 text-white text-xs font-black cursor-pointer">Pagar {mesLongo(pix.mes)} por Pix · {brl(pix.valor)}</button>
      ) : (
        <div className="rounded-xl border border-sky-400/30 bg-slate-950/60 p-3 space-y-3">
          <p className="text-xs text-slate-200">Pague {brl(pix.valor)} para <span className="font-bold">{pix.recebedor}</span>. No app do seu banco, escolha Pix e leia o QR Code ou use o código.</p>
          <div className="flex justify-center">
            {qr ? <img src={qr} alt="QR Code do Pix da mensalidade" width={240} height={240} className="rounded-xl bg-white" /> : <p className="text-[11px] text-slate-400">Gerando o QR Code…</p>}
          </div>
          <button type="button" onClick={async () => { setCopiado(await copiar(pix.copia_e_cola)); setTimeout(() => setCopiado(false), 2500); }}
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

/** Mensalidade dos filhos: o responsável vê o valor, o vencimento e o que já foi pago (e, no teste, paga por Pix). */
export const MensalidadeCard: React.FC = () => {
  const [filhos, setFilhos] = useState<MensalidadeFilho[] | null>(null);
  const carregar = () => TransportRepository.minhasMensalidades().then(setFilhos).catch(() => setFilhos([]));
  useEffect(() => { void carregar(); }, []);
  if (!filhos || filhos.length === 0) return null;

  return (
    <section aria-label="Mensalidade" className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
      <h3 className="text-xs font-bold text-slate-200">Mensalidade</h3>
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
