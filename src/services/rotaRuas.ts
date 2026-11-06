/**
 * Rota automática por RUAS (não por linha reta).
 * - Endereço → coordenada: OpenStreetMap/Nominatim, sem cache e sem log do endereço.
 * - Ordem e tempos de cada trecho: OSRM (/trip), que usa o mapa viário real.
 * Só coordenadas vão ao OSRM; o endereço de cada criança vai apenas ao Nominatim, uma vez, quando o motorista pede a rota.
 */
export type Ponto = { latitude: number; longitude: number };
export type FetchLike = (url: string, init?: any) => Promise<{ ok: boolean; json: () => Promise<any> }>;

export const PARADA_EMBARQUE_MIN = 1; // tempo parado para embarcar/desembarcar cada aluno

/** Endereço → coordenada (ou null). Não guarda o endereço em lugar nenhum. */
export async function geocodificarEndereco(endereco: string, perto: Ponto | null, f: FetchLike): Promise<Ponto | null> {
  const q = endereco.trim().replace(/\s+/g, ' ').slice(0, 200);
  if (q.length < 5) return null;
  const vb = perto ? `&viewbox=${perto.longitude - 0.6},${perto.latitude + 0.4},${perto.longitude + 0.6},${perto.latitude - 0.4}&bounded=0` : '';
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&accept-language=pt-BR${vb}&q=${encodeURIComponent(q)}`;
  try {
    const r = await f(url, { headers: { 'User-Agent': 'VanEscolar/1.0 (contato@routinetech.com.br)' } });
    if (!r.ok) return null;
    const a = (await r.json())?.[0];
    const lat = Number(a?.lat), lon = Number(a?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    // Resultado a mais de 60 km da escola quase sempre é outro lugar com nome parecido: trata como "não achei".
    if (perto && distKm(perto, { latitude: lat, longitude: lon }) > 60) return null;
    return { latitude: Number(lat.toFixed(6)), longitude: Number(lon.toFixed(6)) };
  } catch {
    return null;
  }
}

export function distKm(a: Ponto, b: Ponto): number {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad, dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface RotaCalculada {
  /** índices de `alunos` na ordem de passagem */
  ordem: number[];
  /** minutos de cada trecho: ida = [aluno 1 → aluno 2, ..., último aluno → escola]; volta = [escola → aluno 1, aluno 1 → aluno 2, ...]. Um trecho por aluno. */
  trechosMin: number[];
  trechosKm: number[];
  /** relação entre o caminho pelas ruas e a linha reta (para a previsão ao vivo) */
  fatorRuas: number;
}

/**
 * Ordena os alunos e mede cada trecho pelas ruas.
 * Ida: alunos → escola (a escola é o fim fixo; o começo é livre). Volta: escola (começo fixo) → alunos.
 */
export async function calcularRotaPorRuas(alunos: Ponto[], escola: Ponto, sentido: 'IDA' | 'VOLTA', f: FetchLike): Promise<RotaCalculada | null> {
  if (alunos.length === 0) return null;
  const volta = sentido === 'VOLTA';
  const pts = volta ? [escola, ...alunos] : [...alunos, escola];
  const coords = pts.map((p) => `${p.longitude},${p.latitude}`).join(';');
  const params = volta ? 'source=first&destination=any' : 'source=any&destination=last';
  const url = `https://router.project-osrm.org/trip/v1/driving/${coords}?roundtrip=false&${params}&overview=false&steps=false`;
  let d: any;
  try {
    const r = await f(url, { headers: { 'User-Agent': 'VanEscolar/1.0 (contato@routinetech.com.br)' } });
    if (!r.ok) return null;
    d = await r.json();
  } catch {
    return null;
  }
  if (d?.code !== 'Ok' || !d.trips?.[0]?.legs || !Array.isArray(d.waypoints)) return null;
  const legs: { duration: number; distance: number }[] = d.trips[0].legs;
  // waypoints[i].waypoint_index = posição do ponto i de entrada dentro da viagem
  const posDe: number[] = d.waypoints.map((w: any) => Number(w.waypoint_index));
  if (posDe.length !== pts.length || legs.length !== pts.length - 1) return null;
  const porPosicao: number[] = [];
  posDe.forEach((pos, i) => { porPosicao[pos] = i; });
  const ordemPts = porPosicao; // índices de `pts` na ordem da viagem
  const alunosIdx = ordemPts.filter((i) => (volta ? i > 0 : i < alunos.length)).map((i) => (volta ? i - 1 : i));
  const trechosMin = legs.map((l) => Math.max(1, Math.round(l.duration / 60)));
  const trechosKm = legs.map((l) => l.distance / 1000);
  let reta = 0, ruas = 0;
  for (let k = 0; k < ordemPts.length - 1; k++) { reta += distKm(pts[ordemPts[k]], pts[ordemPts[k + 1]]); ruas += trechosKm[k]; }
  const fatorRuas = reta > 0.2 ? Math.max(1.1, Math.min(3, ruas / reta)) : 1.3;
  return { ordem: alunosIdx, trechosMin, trechosKm, fatorRuas: Number(fatorRuas.toFixed(2)) };
}

