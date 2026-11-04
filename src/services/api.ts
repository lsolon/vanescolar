/**
 * ============================================================================
 * CAMADA DE SERVIÇOS & REPOSITORY PATTERN (services/api.ts)
 * CONFORMIDADE ESTRITA COM LGPD (DADOS DE MENORES) E AUTENTICAÇÃO AVANÇADA
 * ============================================================================
 */

import {
  Motorista,
  Responsavel,
  Aluno,
  ViagemDiario,
  ParadaViagem,
  ParadaMotoristaSanitizada,
  ViagemMotoristaZeroCache,
  AlunoParadaDetalhada,
  ViagemDetalhada,
  StatusEmbarque
} from '../types/database';

import { AuthService } from './auth';

const SIMULATED_LATENCY_MS = 120;
const sleep = (ms: number = SIMULATED_LATENCY_MS) => new Promise((resolve) => setTimeout(resolve, ms));

function getBaseUrl(): string {
  if (typeof window !== 'undefined') return '';
  return 'http://localhost:3000';
}

const ADMIN_TOKEN_KEY = 'adminToken';
let memoryAdminToken: string | null = null;

function getAuthHeaders(isAdmin: boolean = false): Record<string, string> {
  let token = '';
  if (isAdmin) {
    token = (typeof window !== 'undefined' ? localStorage.getItem(ADMIN_TOKEN_KEY) : null) || memoryAdminToken || '';
  } else {
    token = AuthService.getSessionToken() || '';
  }
  
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
}

async function handleAdminResponse(res: Response) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    if (text.includes('<!doctype') || text.includes('<html')) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(ADMIN_TOKEN_KEY);
      }
      throw new Error('Sessão administrativa expirada ou não autorizada.');
    }
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    if (res.status === 401 || res.status === 403) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(ADMIN_TOKEN_KEY);
      }
    }
    throw new Error(err.error || 'Falha na requisição administrativa.');
  }
  return res.json();
}

const INITIAL_MOTORISTAS: Motorista[] = [
  {
    id: 1,
    uuid: "m-001-david-7f9a",
    nome: "Tio David Santos",
    telefone: "(21) 98765-4321",
    cnh: "04938271645",
    foto_url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80",
    veiculo_modelo: "Renault Master Executiva 2.3",
    veiculo_placa: "RIO-2024",
    veiculo_capacidade: 16,
    status_operacional: "ATIVO",
    aceita_enderecos_dinamicos: false, // David Santos: Rejeita endereços dinâmicos (Regra de Ouro)
    horarios: ["Manhã", "Tarde"],
    dispositivo_bloqueado: false,
    created_at: "2026-01-15T07:00:00Z"
  },
  {
    id: 2,
    uuid: "m-002-carlos-8e1b",
    nome: "Tio Carlos Souza",
    telefone: "(21) 97654-3210",
    cnh: "09876543210",
    foto_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&q=80",
    veiculo_modelo: "Mercedes-Benz Sprinter 415",
    veiculo_placa: "RIO-2025",
    veiculo_capacidade: 18,
    status_operacional: "ATIVO",
    aceita_enderecos_dinamicos: true, // Motorista secundário: Aceita endereços dinâmicos por dia da semana
    horarios: ["Manhã", "Tarde", "Noite"],
    dispositivo_bloqueado: false,
    created_at: "2026-01-16T08:00:00Z"
  }
];

const INITIAL_RESPONSAVEIS: Responsavel[] = [
  {
    id: 101,
    uuid: "r-101-leandro-4b2c",
    id_motorista: 1, // Multi-tenant RLS
    nome: "Leandro Solon",
    nome_completo: "Leandro Solon da Silva",
    cpf: "123.456.789-00",
    telefone_whatsapp: "(21) 99123-4567",
    telefone: "(21) 99123-4567",
    email: "leandrosolon@gmail.com",
    endereco_cobranca: "Rua Araguaia, 850 - Apto 302, Freguesia - Rio de Janeiro/RJ",
    parentesco: "Pai",
    bairro: "Freguesia (Jacarepaguá)",
    cidade: "Rio de Janeiro",
    created_at: "2026-02-01T10:00:00Z"
  },
  {
    id: 102,
    uuid: "r-102-carla-8d3e",
    id_motorista: 1, // Multi-tenant RLS
    nome: "Carla Souza",
    nome_completo: "Carla Souza Oliveira",
    cpf: "987.654.321-11",
    telefone_whatsapp: "(21) 97321-6549",
    telefone: "(21) 97321-6549",
    email: "carla.souza@gmail.com",
    endereco_cobranca: "Rua Tirol, 412 - Casa, Freguesia - Rio de Janeiro/RJ",
    parentesco: "Mãe",
    bairro: "Freguesia (Jacarepaguá)",
    cidade: "Rio de Janeiro",
    created_at: "2026-02-02T11:00:00Z"
  },
  {
    id: 103,
    uuid: "r-103-marcos-9f4a",
    id_motorista: 2, // Multi-tenant RLS para Tio Carlos
    nome: "Marcos Silva",
    nome_completo: "Marcos Vinicius Silva",
    cpf: "456.789.123-22",
    telefone_whatsapp: "(21) 98456-7890",
    telefone: "(21) 98456-7890",
    email: "marcos.silva@gmail.com",
    endereco_cobranca: "Est. dos Três Rios, 1200 - Bloco 2, Freguesia - Rio de Janeiro/RJ",
    parentesco: "Pai",
    bairro: "Freguesia (Jacarepaguá)",
    cidade: "Rio de Janeiro",
    created_at: "2026-02-03T12:00:00Z"
  }
];

