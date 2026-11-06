/**
 * Simulador de deslocamento da van (ferramenta só de teste).
 *
 * Lê os pontos de embarque e o local da escola marcados pelo motorista e envia a posição da van
 * (POST /api/gps) andando de um ponto ao próximo, como se o celular do motorista estivesse rastreando.
 * Assim dá para ver a previsão de chegada e o aviso "a van chega em ~N min" de cada família.
 *
 * Uso (com o servidor no ar e MODO_TESTE_SEM_LOGIN=true):
 *   npx tsx scripts/simular-van.ts
 *   npx tsx scripts/simular-van.ts --url https://vanescolar.ai.studio --sentido VOLTA --velocidade 60
 *
 * Opções:
 *   --url         endereço do app (padrão http://localhost:3000)
 *   --nome        nome do motorista de teste (padrão: o mesmo do botão "Entrar como motorista")
 *   --sentido     IDA ou VOLTA (padrão: o da rota em andamento ou IDA)
 *   --velocidade  km/h da van (padrão 30; aumente para o teste ficar mais rápido)
 *   --intervalo   segundos entre envios de GPS (padrão 3)
 *   --pausa       segundos parados em cada ponto (padrão 5)
 *   --sem-marcar  não marca Embarcou/Entregue ao chegar em cada ponto
 *
 * Alternativa ao login de teste: defina VAN_TOKEN com o token de sessão do motorista (nunca cole token no chat).
 * Só motoristas com o local de embarque marcado entram no trajeto; quem não tem ponto é ignorado.
 */

type Ponto = { nome: string; latitude: number; longitude: number; paradaId?: number; escola?: boolean };

const args = process.argv.slice(2);
const opt = (nome: string, padrao: string): string => {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : padrao;
};
const BASE = opt('url', 'http://localhost:3000').replace(/\/$/, '');
const VELOCIDADE = Math.max(5, Math.min(200, Number(opt('velocidade', '30')) || 30));
const INTERVALO_S = Math.max(1, Number(opt('intervalo', '3')) || 3);
const PAUSA_S = Math.max(0, Number(opt('pausa', '5')) || 0);
const MARCAR = !args.includes('--sem-marcar');
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

let token = process.env.VAN_TOKEN || '';

