/** Mensagens entre motorista e família: conversa privada por família + avisos gerais da van. */

export interface Mensagem {
  id: number;
  id_motorista: number;
  /** Responsável (usuário) dono da conversa; null = aviso para toda a van. */
  id_familia: number | null;
  de: 'MOTORISTA' | 'RESPONSAVEL';
  texto: string;
  rapida?: string;
  criado_em: string;
  /** Conversa individual: quando o destinatário leu. */
  lida_em?: string;
  /** Aviso geral: famílias que já leram. */
  lida_por?: number[];
}
export interface MensagensDB { mensagens: Mensagem[] }
export const novoMensagensDB = (): MensagensDB => ({ mensagens: [] });

export const MAX_TEXTO = 500;
export const RETENCAO_DIAS = 90;
export const AVISO_VISIVEL_DIAS = 14;
export const MAX_POR_CONVERSA = 500;

/** Mensagens prontas do motorista (por id, para o texto não depender do cliente). */
export const RAPIDAS: { id: string; texto: string }[] = [
  { id: 'A_CAMINHO', texto: 'Estou a caminho do ponto de embarque.' },
  { id: 'CHEGUEI', texto: 'Cheguei no ponto de embarque.' },
  { id: 'ATRASO_10', texto: 'Estou com um atraso de cerca de 10 minutos.' },
  { id: 'CONFIRMAR_PRESENCA', texto: 'O aluno vai à escola hoje? Se não for, registre a ausência pelo app.' },
  { id: 'ENTREGUE', texto: 'Aluno entregue com segurança.' }
];

const PAR_DE_COORDENADAS = /-?\d{1,3}[.,]\d{4,}\s*[;,]?\s+-?\d{1,3}[.,]\d{4,}|-?\d{1,3}[.,]\d{4,}\s*[;,]\s*-?\d{1,3}[.,]\d{4,}/;

export function validarTexto(entrada: unknown): { ok: true; texto: string } | { ok: false; erro: string } {
  if (typeof entrada !== 'string') return { ok: false, erro: 'Escreva a mensagem.' };
  // eslint-disable-next-line no-control-regex
  const texto = entrada.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r\n?/g, '\n').trim();
  if (!texto) return { ok: false, erro: 'Escreva a mensagem.' };
  if (texto.length > MAX_TEXTO) return { ok: false, erro: `A mensagem pode ter no máximo ${MAX_TEXTO} caracteres.` };
  if (PAR_DE_COORDENADAS.test(texto)) return { ok: false, erro: 'Não envie coordenadas de localização por mensagem.' };
  return { ok: true, texto };
}

/** Texto final: mensagem rápida (pelo id) ou texto livre validado. */
export function resolverTexto(corpo: any, permitirRapida: boolean): { ok: true; texto: string; rapida?: string } | { ok: false; erro: string } {
  if (permitirRapida && corpo?.rapida !== undefined && corpo?.rapida !== null && corpo?.rapida !== '') {
    const r = RAPIDAS.find((x) => x.id === String(corpo.rapida));
    if (!r) return { ok: false, erro: 'Mensagem pronta inválida.' };
    return { ok: true, texto: r.texto, rapida: r.id };
  }
  const v = validarTexto(corpo?.texto);
  return v.ok ? { ok: true, texto: v.texto } : v;
}

export const proximoId = (msgs: { id: number }[]) => msgs.reduce((m, x) => Math.max(m, x.id), 0) + 1;
const porId = (a: Mensagem, b: Mensagem) => a.id - b.id;
const diasAtras = (agora: Date, dias: number) => new Date(agora.getTime() - dias * 86400000).toISOString();

/** Conversa individual entre o motorista e a família (sem avisos). */
export const conversaDireta = (db: MensagensDB, motorista: number, familia: number) =>
  db.mensagens.filter((m) => m.id_motorista === motorista && m.id_familia === familia).sort(porId);

