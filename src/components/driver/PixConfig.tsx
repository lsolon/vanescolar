import React, { useEffect, useState } from 'react';
import { TransportRepository } from '../../services/api';
import type { ConfigPix, PixMotorista, TipoChavePix } from '../../services/api';

const TIPOS: { valor: TipoChavePix; nome: string; exemplo: string }[] = [
  { valor: 'CPF', nome: 'CPF', exemplo: '000.000.000-00' },
  { valor: 'CNPJ', nome: 'CNPJ', exemplo: '00.000.000/0000-00' },
  { valor: 'CELULAR', nome: 'Celular', exemplo: '(21) 90000-0000' },
  { valor: 'EMAIL', nome: 'E-mail', exemplo: 'voce@exemplo.com' },
  { valor: 'ALEATORIA', nome: 'Chave aleatória', exemplo: '123e4567-e89b-12d3-a456-426614174000' }
];

/** Mostra só o final da chave, para conferir sem expor tudo na tela. */
const final = (chave: string) => (chave.length > 6 ? `…${chave.slice(-4)}` : chave);

/**
 * Cartão da chave Pix do motorista (módulo "Pagamento por Pix", em teste).
 * O dinheiro vai direto para a conta dele: o app só mostra o código ao responsável e aguarda a confirmação.
 */
export const PixConfig: React.FC<{ onMudou?: (ativo: boolean) => void }> = ({ onMudou }) => {
  const [estado, setEstado] = useState<PixMotorista | null>(null);
  const [editando, setEditando] = useState(false);
  const [tipo, setTipo] = useState<TipoChavePix>('CELULAR');
  const [chave, setChave] = useState('');
  const [nome, setNome] = useState('');
  const [cidade, setCidade] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    TransportRepository.pixDoMotorista()
      .then((e) => { setEstado(e); onMudou?.(e.ativo); })
      .catch(() => { setEstado({ ativo: false, config: null }); onMudou?.(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!estado || !estado.ativo) return null;

  const config = estado.config;
  const abrirForm = (c: ConfigPix | null) => {
    setTipo(c?.tipo ?? 'CELULAR'); setChave(c?.chave ?? ''); setNome(c?.nome ?? ''); setCidade(c?.cidade ?? '');
    setErro(null); setEditando(true);
  };

  const salvar = async () => {
    setOcupado(true); setErro(null);
    try {
      setEstado(await TransportRepository.salvarPix({ tipo, chave, nome, cidade }));
      setEditando(false);
    } catch (e: any) { setErro(e.message); } finally { setOcupado(false); }
  };

  const remover = async () => {
    if (!window.confirm('Remover a chave Pix? Os responsáveis deixam de ver o QR Code.')) return;
    setOcupado(true); setErro(null);
    try { await TransportRepository.removerPix(); setEstado({ ativo: true, config: null }); setEditando(false); }
    catch (e: any) { setErro(e.message); } finally { setOcupado(false); }
  };

  const exemplo = TIPOS.find((t) => t.valor === tipo)?.exemplo ?? '';

  return (
    <section aria-label="Pagamento por Pix" className="bg-slate-900 border border-sky-400/30 rounded-2xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-100">Pagamento por Pix <span className="ml-1 px-1.5 py-0.5 rounded-md bg-sky-500/15 text-sky-300 text-[10px] font-black align-middle">TESTE</span></h3>
          <p className="text-[11px] text-slate-400">O responsável paga direto na sua conta. Você confere no banco e confirma aqui.</p>
        </div>
      </div>

      {!editando && config && (
        <div className="space-y-2">
          <p className="text-xs text-slate-200">Chave {TIPOS.find((t) => t.valor === config.tipo)?.nome.toLowerCase()} <span className="font-bold">{final(config.chave)}</span> · aparece como <span className="font-bold">{config.nome}</span>, {config.cidade}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => abrirForm(config)} className="px-3 py-2 min-h-[44px] rounded-xl bg-slate-800 text-slate-100 text-xs font-bold cursor-pointer">Editar</button>
            <button type="button" disabled={ocupado} onClick={remover} className="px-3 py-2 min-h-[44px] rounded-xl bg-slate-800 text-rose-300 text-xs font-bold cursor-pointer disabled:opacity-50">Remover</button>
          </div>
        </div>
      )}

      {!editando && !config && (
        <div className="space-y-2">
          <p className="text-xs text-amber-200">Cadastre a sua chave Pix para os responsáveis verem o QR Code da mensalidade.</p>
          <button type="button" onClick={() => abrirForm(null)} className="px-4 py-2 min-h-[44px] rounded-xl bg-sky-600 text-white text-xs font-black cursor-pointer">Cadastrar chave Pix</button>
        </div>
      )}

      {editando && (
        <div className="space-y-2">
          <label className="block text-[11px] text-slate-400">Tipo da chave
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoChavePix)} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 min-h-[44px] text-sm text-slate-100">
              {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.nome}</option>)}
            </select>
          </label>
          <label className="block text-[11px] text-slate-400">Chave Pix
            <input value={chave} onChange={(e) => setChave(e.target.value)} placeholder={exemplo} autoComplete="off" spellCheck={false}
              className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 min-h-[44px] text-sm text-slate-100" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-[11px] text-slate-400">Nome que aparece (até 25 letras)
              <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={40} placeholder="Seu nome ou empresa"
                className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 min-h-[44px] text-sm text-slate-100" />
            </label>
            <label className="block text-[11px] text-slate-400">Cidade (até 15 letras)
              <input value={cidade} onChange={(e) => setCidade(e.target.value)} maxLength={30} placeholder="Rio de Janeiro"
                className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 min-h-[44px] text-sm text-slate-100" />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={ocupado || !chave || !nome || !cidade} onClick={salvar} className="px-4 py-2 min-h-[44px] rounded-xl bg-sky-600 text-white text-xs font-black cursor-pointer disabled:opacity-50">Salvar</button>
            <button type="button" onClick={() => { setEditando(false); setErro(null); }} className="px-3 py-2 min-h-[44px] rounded-xl bg-slate-800 text-slate-200 text-xs font-bold cursor-pointer">Cancelar</button>
          </div>
          <p className="text-[10px] text-slate-500">A chave é mostrada só aos responsáveis dos seus alunos, dentro do código Pix.</p>
        </div>
      )}
      {erro && <p role="alert" className="text-[11px] text-rose-300">{erro}</p>}
    </section>
  );
};
