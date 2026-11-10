/**
 * Previsão de atraso da rota inteira (botão "Calcular a partir de onde estou").
 * Parte da posição do motorista, passa por todas as paradas pendentes na ordem da rota e termina na escola (ida)
 * ou na última parada (volta). Só calcula: não altera nenhum horário combinado com as famílias.
 * Função pura (sem GPS, mapa nem relógio): o servidor injeta o tempo entre pontos e a hora atual.
 */

export const TOLERANCIA_ATRASO_MIN = 5;

export interface PontoRota { latitude: number; longitude: number }
export interface ParadaCalculo {
  id: number;
  nome: string;
  /** Responsável no app (para a mensagem); null se o aluno ainda não tem conta vinculada */
  familia: number | null;
  local: PontoRota | null;
  /** Horário combinado de passagem (minutos desde 00:00); null se não há horário definido */
  combinadoMin: number | null;
  /** Ida: limite de chegada à escola deste aluno (entrada menos a antecedência); null se desconhecido */
  limiteEscolaMin?: number | null;
}
export interface EntradaCalculo {
  sentido: 'IDA' | 'VOLTA';
  agoraMin: number;
  origem: PontoRota;
  paradas: ParadaCalculo[];
  escola: PontoRota | null;
  /** Volta: hora em que a escola libera os alunos; a van não sai antes disso */
  saidaEscolaMin?: number | null;
  /** Minutos de deslocamento entre dois pontos */
  trecho: (a: PontoRota, b: PontoRota) => number;
  minPorParada: number;
  /** Minutos usados quando falta o ponto no mapa (parada ou escola) */
  trechoPadraoMin: number;
  toleranciaMin?: number;
}
export interface ParadaPrevista {
  id: number; nome: string; familia: number | null;
  previstoMin: number; combinadoMin: number | null;
  /** > 0 = atrasada em relação ao combinado (ou ao limite da escola, na ida) */
  atrasoMin: number | null; afetado: boolean;
  /** true quando o atraso vem da chegada à escola e não da parada */
  porEscola: boolean;
}
export interface ResultadoRota {
  paradas: ParadaPrevista[];
  escola: { chegadaMin: number; limiteMin: number | null; atrasoMin: number | null } | null;
  afetados: number;
  atrasoMaxMin: number;
  /** Havia parada ou escola sem ponto no mapa: a previsão é aproximada */
  aproximado: boolean;
}

/** Diferença a − b em minutos, circular (-12 h .. +12 h), para não quebrar perto da meia-noite. */
export const difMin = (a: number, b: number) => ((a - b + 720) % 1440 + 1440) % 1440 - 720;

export function preverRota(e: EntradaCalculo): ResultadoRota {
  const tol = e.toleranciaMin ?? TOLERANCIA_ATRASO_MIN;
  let aproximado = false;
  const ir = (a: PontoRota | null, b: PontoRota | null) => {
    if (!a || !b) { aproximado = true; return e.trechoPadraoMin; }
    return e.trecho(a, b);
  };
  let t = e.agoraMin;
  let pos: PontoRota | null = e.origem;
  let chegadaEscola: number | null = null;

  if (e.sentido === 'VOLTA') {
    // A van começa na escola: chega, espera a saída dos alunos e só então segue para as casas.
    t += ir(pos, e.escola);
    chegadaEscola = t;
    if (e.saidaEscolaMin != null && difMin(e.saidaEscolaMin, t) > 0) t += difMin(e.saidaEscolaMin, t);
    pos = e.escola;
  }

  const paradas: ParadaPrevista[] = [];
  for (const p of e.paradas) {
    t += ir(pos, p.local);
    let previsto = t;
    // Na ida a van não passa antes do horário combinado: espera no ponto.
    if (e.sentido === 'IDA' && p.combinadoMin != null && difMin(p.combinadoMin, previsto) > 0) previsto = previsto + difMin(p.combinadoMin, previsto);
    paradas.push({ id: p.id, nome: p.nome, familia: p.familia, previstoMin: previsto, combinadoMin: p.combinadoMin, atrasoMin: p.combinadoMin == null ? null : difMin(previsto, p.combinadoMin), afetado: false, porEscola: false });
    t = previsto + e.minPorParada;
    pos = p.local ?? pos;
  }

  let escola: ResultadoRota['escola'] = null;
  if (e.sentido === 'IDA') {
    t += ir(pos, e.escola);
    chegadaEscola = t;
    const limites = e.paradas.map((p) => p.limiteEscolaMin).filter((x): x is number => typeof x === 'number');
    const limite = limites.length ? Math.min(...limites) : null;
    escola = { chegadaMin: t, limiteMin: limite, atrasoMin: limite == null ? null : difMin(t, limite) };
    e.paradas.forEach((p, i) => {
      if (typeof p.limiteEscolaMin !== 'number') return;
      const atrasoEscola = difMin(t, p.limiteEscolaMin);
      if (atrasoEscola >= tol && atrasoEscola > (paradas[i].atrasoMin ?? -Infinity)) { paradas[i].atrasoMin = atrasoEscola; paradas[i].porEscola = true; }
    });
  } else if (chegadaEscola != null) {
    escola = { chegadaMin: chegadaEscola, limiteMin: e.saidaEscolaMin ?? null, atrasoMin: e.saidaEscolaMin == null ? null : difMin(chegadaEscola, e.saidaEscolaMin) };
  }

  for (const p of paradas) p.afetado = (p.atrasoMin ?? 0) >= tol;
  const atrasos = paradas.map((p) => p.atrasoMin ?? 0);
  return { paradas, escola, afetados: paradas.filter((p) => p.afetado).length, atrasoMaxMin: Math.max(0, ...atrasos), aproximado };
}