/** Avisos gerais ainda visíveis (janela de dias), do mais antigo ao mais novo. */
export const avisosDaVan = (db: MensagensDB, motorista: number, agora: Date = new Date()) => {
  const corte = diasAtras(agora, AVISO_VISIVEL_DIAS);
  return db.mensagens.filter((m) => m.id_motorista === motorista && m.id_familia === null && m.criado_em >= corte).sort(porId);
};

/** O que a família vê: a conversa com o motorista e os avisos da van, em ordem. */
export const feedDaFamilia = (db: MensagensDB, motorista: number, familia: number, agora: Date = new Date()) =>
  [...conversaDireta(db, motorista, familia), ...avisosDaVan(db, motorista, agora)].sort(porId);

export const naoLidasDoMotorista = (db: MensagensDB, motorista: number, familia: number) =>
  conversaDireta(db, motorista, familia).filter((m) => m.de === 'RESPONSAVEL' && !m.lida_em).length;

export const naoLidasDaFamilia = (db: MensagensDB, motorista: number, familia: number, agora: Date = new Date()) =>
  conversaDireta(db, motorista, familia).filter((m) => m.de === 'MOTORISTA' && !m.lida_em).length
  + avisosDaVan(db, motorista, agora).filter((m) => !(m.lida_por ?? []).includes(familia)).length;

/** Marca como lidas as mensagens que a outra parte enviou. Retorna quantas mudaram. */
export function marcarLidasPeloMotorista(db: MensagensDB, motorista: number, familia: number, agoraIso: string): number {
  let n = 0;
  for (const m of conversaDireta(db, motorista, familia)) if (m.de === 'RESPONSAVEL' && !m.lida_em) { m.lida_em = agoraIso; n++; }
  return n;
}
export function marcarLidasPelaFamilia(db: MensagensDB, motorista: number, familia: number, agoraIso: string, agora: Date = new Date()): number {
  let n = 0;
  for (const m of conversaDireta(db, motorista, familia)) if (m.de === 'MOTORISTA' && !m.lida_em) { m.lida_em = agoraIso; n++; }
  for (const m of avisosDaVan(db, motorista, agora)) {
    const lidos = m.lida_por ?? (m.lida_por = []);
    if (!lidos.includes(familia)) { lidos.push(familia); n++; }
  }
  return n;
}

/** Retenção (LGPD): apaga mensagens antigas do motorista e limita o tamanho de cada conversa. */
export function podar(db: MensagensDB, motorista: number, agora: Date = new Date()): void {
  const corte = diasAtras(agora, RETENCAO_DIAS);
  db.mensagens = db.mensagens.filter((m) => m.id_motorista !== motorista || m.criado_em >= corte);
  const porConversa = new Map<string, Mensagem[]>();
  for (const m of db.mensagens) if (m.id_motorista === motorista) {
    const k = String(m.id_familia);
    (porConversa.get(k) ?? porConversa.set(k, []).get(k)!).push(m);
  }
  const remover = new Set<number>();
  for (const lista of porConversa.values()) {
    lista.sort(porId);
    for (const m of lista.slice(0, Math.max(0, lista.length - MAX_POR_CONVERSA))) remover.add(m.id);
  }
  if (remover.size) db.mensagens = db.mensagens.filter((m) => m.id_motorista !== motorista || !remover.has(m.id));
}

export function enviar(db: MensagensDB, dados: { motorista: number; familia: number | null; de: 'MOTORISTA' | 'RESPONSAVEL'; texto: string; rapida?: string }, agora: Date = new Date()): Mensagem {
  const nova: Mensagem = { id: proximoId(db.mensagens), id_motorista: dados.motorista, id_familia: dados.familia, de: dados.de, texto: dados.texto, criado_em: agora.toISOString() };
  if (dados.rapida) nova.rapida = dados.rapida;
  db.mensagens.push(nova);
  podar(db, dados.motorista, agora);
  return nova;
}
