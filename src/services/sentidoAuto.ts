/** Sentido sugerido pelo horário: perto da entrada na escola = Ida; perto da saída = Volta. */
export type Sentido = 'IDA' | 'VOLTA';

const paraMin = (h?: string | null): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(h ?? '').trim());
  if (!m) return null;
  const hh = Number(m[1]), mm = Number(m[2]);
  return hh < 24 && mm < 60 ? hh * 60 + mm : null;
};

/** Minutos desde 00:00 no horário de Brasília (America/Sao_Paulo). */
export function minutosAgoraBrasil(d: Date = new Date()): number {
  const partes = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  return (Number(partes.find((x) => x.type === 'hour')!.value) % 24) * 60 + Number(partes.find((x) => x.type === 'minute')!.value);
}

/**
 * Escolhe o sentido pelo evento mais próximo de agora: entrada (Ida) ou saída (Volta) da escola dos alunos.
 * Empate: vale o que ainda vai acontecer; sem nenhum horário informado, antes do meio-dia é Ida e depois é Volta.
 */
export function sentidoPorHorario(alunos: { escola_entrada?: string | null; escola_saida?: string | null }[], agoraMin: number): Sentido {
  const eventos: { min: number; sentido: Sentido }[] = [];
  for (const a of alunos) {
    const e = paraMin(a.escola_entrada), s = paraMin(a.escola_saida);
    if (e !== null) eventos.push({ min: e, sentido: 'IDA' });
    if (s !== null) eventos.push({ min: s, sentido: 'VOLTA' });
  }
  if (eventos.length === 0) return agoraMin < 12 * 60 ? 'IDA' : 'VOLTA';
  let melhor = eventos[0];
  for (const ev of eventos.slice(1)) {
    const dm = Math.abs(melhor.min - agoraMin), de = Math.abs(ev.min - agoraMin);
    const futuroEv = ev.min >= agoraMin, futuroM = melhor.min >= agoraMin;
    if (de < dm || (de === dm && futuroEv && !futuroM)) melhor = ev;
  }
  return melhor.sentido;
}