const INITIAL_ALUNOS: Aluno[] = [
  {
    id: 201,
    uuid: "a-201-mariaclara-1c9f",
    id_responsavel: 101,
    id_motorista: 1,
    nome: "Maria Clara Solon",
    nome_aluno: "Maria Clara Solon",
    escola_id: "ESC-SANTA-MONICA",
    turno: "MANHA",
    endereco_embarque: {
      rua: "Rua Araguaia",
      numero: "850",
      bairro: "Freguesia",
      cidade: "Rio de Janeiro",
      latitude: -22.9348,
      longitude: -43.3412,
      complemento: "Apto 302",
      ponto_referencia: "Próximo à Praça / Portaria Principal"
    },
    endereco_desembarque: {
      rua: "Estrada dos Três Rios",
      numero: "100",
      bairro: "Freguesia",
      cidade: "Rio de Janeiro",
      latitude: -22.9360,
      longitude: -43.3420,
      ponto_referencia: "Colégio Santa Mônica"
    },
    enderecos_dinamicos: {
      SEGUNDA: {
        rua: "Rua Geminiano Gois",
        numero: "120",
        bairro: "Freguesia",
        latitude: -22.9355,
        longitude: -43.3418,
        ponto_referencia: "Casa dos Avós"
      },
      TERCA: {
        rua: "Rua Araguaia",
        numero: "850",
        bairro: "Freguesia",
        latitude: -22.9348,
        longitude: -43.3412,
        ponto_referencia: "Casa do Pai"
      }
    },
    referencia_mascarada: "Rua A... - Próximo à Praça",
    nome_mascarado_lgpd: "Maria C.",
    endereco_embarque_real: "Rua Araguaia, 850 - Apto 302",
    endereco_mascarado: "Rua A... (Endereço Restrito - LGPD)",
    ponto_referencia_generico: "Próximo à Praça / Portaria Principal",
    bairro: "Freguesia (Jacarepaguá)",
    foto_url: "https://images.unsplash.com/photo-1543332164-6e82f355badc?auto=format&fit=crop&w=256&q=80",
    contato_emergencia: "(21) 99123-4567 (Pai)",
    observacoes_medicas: "Alérgica a amendoim.",
    created_at: "2026-02-05T08:00:00Z"
  },
  {
    id: 202,
    uuid: "a-202-enzogabriel-2d8e",
    id_responsavel: 102,
    id_motorista: 1,
    nome: "Enzo Gabriel Souza",
    nome_aluno: "Enzo Gabriel Souza",
    escola_id: "ESC-SANTA-MONICA",
    turno: "MANHA",
    endereco_embarque: {
      rua: "Rua Tirol",
      numero: "412",
      bairro: "Freguesia",
      cidade: "Rio de Janeiro",
      latitude: -22.9320,
      longitude: -43.3445,
      ponto_referencia: "Próximo à Padaria / Vila"
    },
    endereco_desembarque: {
      rua: "Estrada dos Três Rios",
      numero: "100",
      bairro: "Freguesia",
      cidade: "Rio de Janeiro",
      latitude: -22.9360,
      longitude: -43.3420,
      ponto_referencia: "Colégio Santa Mônica"
    },
    referencia_mascarada: "Rua T... - Próximo à Padaria",
    nome_mascarado_lgpd: "Enzo G.",
    endereco_embarque_real: "Rua Tirol, 412 - Casa",
    endereco_mascarado: "Rua T... (Endereço Restrito - LGPD)",
    ponto_referencia_generico: "Próximo à Padaria / Vila",
    bairro: "Freguesia (Jacarepaguá)",
    contato_emergencia: "(21) 97321-6549 (Mãe)",
    created_at: "2026-02-06T08:00:00Z"
  },
  {
    id: 203,
    uuid: "a-203-lucassilva-3f7c",
    id_responsavel: 103,
    id_motorista: 2, // Vinculado ao Tio Carlos
    nome: "Lucas Silva",
    nome_aluno: "Lucas Silva",
    escola_id: "ESC-SANTA-MONICA",
    turno: "MANHA",
    endereco_embarque: {
      rua: "Est. dos Três Rios",
      numero: "1200",
      bairro: "Freguesia",
      cidade: "Rio de Janeiro",
      latitude: -22.9295,
      longitude: -43.3385,
      complemento: "Bloco 2",
      ponto_referencia: "Próximo à Farmácia / Guarita"
    },
    endereco_desembarque: {
      rua: "Estrada dos Três Rios",
      numero: "100",
      bairro: "Freguesia",
      cidade: "Rio de Janeiro",
      latitude: -22.9360,
      longitude: -43.3420,
      ponto_referencia: "Colégio Santa Mônica"
    },
    enderecos_dinamicos: {
      SEGUNDA: {
        rua: "Avenida Geremário Dantas",
        numero: "500",
        bairro: "Pechincha",
        cidade: "Rio de Janeiro",
        latitude: -22.9280,
        longitude: -43.3370,
        ponto_referencia: "Casa da Mãe (Guarda Compartilhada)"
      },
      QUARTA: {
        rua: "Avenida Geremário Dantas",
        numero: "500",
        bairro: "Pechincha",
        cidade: "Rio de Janeiro",
        latitude: -22.9280,
        longitude: -43.3370,
        ponto_referencia: "Casa da Mãe"
      }
    },
    referencia_mascarada: "Est. T... - Próximo à Farmácia",
    nome_mascarado_lgpd: "Lucas S.",
    endereco_embarque_real: "Est. dos Três Rios, 1200 - Bloco 2",
    endereco_mascarado: "Est. T... (Endereço Restrito - LGPD)",
    ponto_referencia_generico: "Próximo à Farmácia / Guarita",
    bairro: "Freguesia (Jacarepaguá)",
    contato_emergencia: "(21) 98456-7890 (Pai)",
    created_at: "2026-02-07T08:00:00Z"
  }
];

const INITIAL_VIAGENS: ViagemDiario[] = [
  {
    id: 501,
    uuid: "v-501-freguesia-9821",
    id_motorista: 1,
    data: "2026-11-03",
    periodo: "MANHA_IDA",
    status: "AGENDADA",
    rota_nome: "Rota 01 - Manhã / Freguesia - Santa Mônica",
    distancia_km_estimada: 6.8,
    created_at: "2026-11-03T06:00:00Z"
  }
];

const INITIAL_PARADAS: ParadaViagem[] = [
  {
    id: 1001,
    id_viagem: 501,
    id_aluno: 201,
    id_motorista: 1,
    tipo: 'Ida',
    ordem_sequencia: 1,
    status_embarque: "PENDENTE",
    hora_prevista: "06:45",
    latitude: -22.9348,
    longitude: -43.3412,
    observacao: "Portaria principal do condomínio",
    codigo_vinculo: "VAN-201"
  },
  {
    id: 1002,
    id_viagem: 501,
    id_aluno: 202,
    id_motorista: 1,
    tipo: 'Ida',
    ordem_sequencia: 2,
    status_embarque: "PENDENTE",
    hora_prevista: "06:55",
    latitude: -22.9320,
    longitude: -43.3445,
    observacao: "Em frente à vila",
    codigo_vinculo: "VAN-202"
  }
];

let motoristasDB: Motorista[] = JSON.parse(JSON.stringify(INITIAL_MOTORISTAS));
let responsaveisDB: Responsavel[] = JSON.parse(JSON.stringify(INITIAL_RESPONSAVEIS));
let alunosDB: Aluno[] = JSON.parse(JSON.stringify(INITIAL_ALUNOS));
let viagensDB: ViagemDiario[] = JSON.parse(JSON.stringify(INITIAL_VIAGENS));
let paradasDB: ParadaViagem[] = JSON.parse(JSON.stringify(INITIAL_PARADAS));

export interface ProximidadeVan {
  estado: 'aguardando' | 'a_caminho' | 'proxima' | 'embarcou' | 'entregue' | 'ausente' | 'encerrada';
  rotaAtiva: boolean;
  progresso: number;
  minutos: number | null;
  mapaLiberado: boolean;
  avisoAtivo: boolean;
  posicao?: { latitude: number; longitude: number; heading: number };
  atualizadoEm: string;
}
export interface PrefsProximidade { estilo: 'A' | 'B' | 'C'; avisoMin: number }

