import React, { useCallback, useEffect, useState } from 'react';
import { TransportRepository, type AssinaturaAdminLinha } from '../../services/api';

const dataBR = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
const ROTULO: Record<string, string> = { TESTE: 'Em teste', ATIVA: 'Assinando', BLOQUEADA: 'Bloqueada', ISENTA: 'Cortesia' };
const COR: Record<string, string> = { TESTE: 'text-amber-300', ATIVA: 'text-emerald-300', BLOQUEADA: 'text-rose-300', ISENTA: 'text-sky-300' };

/** Admin > Assinaturas: quem está em teste, assinando ou bloqueado; cortesia e dias extras de teste. */
export const AssinaturasAdmin: React.FC = () => {
  const [dados, setDados] = useState<{ bloqueioAtivo: boolean; cobrancaDisponivel: boolean; webhookComSegredo: boolean; motoristas: AssinaturaAdminLinha[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [diagEmail, setDiagEmail] = useState('');
  const [diag, setDiag] = useState<{ tipoDoToken: string; resultados: Array<{ nome: string; ok: boolean; detalhe: string }> } | null>(null);
  const [diagCarregando, setDiagCarregando] = useState(false);
  const rodarDiag = async () => {
    setDiagCarregando(true); setDiag(null);
    try { setDiag(await TransportRepository.diagnosticarMercadoPago(diagEmail.trim())); setErro(null); }
    catch (e: any) { setErro(e?.message || 'Não foi possível testar.'); }
    finally { setDiagCarregando(false); }
  };

  const carregar = useCallback(async () => {
    try { setDados(await TransportRepository.listarAssinaturasAdmin()); setErro(null); }
    catch (e: any) { setErro(e?.message || 'Não foi possível carregar.'); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const ajustar = async (id: number, corpo: { isento?: boolean; diasExtras?: number }) => {
    try { await TransportRepository.ajustarAssinaturaAdmin(id, corpo); await carregar(); }
    catch (e: any) { setErro(e?.message || 'Não foi possível salvar.'); }
  };
  const maisDias = (m: AssinaturaAdminLinha) => {
    const v = window.prompt(`Dias extras de teste para ${m.nome} (hoje: ${m.diasExtras}). De 0 a 365:`, String(m.diasExtras || 15));
    if (v === null) return;
    ajustar(m.id, { diasExtras: Number(v) });
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Assinaturas</h2>
      {erro && <p role="alert" className="text-sm text-rose-300">{erro}</p>}
      {dados && (
        <ul className="text-xs text-slate-400 space-y-1">
          <li>Cobrança pelo Mercado Pago: <b className={dados.cobrancaDisponivel ? 'text-emerald-300' : 'text-rose-300'}>{dados.cobrancaDisponivel ? 'configurada' : 'falta MP_ACCESS_TOKEN'}</b></li>
          <li>Conferência dos avisos (webhook): <b className={dados.webhookComSegredo ? 'text-emerald-300' : 'text-amber-300'}>{dados.webhookComSegredo ? 'com assinatura digital' : 'falta MP_WEBHOOK_SECRET'}</b></li>
          <li>Bloqueio ao fim do teste: <b className={dados.bloqueioAtivo ? 'text-emerald-300' : 'text-amber-300'}>{dados.bloqueioAtivo ? 'ligado' : 'desligado (ASSINATURA_BLOQUEIO=false)'}</b></li>
        </ul>
      )}
      <details className="rounded-xl border border-slate-700 bg-slate-900/60 p-3">
        <summary className="text-sm font-bold text-slate-200 cursor-pointer min-h-[44px] flex items-center">Testar o Mercado Pago</summary>
        <div className="space-y-2 pt-2">
          <p className="text-xs text-slate-400">Envia 5 pedidos de assinatura (do mais simples ao completo) e mostra qual o Mercado Pago recusa. Não cobra ninguém. Use um e-mail de pagador diferente do da sua conta de vendedor.</p>
          <input type="email" value={diagEmail} onChange={(e) => setDiagEmail(e.target.value)} placeholder="e-mail do pagador" aria-label="E-mail do pagador" className="w-full min-h-[44px] rounded-xl bg-slate-950 border border-slate-700 px-3 text-sm text-white" />
          <button type="button" onClick={rodarDiag} disabled={diagCarregando || !diagEmail.includes('@')} className="min-h-[44px] px-4 rounded-xl bg-amber-400 text-slate-950 text-sm font-black disabled:opacity-50">{diagCarregando ? 'Testando…' : 'Rodar teste'}</button>
          {diag && (
            <div className="space-y-1">
              <p className="text-xs text-slate-300">Token: <b>{diag.tipoDoToken}</b></p>
              <ul className="space-y-1">
                {diag.resultados.map((r) => (
                  <li key={r.nome} className={`text-xs ${r.ok ? 'text-emerald-300' : 'text-rose-300'}`}><b>{r.ok ? 'OK' : 'RECUSADO'}</b> · {r.nome}<br /><span className="text-slate-400">{r.detalhe}</span></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>
      <p className="text-xs text-slate-500">Dados de motoristas bloqueados há mais de 30 dias aparecem como "pode excluir". Nenhuma exclusão é feita automaticamente.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-slate-500 font-bold">
            <tr><th className="py-2 pr-3">Motorista</th><th className="pr-3">Situação</th><th className="pr-3">Alunos</th><th className="pr-3">Teste até</th><th className="pr-3">Exclusão</th><th>Ações</th></tr>
          </thead>
          <tbody className="text-slate-200">
            {(dados?.motoristas ?? []).map((m) => (
              <tr key={m.id} className="border-t border-slate-800 align-top">
                <td className="py-2 pr-3"><div className="font-bold">{m.nome}</div><div className="text-[11px] text-slate-500">{m.email}</div></td>
                <td className={`pr-3 font-bold ${COR[m.estado]}`}>{ROTULO[m.estado]}{m.estado === 'TESTE' && m.diasRestantes !== null ? ` (${m.diasRestantes}d)` : ''}{m.plano ? <div className="text-[11px] font-normal text-slate-400">MP: {m.plano.status} · R$ {m.plano.valor}</div> : null}</td>
                <td className="pr-3">{m.alunos}</td>
                <td className="pr-3">{dataBR(m.testeFim)}{m.diasExtras ? <div className="text-[11px] text-slate-500">+{m.diasExtras} dias</div> : null}</td>
                <td className="pr-3">{m.estado === 'BLOQUEADA' ? <span className={m.podeExcluir ? 'text-rose-300 font-bold' : ''}>{m.podeExcluir ? 'pode excluir' : `após ${dataBR(m.excluirApos)}`}</span> : '—'}</td>
                <td className="space-x-2 whitespace-nowrap">
                  <button type="button" onClick={() => maisDias(m)} className="px-2 py-1 rounded-lg bg-slate-800 text-xs font-bold cursor-pointer">Dias extras</button>
                  <button type="button" disabled={m.isentoPorConfig} onClick={() => ajustar(m.id, { isento: !m.isento })} className="px-2 py-1 rounded-lg bg-slate-800 text-xs font-bold cursor-pointer disabled:opacity-40">{m.isento || m.isentoPorConfig ? 'Tirar cortesia' : 'Cortesia'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {dados && dados.motoristas.length === 0 && <p className="text-sm text-slate-500 py-4">Nenhum motorista ainda.</p>}
      </div>
    </div>
  );
};
