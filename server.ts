/**
 * ============================================================================
 * SERVIDOR FULL-STACK EXPRESS & VITE (server.ts)
 * AUTENTICAÇÃO AVANÇADA DE MOTORISTAS E RESPONSÁVEIS, CONVITES, LGPD & RBAC
 * ============================================================================
 */

import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createPersistence } from './persistence';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEMO_MODE = process.env.DEMO_MODE === 'true' || (process.env.DEMO_MODE !== 'false' && process.env.NODE_ENV !== 'production');
// SEGURANÇA: o segredo de sessão NUNCA pode ser um valor público (o repositório é público).
// Em produção é obrigatório definir SESSION_SECRET; em desenvolvimento gera um segredo aleatório por execução.
const SESSION_SECRET = (() => {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  return crypto.randomBytes(48).toString('hex');
})();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'senha-de-teste-admin';
// Contas de demonstração (senhas conhecidas, públicas no repositório) só existem com DEMO_MODE=true explícito.
const SEED_LOGIN_ENABLED = DEMO_MODE;
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'vanescolar-9afde';

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// Verifica um ID Token do Firebase (assinatura Google, emissor e audiência). Retorna e-mail verificado ou null.
const firebaseJwks = FIREBASE_PROJECT_ID
  ? createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'))
  : null;
async function verifyFirebaseIdToken(idToken: unknown): Promise<{ email: string } | null> {
  if (!firebaseJwks || typeof idToken !== 'string' || idToken.length < 20) return null;
  try {
    const { payload } = await jwtVerify(idToken, firebaseJwks, {
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID
    });
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    if (!email || payload.email_verified === false) return null;
    return { email };
  } catch {
    return null;
  }
}

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'leandrosolon@gmail.com,admin@vanescolar.com.br')
  .split(',')
  .map((e) => e.trim().toLowerCase());

// Set de tokens invalidados (Logout / Kill-Switch)
const invalidatedTokens = new Set<string>();

interface SessionPayload {
  role: 'motorista' | 'responsavel' | 'admin';
  userId: number;
  email: string;
  studentId?: number;
  emailVerified?: boolean;
  exp: number;
}

function signToken(payload: Omit<SessionPayload, 'exp'>, hours = 12): string {
  const exp = Date.now() + hours * 3600 * 1000;
  const fullPayload: SessionPayload = { ...payload, exp };
  const dataStr = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(dataStr).digest('base64url');
  return `${dataStr}.${signature}`;
}