/**
 * Horários aproximados de passagem em cada aluno.
 * Ida: parte do horário em que a van deve estar na escola e volta no tempo, trecho a trecho.
 * Volta: parte da saída da escola e avança, trecho a trecho.
 */
export function horariosDaRota(sentido: 'IDA' | 'VOLTA', trechosMin: number[], chegadaNaEscolaMin: number, saidaDaEscolaMin: number): number[] {
  const n = trechosMin.length; // um trecho por aluno: ida = aluno i → próximo ponto; volta = ponto anterior → aluno i
  const hs: number[] = new Array(n);
  if (sentido === 'IDA') {
    let t = chegadaNaEscolaMin;
    for (let i = n - 1; i >= 0; i--) { t -= trechosMin[i] + PARADA_EMBARQUE_MIN; hs[i] = t; }
  } else {
    let t = saidaDaEscolaMin;
    for (let i = 0; i < n; i++) { t += trechosMin[i]; hs[i] = t; t += PARADA_EMBARQUE_MIN; }
  }
  return hs;
}

/** Matriz de tempos (minutos, pelas ruas) entre todos os pontos; null se o serviço falhar. */
export async function matrizTempos(pts: Ponto[], f: FetchLike): Promise<number[][] | null> {
  if (pts.length < 2) return null;
  const coords = pts.map((p) => `${p.longitude},${p.latitude}`).join(';');
  try {
    const r = await f(`https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration`, { headers: { 'User-Agent': 'VanEscolar/1.0 (contato@routinetech.com.br)' } });
    if (!r.ok) return null;
    const d = await r.json();
    if (d?.code !== 'Ok' || !Array.isArray(d.durations) || d.durations.length !== pts.length) return null;
    return d.durations.map((linha: (number | null)[]) => linha.map((s) => (typeof s === 'number' ? Math.max(1, Math.round(s / 60)) : 999)));
  } catch {
    return null;
  }
}

export interface AlunoPlano { nome: string; ancoraMin: number | null }
export interface AvisoPlano { tipo: 'trecho' | 'escola'; texto: string; faltamMin: number }
export interface PlanoRota { ordem: number[]; horarios: number[]; ancoras: boolean[]; avisos: AvisoPlano[] }

const hhmm = (m: number) => { const x = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };

/**
 * Horários dos alunos numa ordem dada. Os que têm horário fixo (âncora) não mudam; os demais são calculados pelos tempos reais.
 * Ida: o último ponto é a escola, que deve ser alcançada até `escolaMin`. Volta: o primeiro ponto é a escola, na hora `escolaMin`.
 * `D` é a matriz de tempos: índices 0..n-1 = alunos, n = escola.
 */