type EventCallback = (eventType: string, payload: unknown) => void;
const listeners = new Set<EventCallback>();

// Transmissão ao vivo (SSE): exige sessão. Reconecta sempre que o token muda (login/logout).
let sse: EventSource | null = null;
const eventosMapeados = [
  'INIT_STATE',
  'STATUS_EMBARQUE_ATUALIZADO',
  'AUSENCIA_NOTIFICADA',
  'AUSENCIA_CANCELADA',
  'ROTA_STATUS_ALTERADO',
  'NOVA_PARADA_CADASTRADA',
  'KILL_SWITCH_ATIVADO',
  'DISPOSITIVO_DESBLOQUEADO',
  'DATABASE_RESET',
  'DADOS_LIMPOS',
  'GPS_ATUALIZADO',
  'PROXIMIDADE_ATUALIZADA'
];

function conectarSSE() {
  if (typeof window === 'undefined' || !('EventSource' in window)) return;
  try {
    if (sse) { sse.close(); sse = null; }
    const token = localStorage.getItem('van_token') || '';
    if (!token) return;
    const conexao = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
    sse = conexao;
    eventosMapeados.forEach((nomeEvento) => {
      conexao.addEventListener(nomeEvento, (e) => {
        try {
          const payload = JSON.parse((e as MessageEvent).data);
          syncStateFromEvent(nomeEvento, payload);
          listeners.forEach((cb) => cb(nomeEvento, payload));
          if (nomeEvento === 'STATUS_EMBARQUE_ATUALIZADO') {
            listeners.forEach((cb) => cb('aluno:status_alterado', payload));
          } else if (nomeEvento === 'AUSENCIA_NOTIFICADA') {
            listeners.forEach((cb) => cb('aluno:ausencia_avisada', payload));
          } else if (nomeEvento === 'DATABASE_RESET' || nomeEvento === 'DADOS_LIMPOS') {
            listeners.forEach((cb) => cb('database:reset', payload));
          }
        } catch (err) {
          console.error('Erro SSE:', err);
        }
      });
    });
  } catch (err) {
    console.warn('SSE indisponível:', err);
  }
}
if (typeof window !== 'undefined') {
  window.addEventListener('van-token', conectarSSE);
  conectarSSE();
}

function syncStateFromServer(serverState: any) {
  if (!serverState) return;
  if (Array.isArray(serverState.paradas)) {
    if (serverState.paradas.length === 0) {
      paradasDB = [];
      alunosDB = [];
      responsaveisDB = [];
    } else {
      serverState.paradas.forEach((sp: any) => {
        const p = paradasDB.find((item) => item.id_aluno === sp.id_aluno || item.id === sp.id);
        if (p) {
          p.status_embarque = sp.status_embarque;
          if (sp.motivo_ausencia !== undefined) {
            p.motivo_ausencia = sp.motivo_ausencia;
          } else if (sp.status_embarque !== 'AUSENTE') {
            delete (p as any).motivo_ausencia;
          }
          if (sp.hora_embarque) p.hora_embarque = sp.hora_embarque;
          if (sp.hora_desembarque) p.hora_desembarque = sp.hora_desembarque;
        }
      });
    }
  }
  if (serverState.viagem && viagensDB[0]) {
    viagensDB[0].status = serverState.viagem.status;
  }
  if (serverState.motorista) {
    const existing = motoristasDB.find((m) => m.id === serverState.motorista.id);
    if (existing) {
      Object.assign(existing, serverState.motorista);
    } else {
      motoristasDB.unshift({
        id: serverState.motorista.id,
        uuid: serverState.motorista.uuid || `m-${serverState.motorista.id}`,
        nome: serverState.motorista.nome,
        telefone: serverState.motorista.telefone,
        cnh: '01234567890',
        foto_url: serverState.motorista.foto_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80",
        veiculo_modelo: serverState.motorista.veiculo_modelo,
        veiculo_placa: serverState.motorista.veiculo_placa,
        veiculo_capacidade: serverState.motorista.capacidade_alunos || 16,
        status_operacional: 'ATIVO',
        aceita_enderecos_dinamicos: serverState.motorista.aceita_enderecos_dinamicos ?? false,
        dispositivo_bloqueado: !!serverState.motorista.dispositivo_bloqueado,
        created_at: serverState.motorista.created_at || new Date().toISOString()
      });
    }
  }
}

function syncStateFromEvent(eventType: string, payload: any) {
  if (!payload) return;
  if (payload.estado) {
    syncStateFromServer(payload.estado);
  }
  if (eventType === 'INIT_STATE') {
    syncStateFromServer(payload);
    return;
  }
  if (eventType === 'DATABASE_RESET' || eventType === 'database:reset' || eventType === 'DADOS_LIMPOS') {
    paradasDB = [];
    alunosDB = [];
    responsaveisDB = [];
  }
}

export function subscribeToDatabaseChanges(callback: EventCallback): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function mascararTelefone(tel: string): string {
  const digits = tel.replace(/\D/g, '');
  if (digits.length >= 10) {
    const ddd = digits.slice(0, 2);
    const lastDigits = digits.slice(-4);
    return `(${ddd}) 9****-${lastDigits}`;
  }
  return tel;
}

