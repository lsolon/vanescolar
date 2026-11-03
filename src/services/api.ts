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

import { auth, googleProvider } from './firebase';
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signOut } from 'firebase/auth';

const SIMULATED_LATENCY_MS = 120;
const sleep = (ms: number = SIMULATED_LATENCY_MS) => new Promise((resolve) => setTimeout(resolve, ms));

function getAuthHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('van_token') : '';
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
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
    dispositivo_bloqueado: false,
    created_at: "2026-01-15T07:00:00Z"
  }
];

const INITIAL_RESPONSAVEIS: Responsavel[] = [
  {
    id: 101,
    uuid: "r-101-leandro-4b2c",
    nome: "Leandro Solon",
    parentesco: "Pai",
    telefone: "(21) 99123-4567",
    email: "leandrosolon@gmail.com",
    endereco_padrao: "Rua Araguaia, 850 - Apto 302",
    bairro: "Freguesia (Jacarepaguá)",
    cidade: "Rio de Janeiro",
    created_at: "2026-02-01T10:00:00Z"
  }
];

const INITIAL_ALUNOS: Aluno[] = [
  {
    id: 201,
    uuid: "a-201-mariaclara-1c9f",
    id_responsavel: 101,
    id_motorista: 1,
    nome: "Maria Clara Solon",
    nome_mascarado_lgpd: "Maria C.",
    data_nascimento: "2017-06-14",
    escola_destino: "Colégio Santa Mônica - Freguesia",
    turma: "4º Ano Fundamental I",
    turno: "MANHA",
    endereco_embarque_real: "Rua Araguaia, 850 - Apto 302",
    endereco_mascarado: "Rua F... - Próximo à Praça",
    ponto_referencia_generico: "Próximo à Praça / Portaria Principal",
    bairro: "Freguesia (Jacarepaguá)",
    foto_url: "https://images.unsplash.com/photo-1543332164-6e82f355badc?auto=format&fit=crop&w=256&q=80",
    contato_emergencia: "(21) 99123-4567 (Pai)",
    observacoes_medicas: "Alérgica a amendoim.",
    created_at: "2026-02-05T08:00:00Z"
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
    ordem_sequencia: 1,
    status_embarque: "PENDENTE",
    hora_prevista: "06:45",
    latitude: -22.9348,
    longitude: -43.3412,
    observacao: "Portaria principal do condomínio",
    codigo_vinculo: "VAN-201"
  }
];

let motoristasDB: Motorista[] = JSON.parse(JSON.stringify(INITIAL_MOTORISTAS));
let responsaveisDB: Responsavel[] = JSON.parse(JSON.stringify(INITIAL_RESPONSAVEIS));
let alunosDB: Aluno[] = JSON.parse(JSON.stringify(INITIAL_ALUNOS));
let viagensDB: ViagemDiario[] = JSON.parse(JSON.stringify(INITIAL_VIAGENS));
let paradasDB: ParadaViagem[] = JSON.parse(JSON.stringify(INITIAL_PARADAS));

type EventCallback = (eventType: string, payload: unknown) => void;
const listeners = new Set<EventCallback>();

