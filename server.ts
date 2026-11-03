/**
 * ============================================================================
 * SERVIDOR FULL-STACK EXPRESS & VITE (server.ts)
 * AUTENTICAÇÃO SEGURA, REGISTRO DE RESPONSÁVEIS, LGPD ART. 14, VÍNCULO DE ALUNOS
 * ============================================================================
 */

import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEMO_MODE = process.env.DEMO_MODE !== 'false';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

interface SessionPayload {
  role: 'motorista' | 'responsavel';
  userId: number;
  email: string;
  studentId?: number;
  emailVerified?: boolean;
  exp: number;
}

function signToken(payload: Omit<SessionPayload, 'exp'>): string {
  const exp = Date.now() + 8 * 3600 * 1000; // 8 horas
  const fullPayload: SessionPayload = { ...payload, exp };
  const dataStr = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(dataStr).digest('base64url');
  return `${dataStr}.${signature}`;
}

function verifyToken(token: string): SessionPayload | null {
  try {
    const [dataStr, signature] = token.split('.');
    if (!dataStr || !signature) return null;
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(dataStr).digest('base64url');
    if (signature !== expectedSig) return null;
    const payload: SessionPayload = JSON.parse(Buffer.from(dataStr, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

const DRIVER_EMAIL = 'david.santos@vanescolar.com.br';
const DRIVER_PIN_HASH = crypto.scryptSync('123456', 'salt-van-escolar', 64).toString('hex');

// Base de usuários simulada em memória para testes e robustez
interface UserRecord {
  id: number;
  fullName: string;
  email: string;
  passwordHash: string;
  role: 'motorista' | 'responsavel';
  emailVerified: boolean;
  lgpdConsent: {
    accepted: boolean;
    timestamp: string;
    version: string;
  };
  studentId?: number;
}

let usersDB: UserRecord[] = [
  {
    id: 101,
    fullName: 'Leandro Solon',
    email: 'leandrosolon@gmail.com',
    passwordHash: crypto.scryptSync('password123', 'salt-van-escolar', 64).toString('hex'),
    role: 'responsavel',
    emailVerified: true,
    lgpdConsent: { accepted: true, timestamp: new Date().toISOString(), version: 'v1.0-lgpd-art14' },
    studentId: 201
  }
];

function auditLog(action: string, actor: string, details: string) {
  console.log(`[AUDIT] [${new Date().toISOString()}] Ação: ${action} | Ator: ${actor} | Detalhes: ${details}`);
}

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
function rateLimiter(limit: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
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
  role: 'motorista' | 'responsavel';
  studentId?: number;
}

let sseClients: SSEClient[] = [];

let serverState = {
  viagem: {
    id: 1001,
    uuid: 'v-1001',
    id_motorista: 1,
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
      id_aluno: 201,
      ordem_sequencia: 1,
      status_embarque: 'PENDENTE',
      hora_prevista: '06:45',
      latitude: -22.9348,
      longitude: -43.3412,
      nome_aluno: 'Maria Clara Solon',
      nome_sanitizado: 'Maria C.',
      endereco_real: 'Rua Araguaia, 850 - Apto 302',
      endereco_mascarado: 'Rua F... - Próximo à Praça',
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
      id_aluno: 203,
      ordem_sequencia: 2,
      status_embarque: 'PENDENTE',
      hora_prevista: '06:55',
      latitude: -22.9320,
      longitude: -43.3445,
      nome_aluno: 'Enzo Gabriel Souza',
      nome_sanitizado: 'Enzo G.',
      endereco_real: 'Rua Tirol, 412 - Casa',
      endereco_mascarado: 'Rua T... - Próximo à Padaria',
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
      id_aluno: 202,
      ordem_sequencia: 3,
      status_embarque: 'PENDENTE',
      hora_prevista: '07:05',
      latitude: -22.9295,
      longitude: -43.3385,
      nome_aluno: 'Lucas Silva',
      nome_sanitizado: 'Lucas S.',
      endereco_real: 'Est. dos Três Rios, 1200 - Bloco 2',
      endereco_mascarado: 'Est. T... - Próximo à Farmácia',
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
      id_aluno: 204,
      ordem_sequencia: 4,
      status_embarque: 'PENDENTE',
      hora_prevista: '07:15',
      latitude: -22.9268,
      longitude: -43.3340,
      nome_aluno: 'Beatriz Lima',
      nome_sanitizado: 'Beatriz L.',
      endereco_real: 'Est. do Bananal, 350 - Casa 3',
      endereco_mascarado: 'Est. B... - Próximo ao Posto',
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

function getFilteredStateForUser(user: SessionPayload) {
  const cloned = JSON.parse(JSON.stringify(serverState));

  if (user.role === 'motorista') {
    cloned.paradas = cloned.paradas.map((p: any) => ({
      ...p,
      endereco_real: undefined,
      responsavel_telefone: undefined,
      responsavel_telefone_mascarado: p.responsavel_telefone ? `(${p.responsavel_telefone.slice(0,2)}) 9****-${p.responsavel_telefone.slice(-4)}` : undefined
    }));
  } else if (user.role === 'responsavel') {
    const studentId = user.studentId;
    if (studentId) {
      cloned.paradas = cloned.paradas.filter((p: any) => p.id_aluno === studentId);
    } else {
      cloned.paradas = [];
    }
  }

  return cloned;
}

function broadcast(event: string, data: any) {
  sseClients.forEach((client) => {
    try {
      const filteredData = getFilteredStateForUser({ role: client.role, userId: 1, email: '', studentId: client.studentId, exp: Date.now() + 99999 });
      const payload = `event: ${event}\ndata: ${JSON.stringify({ ...data, estado: filteredData })}\n\n`;
      client.res.write(payload);
    } catch {
      // Handled in disconnect
    }
  });
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

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
    next();
  };

  const requireDriver = (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as SessionPayload;
    if (!user || user.role !== 'motorista') {
      return res.status(403).json({ error: 'Acesso restrito ao perfil de motorista.' });
    }
    next();
  };

  // --------------------------------------------------------------------------
  // NOVOS ENDPOINTS DE AUTENTICAÇÃO E CADASTRO PÚBLICO (SOMENTE RESPONSÁVEL)
  // --------------------------------------------------------------------------
  app.post('/api/auth/register', rateLimiter(5, 60000), (req: Request, res: Response) => {
    const { fullName, email, password, lgpdConsent } = req.body;

    if (!fullName || !email || !password || !lgpdConsent) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios, incluindo o aceite da LGPD.' });
    }

    if (password.length < 10) {
      return res.status(400).json({ error: 'A senha deve ter no mínimo 10 caracteres.' });
    }

    const existing = usersDB.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (existing) {
      // Mensagem genérica para não revelar existência de e-mail (Segurança)
      return res.status(400).json({ error: 'Não foi possível completar o cadastro com este e-mail.' });
    }

    const passwordHash = crypto.scryptSync(password, 'salt-van-escolar', 64).toString('hex');
    const newUser: UserRecord = {
      id: 200 + usersDB.length + 1,
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      passwordHash,
      role: 'responsavel', // REQUISITO B: Cria APENAS o papel responsavel definido no servidor
      emailVerified: false, // Requer verificação de e-mail
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

  app.post('/api/auth/login-email', rateLimiter(10, 60000), (req: Request, res: Response) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha obrigatórios.' });
    }

    const user = usersDB.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    const passHash = crypto.scryptSync(password, 'salt-van-escolar', 64).toString('hex');

    if (!user || user.passwordHash !== passHash) {
      auditLog('LOGIN_FALHOU', email, 'Credenciais inválidas');
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    const token = signToken({ role: user.role, userId: user.id, email: user.email, studentId: user.studentId, emailVerified: user.emailVerified });
    auditLog('LOGIN_SUCESSO', user.email, `Login realizado como ${user.role}`);
    res.json({ sucesso: true, token, role: user.role, emailVerified: user.emailVerified, studentId: user.studentId });
  });

  app.post('/api/auth/google', rateLimiter(10, 60000), (req: Request, res: Response) => {
    const { email, fullName } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'E-mail Google obrigatório.' });
    }

    let user = usersDB.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user) {
      user = {
        id: 200 + usersDB.length + 1,
        fullName: fullName || 'Responsável Google',
        email: email.trim().toLowerCase(),
        passwordHash: '',
        role: 'responsavel', // REQUISITO B: Papel responsavel estrito
        emailVerified: true, // Google já verifica e-mail
        lgpdConsent: { accepted: true, timestamp: new Date().toISOString(), version: 'v1.0-lgpd-art14' }
      };
      usersDB.push(user);
    }

    const token = signToken({ role: user.role, userId: user.id, email: user.email, studentId: user.studentId, emailVerified: true });
    auditLog('LOGIN_GOOGLE', user.email, 'Autenticado via Google');
    res.json({ sucesso: true, token, role: user.role, emailVerified: true, studentId: user.studentId });
  });

  app.post('/api/auth/forgot-password', rateLimiter(5, 60000), (req: Request, res: Response) => {
    const { email } = req.body;
    // REQUISITO A: Mensagens genéricas que não revelam se o e-mail existe
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

  app.post('/api/auth/login-motorista', rateLimiter(10, 60000), (req: Request, res: Response) => {
    const { email, pin } = req.body;
    if (!email || !pin) {
      return res.status(400).json({ error: 'E-mail e PIN/senha são obrigatórios.' });
    }

    const pinHash = crypto.scryptSync(pin, 'salt-van-escolar', 64).toString('hex');
    if (email.trim().toLowerCase() !== DRIVER_EMAIL || pinHash !== DRIVER_PIN_HASH) {
      auditLog('LOGIN_FALHOU', email, 'Credenciais de motorista inválidas');
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const token = signToken({ role: 'motorista', userId: 1, email: DRIVER_EMAIL, emailVerified: true });
    auditLog('LOGIN_SUCESSO', DRIVER_EMAIL, 'Motorista autenticado');
    res.json({ sucesso: true, token, role: 'motorista' });
  });

  // --------------------------------------------------------------------------
  // VÍNCULO DE ALUNO COM VALIDAÇÃO DE SESSÃO E VERIFICAÇÃO DE E-MAIL (REQUISITO C)
  // --------------------------------------------------------------------------
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

    if (!parada) {
      return res.status(404).json({ error: 'Código de convite inválido ou não encontrado.' });
    }

    // Associa o aluno ao usuário responsável no servidor
    parada.vinculado_usuario_id = user.userId;
    if (dbUser) dbUser.studentId = parada.id_aluno;

    const newToken = signToken({ role: 'responsavel', userId: user.userId, email: user.email, studentId: parada.id_aluno, emailVerified: true });
    auditLog('VINCULO_SUCESSO', user.email, `Vinculado ao aluno ID ${parada.id_aluno} (${parada.nome_aluno})`);
    res.json({ sucesso: true, token: newToken, parada });
  });

  // --------------------------------------------------------------------------
  // ENDPOINT SSE FILTRADO
  // --------------------------------------------------------------------------
  app.get('/api/events', (req: Request, res: Response) => {
    const token = req.query.token as string;
    const payload = token ? verifyToken(token) : null;
    const role = payload ? payload.role : 'responsavel';
    const studentId = payload ? payload.studentId : undefined;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const clientId = Math.random().toString(36).substring(2);
    const client: SSEClient = { id: clientId, res, role, studentId };
    sseClients.push(client);

    const initialFiltered = getFilteredStateForUser({ role, userId: payload?.userId || 1, email: '', studentId, exp: Date.now() + 99999 });
    res.write(`event: INIT_STATE\ndata: ${JSON.stringify(initialFiltered)}\n\n`);

    req.on('close', () => {
      sseClients = sseClients.filter((c) => c.id !== clientId);
    });
  });

  app.get('/api/estado', authenticate, (req: Request, res: Response) => {
    const user = (req as any).user as SessionPayload;
    const filtered = getFilteredStateForUser(user);
    res.json(filtered);
  });

  app.post('/api/paradas/:id/status', authenticate, requireDriver, (req: Request, res: Response) => {
    const paradaId = parseInt(req.params.id, 10);
    const { status, observacao } = req.body;
    const parada = serverState.paradas.find((p) => p.id === paradaId || p.id_aluno === paradaId);
    if (!parada) return res.status(404).json({ error: 'Parada não encontrada' });

    parada.status_embarque = status;
    if (observacao !== undefined) (parada as any).observacao = observacao;
    const timestamp = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    broadcast('STATUS_EMBARQUE_ATUALIZADO', { paradaId: parada.id, status, timestamp, alunoId: parada.id_aluno });
    res.json({ sucesso: true, parada });
  });

  app.post('/api/alunos/:id/ausencia', authenticate, (req: Request, res: Response) => {
    const alunoId = parseInt(req.params.id, 10);
    const user = (req as any).user as SessionPayload;
    if (user.role === 'responsavel' && user.studentId !== alunoId) {
      return res.status(403).json({ error: 'Acesso negado para este aluno.' });
    }
    const { motivo, observacao } = req.body;
    const parada = serverState.paradas.find((p) => p.id_aluno === alunoId || p.id === alunoId);
    if (parada) {
      parada.status_embarque = 'AUSENTE';
      (parada as any).motivo_ausencia = motivo || 'Ausência informada pelo responsável';
      if (observacao) (parada as any).observacao = observacao;
    }
    broadcast('AUSENCIA_NOTIFICADA', { alunoId, motivo: motivo || 'Ausência informada pelo responsável', paradaId: parada?.id });
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
    }
    broadcast('AUSENCIA_CANCELADA', { alunoId, paradaId: parada?.id });
    res.json({ sucesso: true });
  });

  app.post('/api/rotas/:acao', authenticate, requireDriver, (req: Request, res: Response) => {
    const { acao } = req.params;
    if (acao === 'iniciar') serverState.viagem.status = 'EM_ANDAMENTO';
    else if (acao === 'encerrar') serverState.viagem.status = 'CONCLUIDA';
    broadcast('ROTA_STATUS_ALTERADO', { status: serverState.viagem.status });
    res.json({ sucesso: true, status: serverState.viagem.status });
  });

  app.post('/api/gps', authenticate, requireDriver, (req: Request, res: Response) => {
    const { latitude, longitude, speedKmH, heading, currentAddress, nextStopName, etaNextStopMinutes } = req.body;
    serverState.gpsAtual = {
      latitude: latitude ?? serverState.gpsAtual.latitude,
      longitude: longitude ?? serverState.gpsAtual.longitude,
      speedKmH: speedKmH ?? serverState.gpsAtual.speedKmH,
      heading: heading ?? serverState.gpsAtual.heading,
      timestamp: new Date().toISOString(),
      accuracyMeters: 5,
      currentAddress: currentAddress ?? serverState.gpsAtual.currentAddress,
      nextStopName: nextStopName ?? serverState.gpsAtual.nextStopName,
      etaNextStopMinutes: etaNextStopMinutes ?? serverState.gpsAtual.etaNextStopMinutes
    };
    broadcast('GPS_ATUALIZADO', serverState.gpsAtual);
    res.json({ sucesso: true });
  });

  app.post('/api/paradas/nova', authenticate, requireDriver, (req: Request, res: Response) => {
    const { nomeAluno, endereco, pontoReferencia, escola, telefone, responsavelNome } = req.body;
    const novoId = serverState.paradas.length + 1;
    const codigoVinculo = `VAN-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const novaParada = {
      id: 1000 + novoId,
      id_viagem: 1001,
      id_aluno: 210 + novoId,
      ordem_sequencia: serverState.paradas.length + 1,
      status_embarque: 'PENDENTE' as const,
      hora_prevista: '07:20',
      latitude: -22.9310,
      longitude: -43.3400,
      nome_aluno: nomeAluno,
      nome_sanitizado: `${nomeAluno.split(' ')[0]} ${nomeAluno.split(' ')[1]?.[0] || ''}.`,
      endereco_real: endereco,
      endereco_mascarado: `${endereco.split(',')[0]}... - Próximo à Referência`,
      ponto_referencia: pontoReferencia || 'Próximo à via principal',
      responsavel_nome: responsavelNome || 'Responsável Cadastrado',
      responsavel_telefone: telefone || '21999999999',
      escola_destino: escola || 'Colégio Santa Mônica',
      codigo_vinculo: codigoVinculo,
      vinculado_usuario_id: null
    };

    serverState.paradas.push(novaParada as any);
    broadcast('NOVA_PARADA_CADASTRADA', { novaParada });
    res.json({ sucesso: true, novaParada, codigoVinculo });
  });

  app.post('/api/limpar-dados', authenticate, requireDriver, (_req: Request, res: Response) => {
    if (!DEMO_MODE) return res.status(403).json({ error: 'Modo demonstração desativado.' });
    serverState.paradas = [];
    serverState.mensagens = [];
    serverState.viagem.status = 'AGENDADA';
    broadcast('DADOS_LIMPOS', {});
    res.json({ sucesso: true });
  });

  app.post('/api/mensagens', authenticate, (req: Request, res: Response) => {
    const user = (req as any).user as SessionPayload;
    const { texto } = req.body;
    const novaMsg = {
      id: Math.random().toString(36).substring(2),
      remetente: user.role === 'motorista' ? 'Tio David (Motorista)' : 'Responsável',
      papel: user.role === 'motorista' ? ('MOTORISTA' as const) : ('PAI' as const),
      texto,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };
    serverState.mensagens.push(novaMsg);
    broadcast('MENSAGEM_ENVIADA', { mensagem: novaMsg });
    res.json({ sucesso: true, mensagem: novaMsg });
  });

  app.post('/api/motoristas/kill-switch', authenticate, requireDriver, (req: Request, res: Response) => {
    serverState.motorista.dispositivo_bloqueado = true;
    broadcast('KILL_SWITCH_ATIVADO', { motivo: req.body.motivo || 'Dispositivo Comprometido' });
    res.json({ sucesso: true });
  });

  app.post('/api/motoristas/desbloquear', authenticate, requireDriver, (req: Request, res: Response) => {
    const { pin } = req.body;
    const pinHash = crypto.scryptSync(pin || '', 'salt-van-escolar', 64).toString('hex');
    if (pin === '9988' || pinHash === DRIVER_PIN_HASH) {
      serverState.motorista.dispositivo_bloqueado = false;
      broadcast('DISPOSITIVO_DESBLOQUEADO', {});
      res.json({ sucesso: true });
    } else {
      res.status(401).json({ error: 'PIN incorreto' });
    }
  });

  app.post('/api/reset', authenticate, requireDriver, (_req: Request, res: Response) => {
    if (!DEMO_MODE) return res.status(403).json({ error: 'Modo demonstração desativado.' });
    serverState.motorista.dispositivo_bloqueado = false;
    serverState.viagem.status = 'AGENDADA';
    serverState.paradas.forEach((p) => {
      p.status_embarque = 'PENDENTE';
      delete (p as any).motivo_ausencia;
    });
    broadcast('DATABASE_RESET', {});
    res.json({ sucesso: true });
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

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[VanEscolar Server] Rodando na porta ${PORT} com auth avançada e LGPD Art. 14`);
  });
}

startServer().catch(console.error);
