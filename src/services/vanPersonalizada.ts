import { useEffect, useState } from 'react';
import { TransportRepository } from './api';

/**
 * "Van do João • Freguesia": personalização do cabeçalho.
 * Guarda no aparelho só o primeiro nome do motorista, o bairro e (se veio de um link) o código MOT-… para
 * já preencher o cadastro do filho. Nada de dados de criança. Se o servidor não achar o link, não muda nada.
 */
export interface VanPersonalizada { nome: string; bairro: string; codigo?: string }

const CHAVE = 'vanescolar.van';

export function lerVanSalva(): VanPersonalizada | null {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) || 'null');
    if (v && typeof v.nome === 'string' && v.nome) return { nome: v.nome, bairro: String(v.bairro ?? ''), ...(typeof v.codigo === 'string' ? { codigo: v.codigo } : {}) };
  } catch { /* storage indisponível ou conteúdo inválido */ }
  return null;
}

export function salvarVan(v: VanPersonalizada): void {
  try { localStorage.setItem(CHAVE, JSON.stringify(v)); } catch { /* sem storage: só não lembra */ }
}

/** Código MOT-… do parâmetro ?m= da URL (ou null). */
export function codigoDaUrl(): string | null {
  const m = new URLSearchParams(window.location.search).get('m');
  const cod = (m ?? '').trim().toUpperCase();
  return /^MOT-[0-9A-F]{6}$/.test(cod) ? cod : null;
}

/** Texto do cabeçalho: "Van do João • Freguesia" (ou só "Van do João"). */
export function rotuloDaVan(v: { nome: string; bairro?: string } | null): string | null {
  if (!v?.nome) return null;
  return `Van do ${v.nome}${v.bairro ? ` • ${v.bairro}` : ''}`;
}

/** Hook: usa o link ?m= se houver (e lembra no aparelho); senão, a última van salva. */
export function useVanPersonalizada(): VanPersonalizada | null {
  const [van, setVan] = useState<VanPersonalizada | null>(() => lerVanSalva());
  useEffect(() => {
    const cod = codigoDaUrl();
    if (!cod) return;
    let vivo = true;
    TransportRepository.abrirVanDoMotorista(cod)
      .then((d) => {
        if (!vivo || !d.motorista) return;
        const nova = { nome: d.motorista, bairro: d.bairro || '', codigo: cod };
        salvarVan(nova);
        setVan(nova);
      })
      .catch(() => { /* link inexistente: segue com a tela normal */ });
    return () => { vivo = false; };
  }, []);
  return van;
}