async function chamar(metodo: string, caminho: string, corpo?: unknown): Promise<any> {
  const r = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const dados: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${metodo} ${caminho} → ${r.status}: ${dados.error || 'erro'}`);
  return dados;
}

/** Distância em km entre dois pontos (haversine). */
function km(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
const rumo = (a: Ponto, b: Ponto): number => {
  const rad = (g: number) => (g * Math.PI) / 180;
  const y = Math.sin(rad(b.longitude - a.longitude)) * Math.cos(rad(b.latitude));
  const x = Math.cos(rad(a.latitude)) * Math.sin(rad(b.latitude)) - Math.sin(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.cos(rad(b.longitude - a.longitude));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};

async function main() {
  if (!token) {
    const login = await chamar('POST', '/api/teste/entrar', { papel: 'motorista', nome: process.argv.includes('--nome') ? opt('nome', '') : undefined });
    token = login.token;
  }
  const estado = await chamar('GET', '/api/estado');
  const emAndamento = estado.viagem?.status === 'EM_ANDAMENTO';
  const sentido: 'IDA' | 'VOLTA' = (emAndamento && estado.viagem?.sentido === 'VOLTA') || (!emAndamento && opt('sentido', 'IDA').toUpperCase() === 'VOLTA') ? 'VOLTA' : 'IDA';

  const paradas: any[] = (estado.paradas || []).filter((p: any) => p.vinculo !== 'PENDENTE' && p.vinculo !== 'RECUSADO');
  const ordem = (p: any) => (sentido === 'VOLTA' ? (p.ordem_volta ?? p.ordem_sequencia) : (p.ordem_ida ?? p.ordem_sequencia)) ?? 0;
  const comPonto = paradas.filter((p) => p.status_embarque !== 'AUSENTE' && typeof p.latitude === 'number' && typeof p.longitude === 'number' && (p.latitude !== 0 || p.longitude !== 0));
  const semPonto = paradas.filter((p) => p.status_embarque !== 'AUSENTE' && !comPonto.includes(p));
  comPonto.sort((a, b) => ordem(a) - ordem(b));
  if (!comPonto.length) throw new Error('Nenhum aluno com local de embarque marcado. Marque o ponto de cada aluno no painel (Mapa → Marcar local de embarque).');

  const pontos: Ponto[] = comPonto.map((p) => ({ nome: p.nome_aluno || `Aluno ${p.id}`, latitude: p.latitude, longitude: p.longitude, paradaId: p.id }));
  const escolas: any[] = (await chamar('GET', '/api/motorista/escolas')).escolas || [];
  const escola = escolas.find((e) => e.local);
  const pEscola: Ponto | null = escola ? { nome: `Escola ${escola.nome}`, latitude: escola.local.latitude, longitude: escola.local.longitude, escola: true } : null;
  if (pEscola) { sentido === 'IDA' ? pontos.push(pEscola) : pontos.unshift(pEscola); }

  // Começa ~700 m antes do primeiro ponto, na direção contrária à do trajeto.
  const p0 = pontos[0], p1 = pontos[1] ?? { ...p0, latitude: p0.latitude + 0.01 };
  const k = Math.max(km(p0, p1), 0.001);
  const f = 0.7 / k;
  let atual: Ponto = { nome: 'Partida', latitude: p0.latitude + (p0.latitude - p1.latitude) * f, longitude: p0.longitude + (p0.longitude - p1.longitude) * f };

  if (!emAndamento) await chamar('POST', '/api/rotas/iniciar', { sentido });
  console.log(`Simulando ${sentido === 'IDA' ? 'IDA (casa → escola)' : 'VOLTA (escola → casa)'} em ${BASE} a ${VELOCIDADE} km/h, GPS a cada ${INTERVALO_S}s.`);
  if (semPonto.length) console.log(`Ignorados (sem local de embarque marcado): ${semPonto.map((p) => p.nome_aluno || p.id).join(', ')}`);
  console.log(`Trajeto: ${pontos.map((p) => p.nome).join(' → ')}\nCtrl+C para parar.\n`);

  const enviar = (p: { latitude: number; longitude: number }, rumoGraus: number, vel: number) =>
    chamar('POST', '/api/gps', { latitude: p.latitude, longitude: p.longitude, speedKmH: vel, heading: rumoGraus, accuracyMeters: 8 });

  const passoKm = (VELOCIDADE * INTERVALO_S) / 3600;
  for (const alvo of pontos) {
    let rm = rumo(atual, alvo);
    while (km(atual, alvo) > passoKm) {
      const t = passoKm / km(atual, alvo);
      atual = { nome: atual.nome, latitude: atual.latitude + (alvo.latitude - atual.latitude) * t, longitude: atual.longitude + (alvo.longitude - atual.longitude) * t };
      await enviar(atual, rm, VELOCIDADE);
      await esperar(INTERVALO_S * 1000);
    }
    atual = { ...alvo };
    await enviar(atual, rm, 0);
    console.log(`Chegou em: ${alvo.nome}`);
    if (MARCAR) {
      if (alvo.escola && sentido === 'IDA') {
        for (const p of comPonto) await chamar('POST', `/api/paradas/${p.id}/status`, { status: 'ENTREGUE' }).catch(() => {});
        console.log('  Todos entregues na escola.');
      } else if (!alvo.escola) {
        await chamar('POST', `/api/paradas/${alvo.paradaId}/status`, { status: sentido === 'IDA' ? 'EMBARCOU' : 'ENTREGUE' }).catch(() => {});
        console.log(`  ${alvo.nome}: ${sentido === 'IDA' ? 'embarcou' : 'entregue'}.`);
      }
    }
    await esperar(PAUSA_S * 1000);
    rm = rumo(atual, alvo);
  }
  console.log('\nTrajeto concluído. Encerre a rota no painel do motorista (a faixa "Encerrar a rota?" aparece quando todos foram entregues).');
}

main().catch((e) => { console.error('Erro:', e.message); process.exit(1); });
