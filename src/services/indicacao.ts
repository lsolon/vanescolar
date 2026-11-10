import { useEffect, useState } from 'react';
import { TransportRepository } from './api';

/**
 * Indicação entre motoristas: o link `?ind=IND-XXXXXX` é guardado neste aparelho por 30 dias, para valer quando a
 * pessoa criar a conta (mesmo que ela volte outro dia, sem o link). Só o código fica guardado; nada de dados pessoais.
 */
const CHAVE = 'vanescolar.indicacao';
const VALIDADE_MS = 30 * 24 * 3600 * 1000;
const COD_RE = /^IND-[0-9A-F]{6}$/;

export function codigoIndicacaoDaUrl(): string | null {
  const c = (new URLSearchParams(window.location.search).get('ind') ?? '').trim().toUpperCase();
  return COD_RE.test(c) ? c : null;
}

export function salvarIndicacao(codigo: string): void {
  try { localStorage.setItem(CHAVE, JSON.stringify({ codigo, ate: Date.now() + VALIDADE_MS })); } catch { /* sem storage: só não lembra */ }
}

export function lerIndicacaoSalva(): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) || 'null');
    if (v && typeof v.codigo === 'string' && COD_RE.test(v.codigo) && Number(v.ate) > Date.now()) return v.codigo;
  } catch { /* conteúdo inválido */ }
  return null;
}

/** Código de indicação em vigor: o do link (e guarda) ou o lembrado no aparelho. */
export function indicacaoAtual(): string | null {
  const daUrl = codigoIndicacaoDaUrl();
  if (daUrl) { salvarIndicacao(daUrl); return daUrl; }
  return lerIndicacaoSalva();
}

/** Hook: devolve o código e o primeiro nome de quem indicou (se o servidor reconhecer o código). */
export function useIndicacao(): { codigo: string | null; nome: string | null } {
  const [codigo] = useState(indicacaoAtual);
  const [nome, setNome] = useState<string | null>(null);
  useEffect(() => {
    if (!codigo) return;
    let vivo = true;
    TransportRepository.indicacaoPublica(codigo).then((n) => { if (vivo) setNome(n); }).catch(() => {});
    return () => { vivo = false; };
  }, [codigo]);
  return { codigo, nome };
}