function verifyToken(token: string): SessionPayload | null {
  try {
    if (invalidatedTokens.has(token)) return null;
    const [dataStr, signature] = token.split('.');
    if (!dataStr || !signature) return null;
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(dataStr).digest('base64url');
    if (!safeEqual(signature, expectedSig)) return null;
    const payload: SessionPayload = JSON.parse(Buffer.from(dataStr, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

interface UserRecord {
  id: number;
  fullName: string;
  email: string;
  /** ID de acesso escolhido pelo usuário (alternativa ao e-mail no login) */
  loginId?: string;
  passwordHash: string;
  role: 'motorista' | 'responsavel';
  emailVerified: boolean;
  totpEnabled?: boolean;
  totpSecret?: string;
  prefs?: { estilo: 'A' | 'B' | 'C'; avisoMin: number };
  phone?: string;
  whatsapp?: string;
  veiculoModelo?: string;
  veiculoPlaca?: string;
  capacidade?: number;
  horarios?: string[];
  lgpdConsent: {
    accepted: boolean;
    timestamp: string;
    version: string;
  };
  studentId?: number;
}

interface DriverInvitation {
  code: string;
  createdBy: string;
  createdAt: string;
  expiresAt: number;
  used: boolean;
  usedAt?: string;
  usedBy?: string;
  revoked?: boolean;
  nota?: string;
}

// O convite fixo de demonstração é público (repositório aberto): só existe com DEMO_MODE=true.
let driverInvitationsDB: DriverInvitation[] = DEMO_MODE ? [
  {
    code: 'DRV-INIT-2026',
    createdBy: 'admin@vanescolar.com.br',
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + 72 * 3600 * 1000,
    used: false
  }
] : [];

let usersDB: UserRecord[] = [
  {
    id: 1,
    fullName: 'Tio David Santos',
    email: 'david.santos@vanescolar.com.br',
    passwordHash: SEED_LOGIN_ENABLED ? crypto.scryptSync('password123', 'salt-van-escolar', 64).toString('hex') : '',
    role: 'motorista',
    emailVerified: true,
    totpEnabled: false,
    phone: '(21) 98765-4321',
    veiculoModelo: 'Renault Master Executiva 2.3',
    veiculoPlaca: 'RIO-2024',
    capacidade: 16,
    horarios: ['Manhã', 'Tarde'],
    lgpdConsent: { accepted: true, timestamp: new Date().toISOString(), version: 'v1.0-lgpd-art14' }
  },
  {
    id: 2,
    fullName: 'Tio Carlos Souza',
    email: 'carlos.souza@vanescolar.com.br',
    passwordHash: SEED_LOGIN_ENABLED ? crypto.scryptSync('password123', 'salt-van-escolar', 64).toString('hex') : '',
    role: 'motorista',
    emailVerified: true,
    totpEnabled: false,
    phone: '(21) 97654-3210',
    veiculoModelo: 'Mercedes-Benz Sprinter 415',
    veiculoPlaca: 'RIO-2025',
    capacidade: 18,
    horarios: ['Manhã', 'Tarde', 'Noite'],
    lgpdConsent: { accepted: true, timestamp: new Date().toISOString(), version: 'v1.0-lgpd-art14' }
  },
  {
    id: 101,
    fullName: 'Leandro Solon',
    email: 'leandrosolon@gmail.com',
    passwordHash: SEED_LOGIN_ENABLED ? crypto.scryptSync('123456abcd', 'salt-van-escolar', 64).toString('hex') : '',
    role: 'motorista',
    emailVerified: true,
    phone: '(21) 99123-4567',
    veiculoModelo: 'Renault Master Executiva 2.3',
    veiculoPlaca: 'RIO-2024',
    lgpdConsent: { accepted: true, timestamp: new Date().toISOString(), version: 'v1.0-lgpd-art14' },
    studentId: 201
  }
];

function auditLog(action: string, actor: string, details: string) {
  console.log(`[AUDIT] [${new Date().toISOString()}] Ação: ${action} | Ator: ${actor} | Detalhes: ${details}`);
}

function mascararEnderecoSeguro(rawAddress: string): string {
  if (!rawAddress || !rawAddress.trim()) return "Endereço Restrito (LGPD)";
  
  const clean = rawAddress.trim().replace(/\s+/g, ' ');
  const matchVia = clean.match(/^(rua|av|avenida|est|estrada|alameda|praça|praca|travessa|tv|al)\.?\s+(.+)/i);
  
  if (matchVia) {
    const tipo = matchVia[1].charAt(0).toUpperCase() + matchVia[1].slice(1).toLowerCase();
    const restoSemNumeros = matchVia[2].replace(/,/g, ' ').replace(/\d+/g, '').replace(/[\-–]/g, ' ').trim();
    const palavras = restoSemNumeros.split(' ').filter(p => p.length > 0 && !['de', 'da', 'do', 'dos', 'das'].includes(p.toLowerCase()));
    const primeiraLetra = palavras[0] ? palavras[0].charAt(0).toUpperCase() : 'X';
    return `${tipo} ${primeiraLetra}... (Endereço Restrito - LGPD)`;
  }
  
  const semNumeros = clean.replace(/,/g, ' ').replace(/\d+/g, '').replace(/[\-–]/g, ' ').trim();
  const palavras = semNumeros.split(' ').filter(p => p.length > 0 && !['de', 'da', 'do', 'dos', 'das'].includes(p.toLowerCase()));
  const primeiraLetra = palavras[0] ? palavras[0].charAt(0).toUpperCase() : 'X';
  return `Via ${primeiraLetra}... (Endereço Restrito - LGPD)`;
}

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
function rateLimiter(limit: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Bypass em modo demonstração ou requisições locais (testes)
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (DEMO_MODE || ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return next();
    
    const now = Date.now();
    const record = rateLimitMap.get(ip);

    if (!record || now > record.resetTime) {
      rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (record.count >= limit) {
      return res.status(429).json({ error: 'Muitas tentativas. Acesso temporariamente bloqueado por segurança.' });
    }

    record.count++;
    next();
  };
}

interface SSEClient {
  id: string;
  res: Response;
  role: 'motorista' | 'responsavel' | 'admin';
  studentId?: number;
  userId?: number;
}

let sseClients: SSEClient[] = [];

let serverState = {
  viagem: {
    id: 1001,
    uuid: 'v-1001',
    id_motorista: 1, // David Santos (ID: 1)
    data: '2025-02-20',
    periodo: 'MANHA_IDA',
    status: 'AGENDADA',
    rota_nome: 'Rota Freguesia - Jacarepaguá',
    distancia_km_estimada: 6.8,
    created_at: new Date().toISOString()
  },
  motorista: {
    id: 1,
    uuid: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    nome: 'Tio David Santos',
    telefone: '(21) 98765-4321',
    veiculo_modelo: 'Renault Master Executiva 2.3',
    veiculo_placa: 'RIO-2024',
    capacidade_alunos: 16,
    dispositivo_bloqueado: false,
    created_at: '2025-01-10T08:00:00Z'
  },
  paradas: [
    {
      id: 1,
      id_viagem: 1001,
      id_motorista: 1,
      id_aluno: 201,
      ordem_sequencia: 1,
      status_embarque: 'PENDENTE',
      hora_prevista: '06:45',
      latitude: -22.9348,
      longitude: -43.3412,
      nome_aluno: 'Maria Clara Solon',
      nome_sanitizado: 'Maria C.',
      endereco_real: 'Rua Araguaia, 850 - Apto 302',
      endereco_mascarado: 'Rua A... (Endereço Restrito - LGPD)',
      ponto_referencia: 'Próximo à Praça / Portaria Principal',
      responsavel_nome: 'Leandro Solon',
      responsavel_telefone: '21991234567',
      escola_destino: 'Colégio Santa Mônica',
      codigo_vinculo: 'VAN-201',
      vinculado_usuario_id: 101
    },
    {
      id: 2,
      id_viagem: 1001,
      id_motorista: 1,
      id_aluno: 203,
      ordem_sequencia: 2,
      status_embarque: 'PENDENTE',
      hora_prevista: '06:55',
      latitude: -22.9320,
      longitude: -43.3445,
      nome_aluno: 'Enzo Gabriel Souza',
      nome_sanitizado: 'Enzo G.',
      endereco_real: 'Rua Tirol, 412 - Casa',
      endereco_mascarado: 'Rua T... (Endereço Restrito - LGPD)',
      ponto_referencia: 'Próximo à Padaria / Vila',
      responsavel_nome: 'Carla Souza',
      responsavel_telefone: '21973216549',
      escola_destino: 'Colégio Santa Mônica',
      codigo_vinculo: 'VAN-203',
      vinculado_usuario_id: null
    },
    {
      id: 3,
      id_viagem: 1001,
      id_motorista: 1,
      id_aluno: 202,
      ordem_sequencia: 3,
      status_embarque: 'PENDENTE',
      hora_prevista: '07:05',
      latitude: -22.9295,
      longitude: -43.3385,
      nome_aluno: 'Lucas Silva',
      nome_sanitizado: 'Lucas S.',
      endereco_real: 'Est. dos Três Rios, 1200 - Bloco 2',
      endereco_mascarado: 'Est. T... (Endereço Restrito - LGPD)',
      ponto_referencia: 'Próximo à Farmácia / Guarita',
      responsavel_nome: 'Marcos Silva',
      responsavel_telefone: '21984567890',
      escola_destino: 'Colégio Santa Mônica',
      codigo_vinculo: 'VAN-202',
      vinculado_usuario_id: null
    },
    {
      id: 4,
      id_viagem: 1001,
      id_motorista: 1,
      id_aluno: 204,
      ordem_sequencia: 4,
      status_embarque: 'PENDENTE',
      hora_prevista: '07:15',
      latitude: -22.9268,
      longitude: -43.3340,
      nome_aluno: 'Beatriz Lima',
      nome_sanitizado: 'Beatriz L.',
      endereco_real: 'Est. do Bananal, 350 - Casa 3',
      endereco_mascarado: 'Est. B... (Endereço Restrito - LGPD)',
      ponto_referencia: 'Próximo ao Posto / Condomínio',
      responsavel_nome: 'Fernanda Lima',
      responsavel_telefone: '21981129988',
      escola_destino: 'Colégio Santa Mônica',
      codigo_vinculo: 'VAN-204',
      vinculado_usuario_id: null
    }
  ],
  gpsAtual: {
    latitude: -22.9348,
    longitude: -43.3412,
    speedKmH: 0,
    heading: 45,
    timestamp: new Date().toISOString(),
    accuracyMeters: 6,
    currentAddress: 'Rua Araguaia, 850 - Freguesia, Rio de Janeiro',
    nextStopName: 'Parada 1: Maria Clara (Leandro Solon)',
    etaNextStopMinutes: 4
  },
  mensagens: [] as Array<{ id: string; remetente: string; papel: 'MOTORISTA' | 'PAI'; texto: string; timestamp: string }>
};

// ============================================================================
// ESTADO POR MOTORISTA: cada motorista tem a sua própria viagem, GPS e mensagens.
// As paradas já carregam `id_motorista`. O motorista 1 (demonstração) herda o estado inicial.
// ============================================================================
interface Trip {
  viagem: typeof serverState.viagem;
  gpsAtual: typeof serverState.gpsAtual;
  mensagens: typeof serverState.mensagens;
}
const tripsDB = new Map<number, Trip>();
tripsDB.set(1, { viagem: serverState.viagem, gpsAtual: serverState.gpsAtual, mensagens: serverState.mensagens });

function makeTrip(driverId: number): Trip {
  return {
    viagem: {
      id: 1000 + driverId,
      uuid: `v-${1000 + driverId}`,
      id_motorista: driverId,
      data: new Date().toISOString().slice(0, 10),
      periodo: 'MANHA_IDA',
      status: 'AGENDADA',
      rota_nome: 'Rota',
      distancia_km_estimada: 0,
      created_at: new Date().toISOString()
    },
    gpsAtual: {
      latitude: -22.9068,
      longitude: -43.1729,
      speedKmH: 0,
      heading: 0,
      timestamp: new Date().toISOString(),
      accuracyMeters: 0,
      currentAddress: '',
      nextStopName: '',
      etaNextStopMinutes: 0
    },
    mensagens: []
  };
}

function getTrip(driverId: number): Trip {
  let t = tripsDB.get(driverId);
  if (!t) {
    t = makeTrip(driverId);
    tripsDB.set(driverId, t);
  }
  return t;
}

/** Dono (motorista) da parada; paradas antigas sem dono pertencem ao motorista 1. */
function donoDaParada(p: any): number {
  return p?.id_motorista ?? 1;
}

/** Qual motorista "enxerga" este usuário: motorista = ele mesmo; responsável = motorista do seu aluno; admin = motorista 1. */
function driverIdFor(user: { role: string; userId?: number; studentId?: number }): number | null {
  if (user.role === 'motorista') return user.userId ?? null;
  if (user.role === 'admin') return 1;
  const parada = serverState.paradas.find((p: any) => p.id_aluno === user.studentId);
  return parada ? donoDaParada(parada) : null;
}

/** Perfil público do motorista, montado a partir do cadastro real (nunca de um objeto global). */
function perfilMotorista(driverId: number) {
  const rec = usersDB.find((u) => u.id === driverId);
  if (!rec) return null;
  return {
    id: rec.id,
    uuid: `m-${rec.id}`,
    nome: rec.fullName,
    telefone: rec.whatsapp || rec.phone || '',
    veiculo_modelo: rec.veiculoModelo || 'Van escolar',
    veiculo_placa: rec.veiculoPlaca || '',
    capacidade_alunos: rec.capacidade || 16,
    horarios: rec.horarios || ['Manhã', 'Tarde'],
    aceita_enderecos_dinamicos: (rec as any).aceita_enderecos_dinamicos ?? false,
    dispositivo_bloqueado: !!(rec as any).dispositivo_bloqueado,
    created_at: new Date().toISOString()
  };
}

// ============================================================================
// PROXIMIDADE DA VAN (privacidade): o responsável recebe só um resumo calculado no servidor
// (estado, progresso, minutos). Coordenadas da van só saem quando a próxima parada é a do aluno.
// ============================================================================
const MIN_POR_PARADA = 4;
const AVISOS_VALIDOS = [3, 5, 10, 15, 20, 30];
const ESTILOS_VALIDOS = ['A', 'B', 'C'];
const PREFS_PADRAO = { estilo: 'C' as 'A' | 'B' | 'C', avisoMin: 10 };
function prefsDe(userId?: number) {
  const u = usersDB.find((x) => x.id === userId);
  return { ...PREFS_PADRAO, ...(u?.prefs || {}) };
}
function haversineKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad, dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
interface Proximidade {
  estado: 'aguardando' | 'a_caminho' | 'proxima' | 'embarcou' | 'entregue' | 'ausente' | 'encerrada';
  rotaAtiva: boolean;
  progresso: number;
  minutos: number | null;
  mapaLiberado: boolean;
  avisoAtivo: boolean;
  posicao?: { latitude: number; longitude: number; heading: number };
  atualizadoEm: string;
}
function computeProximity(driverId: number, studentId: number | undefined, avisoMin: number): Proximidade | null {
  if (!studentId) return null;
  const trip = getTrip(driverId);
  const minhas = serverState.paradas
    .filter((p: any) => donoDaParada(p) === driverId)
    .sort((a: any, b: any) => (a.ordem_sequencia ?? 0) - (b.ordem_sequencia ?? 0));
  const mine: any = minhas.find((p: any) => p.id_aluno === studentId);
  if (!mine) return null;
  const agora = new Date().toISOString();
  const st = String(trip.viagem.status);
  const rotaAtiva = st === 'EM_ANDAMENTO';
  const base = { rotaAtiva, mapaLiberado: false, avisoAtivo: false, atualizadoEm: agora };
  if (mine.status_embarque === 'AUSENTE') return { ...base, estado: 'ausente', progresso: 0, minutos: null };
  if (mine.status_embarque === 'ENTREGUE') return { ...base, estado: 'entregue', progresso: 1, minutos: 0 };
  if (mine.status_embarque === 'EMBARCOU') return { ...base, estado: 'embarcou', progresso: 1, minutos: 0 };
  if (st === 'FINALIZADA' || st === 'CONCLUIDA') return { ...base, estado: 'encerrada', progresso: 0, minutos: null };
  if (!rotaAtiva) return { ...base, estado: 'aguardando', progresso: 0, minutos: null };

  const antes = minhas.filter((p: any) => (p.ordem_sequencia ?? 0) < (mine.ordem_sequencia ?? 0));
  const faltam = antes.filter((p: any) => p.status_embarque === 'PENDENTE').length; // paradas antes da dele ainda não atendidas
  let minutos = (faltam + 1) * MIN_POR_PARADA;
  const gps = trip.gpsAtual;
  if (gps.accuracyMeters > 0 && typeof mine.latitude === 'number' && typeof mine.longitude === 'number') {
    const km = haversineKm(gps, mine);
    const velocidade = Math.max(20, Math.min(50, gps.speedKmH || 0)); // km/h; evita estimativas absurdas com a van parada
    minutos = Math.min(minutos, Math.max(1, Math.round((km / velocidade) * 60) + faltam));
  }
  const proxima = faltam === 0;
  const progresso = Math.max(0, Math.min(0.97, (antes.length - faltam) / (antes.length + 1)));
  const out: Proximidade = {
    ...base,
    estado: proxima ? 'proxima' : 'a_caminho',
    progresso,
    minutos,
    mapaLiberado: proxima && gps.accuracyMeters > 0,
    avisoAtivo: minutos <= avisoMin
  };
  if (out.mapaLiberado) out.posicao = { latitude: gps.latitude, longitude: gps.longitude, heading: gps.heading };
  return out;
}

/** ID de acesso: 3–30 caracteres (letras minúsculas, números, ponto, traço, sublinhado), sem @. */
function lerLoginId(v: unknown): string | null {
  const id = String(v ?? '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{2,29}$/.test(id) ? id : null;
}

/** Acha o usuário pelo e-mail (contém @) ou pelo ID de acesso cadastrado. */
function acharUsuarioPorLogin(identificador: unknown): UserRecord | undefined {
  const ident = String(identificador ?? '').trim().toLowerCase();
  if (!ident) return undefined;
  return ident.includes('@')
    ? usersDB.find((u) => u.email.toLowerCase() === ident)
    : usersDB.find((u) => u.loginId === ident);
}

// ---- Horários da escola (informados pelo responsável) e horários previstos da van ----
const FOLGA_CHEGADA_MIN = 15;   // a van chega à escola esta folga antes da entrada
const TRAJETO_ESCOLA_MIN = 10;  // do último embarque até a escola
const APOS_SAIDA_MIN = 10;      // da saída da escola até o primeiro desembarque

function lerHorario(v: unknown): string | null {
  const t = String(v ?? '').trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : null;
}
const paraMin = (h: string) => parseInt(h.slice(0, 2), 10) * 60 + parseInt(h.slice(3), 10);
const deMin = (m: number) => {
  const x = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
};

/** Horários previstos de ida e volta: o motorista pode fixar à mão; senão vêm do horário da escola. */
function horariosDaParada(p: any): { hora_ida: string | null; hora_volta: string | null } {
  const dono = donoDaParada(p);
  const grupo = serverState.paradas
    .filter((x: any) => donoDaParada(x) === dono)
    .sort((a: any, b: any) => a.ordem_sequencia - b.ordem_sequencia);
  const idx = Math.max(0, grupo.findIndex((x: any) => x.id === p.id));
  const ida = p.hora_ida_manual
    ?? (p.escola_entrada ? deMin(paraMin(p.escola_entrada) - FOLGA_CHEGADA_MIN - TRAJETO_ESCOLA_MIN - (grupo.length - 1 - idx) * MIN_POR_PARADA) : null);
  const volta = p.hora_volta_manual
    ?? (p.escola_saida ? deMin(paraMin(p.escola_saida) + APOS_SAIDA_MIN + idx * MIN_POR_PARADA) : null);
  return { hora_ida: ida, hora_volta: volta };
}

function comHorarios(p: any) {
  const h = horariosDaParada(p);
  return { ...p, ...h, hora_prevista: h.hora_ida ?? 'A definir' };
}

/** Valida um par latitude/longitude; devolve null se inválido. Arredonda a ~1 m. */
function lerLocal(lat: unknown, lng: unknown): { latitude: number; longitude: number } | null {
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return { latitude: Number(lat.toFixed(5)), longitude: Number(lng.toFixed(5)) };
}

function getFilteredStateForUser(user: SessionPayload) {
  const driverId = driverIdFor(user);
  const trip = driverId !== null ? getTrip(driverId) : makeTrip(0);
  const cloned = JSON.parse(JSON.stringify({
    motorista: serverState.motorista,
    paradas: serverState.paradas.map(comHorarios),
    viagem: trip.viagem,
    gpsAtual: trip.gpsAtual,
    mensagens: trip.mensagens
  }));
  const perfil = driverId !== null ? perfilMotorista(driverId) : null;
  if (perfil) {
    cloned.motorista = perfil;
    cloned.viagem.rota_nome = `Rota ${perfil.nome.split(' ')[0]} - Jacarepaguá`;
  }

  // Motorista vê EXCLUSIVAMENTE suas próprias paradas/alunos
  if (user.role === 'motorista') {
    cloned.paradas = cloned.paradas
      .filter((p: any) => donoDaParada(p) === user.userId)
      .map((p: any) => ({
        ...p,
        endereco_real: undefined,
        responsavel_telefone: undefined,
        responsavel_telefone_mascarado: p.responsavel_telefone ? `(${p.responsavel_telefone.slice(0,2)}) 9****-${p.responsavel_telefone.slice(-4)}` : undefined
      }));
  } else if (user.role === 'admin') {
    cloned.paradas = cloned.paradas.map((p: any) => ({
      ...p,
      endereco_real: p.endereco_real,
      responsavel_telefone: p.responsavel_telefone,
      responsavel_telefone_mascarado: p.responsavel_telefone ? `(${p.responsavel_telefone.slice(0,2)}) 9****-${p.responsavel_telefone.slice(-4)}` : undefined
    }));
  } else if (user.role === 'responsavel') {
    const studentId = user.studentId;
    if (studentId) {
      cloned.paradas = cloned.paradas.filter((p: any) => p.id_aluno === studentId);
    } else {
      cloned.paradas = [];
    }
    // PRIVACIDADE: responsável nunca recebe a posição bruta da van; só quando a próxima parada é a do aluno.
    const prox = driverId !== null ? computeProximity(driverId, studentId, prefsDe(user.userId).avisoMin) : null;
    cloned.gpsAtual = {
      latitude: prox?.posicao?.latitude ?? 0,
      longitude: prox?.posicao?.longitude ?? 0,
      speedKmH: 0,
      heading: prox?.posicao?.heading ?? 0,
      timestamp: trip.gpsAtual.timestamp,
      accuracyMeters: prox?.posicao ? trip.gpsAtual.accuracyMeters : 0,
      currentAddress: '',
      nextStopName: '',
      etaNextStopMinutes: prox?.minutos ?? 0
    };
    cloned.proximidade = prox;
    cloned.prefs = prefsDe(user.userId);
  }

  return cloned;
}

function broadcast(event: string, data: any, driverId?: number | null) {
  sseClients.forEach((client) => {
    // Eventos de um motorista só chegam a ele, aos responsáveis dos seus alunos e a administradores.
    if (driverId !== undefined && driverId !== null && client.role !== 'admin') {
      if (driverIdFor({ role: client.role, userId: client.userId, studentId: client.studentId }) !== driverId) return;
    }
    try {
      const filteredData = getFilteredStateForUser({ role: client.role, userId: client.userId || 1, email: '', studentId: client.studentId, exp: Date.now() + 99999 });
      if (client.role === 'responsavel' && event === 'GPS_ATUALIZADO') {
        // Responsável não recebe coordenadas: só o resumo de proximidade calculado no servidor.
        client.res.write(`event: PROXIMIDADE_ATUALIZADA\ndata: ${JSON.stringify({ proximidade: filteredData.proximidade, estado: filteredData })}\n\n`);
        return;
      }
      const payload = `event: ${event}\ndata: ${JSON.stringify({ ...data, estado: filteredData })}\n\n`;
      client.res.write(payload);
      if (client.role === 'responsavel' && (event === 'STATUS_EMBARQUE_ATUALIZADO' || event === 'ROTA_STATUS_ALTERADO' || event === 'AUSENCIA_NOTIFICADA' || event === 'AUSENCIA_CANCELADA')) {
        client.res.write(`event: PROXIMIDADE_ATUALIZADA\ndata: ${JSON.stringify({ proximidade: filteredData.proximidade, estado: filteredData })}\n\n`);
      }
    } catch {
      // Ignore disconnect
    }
  });
}

async function startServer() {
  // ==========================================================================
  // PERSISTÊNCIA: carrega o estado salvo (Firestore/arquivo) antes de aceitar requisições
  // ==========================================================================
  const persistence = await createPersistence();
  const seedEmails = new Set(usersDB.map((u) => u.email.toLowerCase()));
  try {
    const saved = await persistence.load();
    if (Array.isArray(saved.users)) usersDB.splice(0, usersDB.length, ...saved.users);
    if (Array.isArray(saved.invitations)) driverInvitationsDB.splice(0, driverInvitationsDB.length, ...saved.invitations);
    if (saved.state) {
      if (Array.isArray(saved.state.paradas)) serverState.paradas = saved.state.paradas;
      // Formato novo: uma viagem + mensagens por motorista. Formato antigo (único) pertence ao motorista 1.
      const trips: Record<string, { viagem?: any; mensagens?: any[] }> =
        saved.state.trips || (saved.state.viagem ? { '1': { viagem: saved.state.viagem, mensagens: saved.state.mensagens } } : {});
      for (const [id, t] of Object.entries(trips)) {
        const trip = getTrip(Number(id));
        if (t?.viagem) trip.viagem = t.viagem;
        if (Array.isArray(t?.mensagens)) trip.mensagens = t.mensagens;
      }
    }
    if (Array.isArray(saved.settings?.adminEmails)) {
      for (const e of saved.settings.adminEmails) {
        const email = String(e).toLowerCase().trim();
        if (email && !ADMIN_EMAILS.includes(email)) ADMIN_EMAILS.push(email);
      }
    }
    // Segurança: senhas das contas de demonstração nunca valem fora do DEMO_MODE, mesmo que tenham sido salvas.
    if (!SEED_LOGIN_ENABLED) {
      for (const u of usersDB) if (seedEmails.has(u.email.toLowerCase())) u.passwordHash = '';
    }
    console.log(`[Persistência] Armazenamento: ${persistence.kind} | usuários: ${usersDB.length} | convites: ${driverInvitationsDB.length} | paradas: ${serverState.paradas.length}`);
  } catch (err: any) {
    console.error('[Persistência] Falha ao carregar o estado salvo (seguindo SEM gravar, para não sobrescrever dados):', err?.message || err);
    persistence.disable(`falha_ao_ler_${persistence.kind}${err?.code !== undefined ? '_codigo_' + err.code : ''}`);
  }
  persistence.attach(() => ({
    users: usersDB,
    invitations: driverInvitationsDB,
    state: {
      paradas: serverState.paradas,
      trips: Object.fromEntries([...tripsDB.entries()].map(([id, t]) => [id, { viagem: t.viagem, mensagens: t.mensagens }]))
    },
    settings: { adminEmails: ADMIN_EMAILS }
  }));
  const shutdown = async (signal: string) => {
    console.log(`[VanEscolar Server] ${signal} recebido: salvando estado antes de encerrar...`);
    try { await persistence.flush(); } catch (err: any) { console.error('[Persistência] Falha ao salvar no encerramento:', err?.message || err); }
    process.exit(0);
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  // Qualquer requisição que altera dados (POST/PUT/PATCH/DELETE) e termina com sucesso agenda uma gravação.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
      res.on('finish', () => { if (res.statusCode < 400) persistence.scheduleSave(); });
    }
    next();
  });

  // Saúde do servidor (não expõe dados): útil para conferir se a persistência está ativa.
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, persistence: persistence.kind, ...(persistence.reason ? { motivo: persistence.reason } : {}) });
  });

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  const authenticate = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    let token = '';
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.cookies && req.cookies.van_session) {
      token = req.cookies.van_session;
    }

    if (!token) {
      return res.status(401).json({ error: 'Acesso não autorizado. Token ausente.' });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    }

    (req as any).user = payload;
    (req as any).token = token;
    next();
  };

  const requireDriver = (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as SessionPayload;
    // Admins também podem acessar rotas de motorista
    if (!user || (user.role !== 'motorista' && user.role !== 'admin')) {
      return res.status(403).json({ error: 'Acesso negado: Rota restrita ao perfil de motorista ou administrador.' });
    }
    if (!user.emailVerified) {
      return res.status(403).json({ error: 'E-mail do motorista não verificado. Verifique seu e-mail para acessar o painel.' });
    }
    next();
  };

  const requireTripOwnership = (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as SessionPayload;
    if (user.role === 'admin' || user.role === 'motorista') return next(); // Admins e Motoristas operam a viagem ativa
    // Responsáveis nunca operam a viagem (rotas de motorista).
    auditLog('ACESSO_NEGADO_VIAGEM', user.email, `Usuário ${user.userId} tentou operar uma viagem`);
    return res.status(403).json({ error: 'Acesso negado: esta viagem pertence a outro usuário.' });
  };

  const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as SessionPayload;
    if (!user || (user.role !== 'admin' && !ADMIN_EMAILS.includes(user.email.toLowerCase()))) {
      return res.status(403).json({ error: 'Acesso restrito a administradores do sistema.' });
    }
    // Garante que o role esteja correto no payload caso venha apenas pelo email
    if (user.role !== 'admin') {
      user.role = 'admin';
    }
    next();
  };

  // --------------------------------------------------------------------------
  // NOVOS ENDPOINTS DE AUTENTICAÇÃO E CONVITES DE MOTORISTA
  // --------------------------------------------------------------------------

  // REGISTRO DE MOTORISTA COM CÓDIGO DE CONVITE OBRIGATÓRIO
  app.post('/api/auth/register-motorista', rateLimiter(5, 60000), (req: Request, res: Response) => {
    const { fullName, email, password, phone, vehicleModel, vehiclePlate, invitationCode, lgpdConsent, firebaseUid } = req.body;
    const loginId = req.body.loginId ? lerLoginId(req.body.loginId) : undefined;
    if (req.body.loginId && !loginId) {
      return res.status(400).json({ error: 'ID inválido. Use de 3 a 30 letras minúsculas, números, ponto, traço ou sublinhado.' });
    }
    if (loginId && usersDB.some((u) => u.loginId === loginId)) {
      return res.status(400).json({ error: 'Este ID já está em uso. Escolha outro.' });
    }

    if (!fullName || !email || !invitationCode || !lgpdConsent) {
      return res.status(400).json({ error: 'Todos os campos obrigatórios e o código de convite devem ser fornecidos.' });
    }

    // Valida código de convite de motorista
    const inv = driverInvitationsDB.find(
      (i) => i.code.toUpperCase() === invitationCode.trim().toUpperCase()
    );

    if (!inv || inv.used || inv.revoked || inv.expiresAt < Date.now()) {
      auditLog('CONVITE_MOTORISTA_INVALIDO', email, `Tentativa com convite: ${invitationCode}`);
      return res.status(400).json({ error: 'Código de convite de motorista inválido, expirado ou já utilizado.' });
    }

    const existing = usersDB.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (existing) {
      return res.status(400).json({ error: 'Não foi possível completar o cadastro de motorista com este e-mail.' });
    }

    const newDriverId = usersDB.length + 1;

    const newDriverUser: UserRecord = {
      id: newDriverId,
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      ...(loginId ? { loginId } : {}),
      passwordHash: password ? crypto.scryptSync(password, 'salt-van-escolar', 64).toString('hex') : '',
      role: 'motorista',
      emailVerified: true,
      phone: phone || '(21) 98765-4321',
      veiculoModelo: vehicleModel || 'Renault Master Executiva',
      veiculoPlaca: vehiclePlate || 'RIO-2026',
      lgpdConsent: {
        accepted: true,
        timestamp: new Date().toISOString(),
        version: 'v1.0-motorista-lgpd'
      }
    };

    usersDB.push(newDriverUser);

    // Marca convite como utilizado
    inv.used = true;
    inv.usedAt = new Date().toISOString();
    inv.usedBy = newDriverUser.email;

    auditLog('MOTORISTA_CADASTRADO', newDriverUser.email, `Convite ${inv.code} utilizado com sucesso`);

    const token = signToken({ role: 'motorista', userId: newDriverUser.id, email: newDriverUser.email, emailVerified: true }, 12);
    res.json({
      sucesso: true,
      token,
      emailVerified: true,
      message: 'Conta de motorista criada com sucesso.'
    });
  });

  // LOGIN DO MOTORISTA (E-MAIL OU GOOGLE VIA ID TOKEN)
  app.post('/api/auth/login-motorista', rateLimiter(10, 60000), async (req: Request, res: Response) => {
    const { email, idToken, password } = req.body;
    const verified = idToken ? await verifyFirebaseIdToken(idToken) : null;
    // Token verificado de OUTRO e-mail nunca vale; token não verificável cai na checagem de senha abaixo.
    if (verified && verified.email !== String(email || '').trim().toLowerCase()) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }
    
    // Em um sistema real, aqui verificaríamos o idToken com firebase-admin
    // Aqui simulamos a busca pelo usuário via e-mail
    const achado = acharUsuarioPorLogin(email);
    const user = achado && achado.role === 'motorista' ? achado : undefined;

    if (!user) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    // Sem token Google/Firebase verificado, a senha é OBRIGATÓRIA.
    if (!verified) {
      const passHash = crypto.scryptSync(String(password || ''), 'salt-van-escolar', 64).toString('hex');
      if (!password || !user.passwordHash || !safeEqual(user.passwordHash, passHash)) {
        return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
      }
    }

    const isAdmin = ADMIN_EMAILS.includes(user.email.toLowerCase());
    const role = isAdmin ? 'admin' : 'motorista';

    const token = signToken({ role, userId: user.id, email: user.email, emailVerified: user.emailVerified }, 12);
    auditLog('LOGIN_MOTORISTA_SUCESSO', user.email, `Motorista autenticado como ${role}`);
    res.json({
      sucesso: true,
      token,
      role,
      emailVerified: user.emailVerified,
      totpEnabled: !!user.totpEnabled
    });
  });

  app.post('/api/auth/google-motorista', (req: Request, res: Response) => {
    // Redireciona para login-motorista genérico
    return app._router.handle(req, res, () => {});
  });

  // LOGIN DO RESPONSÁVEL (E-MAIL OU GOOGLE VIA ID TOKEN)
  app.post('/api/auth/login-email', rateLimiter(10, 60000), async (req: Request, res: Response) => {
    const { email, password, idToken } = req.body;
    const verified = idToken ? await verifyFirebaseIdToken(idToken) : null;
    // Token verificado de OUTRO e-mail nunca vale; token não verificável cai na checagem de senha abaixo.
    if (verified && verified.email !== String(email || '').trim().toLowerCase()) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    const user = acharUsuarioPorLogin(email);

    if (!user) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    // Sem token Google/Firebase verificado, a senha é OBRIGATÓRIA.
    if (!verified) {
      const passHash = crypto.scryptSync(String(password || ''), 'salt-van-escolar', 64).toString('hex');
      if (!password || !user.passwordHash || !safeEqual(user.passwordHash, passHash)) {
        return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
      }
    }

    const isAdmin = ADMIN_EMAILS.includes(user.email.toLowerCase());
    const role = isAdmin ? 'admin' : user.role;
    const token = signToken({ role, userId: user.id, email: user.email, studentId: user.studentId, emailVerified: user.emailVerified });
    auditLog('LOGIN_SUCESSO', user.email, `Login realizado como ${role}`);
    res.json({ sucesso: true, token, role, emailVerified: user.emailVerified, studentId: user.studentId });
  });

  app.post('/api/auth/google', rateLimiter(10, 60000), async (req: Request, res: Response) => {
    const { fullName, idToken } = req.body;
    // O e-mail vem SOMENTE do token verificado, nunca do corpo da requisição.
    const verified = await verifyFirebaseIdToken(idToken);
    if (!verified) {
      return res.status(401).json({ error: 'Não foi possível validar o login com Google.' });
    }
    const email = verified.email;

    let user = usersDB.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user) {
      user = {
        id: 200 + usersDB.length + 1,
        fullName: fullName || 'Responsável Google',
        email: email.trim().toLowerCase(),
        passwordHash: '',
        role: 'responsavel',
        emailVerified: true,
        lgpdConsent: { accepted: true, timestamp: new Date().toISOString(), version: 'v1.0-lgpd-art14' }
      };
      usersDB.push(user);
    }

    const isAdmin = ADMIN_EMAILS.includes(user.email.toLowerCase());
    const role = isAdmin ? 'admin' : user.role;
    const token = signToken({ role, userId: user.id, email: user.email, studentId: user.studentId, emailVerified: true });
    auditLog('LOGIN_GOOGLE', user.email, `Autenticado via Google como ${role}`);
    res.json({ sucesso: true, token, role, emailVerified: true, studentId: user.studentId });
  });

  // ALTERAR CONFIGURAÇÃO DE 2FA (TOTP)
  app.post('/api/auth/toggle-totp', authenticate, requireDriver, (req: Request, res: Response) => {
    const userPayload = (req as any).user as SessionPayload;
    const user = usersDB.find((u) => u.id === userPayload.userId);
    if (user) {
      user.totpEnabled = !user.totpEnabled;
      auditLog('TOTP_TOGGLE', user.email, `2FA alterado para ${user.totpEnabled}`);
      return res.json({ sucesso: true, totpEnabled: user.totpEnabled });
    }
    res.status(404).json({ error: 'Usuário não encontrado' });
  });

  // LOGOUT SEGURO
  app.post('/api/auth/logout', authenticate, (req: Request, res: Response) => {
    const token = (req as any).token;
    if (token) invalidatedTokens.add(token);
    const user = (req as any).user as SessionPayload;
    auditLog('LOGOUT', user.email, 'Sessão encerrada pelo usuário');
    res.json({ sucesso: true });
  });

  // GERENCIAMENTO DE CONVITES PELO ADMINISTRADOR (ALINHADO COM FRONTEND)
  app.post('/api/admin/convites-motorista', authenticate, requireAdmin, (req: Request, res: Response) => {
    const user = (req as any).user as SessionPayload;
    const { nota } = req.body;

    const code = `DRV-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
    const newInvitation: DriverInvitation = {
      code,
      createdBy: user.email,
      createdAt: new Date().toISOString(),
      expiresAt: Date.now() + 72 * 3600 * 1000,
      used: false,
      nota: nota || ''
    };

    driverInvitationsDB.push(newInvitation);
    auditLog('CONVITE_GERADO', user.email, `Novo convite de motorista criado: ${code}`);
    res.json({ sucesso: true, invitation: newInvitation });
  });

  app.get('/api/admin/convites-motorista', authenticate, requireAdmin, (_req: Request, res: Response) => {
    res.json({ sucesso: true, convites: driverInvitationsDB });
  });

  app.delete('/api/admin/convites-motorista/:code', authenticate, requireAdmin, (req: Request, res: Response) => {
    const user = (req as any).user as SessionPayload;
    const { code } = req.params;
    const inv = driverInvitationsDB.find((i) => i.code.toUpperCase() === code?.toUpperCase());
    if (inv) {
      inv.revoked = true;
      auditLog('CONVITE_REVOGADO', user.email, `Convite ${code} revogado`);
      return res.json({ sucesso: true });
    }
    res.status(404).json({ error: 'Convite não encontrado' });
  });

  // --- ENDPOINTS ADMINISTRATIVOS ISOLADOS ---

  app.get('/api/admin/metrics', authenticate, requireAdmin, (req, res) => {
    const metrics = {
      totalDrivers: usersDB.filter(u => u.role === 'motorista').length,
      totalParents: usersDB.filter(u => u.role === 'responsavel').length,
      totalStudents: serverState.paradas.length,
      activeInvites: driverInvitationsDB.filter(i => !i.used && !i.revoked).length
    };
    res.json({ sucesso: true, metrics });
  });

  app.get('/api/admin/motoristas', authenticate, requireAdmin, (req, res) => {
    const motoristas = usersDB
      .filter(u => u.role === 'motorista')
      .map(u => ({
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        veiculoModelo: u.veiculoModelo,
        veiculoPlaca: u.veiculoPlaca,
        whatsapp: u.whatsapp || u.phone,
        capacidade: u.capacidade || 16,
        horarios: u.horarios || ['Manhã', 'Tarde'],
        status: (u as any).status || 'ATIVO'
      }));
    res.json({ sucesso: true, motoristas });
  });

  app.post('/api/admin/motoristas/criar', authenticate, requireAdmin, (req: Request, res: Response) => {
    const { fullName, email, password, horarios, capacidade, veiculoPlaca, whatsapp, veiculoModelo } = req.body;
    if (!fullName || !email || !password) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
    }
    const existing = usersDB.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
    if (existing) {
      return res.status(400).json({ error: 'E-mail de motorista já cadastrado.' });
    }
    const passwordHash = crypto.scryptSync(password, 'salt-van-escolar', 64).toString('hex');
    const newDriver: UserRecord = {
      id: usersDB.length + 200,
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      passwordHash,
      role: 'motorista',
      emailVerified: true,
      phone: whatsapp || '(21) 98765-4321',
      whatsapp: whatsapp || '(21) 98765-4321',
      veiculoModelo: veiculoModelo || 'Renault Master Executiva',
      veiculoPlaca: veiculoPlaca || 'RIO-2026',
      capacidade: capacidade ? Number(capacidade) : 16,
      horarios: horarios || ['Manhã', 'Tarde'],
      lgpdConsent: { accepted: true, timestamp: new Date().toISOString(), version: 'v1.0-motorista' }
    };
    usersDB.push(newDriver);
    auditLog('MOTORISTA_CRIADO_ADMIN', (req as any).user.email, `Criado motorista ${newDriver.email}`);
    res.json({ sucesso: true, motorista: newDriver });
  });

  // Apaga TODOS os dados (alunos, paradas, motoristas, responsáveis, convites, mensagens). Mantém só os admins.
  app.post('/api/admin/limpar-tudo', authenticate, requireAdmin, rateLimiter(3, 60000), (req: Request, res: Response) => {
    if (req.body?.confirmacao !== 'LIMPAR TUDO') {
      return res.status(400).json({ error: 'Confirmação ausente. Digite LIMPAR TUDO.' });
    }
    const admin = (req as any).user as SessionPayload;
    const antes = { usuarios: usersDB.length, convites: driverInvitationsDB.length, paradas: serverState.paradas.length };
    usersDB = usersDB.filter((u) => ADMIN_EMAILS.includes(u.email.toLowerCase()));
    driverInvitationsDB = [];
    serverState.paradas = [];
    tripsDB.clear();
    for (const c of sseClients) { try { c.res.write(`event: DADOS_LIMPOS\ndata: {}\n\n`); } catch {} }
    auditLog('LIMPAR_TUDO', admin.email, `Dados apagados: ${JSON.stringify(antes)}`);
    res.json({ sucesso: true, apagados: antes });
  });

  app.post('/api/admin/motoristas/:id/toggle', authenticate, requireAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    const user = usersDB.find(u => u.id === id);
    if (user) {
      (user as any).status = (user as any).status === 'INATIVO' ? 'ATIVO' : 'INATIVO';
      auditLog('MOTORISTA_STATUS_ALTERADO', (req as any).user.email, `Motorista ${id} alterado para ${(user as any).status}`);
      return res.json({ sucesso: true, status: (user as any).status });
    }
    res.status(404).json({ error: 'Motorista não encontrado' });
  });

  app.get('/api/admin/responsaveis', authenticate, requireAdmin, (req, res) => {
    const responsaveis = usersDB
      .filter(u => u.role === 'responsavel')
      .map(u => {
        const student = serverState.paradas.find(p => p.id_aluno === u.studentId);
        return {
          id: u.id,
          fullName: u.fullName,
          email: u.email,
          emailVerified: u.emailVerified,
          studentName: student ? student.nome_aluno : null
        };
      });
    res.json({ sucesso: true, responsaveis });
  });

  app.get('/api/admin/settings', authenticate, requireAdmin, (req, res) => {
    res.json({ sucesso: true, adminEmails: ADMIN_EMAILS });
  });

  app.post('/api/admin/settings/emails', authenticate, requireAdmin, (req, res) => {
    const { emails } = req.body;
    if (Array.isArray(emails)) {
      // Atualiza a lista em memória (em produção seria no DB)
      ADMIN_EMAILS.length = 0;
      emails.forEach(e => ADMIN_EMAILS.push(e.toLowerCase().trim()));
      auditLog('ADMIN_EMAILS_ATUALIZADOS', (req as any).user.email, `Nova lista: ${ADMIN_EMAILS.join(', ')}`);
      return res.json({ sucesso: true, adminEmails: ADMIN_EMAILS });
    }
    res.status(400).json({ error: 'Formato de e-mails inválido' });
  });

  app.post('/api/admin/auth', rateLimiter(10, 60000), async (req: Request, res: Response) => {
    const { email, idToken, password } = req.body;
    // Prova de identidade obrigatória: token Google/Firebase verificado OU senha de admin (ADMIN_PASSWORD).
    const verified = idToken ? await verifyFirebaseIdToken(idToken) : null;
    const passwordOk = (!!ADMIN_PASSWORD && typeof password === 'string' && safeEqual(password, ADMIN_PASSWORD)) || (SEED_LOGIN_ENABLED && (password === 'senha-de-teste-admin' || password === '123456abcd'));
    const sanitizedEmail = (verified ? verified.email : String(email || '')).trim().toLowerCase();

    if (!verified && !passwordOk) {
      auditLog('TENTATIVA_LOGIN_ADMIN_NEGADA', sanitizedEmail || 'desconhecido', 'Prova de identidade ausente ou inválida');
      return res.status(401).json({ error: 'Credenciais de administrador inválidas.' });
    }

    if (!sanitizedEmail || !ADMIN_EMAILS.includes(sanitizedEmail)) {
      auditLog('TENTATIVA_LOGIN_ADMIN_NEGADA', sanitizedEmail || 'desconhecido', 'E-mail não está na lista de administradores');
      return res.status(403).json({ error: 'Acesso não autorizado. Você não possui privilégios de administrador.' });
    }


    let user = usersDB.find((u) => u.email.toLowerCase() === sanitizedEmail);
    if (!user) {
      user = {
        id: 999 + usersDB.length,
        fullName: 'Administrador ' + (sanitizedEmail.split('@')[0]),
        email: sanitizedEmail,
        passwordHash: '',
        role: 'motorista', 
        emailVerified: true,
        lgpdConsent: { accepted: true, timestamp: new Date().toISOString(), version: 'v1.0-admin' }
      };
      usersDB.push(user);
    }

    const token = signToken({ role: 'admin', userId: user.id, email: user.email, emailVerified: true });
    auditLog('LOGIN_ADMIN_GOOGLE', user.email, 'Acesso ao Painel Admin concedido');
    res.json({ sucesso: true, token, role: 'admin' });
  });

  // ENDPOINTS DE AUTENTICAÇÃO DO RESPONSÁVEL
  app.post('/api/auth/register', rateLimiter(5, 60000), (req: Request, res: Response) => {
    const { fullName, email, password, lgpdConsent } = req.body;
    const loginId = req.body.loginId ? lerLoginId(req.body.loginId) : undefined;
    if (req.body.loginId && !loginId) {
      return res.status(400).json({ error: 'ID inválido. Use de 3 a 30 letras minúsculas, números, ponto, traço ou sublinhado.' });
    }
    if (loginId && usersDB.some((u) => u.loginId === loginId)) {
      return res.status(400).json({ error: 'Este ID já está em uso. Escolha outro.' });
    }

    if (!fullName || !email || !password || !lgpdConsent) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios, incluindo o aceite da LGPD.' });
    }

    if (password.length < 10) {
      return res.status(400).json({ error: 'A senha deve ter no mínimo 10 caracteres.' });
    }

    const existing = usersDB.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (existing) {
      return res.status(400).json({ error: 'Não foi possível completar o cadastro com este e-mail.' });
    }

    const passwordHash = crypto.scryptSync(password, 'salt-van-escolar', 64).toString('hex');
    const newUser: UserRecord = {
      id: 200 + usersDB.length + 1,
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      ...(loginId ? { loginId } : {}),
      passwordHash,
      role: 'responsavel',
      emailVerified: false,
      lgpdConsent: {
        accepted: true,
        timestamp: new Date().toISOString(),
        version: 'v1.0-lgpd-art14'
      }
    };

    usersDB.push(newUser);
    auditLog('USUARIO_CADASTRADO', newUser.email, 'Novo responsável cadastrado com aceite LGPD Art. 14');

    const token = signToken({ role: 'responsavel', userId: newUser.id, email: newUser.email, emailVerified: false });
    res.json({ sucesso: true, token, emailVerified: false, message: 'Cadastro realizado com sucesso. Verifique seu e-mail.' });
  });

  app.post('/api/auth/forgot-password', rateLimiter(5, 60000), (req: Request, res: Response) => {
    const { email } = req.body;
    auditLog('FORGOT_PASSWORD', email || 'desconhecido', 'Solicitação de reset de senha');
    res.json({ sucesso: true, message: 'Se o e-mail estiver cadastrado, as instruções de redefinição foram enviadas.' });
  });

  app.post('/api/auth/verify-email-sim', authenticate, (req: Request, res: Response) => {
    const userPayload = (req as any).user as SessionPayload;
    const user = usersDB.find((u) => u.id === userPayload.userId);
    if (user) {
      user.emailVerified = true;
    }
    const token = signToken({ role: userPayload.role, userId: userPayload.userId, email: userPayload.email, studentId: userPayload.studentId, emailVerified: true });
    res.json({ sucesso: true, token, emailVerified: true });
  });

  // PREFERÊNCIAS DO RESPONSÁVEL: estilo da barra de proximidade e antecedência do aviso.
  // ID de acesso (alternativa ao e-mail no login)
  app.get('/api/conta', authenticate, (req: Request, res: Response) => {
    const u = usersDB.find((x) => x.id === ((req as any).user as SessionPayload).userId);
    res.json({ email: u?.email ?? null, loginId: u?.loginId ?? null });
  });

  app.put('/api/conta/id', authenticate, rateLimiter(10, 60000), (req: Request, res: Response) => {
    const user = (req as any).user as SessionPayload;
    const rec = usersDB.find((x) => x.id === user.userId);
    if (!rec) return res.status(404).json({ error: 'Conta não encontrada.' });
    const id = lerLoginId(req.body?.loginId);
    if (!id) return res.status(400).json({ error: 'ID inválido. Use de 3 a 30 letras minúsculas, números, ponto, traço ou sublinhado.' });
    if (usersDB.some((u) => u.loginId === id && u.id !== rec.id)) {
      return res.status(400).json({ error: 'Este ID já está em uso. Escolha outro.' });
    }
    rec.loginId = id;
    auditLog('ID_ACESSO_DEFINIDO', rec.email, 'ID de acesso definido/alterado');
    res.json({ sucesso: true, loginId: id });
  });

  // Responsável informa entrada e saída da escola (o motorista dono também pode ajustar).
  app.put('/api/alunos/:id/escola-horarios', authenticate, (req: Request, res: Response) => {
    const alunoId = parseInt(req.params.id, 10);
    const user = (req as any).user as SessionPayload;
    if (user.role === 'responsavel' && user.studentId !== alunoId) {
      return res.status(403).json({ error: 'Acesso negado para este aluno.' });
    }
    if (user.role !== 'responsavel' && user.role !== 'motorista') return res.status(403).json({ error: 'Acesso negado.' });
    const parada: any = serverState.paradas.find((p: any) => p.id_aluno === alunoId);
    if (!parada || (user.role === 'motorista' && donoDaParada(parada) !== user.userId)) {
      return res.status(404).json({ error: 'Aluno não encontrado.' });
    }
    const entrada = lerHorario(req.body?.entrada);
    const saida = lerHorario(req.body?.saida);
    if (!entrada || !saida) return res.status(400).json({ error: 'Informe entrada e saída no formato HH:MM.' });
    if (paraMin(saida) <= paraMin(entrada)) return res.status(400).json({ error: 'A saída precisa ser depois da entrada.' });
    parada.escola_entrada = entrada;
    parada.escola_saida = saida;
    broadcast('HORARIOS_ATUALIZADOS', { paradaId: parada.id }, donoDaParada(parada));
    res.json({ sucesso: true, ...horariosDaParada(parada) });
  });

  // Motorista ajusta (ou limpa) o horário previsto de ida/volta de uma parada sua.
  app.put('/api/paradas/:id/horarios', authenticate, requireDriver, requireTripOwnership, (req: Request, res: Response) => {
    const user = (req as any).user as SessionPayload;
    const parada: any = serverState.paradas.find((p: any) => p.id === parseInt(req.params.id, 10));
    if (!parada || donoDaParada(parada) !== user.userId) return res.status(404).json({ error: 'Parada não encontrada' });
    const b = req.body || {};
    for (const [campo, chave] of [['horaIda', 'hora_ida_manual'], ['horaVolta', 'hora_volta_manual']] as const) {
      if (!(campo in b)) continue;
      if (b[campo] === null || b[campo] === '') { delete parada[chave]; continue; }
      const h = lerHorario(b[campo]);
      if (!h) return res.status(400).json({ error: 'Horário inválido. Use HH:MM.' });
      parada[chave] = h;
    }
    broadcast('HORARIOS_ATUALIZADOS', { paradaId: parada.id }, donoDaParada(parada));
    res.json({ sucesso: true, ...horariosDaParada(parada) });
  });

  app.get('/api/preferencias', authenticate, (req: Request, res: Response) => {
    const u = (req as any).user as SessionPayload;
    res.json({ ...prefsDe(u.userId), avisosValidos: AVISOS_VALIDOS });
  });
  app.put('/api/preferencias', authenticate, (req: Request, res: Response) => {
    const u = (req as any).user as SessionPayload;
    const rec = usersDB.find((x) => x.id === u.userId);
    if (!rec || u.role !== 'responsavel') return res.status(403).json({ error: 'Apenas responsáveis têm estas preferências.' });
    const { estilo, avisoMin } = req.body || {};
    if (!ESTILOS_VALIDOS.includes(estilo) || !AVISOS_VALIDOS.includes(avisoMin)) {
      return res.status(400).json({ error: 'Preferências inválidas.' });
    }
    rec.prefs = { estilo, avisoMin };
    res.json({ sucesso: true, ...rec.prefs });
  });

  // PROXIMIDADE: resumo seguro (sem coordenadas, exceto quando a próxima parada é a do aluno).
  app.get('/api/proximidade', authenticate, (req: Request, res: Response) => {
    const u = (req as any).user as SessionPayload;
    if (u.role !== 'responsavel') return res.status(403).json({ error: 'Disponível apenas para responsáveis.' });
    const driverId = driverIdFor(u);
    const prox = driverId !== null ? computeProximity(driverId, u.studentId, prefsDe(u.userId).avisoMin) : null;
    res.json({ proximidade: prox, prefs: prefsDe(u.userId) });
  });

  app.post('/api/vincular', authenticate, rateLimiter(10, 60000), (req: Request, res: Response) => {
    const user = (req as any).user as SessionPayload;
    if (user.role !== 'responsavel') {
      return res.status(403).json({ error: 'Apenas responsáveis podem vincular alunos.' });
    }

    const dbUser = usersDB.find((u) => u.id === user.userId);
    if (dbUser && !dbUser.emailVerified && !user.emailVerified) {
      return res.status(403).json({ error: 'E-mail não verificado. Verifique seu e-mail antes de vincular o aluno.' });
    }

    const { codigoVinculo } = req.body;
    if (!codigoVinculo) {
      return res.status(400).json({ error: 'Código de vínculo obrigatório.' });
    }

    const parada = serverState.paradas.find(
      (p: any) => p.codigo_vinculo?.toUpperCase() === codigoVinculo.trim().toUpperCase()
    );

    if (!parada || parada.vinculado_usuario_id || (parada as any).codigo_expirado) {
      return res.status(404).json({ error: 'Código de convite inválido, já utilizado ou expirado.' });
    }

    parada.vinculado_usuario_id = user.userId;
    (parada as any).codigo_expirado = true; // Expirado imediatamente após o primeiro uso
    if (dbUser) dbUser.studentId = parada.id_aluno;

    const newToken = signToken({ role: 'responsavel', userId: user.userId, email: user.email, studentId: parada.id_aluno, emailVerified: true });
    auditLog('VINCULO_SUCESSO', user.email, `Vinculado ao aluno ID ${parada.id_aluno} (${parada.nome_aluno}) - Código expirado`);
    res.json({ sucesso: true, token: newToken, parada });
  });

  // --------------------------------------------------------------------------
  // ENDPOINT SSE FILTRADO
  // --------------------------------------------------------------------------
  app.get('/api/events', (req: Request, res: Response) => {
    const token = req.query.token as string;
    const payload = token ? verifyToken(token) : null;
    // SEGURANÇA: a transmissão ao vivo (GPS, mensagens, dados do motorista) exige sessão válida.
    if (!payload) return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    const role = payload.role;
    const studentId = payload.studentId;
    const userId = payload.userId;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const clientId = Math.random().toString(36).substring(2);
    const client: SSEClient = { id: clientId, res, role, studentId, userId };
    sseClients.push(client);

    const initialFiltered = getFilteredStateForUser({ role, userId, email: payload.email || '', studentId, exp: Date.now() + 99999 });
    res.write(`event: INIT_STATE\ndata: ${JSON.stringify(initialFiltered)}\n\n`);

    req.on('close', () => {
      sseClients = sseClients.filter((c) => c.id !== clientId);
    });
  });

  app.get('/api/estado', authenticate, (req: Request, res: Response) => {
    const user = (req as any).user as SessionPayload;
    if (user.role === 'motorista' && !user.emailVerified) {
      return res.status(403).json({ error: 'E-mail do motorista não verificado. Verifique seu e-mail para acessar o painel.' });
    }
    const filtered = getFilteredStateForUser(user);
    res.json(filtered);
  });

  // ROTAS DE MOTORISTA COM PROTEÇÃO DE ROLE E OWNER DA VIAGEM (REQUISITO 5)
  app.post('/api/paradas/:id/status', authenticate, requireDriver, requireTripOwnership, (req: Request, res: Response) => {
    const paradaId = parseInt(req.params.id, 10);
    const { status, observacao } = req.body;
    const userMot = (req as any).user as SessionPayload;
    const parada = serverState.paradas.find((p) => p.id === paradaId || p.id_aluno === paradaId);
    // SEGURANÇA: um motorista só altera as paradas dos SEUS alunos.
    if (!parada || (userMot.role === 'motorista' && donoDaParada(parada) !== userMot.userId)) {
      return res.status(404).json({ error: 'Parada não encontrada' });
    }

    parada.status_embarque = status;
    if (observacao !== undefined) (parada as any).observacao = observacao;
    const timestamp = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    broadcast('STATUS_EMBARQUE_ATUALIZADO', { paradaId: parada.id, status, timestamp, alunoId: parada.id_aluno }, donoDaParada(parada));
    res.json({ sucesso: true, parada });
  });

  app.post('/api/alunos/:id/ausencia', authenticate, (req: Request, res: Response) => {
    const alunoId = parseInt(req.params.id, 10);
    const user = (req as any).user as SessionPayload;
    if (user.role === 'responsavel' && user.studentId !== alunoId) {
      return res.status(403).json({ error: 'Acesso negado para este aluno.' });
    }
    const { motivo, observacao } = req.body;
    const trecho = ['IDA', 'VOLTA'].includes(req.body?.trecho) ? req.body.trecho : 'AMBOS';
    const parada = serverState.paradas.find((p) => p.id_aluno === alunoId || p.id === alunoId);
    if (parada) {
      (parada as any).ausencia_trecho = trecho;
      // Só vale já se a viagem em andamento for do mesmo sentido (ou a ausência for dos dois).
      const trip = getTrip(donoDaParada(parada) as number);
      if (trecho === 'AMBOS' || trecho === ((trip.viagem as any).sentido || 'IDA')) parada.status_embarque = 'AUSENTE';
      (parada as any).motivo_ausencia = motivo || 'Ausência informada pelo responsável';
      if (observacao) (parada as any).observacao = observacao;
    }
    broadcast('AUSENCIA_NOTIFICADA', { alunoId, motivo: motivo || 'Ausência informada pelo responsável', paradaId: parada?.id }, parada ? donoDaParada(parada) : undefined);
    res.json({ sucesso: true, parada });
  });

  app.post('/api/alunos/:id/desfazer-ausencia', authenticate, (req: Request, res: Response) => {
    const alunoId = parseInt(req.params.id, 10);
    const user = (req as any).user as SessionPayload;
    if (user.role === 'responsavel' && user.studentId !== alunoId) {
      return res.status(403).json({ error: 'Acesso negado para este aluno.' });
    }
    const parada = serverState.paradas.find((p) => p.id_aluno === alunoId || p.id === alunoId);
    if (parada) {
      parada.status_embarque = 'PENDENTE';
      delete (parada as any).motivo_ausencia;
      delete (parada as any).ausencia_trecho;
    }
    broadcast('AUSENCIA_CANCELADA', { alunoId, paradaId: parada?.id }, parada ? donoDaParada(parada) : undefined);
    res.json({ sucesso: true });
  });

  app.post('/api/rotas/:acao', authenticate, requireDriver, requireTripOwnership, (req: Request, res: Response) => {
    const { acao } = req.params;
    const driverId = driverIdFor((req as any).user) as number;
    const trip = getTrip(driverId);
    if (acao === 'iniciar') {
      // O motorista escolhe o sentido: IDA (casa → escola) ou VOLTA (escola → casa).
      const sentido = req.body?.sentido === 'VOLTA' ? 'VOLTA' : 'IDA';
      const mudou = (trip.viagem as any).sentido !== sentido;
      (trip.viagem as any).sentido = sentido;
      (trip.viagem as any).periodo = sentido === 'VOLTA' ? 'MANHA_VOLTA' : 'MANHA_IDA';
      trip.viagem.status = 'EM_ANDAMENTO';
      if (mudou) {
        // Novo sentido: todos voltam a PENDENTE, exceto quem avisou ausência para este sentido.
        for (const p of serverState.paradas as any[]) {
          if (donoDaParada(p) !== driverId) continue;
          const trechoAus = p.ausencia_trecho ?? (p.status_embarque === 'AUSENTE' ? 'AMBOS' : null);
          const ausente = trechoAus === sentido || trechoAus === 'AMBOS';
          p.status_embarque = ausente ? 'AUSENTE' : 'PENDENTE';
        }
      }
    }
    else if (acao === 'encerrar') { trip.viagem.status = 'CONCLUIDA'; delete (trip.viagem as any).sentido; }
    broadcast('ROTA_STATUS_ALTERADO', { status: trip.viagem.status, sentido: (trip.viagem as any).sentido }, driverId);
    res.json({ sucesso: true, status: trip.viagem.status });
  });

  app.post('/api/gps', authenticate, requireDriver, requireTripOwnership, (req: Request, res: Response) => {
    const { latitude, longitude, speedKmH, heading, accuracyMeters, currentAddress, nextStopName, etaNextStopMinutes } = req.body;
    // Valida coordenadas: precisam ser números dentro da faixa geográfica válida.
    if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return res.status(400).json({ error: 'Coordenadas inválidas.' });
    }
    const num = (v: any, def: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : def);
    const driverId = driverIdFor((req as any).user) as number;
    const trip = getTrip(driverId);
    trip.gpsAtual = {
      latitude,
      longitude,
      speedKmH: num(speedKmH, 0, 200),
      heading: num(heading, trip.gpsAtual.heading, 360),
      timestamp: new Date().toISOString(),
      accuracyMeters: Math.max(1, num(accuracyMeters, 5, 10000)),
      currentAddress: currentAddress ?? trip.gpsAtual.currentAddress,
      nextStopName: nextStopName ?? trip.gpsAtual.nextStopName,
      etaNextStopMinutes: etaNextStopMinutes ?? trip.gpsAtual.etaNextStopMinutes
    };
    broadcast('GPS_ATUALIZADO', trip.gpsAtual, driverId);
    res.json({ sucesso: true });
  });

  app.post('/api/paradas/nova', authenticate, requireDriver, requireTripOwnership, (req: Request, res: Response) => {
    const user = (req as any).user as SessionPayload;
    const { nomeAluno, endereco, pontoReferencia, escola } = req.body;
    const telefone = req.body.telefone ?? req.body.telefoneResponsavel;
    const responsavelNome = req.body.responsavelNome ?? req.body.nomeResponsavel;
    const local = lerLocal(req.body.latitude, req.body.longitude);
    if (req.body.latitude !== undefined && req.body.latitude !== null && !local) {
      return res.status(400).json({ error: 'Localização inválida.' });
    }
    const novoId = serverState.paradas.reduce((m: number, p: any) => Math.max(m, p.id % 1000, (p.id_aluno ?? 0) - 210), 0) + 1;
    const codigoVinculo = `VAN-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const novaParada = {
      id: 1000 + novoId,
      id_viagem: 1000 + user.userId,
      id_motorista: user.userId,
      id_aluno: 210 + novoId,
      ordem_sequencia: serverState.paradas.filter((p: any) => p.id_motorista === user.userId).length + 1,
      status_embarque: 'PENDENTE' as const,
      ...(lerHorario(req.body.escolaEntrada) ? { escola_entrada: lerHorario(req.body.escolaEntrada)! } : {}),
      ...(lerHorario(req.body.escolaSaida) ? { escola_saida: lerHorario(req.body.escolaSaida)! } : {}),
      // Sem localização marcada o aluno fica sem coordenadas (nunca um ponto inventado).
      latitude: local ? local.latitude : null,
      longitude: local ? local.longitude : null,
      nome_aluno: nomeAluno,
      nome_sanitizado: `${nomeAluno.split(' ')[0]} ${nomeAluno.split(' ')[1]?.[0] || ''}.`,
      endereco_real: endereco,
      endereco_mascarado: mascararEnderecoSeguro(endereco),
      ponto_referencia: pontoReferencia || 'Próximo à via principal',
      responsavel_nome: responsavelNome || 'Responsável Cadastrado',
      responsavel_telefone: telefone || '21999999999',
      escola_destino: escola || 'Colégio Santa Mônica',
      codigo_vinculo: codigoVinculo,
      vinculado_usuario_id: null
    };

    serverState.paradas.push(novaParada as any);
    broadcast('NOVA_PARADA_CADASTRADA', { novaParada }, user.userId);
    res.json({ sucesso: true, novaParada, codigoVinculo });
  });

  // O motorista marca/atualiza o local de embarque de um aluno seu (navegação e estimativa de chegada).
  app.put('/api/paradas/:id/local', authenticate, requireDriver, requireTripOwnership, (req: Request, res: Response) => {
    const user = (req as any).user as SessionPayload;
    const id = parseInt(req.params.id, 10);
    const parada: any = serverState.paradas.find((p: any) => p.id === id);
    if (!parada || donoDaParada(parada) !== user.userId) return res.status(404).json({ error: 'Parada não encontrada' });
    const local = lerLocal(req.body?.latitude, req.body?.longitude);
    if (!local) return res.status(400).json({ error: 'Localização inválida.' });
    parada.latitude = local.latitude;
    parada.longitude = local.longitude;
    auditLog('LOCAL_PARADA_DEFINIDO', user.email, `Local de embarque definido para a parada ${parada.id}`);
    res.json({ sucesso: true });
  });

  app.post('/api/limpar-dados', authenticate, requireDriver, requireTripOwnership, (req: Request, res: Response) => {
    if (!DEMO_MODE) return res.status(403).json({ error: 'Modo demonstração desativado.' });
    const driverId = driverIdFor((req as any).user) as number;
    const trip = getTrip(driverId);
    serverState.paradas = serverState.paradas.filter((p: any) => donoDaParada(p) !== driverId);
    trip.mensagens.length = 0;
    trip.viagem.status = 'AGENDADA';
    broadcast('DADOS_LIMPOS', {}, driverId);
    res.json({ sucesso: true });
  });

  app.post('/api/mensagens', authenticate, (req: Request, res: Response) => {
    const user = (req as any).user as SessionPayload;
    const { texto } = req.body;
    let senderName = 'Responsável';
    if (user.role === 'motorista') {
      const dbDriver = usersDB.find(u => u.id === user.userId || (user.email && u.email.toLowerCase() === user.email.toLowerCase()));
      senderName = dbDriver?.fullName ? `${dbDriver.fullName} (Motorista)` : 'Motorista';
    } else if (user.role === 'admin') {
      senderName = 'Administrador';
    } else {
      const dbResp = usersDB.find(u => u.id === user.userId);
      senderName = dbResp?.fullName ? `${dbResp.fullName} (Responsável)` : 'Responsável';
    }
    const novaMsg = {
      id: Math.random().toString(36).substring(2),
      remetente: senderName,
      papel: user.role === 'motorista' ? ('MOTORISTA' as const) : ('PAI' as const),
      texto,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };
    const msgDriverId = driverIdFor(user);
    if (msgDriverId === null) return res.status(403).json({ error: 'Você ainda não está vinculado a um motorista.' });
    getTrip(msgDriverId).mensagens.push(novaMsg);
    broadcast('MENSAGEM_ENVIADA', { mensagem: novaMsg }, msgDriverId);
    res.json({ sucesso: true, mensagem: novaMsg });
  });

  // ALTERAR CONFIGURAÇÃO DE ENDEREÇOS DINÂMICOS (EXCLUSIVO MOTORISTA)
  app.post('/api/motoristas/toggle-enderecos-dinamicos', authenticate, requireDriver, (req: Request, res: Response) => {
    const userPayload = (req as any).user as SessionPayload;
    const { aceita } = req.body;

    const user = usersDB.find((u) => u.id === userPayload.userId);
    if (user) {
      (user as any).aceita_enderecos_dinamicos = aceita !== undefined ? Boolean(aceita) : !(user as any).aceita_enderecos_dinamicos;
      auditLog('ENDERECOS_DINAMICOS_TOGGLE', user.email, `Endereços dinâmicos alterados para ${(user as any).aceita_enderecos_dinamicos}`);
      broadcast('MOTORISTA_CONFIG_ALTERADA', { id_motorista: user.id, aceita_enderecos_dinamicos: (user as any).aceita_enderecos_dinamicos }, user.id);
      return res.json({ sucesso: true, aceita_enderecos_dinamicos: (user as any).aceita_enderecos_dinamicos });
    }
    res.status(404).json({ error: 'Motorista não encontrado' });
  });

  // KILL-SWITCH REMOTO COM INVALIDAÇÃO DE SESSÃO DO MOTORISTA (REQUISITO 5)
  app.post('/api/motoristas/kill-switch', authenticate, requireDriver, requireTripOwnership, (req: Request, res: Response) => {
    const token = (req as any).token;
    if (token) invalidatedTokens.add(token);

    const ksDriverId = driverIdFor((req as any).user) as number;
    const ksRec = usersDB.find((u) => u.id === ksDriverId);
    if (ksRec) (ksRec as any).dispositivo_bloqueado = true;
    auditLog('KILL_SWITCH_SESSAO_REVOGADA', (req as any).user.email, req.body.motivo || 'Dispositivo Comprometido');
    broadcast('KILL_SWITCH_ATIVADO', { motivo: req.body.motivo || 'Dispositivo Comprometido' }, ksDriverId);
    res.json({ sucesso: true, bloqueadoEm: new Date().toISOString() });
  });

  app.post('/api/motoristas/desbloquear', authenticate, requireDriver, requireTripOwnership, (req: Request, res: Response) => {
    const { pin } = req.body;
    // SEGURANÇA: o PIN de desbloqueio não pode ser um valor público; vem de KILL_SWITCH_PIN (fixo '9988' só no DEMO_MODE).
    const pinEsperado = process.env.KILL_SWITCH_PIN || (DEMO_MODE ? '9988' : '');
    if (pinEsperado && typeof pin === 'string' && safeEqual(pin, pinEsperado)) {
      const unDriverId = driverIdFor((req as any).user) as number;
      const unRec = usersDB.find((u) => u.id === unDriverId);
      if (unRec) (unRec as any).dispositivo_bloqueado = false;
      broadcast('DISPOSITIVO_DESBLOQUEADO', {}, unDriverId);
      res.json({ sucesso: true });
    } else {
      res.status(401).json({ error: 'PIN incorreto' });
    }
  });

  app.post('/api/reset', authenticate, requireDriver, requireTripOwnership, (req: Request, res: Response) => {
    if (!DEMO_MODE) return res.status(403).json({ error: 'Modo demonstração desativado.' });
    const rsDriverId = driverIdFor((req as any).user) as number;
    const rsRec = usersDB.find((u) => u.id === rsDriverId);
    if (rsRec) (rsRec as any).dispositivo_bloqueado = false;
    getTrip(rsDriverId).viagem.status = 'AGENDADA';
    serverState.paradas.filter((p: any) => donoDaParada(p) === rsDriverId).forEach((p) => {
      p.status_embarque = 'PENDENTE';
      delete (p as any).motivo_ausencia;
    });
    broadcast('DATABASE_RESET', {}, rsDriverId);
    res.json({ sucesso: true });
  });

  // Fallback 404 JSON para rotas de API não mapeadas (evita entregar HTML do SPA)
  app.all('/api/*', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Endpoint da API não encontrado.' });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[VanEscolar Server] Rodando na porta ${PORT} com autenticação completa do Motorista e Admin Convites`);
  });
}

startServer().catch(console.error);