export function agendarOrdem(sentido: 'IDA' | 'VOLTA', ordem: number[], alunos: AlunoPlano[], D: number[][], escolaMin: number): { horarios: number[]; avisos: AvisoPlano[]; deficit: number } {
  const n = alunos.length, ida = sentido === 'IDA';
  const nos = ida ? [...ordem, n] : [n, ...ordem];
  const fixo = nos.map((i) => (i === n ? escolaMin : alunos[i].ancoraMin));
  const stay = (i: number) => (i === n ? 0 : PARADA_EMBARQUE_MIN);
  const t: (number | null)[] = fixo.slice();
  for (let k = 1; k < nos.length; k++) if (t[k] === null && t[k - 1] !== null) t[k] = (t[k - 1] as number) + stay(nos[k - 1]) + D[nos[k - 1]][nos[k]];
  for (let k = nos.length - 2; k >= 0; k--) if (t[k] === null && t[k + 1] !== null) t[k] = (t[k + 1] as number) - stay(nos[k]) - D[nos[k]][nos[k + 1]];
  const avisos: AvisoPlano[] = [];
  let deficit = 0;
  for (let k = 1; k < nos.length; k++) {
    const a = nos[k - 1], b = nos[k];
    const falta = Math.round((t[k - 1] as number) + stay(a) + D[a][b] - (t[k] as number));
    if (falta <= 0) continue;
    deficit += falta;
    if (ida && b === n) avisos.push({ tipo: 'escola', faltamMin: falta, texto: `Depois de ${alunos[a].nome} (${hhmm(t[k - 1] as number)}) a van chega à escola às ${hhmm((t[k - 1] as number) + stay(a) + D[a][b])}, ${falta} min depois do limite (${hhmm(escolaMin)}).` });
    else avisos.push({ tipo: 'trecho', faltamMin: falta, texto: `Entre ${a === n ? 'a escola' : alunos[a].nome} (${hhmm(t[k - 1] as number)}) e ${alunos[b].nome} (${hhmm(t[k] as number)}) o trajeto leva ${D[a][b]} min: faltam ${falta} min.` });
  }
  const horarios: number[] = new Array(n);
  nos.forEach((i, k) => { if (i !== n) horarios[i] = Math.round(t[k] as number); });
  return { horarios, avisos, deficit };
}

/**
 * Encaixa os alunos sem horário fixo entre os que já têm (âncoras), no lugar que menos aumenta o tempo e que respeita os horários.
 * `base` é a ordem inicial das âncoras (por horário). Sem âncoras, `base` pode ser a ordem sugerida pelo OSRM.
 */
export function encaixarAlunos(sentido: 'IDA' | 'VOLTA', alunos: AlunoPlano[], D: number[][], escolaMin: number, base: number[]): PlanoRota {
  const n = alunos.length, ida = sentido === 'IDA';
  const seq = [...base];
  const livres = alunos.map((_, i) => i).filter((i) => !seq.includes(i));
  const extra = (s: number[], pos: number, x: number) => {
    const a = pos === 0 ? (ida ? null : n) : s[pos - 1];
    const b = pos === s.length ? (ida ? n : null) : s[pos];
    if (a === null && b === null) return 0;
    if (a === null) return D[x][b as number];
    if (b === null) return D[a][x];
    return D[a][x] + D[x][b] - D[a][b];
  };
  while (livres.length) {
    let melhor: { x: number; pos: number; def: number; ext: number } | null = null;
    for (const x of livres) for (let pos = 0; pos <= seq.length; pos++) {
      const cand = [...seq.slice(0, pos), x, ...seq.slice(pos)];
      const def = agendarOrdem(sentido, cand, alunos, D, escolaMin).deficit;
      const ext = extra(seq, pos, x);
      if (!melhor || def < melhor.def || (def === melhor.def && ext < melhor.ext)) melhor = { x, pos, def, ext };
    }
    seq.splice(melhor!.pos, 0, melhor!.x);
    livres.splice(livres.indexOf(melhor!.x), 1);
  }
  const ag = agendarOrdem(sentido, seq, alunos, D, escolaMin);
  return { ordem: seq, horarios: ag.horarios, ancoras: alunos.map((a) => a.ancoraMin !== null), avisos: ag.avisos };
}

/** Âncoras ordenadas pelo horário. */
export function ordemDasAncoras(alunos: AlunoPlano[]): number[] {
  return alunos.map((a, i) => ({ a, i })).filter((x) => x.a.ancoraMin !== null).sort((x, y) => (x.a.ancoraMin as number) - (y.a.ancoraMin as number)).map((x) => x.i);
}