export const TransportRepository = {
  async loginMotorista(email: string, pin: string): Promise<string> {
    return this.loginMotoristaEmail(email, pin);
  },

  async loginMotoristaEmail(email: string, password: string) {
    await sleep();
    // E-mail + senha são validados pelo próprio servidor (o Firebase é usado só no login com Google).
    const idToken: string | undefined = undefined;

    // Server Exchange
    const res = await fetch(`${getBaseUrl()}/api/auth/login-motorista`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, idToken, password })
    });
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha na sessão' }));
      throw new Error(err.error || 'Credenciais inválidas de motorista no servidor.');
    }
    
    const data = await res.json();
    if (data.token) {
      AuthService.setSessionToken(data.token);
    }
    return data;
  },

  async loginMotoristaGoogle() {
    await sleep();
    try {
      // 1. Firebase Google Login
      const result = await AuthService.loginWithGoogle();
      const user = result.user;
      const idToken = await user.getIdToken();

      // 2. Server Exchange
      const res = await fetch(`${getBaseUrl()}/api/auth/login-motorista`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, idToken, fullName: user.displayName })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Motorista não cadastrado' }));
        throw new Error(err.error || 'Conta Google não possui perfil de motorista aprovado.');
      }

      const data = await res.json();
      if (data.token) {
        AuthService.setSessionToken(data.token);
      }
      return data;
    } catch (err: any) {
      throw err;
    }
  },

  async registrarMotorista(params: {
    fullName: string;
    email: string;
    password: string;
    phone: string;
    vehicleModel: string;
    vehiclePlate: string;
    invitationCode: string;
    lgpdConsent: boolean;
  }) {
    await sleep();
    
    // Cadastro com e-mail + senha é feito só no servidor (o Firebase é usado só no login com Google).
    const firebaseUid: string | undefined = undefined;

    // Server Sync
    const res = await fetch(`${getBaseUrl()}/api/auth/register-motorista`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, firebaseUid })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Erro no servidor' }));
      throw new Error(err.error || 'Não foi possível completar o cadastro no servidor.');
    }

    const data = await res.json();
    if (data.token) {
      AuthService.setSessionToken(data.token);
    }

    const newMotoristaLocal: Motorista = {
      id: motoristasDB.length + 1,
      uuid: `m-drv-${Date.now()}`,
      nome: params.fullName,
      telefone: params.phone || '(21) 98765-4321',
      cnh: '01234567890',
      foto_url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80",
      veiculo_modelo: params.vehicleModel || 'Renault Master Executiva',
      veiculo_placa: params.vehiclePlate || 'RIO-2026',
      veiculo_capacidade: 16,
      status_operacional: 'ATIVO',
      aceita_enderecos_dinamicos: false,
      dispositivo_bloqueado: false,
      created_at: new Date().toISOString()
    };
    motoristasDB.unshift(newMotoristaLocal);

    return data;
  },

  async toggleTotp(enabled: boolean) {
    const res = await fetch(`${getBaseUrl()}/api/auth/toggle-totp`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ enabled })
    });
    if (!res.ok) throw new Error('Falha ao atualizar 2FA');
    return res.json();
  },

  async logout() {
    await AuthService.logout();
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      try {
        await fetch(`${getBaseUrl()}/api/auth/logout`, { method: 'POST', headers: getAuthHeaders() });
      } catch {
        // Ignora
      }
    }
  },

  async gerarConviteMotorista(nota?: string) {
    const res = await fetch(`${getBaseUrl()}/api/admin/convites-motorista`, {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify({ nota })
    });
    return handleAdminResponse(res);
  },

  async listarConvitesMotorista() {
    const res = await fetch(`${getBaseUrl()}/api/admin/convites-motorista`, {
      headers: getAuthHeaders(true)
    });
    return handleAdminResponse(res);
  },

  async revogarConviteMotorista(code: string) {
    const res = await fetch(`${getBaseUrl()}/api/admin/convites-motorista/${code}`, {
      method: 'DELETE',
      headers: getAuthHeaders(true)
    });
    return handleAdminResponse(res);
  },

  async criarMotoristaAdmin(params: {
    fullName: string;
    email: string;
    password: string;
    horarios: string[];
    capacidade: number;
    veiculoPlaca: string;
    whatsapp: string;
    veiculoModelo?: string;
  }) {
    const res = await fetch(`${getBaseUrl()}/api/admin/motoristas/criar`, {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify(params)
    });
    return handleAdminResponse(res);
  },

  async loginAdminGoogle() {
    await sleep();
    const result = await AuthService.loginWithGoogle();
    const user = result.user;
    const idToken = await user.getIdToken();

    const res = await fetch(`${getBaseUrl()}/api/admin/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, idToken })
    });

    const data = await handleAdminResponse(res);
    if (data.token) {
      memoryAdminToken = data.token;
      if (typeof window !== 'undefined') {
        localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
      }
    }
    return data;
  },

  async loginAdminDirect(email: string, password: string) {
    await sleep();
    const res = await fetch(`${getBaseUrl()}/api/admin/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await handleAdminResponse(res);
    if (data.token) {
      memoryAdminToken = data.token;
      if (typeof window !== 'undefined') {
        localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
      }
    }
    return data;
  },

  async getAdminMetrics() {
    const res = await fetch(`${getBaseUrl()}/api/admin/metrics`, { headers: getAuthHeaders(true) });
    return handleAdminResponse(res);
  },

  async listarMotoristasAdmin() {
    const res = await fetch(`${getBaseUrl()}/api/admin/motoristas`, { headers: getAuthHeaders(true) });
    return handleAdminResponse(res);
  },

  async toggleMotoristaStatus(id: number) {
    const res = await fetch(`${getBaseUrl()}/api/admin/motoristas/${id}/toggle`, {
      method: 'POST',
      headers: getAuthHeaders(true)
    });
    return handleAdminResponse(res);
  },

  async listarResponsaveisAdmin() {
    const res = await fetch(`${getBaseUrl()}/api/admin/responsaveis`, { headers: getAuthHeaders(true) });
    return handleAdminResponse(res);
  },

  async getAdminSettings() {
    const res = await fetch(`${getBaseUrl()}/api/admin/settings`, { headers: getAuthHeaders(true) });
    return handleAdminResponse(res);
  },

  async updateAdminEmails(emails: string[]) {
    const res = await fetch(`${getBaseUrl()}/api/admin/settings/emails`, {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify({ emails })
    });
    return handleAdminResponse(res);
  },

  async logoutAdmin() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
    }
    await AuthService.logout();
  },

  async registrarResponsavel(params: { fullName: string; email: string; password: string; lgpdConsent: boolean }) {
    await sleep();
    
    // Cadastro com e-mail + senha é feito só no servidor (o Firebase é usado só no login com Google).
    const firebaseUid: string | undefined = undefined;

    // Server Sync
    const res = await fetch(`${getBaseUrl()}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, firebaseUid })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Erro no servidor' }));
      throw new Error(err.error || 'Não foi possível completar o cadastro no servidor.');
    }

    const data = await res.json();
    if (data.token) {
      AuthService.setSessionToken(data.token);
    }
    return data;
  },

  async loginEmail(email: string, password: string) {
    await sleep();
    
    // E-mail + senha são validados pelo próprio servidor (o Firebase é usado só no login com Google).
    const idToken: string | undefined = undefined;

    // Server Exchange
    const res = await fetch(`${getBaseUrl()}/api/auth/login-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, idToken, password })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'E-mail ou senha incorretos' }));
      throw new Error(err.error || 'Falha na autenticação com o servidor.');
    }

    const data = await res.json();
    if (data.token) {
      AuthService.setSessionToken(data.token);
    }
    return data;
  },

  async loginGoogle() {
    await sleep();
    try {
      // 1. Firebase Google Login
      const result = await AuthService.loginWithGoogle();
      const user = result.user;
      const idToken = await user.getIdToken();

      // 2. Server Exchange
      const res = await fetch(`${getBaseUrl()}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, idToken, fullName: user.displayName })
      });

      if (!res.ok) throw new Error('Falha ao autenticar com Google no servidor.');
      
      const data = await res.json();
      if (data.token) {
        AuthService.setSessionToken(data.token);
      }
      return data;
    } catch (err: any) {
      throw err;
    }
  },

  async forgotPassword(email: string) {
    await sleep();
    await AuthService.recoverPassword(email);
    return 'As instruções de redefinição foram enviadas para o seu e-mail.';
  },

  async simularVerificacaoEmail() {
    const res = await fetch(`${getBaseUrl()}/api/auth/verify-email-sim`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (res.ok) {
      const data = await res.json();
      if (data.token) AuthService.setSessionToken(data.token);
      return data;
    }
    throw new Error('Falha na verificação');
  },

  /** Resumo seguro da proximidade da van (sem coordenadas, exceto quando a próxima parada é a do aluno). */
  async getProximidade(): Promise<{ proximidade: ProximidadeVan | null; prefs: PrefsProximidade } | null> {
    const res = await fetch(`${getBaseUrl()}/api/proximidade`, { headers: getAuthHeaders() });
    if (!res.ok) return null;
    return res.json();
  },

  async salvarPreferenciasProximidade(prefs: PrefsProximidade): Promise<PrefsProximidade> {
    const res = await fetch(`${getBaseUrl()}/api/preferencias`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(prefs)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Não foi possível salvar agora.');
    return { estilo: data.estilo, avisoMin: data.avisoMin };
  },

  async resetDatabase(): Promise<void> {
    await sleep();
    AuthService.clearSession();
    motoristasDB = JSON.parse(JSON.stringify(INITIAL_MOTORISTAS));
    responsaveisDB = JSON.parse(JSON.stringify(INITIAL_RESPONSAVEIS));
    alunosDB = JSON.parse(JSON.stringify(INITIAL_ALUNOS));
    viagensDB = JSON.parse(JSON.stringify(INITIAL_VIAGENS));
    paradasDB = JSON.parse(JSON.stringify(INITIAL_PARADAS));
    emitEvent('database:reset', null);

    if (typeof window !== 'undefined' || true) {
      fetch(`${getBaseUrl()}/api/reset`, { method: 'POST', headers: getAuthHeaders() }).catch(() => {});
    }
  },

  async acionarKillSwitch(
    motoristaId: number = 1,
    motivo: string = "Dispositivo comprometido / Alerta de segurança LGPD acionado"
  ): Promise<{ sucesso: boolean; bloqueadoEm: string }> {
    await sleep(80);
    const mot = motoristasDB.find((m) => m.id === motoristaId);
    if (!mot) throw new Error("Motorista não encontrado");

    mot.dispositivo_bloqueado = true;
    mot.motivo_bloqueio = motivo;
    mot.bloqueado_em = new Date().toISOString();
    mot.status_operacional = 'INATIVO';

    emitEvent('seguranca:kill_switch_ativado', {
      motoristaId,
      motivo,
      bloqueadoEm: mot.bloqueado_em
    });

    if (typeof window !== 'undefined' || true) {
      const res = await fetch(`${getBaseUrl()}/api/motoristas/kill-switch`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ motivo })
      });
      if (!res.ok) throw new Error('Falha ao acionar kill-switch');
    }

    return { sucesso: true, bloqueadoEm: mot.bloqueado_em };
  },

  async desbloquearDispositivo(motoristaId: number = 1, pin: string): Promise<boolean> {
    await sleep(100);
    if (pin !== '9988' && pin !== '1234') throw new Error("PIN incorreto.");
    const mot = motoristasDB.find((m) => m.id === motoristaId);
    if (mot) {
      mot.dispositivo_bloqueado = false;
      mot.motivo_bloqueio = undefined;
      mot.bloqueado_em = undefined;
      mot.status_operacional = 'ATIVO';
    }
    emitEvent('seguranca:dispositivo_restaurado', { motoristaId });
    if (typeof window !== 'undefined' || true) {
      await fetch(`${getBaseUrl()}/api/motoristas/desbloquear`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ pin })
      });
    }
    return true;
  },

  async getViagemMotoristaZeroCache(
    motoristaId: number = 1,
    options: { apenasProximaParada?: boolean } = {}
  ): Promise<ViagemMotoristaZeroCache> {
    await sleep();
    if (typeof window !== 'undefined' || true) {
      try {
        const res = await fetch(`${getBaseUrl()}/api/estado`, { headers: getAuthHeaders() });
        if (res.ok) {
          const serverState = await res.json();
          const mot = serverState.motorista;
          if (mot.dispositivo_bloqueado) {
            throw new Error("DISPOSITIVO_BLOQUEADO: Acesso revogado remotamente por incidente de segurança LGPD.");
          }
          const viagem = serverState.viagem;
          let paradasSanitizadas: ParadaMotoristaSanitizada[] = (serverState.paradas || []).map((p: any) => ({
            parada_id: p.id,
            viagem_id: p.id_viagem,
            aluno_id: p.id_aluno,
            ordem_sequencia: p.ordem_sequencia,
            nome_aluno_sanitizado: p.nome_sanitizado || "Aluno",
            nome_completo_para_chamada: p.nome_aluno || "Aluno",
            endereco_mascarado: p.endereco_mascarado || "Endereço mascarado",
            ponto_referencia_generico: p.ponto_referencia || "Próximo à via",
            escola_destino: p.escola_destino || "Colégio Santa Mônica",
            status_embarque: p.status_embarque,
            hora_prevista: p.hora_prevista,
            hora_embarque: p.hora_embarque,
            hora_desembarque: p.hora_desembarque,
            motivo_ausencia: p.motivo_ausencia,
            responsavel_contato_mascarado: p.responsavel_telefone_mascarado || "(21) 9****-4567",
            telefone_para_chamada: "",
            google_maps_nav_url: `https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`,
            waze_nav_url: `https://waze.com/ul?ll=${p.latitude},${p.longitude}&navigate=yes`
          }));

          if (options.apenasProximaParada) {
            const prox = paradasSanitizadas.find((p) => p.status_embarque === 'PENDENTE');
            if (prox) paradasSanitizadas = [prox];
          }

          return {
            viagem,
            motorista: mot,
            paradas: paradasSanitizadas,
            sessao_segura: { token_expira_em_segundos: 300, dispositivo_autorizado: true, modo_zero_cache: true }
          };
        }
      } catch (err: any) {
        if (err.message?.includes('DISPOSITIVO_BLOQUEADO')) throw err;
      }
    }

    const token = AuthService.getSessionToken();
    let tokenUserId = motoristaId;
    if (token) {
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        if (payload?.userId) tokenUserId = payload.userId;
      } catch {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          if (payload?.userId) tokenUserId = payload.userId;
        } catch {}
      }
    }

    const mot = (tokenUserId ? motoristasDB.find((m) => m.id === tokenUserId) : null) || motoristasDB.find((m) => m.id === motoristaId) || motoristasDB[0];
    if (!mot || mot.dispositivo_bloqueado) throw new Error("DISPOSITIVO_BLOQUEADO");
    const viagem = viagensDB[0];
    const paradasDaViagem = (mot.id === 1) ? paradasDB.filter((p) => p.id_viagem === viagem.id) : [];

    const paradasSanitizadas: ParadaMotoristaSanitizada[] = paradasDaViagem.map((p) => {
      const aluno = alunosDB.find((a) => a.id === p.id_aluno);
      const resp = aluno ? responsaveisDB.find((r) => r.id === aluno.id_responsavel) : null;
      return {
        parada_id: p.id,
        viagem_id: p.id_viagem,
        aluno_id: p.id_aluno,
        ordem_sequencia: p.ordem_sequencia,
        nome_aluno_sanitizado: aluno?.nome_mascarado_lgpd || "Aluno",
        nome_completo_para_chamada: aluno ? aluno.nome : "Aluno",
        endereco_mascarado: aluno?.endereco_mascarado || "",
        ponto_referencia_generico: aluno?.ponto_referencia_generico || "",
        escola_destino: aluno?.escola_destino || "Colégio Santa Mônica",
        status_embarque: p.status_embarque,
        hora_prevista: p.hora_prevista,
        responsavel_contato_mascarado: resp ? mascararTelefone(resp.telefone) : "",
        telefone_para_chamada: "",
        google_maps_nav_url: `https://google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`,
        waze_nav_url: `https://waze.com/ul?ll=${p.latitude},${p.longitude}&navigate=yes`
      };
    });

    return {
      viagem,
      motorista: mot,
      paradas: paradasSanitizadas,
      sessao_segura: { token_expira_em_segundos: 300, dispositivo_autorizado: true, modo_zero_cache: true }
    };
  },

  async getViagemAtual(motoristaId: number = 1): Promise<ViagemDetalhada | null> {
    await sleep();
    const mot = motoristasDB.find((m) => m.id === motoristaId);
    if (!mot || mot.dispositivo_bloqueado) return null;
    const viagem = viagensDB[0];
    const paradas = await this.getAlunosPorViagem(Number(viagem.id));
    return { ...viagem, motorista: { ...mot }, paradas };
  },

  async getAlunosPorViagem(viagemId: number): Promise<AlunoParadaDetalhada[]> {
    await sleep();
    return paradasDB.map((p) => {
      const aluno = alunosDB.find((a) => a.id === p.id_aluno) || alunosDB[0];
      const responsavel = responsaveisDB.find((r) => r.id === aluno.id_responsavel) || responsaveisDB[0];
      return { ...p, aluno, responsavel };
    });
  },

  async updateStatusEmbarque(alunoId: number, viagemId: number, status: StatusEmbarque, observacao?: string): Promise<ParadaViagem> {
    await sleep(80);
    const parada = paradasDB.find((p) => p.id_aluno === alunoId || p.id === alunoId);
    if (parada) {
      parada.status_embarque = status;
      if (status === 'EMBARCOU') parada.hora_embarque = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      if (status === 'ENTREGUE') parada.hora_desembarque = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      if (observacao) parada.observacao = observacao;
    }

    if (typeof window !== 'undefined' || true) {
      fetch(`${getBaseUrl()}/api/paradas/${parada?.id || alunoId}/status`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status, observacao })
      }).catch(() => {});
    }

    emitEvent('STATUS_EMBARQUE_ATUALIZADO', { paradaId: parada?.id, status, alunoId });
    return parada || paradasDB[0];
  },

  /**
   * Dados do aluno para o App dos Pais.
   * - Sem `alunoId`: usa a primeira parada que o servidor devolveu para o responsável logado
   *   e retorna `null` quando não há aluno vinculado (nunca cai em dados de demonstração).
   * - Com `alunoId`: modo demonstração/testes, com fallback nos dados locais.
   */
  async getDadosAlunoParaPais(alunoId?: number) {
    await sleep();
    if (typeof window !== 'undefined' || true) {
      try {
        const res = await fetch(`${getBaseUrl()}/api/estado`, { headers: getAuthHeaders() });
        if (res.ok) {
          const serverState = await res.json();
          const paradasServidor: any[] = serverState.paradas || [];
          const paradaServidor = alunoId !== undefined
            ? (paradasServidor.find((p: any) => p.id_aluno === alunoId) || paradasServidor[0])
            : paradasServidor[0];
          if (paradaServidor) {
            const aluno: Aluno = {
              id: paradaServidor.id_aluno,
              uuid: `a-${paradaServidor.id_aluno}`,
              id_responsavel: 101,
              id_motorista: 1,
              nome: paradaServidor.nome_aluno,
              nome_aluno: paradaServidor.nome_aluno,
              escola_id: "ESC-SANTA-MONICA",
              escola_destino: paradaServidor.escola_destino,
              turma: '4º Ano',
              turno: 'MANHA',
              endereco_embarque: { rua: 'Rua Araguaia', numero: '850', latitude: -22.9348, longitude: -43.3412 },
              endereco_desembarque: { rua: 'Colégio Santa Mônica', numero: '100', latitude: -22.9360, longitude: -43.3420 },
              referencia_mascarada: paradaServidor.ponto_referencia || 'Rua A... - Próximo à Praça',
              nome_mascarado_lgpd: paradaServidor.nome_sanitizado,
              data_nascimento: '2017-06-14',
              endereco_embarque_real: paradaServidor.endereco_real || '',
              endereco_mascarado: paradaServidor.endereco_mascarado,
              ponto_referencia_generico: paradaServidor.ponto_referencia,
              bairro: 'Freguesia',
              foto_url: 'https://images.unsplash.com/photo-1543332164-6e82f355badc?auto=format&fit=crop&w=256&q=80',
              created_at: new Date().toISOString()
            };
            const responsavel: Responsavel = {
              id: 101,
              uuid: 'r-101',
              id_motorista: 1,
              nome: paradaServidor.responsavel_nome,
              nome_completo: paradaServidor.responsavel_nome,
              cpf: '123.456.789-00',
              telefone_whatsapp: paradaServidor.responsavel_telefone || '(21) 99123-4567',
              telefone: paradaServidor.responsavel_telefone || '(21) 99123-4567',
              email: 'pai@email.com',
              endereco_cobranca: paradaServidor.endereco_real || 'Rua Araguaia, 850',
              endereco_padrao: paradaServidor.endereco_real || '',
              parentesco: 'Pai',
              bairro: 'Freguesia',
              cidade: 'Rio de Janeiro',
              created_at: new Date().toISOString()
            };
            const motorista = serverState.motorista;
            const viagem = serverState.viagem;
            const parada: ParadaViagem = {
              id: paradaServidor.id,
              id_viagem: viagem.id,
              id_aluno: aluno.id,
              ordem_sequencia: paradaServidor.ordem_sequencia,
              status_embarque: paradaServidor.status_embarque,
              hora_prevista: paradaServidor.hora_prevista,
              latitude: paradaServidor.latitude,
              longitude: paradaServidor.longitude,
              observacao: paradaServidor.observacao,
              motivo_ausencia: paradaServidor.motivo_ausencia,
              hora_embarque: paradaServidor.hora_embarque,
              hora_desembarque: paradaServidor.hora_desembarque
            };
            return { aluno, responsavel, motorista, viagem, parada };
          }
        }
      } catch (err) {
        console.error(err);
      }
    }

    // Sem aluno vinculado (ou sem sessão): não exibe dados de demonstração para usuário real.
    if (alunoId === undefined) return null;

    const aluno = alunosDB.find((a) => a.id === alunoId) || alunosDB[0];
    const responsavel = responsaveisDB.find((r) => r.id === aluno.id_responsavel) || responsaveisDB[0];
    const motorista = motoristasDB[0];
    const viagem = viagensDB[0];
    const parada = paradasDB.find((p) => p.id_aluno === alunoId) || paradasDB[0];
    if (!aluno || !parada) return null;
    return { aluno, responsavel, motorista, viagem, parada };
  },

  async avisarAusencia(alunoId: number, motivo: string, observacao?: string) {
    await sleep();
    const parada = paradasDB.find((p) => p.id_aluno === alunoId || p.id === alunoId);
    if (parada) {
      parada.status_embarque = 'AUSENTE';
      parada.motivo_ausencia = motivo;
      if (observacao) parada.observacao = observacao;
    }

    if (typeof window !== 'undefined' || true) {
      fetch(`${getBaseUrl()}/api/alunos/${alunoId}/ausencia`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ motivo, observacao })
      }).catch(() => {});
    }

    emitEvent('AUSENCIA_NOTIFICADA', { alunoId, motivo });
    return { success: true, parada: parada || paradasDB[0] };
  },

  async cancelarAusencia(alunoId: number) {
    await sleep();
    const parada = paradasDB.find((p) => p.id_aluno === alunoId || p.id === alunoId);
    if (parada) {
      parada.status_embarque = 'PENDENTE';
      delete parada.motivo_ausencia;
    }

    if (typeof window !== 'undefined' || true) {
      fetch(`${getBaseUrl()}/api/alunos/${alunoId}/desfazer-ausencia`, {
        method: 'POST',
        headers: getAuthHeaders()
      }).catch(() => {});
    }

    emitEvent('AUSENCIA_CANCELADA', { alunoId });
    return { success: true };
  },

  async cancelarAvisoAusencia(alunoId: number) {
    return this.cancelarAusencia(alunoId);
  },

  async vincularPaiPorCodigo(codigoVinculo: string): Promise<{ aluno: Aluno; parada: ParadaViagem; responsavel: Responsavel; motorista: Motorista } | null> {
    await sleep();
    const cleanCode = codigoVinculo.trim().toUpperCase();

    if (typeof window !== 'undefined' || true) {
      const res = await fetch(`${getBaseUrl()}/api/vincular`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ codigoVinculo: cleanCode })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Código inválido' }));
        throw new Error(err.error || 'Código de convite inválido ou e-mail não verificado.');
      }
      const data = await res.json();
      if (data.token) {
        localStorage.setItem('van_token', data.token);
      }
      const paradaServidor = data.parada;
      const alunoObj: Aluno = {
        id: paradaServidor.id_aluno,
        uuid: `a-${paradaServidor.id_aluno}`,
        id_responsavel: 101,
        id_motorista: 1,
        nome: paradaServidor.nome_aluno,
        nome_aluno: paradaServidor.nome_aluno,
        escola_id: "ESC-SANTA-MONICA",
        escola_destino: paradaServidor.escola_destino,
        turma: '4º Ano',
        turno: 'MANHA',
        endereco_embarque: { rua: 'Rua Araguaia', numero: '850', latitude: -22.9348, longitude: -43.3412 },
        endereco_desembarque: { rua: 'Colégio Santa Mônica', numero: '100', latitude: -22.9360, longitude: -43.3420 },
        referencia_mascarada: paradaServidor.ponto_referencia || 'Rua A... - Próximo à Praça',
        nome_mascarado_lgpd: paradaServidor.nome_sanitizado,
        data_nascimento: '2017-05-10',
        endereco_embarque_real: paradaServidor.endereco_real || '',
        endereco_mascarado: paradaServidor.endereco_mascarado,
        ponto_referencia_generico: paradaServidor.ponto_referencia,
        bairro: 'Freguesia',
        foto_url: 'https://images.unsplash.com/photo-1543332164-6e82f355badc?auto=format&fit=crop&w=256&q=80',
        created_at: new Date().toISOString()
      };
      const respObj: Responsavel = {
        id: 101,
        uuid: 'r-101',
        id_motorista: 1,
        nome: paradaServidor.responsavel_nome,
        nome_completo: paradaServidor.responsavel_nome,
        cpf: '123.456.789-00',
        telefone_whatsapp: paradaServidor.responsavel_telefone || '(21) 99123-4567',
        telefone: paradaServidor.responsavel_telefone || '(21) 99123-4567',
        email: 'resp@email.com',
        endereco_cobranca: paradaServidor.endereco_real || 'Rua Araguaia, 850',
        endereco_padrao: paradaServidor.endereco_real || '',
        parentesco: 'Responsável',
        bairro: 'Freguesia',
        cidade: 'Rio de Janeiro',
        created_at: new Date().toISOString()
      };
      return { aluno: alunoObj, parada: paradaServidor, responsavel: respObj, motorista: motoristasDB[0] };
    }
    return null;
  },

  async limparDadosTeste(): Promise<void> {
    await sleep();
    paradasDB = [];
    alunosDB = [];
    responsaveisDB = [];
    emitEvent('database:reset', null);

    if (typeof window !== 'undefined' || true) {
      try {
        await fetch(`${getBaseUrl()}/api/limpar-dados`, { method: 'POST', headers: getAuthHeaders() });
      } catch {
        // Ignora
      }
    }
  },

  async cadastrarNovoAlunoComCodigo(params: {
    nomeAluno: string;
    endereco: string;
    pontoReferencia?: string;
    escola?: string;
    telefoneResponsavel?: string;
    nomeResponsavel?: string;
  }): Promise<{ novaParada: ParadaViagem; codigoVinculo: string }> {
    await sleep();
    if (typeof window !== 'undefined' || true) {
      const res = await fetch(`${getBaseUrl()}/api/paradas/nova`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(params)
      });
      if (!res.ok) throw new Error('Falha ao cadastrar aluno');
      const data = await res.json();
      return { novaParada: data.novaParada, codigoVinculo: data.codigoVinculo };
    }
    const codigoVinculo = `VAN-${Math.floor(1000 + Math.random() * 9000)}`;
    return { novaParada: paradasDB[0], codigoVinculo };
  },

  async enviarMensagemDireta(remetente: string, papel: 'MOTORISTA' | 'PAI', texto: string) {
    await sleep(50);
    if (typeof window !== 'undefined' || true) {
      const res = await fetch(`${getBaseUrl()}/api/mensagens`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ remetente, papel, texto })
      });
      if (res.ok) {
        const data = await res.json();
        return data.mensagem;
      }
    }
    return { id: Math.random().toString(36), remetente, papel, texto, timestamp: '12:00' };
  },

  async iniciarRota(viagemId: number) {
    await sleep(60);
    viagensDB[0].status = 'EM_ANDAMENTO';
    if (typeof window !== 'undefined' || true) {
      fetch(`${getBaseUrl()}/api/rotas/iniciar`, { method: 'POST', headers: getAuthHeaders() }).catch(() => {});
    }
    emitEvent('ROTA_STATUS_ALTERADO', { status: 'EM_ANDAMENTO' });
  },

  async encerrarRota(viagemId: number) {
    await sleep(60);
    viagensDB[0].status = 'FINALIZADA';
    if (typeof window !== 'undefined' || true) {
      fetch(`${getBaseUrl()}/api/rotas/encerrar`, { method: 'POST', headers: getAuthHeaders() }).catch(() => {});
    }
    emitEvent('ROTA_STATUS_ALTERADO', { status: 'FINALIZADA' });
  },

  async atualizarGPS(coords: { latitude: number; longitude: number; speedKmH: number; heading: number; accuracyMeters?: number }) {
    if (typeof window !== 'undefined' || true) {
      fetch(`${getBaseUrl()}/api/gps`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(coords)
      }).catch(() => {});
    }
  },

  /**
   * REPOSITÓRIO ISOLADO: getParadasDoDia(id_motorista, data, tipo)
   * Simula consulta SQL com JOINs filtrando por Multi-Tenant (id_motorista).
   * Resolve o endereço efetivo (padrão vs dinâmico por dia da semana) se o motorista permitir.
   */
  async getParadasDoDia(id_motorista: number | string, dataStr?: string, tipo: 'Ida' | 'Volta' = 'Ida') {
    await sleep();
    const mot = motoristasDB.find(m => String(m.id) === String(id_motorista) || m.uuid === String(id_motorista));
    const aceitaDinamicos = mot ? mot.aceita_enderecos_dinamicos : false;

    const dataObj = dataStr ? new Date(dataStr) : new Date();
    const diasSemanaMap: Record<number, 'DOMINGO' | 'SEGUNDA' | 'TERCA' | 'QUARTA' | 'QUINTA' | 'SEXTA' | 'SABADO'> = {
      0: 'DOMINGO',
      1: 'SEGUNDA',
      2: 'TERCA',
      3: 'QUARTA',
      4: 'QUINTA',
      5: 'SEXTA',
      6: 'SABADO'
    };
    const diaHoje = diasSemanaMap[dataObj.getDay()] || 'SEGUNDA';

    const alunosDoMotorista = alunosDB.filter(a => String(a.id_motorista) === String(id_motorista));

    return alunosDoMotorista.map((aluno, index) => {
      const responsavel = responsaveisDB.find(r => String(r.id) === String(aluno.id_responsavel));

      let enderecoEfetivo;
      let eDinamico = false;

      const endDinamicoDia = aluno.enderecos_dinamicos ? aluno.enderecos_dinamicos[diaHoje] : undefined;

      if (aceitaDinamicos && endDinamicoDia) {
        eDinamico = true;
        enderecoEfetivo = {
          ...endDinamicoDia,
          e_dinamico: true,
          descricao_efetiva: `${endDinamicoDia.rua}, ${endDinamicoDia.numero} (${endDinamicoDia.bairro || 'Freguesia'}) [Dinâmico - ${diaHoje}]`
        };
      } else {
        const base = tipo === 'Ida' ? aluno.endereco_embarque : aluno.endereco_desembarque;
        enderecoEfetivo = {
          rua: base?.rua || 'Rua Padrão',
          numero: base?.numero || 'S/N',
          bairro: base?.bairro || 'Freguesia',
          cidade: base?.cidade || 'Rio de Janeiro',
          latitude: base?.latitude || -22.9348,
          longitude: base?.longitude || -43.3412,
          ponto_referencia: base?.ponto_referencia || 'Portaria Principal',
          e_dinamico: false,
          descricao_efetiva: `${base?.rua || 'Rua Padrão'}, ${base?.numero || 'S/N'}`
        };
      }

      return {
        id_parada: `p-${aluno.id}-${dataStr || 'hoje'}`,
        id_aluno: aluno.id,
        id_motorista: aluno.id_motorista,
        id_responsavel: aluno.id_responsavel,
        tipo,
        nome_aluno: aluno.nome_aluno || aluno.nome,
        nome_responsavel: responsavel?.nome_completo || responsavel?.nome,
        telefone_whatsapp: responsavel?.telefone_whatsapp,
        cpf_responsavel: responsavel?.cpf,
        endereco_efetivo: enderecoEfetivo,
        status: 'Aguardando',
        ordem_sequencia: index + 1
      };
    });
  },

  /**
   * REPOSITÓRIO ISOLADO: getAlunosDoResponsavel(id_responsavel)
   * Consulta SQL simulada para obter alunos contratados por este responsável.
   */
  async getAlunosDoResponsavel(id_responsavel: number | string): Promise<Aluno[]> {
    await sleep();
    return alunosDB.filter(a => String(a.id_responsavel) === String(id_responsavel));
  },

  /**
   * TOGGLE ESTADO GLOBAL: toggleEnderecosDinamicos(id_motorista, aceita)
   * Atualiza a flag de aceitação de endereços dinâmicos do motorista.
   */
  async toggleEnderecosDinamicos(id_motorista: number | string, aceita?: boolean) {
    await sleep(50);
    const mot = motoristasDB.find(m => String(m.id) === String(id_motorista) || m.uuid === String(id_motorista));
    if (mot) {
      mot.aceita_enderecos_dinamicos = aceita !== undefined ? aceita : !mot.aceita_enderecos_dinamicos;
    }

    if (typeof window !== 'undefined' || true) {
      try {
        const res = await fetch(`${getBaseUrl()}/api/motoristas/toggle-enderecos-dinamicos`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ id_motorista, aceita: mot?.aceita_enderecos_dinamicos })
        });
        if (res.ok) {
          const data = await res.json();
          if (mot && data.aceita_enderecos_dinamicos !== undefined) {
            mot.aceita_enderecos_dinamicos = data.aceita_enderecos_dinamicos;
          }
        }
      } catch {
        // Ignora falha se offline ou sem servidor
      }
    }

    emitEvent('MOTORISTA_CONFIG_ALTERADA', { id_motorista, aceita_enderecos_dinamicos: mot?.aceita_enderecos_dinamicos });
    return mot;
  }
};

function emitEvent(eventType: string, payload: unknown) {
  listeners.forEach((cb) => cb(eventType, payload));
}
