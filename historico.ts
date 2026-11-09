/**
 * Histórico de viagens por trecho (Ida ou Volta).
 *
 * PRIVACIDADE (LGPD de menores): o histórico guarda só o que o relatório precisa: data, sentido, horários, tempo, km rodados
 * e, por aluno, o nome abreviado ("Ana M."), o resultado e as horas de embarque e entrega.
 * NUNCA entram aqui endereço, ponto de referência, telefone, código de vínculo, coordenadas nem o trajeto do GPS.
 * Os registros mais antigos que RETENCAO_DIAS são apagados sozinhos.
 */

export const RETENCAO_DIAS = 180;
export const MAX_TRECHOS = 400;

export type Sentido = 'IDA' | 'VOLTA';
export type ResultadoAluno = 'ENTREGUE' | 'AUSENTE' | 'NAO_ATENDIDO';

export interface TrechoAtual {
  sentido: Sentido;
  /** nome da viagem ("Manhã 1") em que o trecho foi feito; vazio se o motorista não usa viagens */
  viagem?: string;
  iniciado_em: string;
  km: number;
  ultima_pos?: { latitude: number; longitude: number };
  /** por id da parada: horas dos eventos (ISO) */
  eventos: Record<string, { embarcou_em?: string; entregue_em?: string }>;
}

export interface AlunoDoTrecho {
  nome: string;
  resultado: ResultadoAluno;
  embarcou_em: string | null;
  entregue_em: string | null;
}

export interface TrechoHistorico {
  id: string;
  data: string;
  sentido: Sentido;
  iniciado_em: string;
  encerrado_em: string;
  duracao_min: number;
  km: number | null;
  escola: string | null;
  viagem?: string | null;
  alunos: AlunoDoTrecho[];
  totais: { previstos: number; entregues: number; ausentes: number; nao_atendidos: number };
}

const SALTO_MAX_KM = 2; // um salto maior entre duas posições é erro de GPS, não deslocamento

export function novoTrecho(sentido: Sentido, agora: Date): TrechoAtual {
  return { sentido, iniciado_em: agora.toISOString(), km: 0, eventos: {} };
}

function haversineKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Soma a distância entre duas posições seguidas do GPS. A posição em si fica só na memória do trecho e não vai para o histórico. */
export function somarPosicao(t: TrechoAtual, pos: { latitude: number; longitude: number }): void {
  if (t.ultima_pos) {
    const d = haversineKm(t.ultima_pos, pos);
    if (d <= SALTO_MAX_KM) t.km += d;
  }
  t.ultima_pos = { latitude: pos.latitude, longitude: pos.longitude };
}

export function registrarStatus(t: TrechoAtual, paradaId: number, status: string, agora: Date): void {
  const e = (t.eventos[String(paradaId)] ??= {});
  if (status === 'EMBARCOU') e.embarcou_em = agora.toISOString();
  else if (status === 'ENTREGUE') e.entregue_em = agora.toISOString();
  else if (status === 'PENDENTE') { delete e.embarcou_em; delete e.entregue_em; } // "marquei sem querer"
}

const hhmm = (iso?: string): string | null => iso
  ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
  : null;
const dataSP = (d: Date): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** Nome abreviado seguro: "Ana Maria Souza" → "Ana M."; o que já vier abreviado fica como está. */
export function nomeAbreviado(p: { nome_sanitizado?: string; nome_aluno?: string }): string {
  const s = String(p.nome_sanitizado || '').trim();
  if (s) return s.slice(0, 40);
  const partes = String(p.nome_aluno || '').trim().split(/\s+/).filter(Boolean);
  return partes.length ? `${partes[0]}${partes[1] ? ' ' + partes[1][0] + '.' : ''}`.slice(0, 40) : 'Aluno';
}

/** Fecha o trecho: monta o registro do histórico a partir do estado atual dos alunos. */
export function fecharTrecho(
  t: TrechoAtual,
  paradas: { id: number; nome_sanitizado?: string; nome_aluno?: string; status_embarque?: string; escola_destino?: string }[],
  agora: Date,
  temGps: boolean
): TrechoHistorico {
  const viagem = t.viagem ? String(t.viagem).slice(0, 40) : null;
  const ini = new Date(t.iniciado_em);
  const alunos: AlunoDoTrecho[] = paradas.map((p) => {
    const ev = t.eventos[String(p.id)] ?? {};
    const resultado: ResultadoAluno = p.status_embarque === 'ENTREGUE' ? 'ENTREGUE' : p.status_embarque === 'AUSENTE' ? 'AUSENTE' : 'NAO_ATENDIDO';
    return { nome: nomeAbreviado(p), resultado, embarcou_em: hhmm(ev.embarcou_em), entregue_em: hhmm(ev.entregue_em) };
  });
  const escolas = [...new Set(paradas.map((p) => String(p.escola_destino || '').trim()).filter(Boolean))];
  return {
    id: `${agora.getTime().toString(36)}-${t.sentido[0]}`,
    data: dataSP(ini),
    sentido: t.sentido,
    iniciado_em: t.iniciado_em,
    encerrado_em: agora.toISOString(),
    duracao_min: Math.max(0, Math.round((agora.getTime() - ini.getTime()) / 60000)),
    km: temGps && t.km > 0 ? Math.round(t.km * 10) / 10 : null,
    escola: escolas.length === 1 ? escolas[0].slice(0, 80) : escolas.length > 1 ? 'Várias escolas' : null,
    viagem,
    alunos,
    totais: {
      previstos: alunos.length,
      entregues: alunos.filter((a) => a.resultado === 'ENTREGUE').length,
      ausentes: alunos.filter((a) => a.resultado === 'AUSENTE').length,
      nao_atendidos: alunos.filter((a) => a.resultado === 'NAO_ATENDIDO').length,
    },
  };
}

/** Acrescenta o trecho e apaga o que passou da retenção ou do limite. O mais novo fica primeiro. */
export function acrescentar(lista: TrechoHistorico[], novo: TrechoHistorico, agora: Date): TrechoHistorico[] {
  const corte = agora.getTime() - RETENCAO_DIAS * 86400000;
  return [novo, ...lista].filter((h) => new Date(h.encerrado_em).getTime() >= corte).slice(0, MAX_TRECHOS);
}

/** Campos permitidos no que sai para a tela e para a planilha (lista de permitidos: campo novo não vaza por esquecimento). */
export function paraRelatorio(h: TrechoHistorico): TrechoHistorico {
  return {
    id: h.id, data: h.data, sentido: h.sentido, iniciado_em: h.iniciado_em, encerrado_em: h.encerrado_em,
    duracao_min: h.duracao_min, km: h.km, escola: h.escola, viagem: h.viagem ?? null, totais: { ...h.totais },
    alunos: h.alunos.map((a) => ({ nome: a.nome, resultado: a.resultado, embarcou_em: a.embarcou_em, entregue_em: a.entregue_em })),
  };
}