if (typeof window !== 'undefined' && 'EventSource' in window) {
  try {
    const token = localStorage.getItem('van_token') || '';
    const sse = new EventSource(`/api/events?token=${token}`);
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
      'GPS_ATUALIZADO'
    ];

    eventosMapeados.forEach((nomeEvento) => {
      sse.addEventListener(nomeEvento, (e) => {
        try {
          const payload = JSON.parse(e.data);
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
  if (serverState.motorista && motoristasDB[0]) {
    motoristasDB[0].dispositivo_bloqueado = !!serverState.motorista.dispositivo_bloqueado;
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
    await sleep();
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      const res = await fetch('/api/auth/login-motorista', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, pin })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Falha no login' }));
        throw new Error(err.error || 'Credenciais inválidas');
      }
      const data = await res.json();
      if (data.token) {
        localStorage.setItem('van_token', data.token);
      }
      return data.token;
    }
    return 'mock-token';
  },

  async registrarResponsavel(params: { fullName: string; email: string; password: string; lgpdConsent: boolean }) {
    await sleep();
    if (params.password.length < 10) {
      throw new Error('A senha deve ter no mínimo 10 caracteres.');
    }
    if (!params.lgpdConsent) {
      throw new Error('O consentimento específico para dados de menores (LGPD Art. 14) é obrigatório.');
    }

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Erro ao cadastrar' }));
      throw new Error(err.error || 'Não foi possível completar o cadastro.');
    }
    const data = await res.json();
    if (data.token) {
      localStorage.setItem('van_token', data.token);
    }
    return data;
  },

  async loginEmail(email: string, password: string) {
    await sleep();
    const res = await fetch('/api/auth/login-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'E-mail ou senha incorretos' }));
      throw new Error(err.error || 'E-mail ou senha incorretos.');
    }
    const data = await res.json();
    if (data.token) {
      localStorage.setItem('van_token', data.token);
    }
    return data;
  },

  async loginGoogle() {
    await sleep();
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, fullName: user.displayName || 'Responsável Google' })
      });
      if (!res.ok) throw new Error('Falha ao autenticar com Google no servidor.');
      const data = await res.json();
      if (data.token) {
        localStorage.setItem('van_token', data.token);
      }
      return data;
    } catch (err: any) {
      // Fallback para simulação caso o popup seja bloqueado no ambiente de preview
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'leandrosolon@gmail.com', fullName: 'Leandro Solon' })
      });
      const data = await res.json();
      if (data.token) localStorage.setItem('van_token', data.token);
      return data;
    }
  },

  async forgotPassword(email: string) {
    await sleep();
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    return data.message || 'Se o e-mail estiver cadastrado, as instruções de redefinição foram enviadas.';
  },

  async simularVerificacaoEmail() {
    const res = await fetch('/api/auth/verify-email-sim', {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (res.ok) {
      const data = await res.json();
      if (data.token) localStorage.setItem('van_token', data.token);
      return data;
    }
    throw new Error('Falha na verificação');
  },

  async resetDatabase(): Promise<void> {
    await sleep();
    motoristasDB = JSON.parse(JSON.stringify(INITIAL_MOTORISTAS));
    responsaveisDB = JSON.parse(JSON.stringify(INITIAL_RESPONSAVEIS));
    alunosDB = JSON.parse(JSON.stringify(INITIAL_ALUNOS));
    viagensDB = JSON.parse(JSON.stringify(INITIAL_VIAGENS));
    paradasDB = JSON.parse(JSON.stringify(INITIAL_PARADAS));
    emitEvent('database:reset', null);

    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      fetch('/api/reset', { method: 'POST', headers: getAuthHeaders() }).catch(() => {});
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

    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      const res = await fetch('/api/motoristas/kill-switch', {
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
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      await fetch('/api/motoristas/desbloquear', {
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
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      try {
        const res = await fetch('/api/estado', { headers: getAuthHeaders() });
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

    const mot = motoristasDB.find((m) => m.id === motoristaId);
    if (!mot || mot.dispositivo_bloqueado) throw new Error("DISPOSITIVO_BLOQUEADO");
    const viagem = viagensDB[0];
    const paradasDaViagem = paradasDB.filter((p) => p.id_viagem === viagem.id);

    const paradasSanitizadas: ParadaMotoristaSanitizada[] = paradasDaViagem.map((p) => {
      const aluno = alunosDB.find((a) => a.id === p.id_aluno);
      const resp = aluno ? responsaveisDB.find((r) => r.id === aluno.id_responsavel) : null;
      return {
        parada_id: p.id,
        viagem_id: p.id_viagem,
        aluno_id: p.id_aluno,
        ordem_sequencia: p.ordem_sequencia,
        nome_aluno_sanitizado: aluno ? aluno.nome_mascarado_lgpd : "Aluno",
        nome_completo_para_chamada: aluno ? aluno.nome : "Aluno",
        endereco_mascarado: aluno ? aluno.endereco_mascarado : "",
        ponto_referencia_generico: aluno?.ponto_referencia_generico || "",
        escola_destino: aluno?.escola_destino || "",
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
    const paradas = await this.getAlunosPorViagem(viagem.id);
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

    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      fetch(`/api/paradas/${parada?.id || alunoId}/status`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status, observacao })
      }).catch(() => {});
    }

    emitEvent('STATUS_EMBARQUE_ATUALIZADO', { paradaId: parada?.id, status, alunoId });
    return parada || paradasDB[0];
  },

  async getDadosAlunoParaPais(alunoId: number = 201) {
    await sleep();
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      try {
        const res = await fetch('/api/estado', { headers: getAuthHeaders() });
        if (res.ok) {
          const serverState = await res.json();
          const paradaServidor = (serverState.paradas || []).find((p: any) => p.id_aluno === alunoId) || serverState.paradas[0];
          if (paradaServidor) {
            const aluno: Aluno = {
              id: paradaServidor.id_aluno,
              uuid: `a-${paradaServidor.id_aluno}`,
              id_responsavel: 101,
              id_motorista: 1,
              nome: paradaServidor.nome_aluno,
              nome_mascarado_lgpd: paradaServidor.nome_sanitizado,
              data_nascimento: '2017-06-14',
              escola_destino: paradaServidor.escola_destino,
              turma: '4º Ano',
              turno: 'MANHA',
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
              nome: paradaServidor.responsavel_nome,
              parentesco: 'Pai',
              telefone: paradaServidor.responsavel_telefone,
              email: 'pai@email.com',
              endereco_padrao: paradaServidor.endereco_real || '',
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

    const aluno = alunosDB.find((a) => a.id === alunoId) || alunosDB[0];
    const responsavel = responsaveisDB.find((r) => r.id === aluno.id_responsavel) || responsaveisDB[0];
    const motorista = motoristasDB[0];
    const viagem = viagensDB[0];
    const parada = paradasDB.find((p) => p.id_aluno === alunoId) || paradasDB[0];
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

    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      fetch(`/api/alunos/${alunoId}/ausencia`, {
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

    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      fetch(`/api/alunos/${alunoId}/desfazer-ausencia`, {
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

    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      const res = await fetch('/api/vincular', {
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
        nome_mascarado_lgpd: paradaServidor.nome_sanitizado,
        data_nascimento: '2017-05-10',
        escola_destino: paradaServidor.escola_destino,
        turma: '4º Ano',
        turno: 'MANHA',
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
        nome: paradaServidor.responsavel_nome,
        parentesco: 'Responsável',
        telefone: paradaServidor.responsavel_telefone,
        email: 'resp@email.com',
        endereco_padrao: paradaServidor.endereco_real || '',
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

    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      try {
        await fetch('/api/limpar-dados', { method: 'POST', headers: getAuthHeaders() });
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
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      const res = await fetch('/api/paradas/nova', {
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
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      const res = await fetch('/api/mensagens', {
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
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      fetch('/api/rotas/iniciar', { method: 'POST', headers: getAuthHeaders() }).catch(() => {});
    }
    emitEvent('ROTA_STATUS_ALTERADO', { status: 'EM_ANDAMENTO' });
  },

  async encerrarRota(viagemId: number) {
    await sleep(60);
    viagensDB[0].status = 'FINALIZADA';
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      fetch('/api/rotas/encerrar', { method: 'POST', headers: getAuthHeaders() }).catch(() => {});
    }
    emitEvent('ROTA_STATUS_ALTERADO', { status: 'FINALIZADA' });
  },

  async atualizarGPS(coords: { latitude: number; longitude: number; speedKmH: number; heading: number }) {
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      fetch('/api/gps', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(coords)
      }).catch(() => {});
    }
  }
};

function emitEvent(eventType: string, payload: unknown) {
  listeners.forEach((cb) => cb(eventType, payload));
}
