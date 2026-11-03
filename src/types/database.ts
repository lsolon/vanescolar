/**
 * ============================================================================
 * MODELAGEM RELACIONAL DE DADOS COM CONFORMIDADE LGPD & ZERO-CACHE
 * ============================================================================
 * 
 * Estruturada conforme modelo SQL relacional normalizado para posterior
 * migração para PostgreSQL / MySQL hospedado em VPS Node.js.
 * 
 * POLÍTICAS DE SEGURANÇA E PRIVACIDADE DE MENORES (Art. 14 da LGPD):
 * 1. Zero-Cache: O dispositivo do motorista recebe apenas DTOs sanitizados e
 *    efêmeros. Dados completos de menores nunca são persistidos localmente.
 * 2. Mascaramento Visual: Endereços residenciais são mascarados ("Rua F... - Próximo à Praça")
 *    e nomes de menores são reduzidos ("Maria C."). Coordenadas exatas existem
 *    apenas em memória para acionamento pontual de navegação externa (Waze/Maps).
 * 3. Kill-Switch: Estado de emergência para revogação instantânea de sessão remota.
 * ============================================================================
 */

export type StatusEmbarque = 'PENDENTE' | 'EMBARCOU' | 'ENTREGUE' | 'AUSENTE';

export type StatusViagem = 'AGENDADA' | 'EM_ANDAMENTO' | 'FINALIZADA' | 'CANCELADA';

export type PeriodoViagem = 'MANHA_IDA' | 'MANHA_VOLTA' | 'TARDE_IDA' | 'TARDE_VOLTA';

/**
 * Tabela SQL: motoristas
 * Chave Primária: id (SERIAL ou UUID)
 */
export interface Motorista {
  id: number;
  uuid: string;
  nome: string;
  telefone: string;
  cnh: string;
  foto_url: string;
  veiculo_modelo: string;
  veiculo_placa: string;
  veiculo_capacidade: number;
  status_operacional: 'ATIVO' | 'INATIVO' | 'EM_ROTA';
  dispositivo_bloqueado?: boolean;
  motivo_bloqueio?: string;
  bloqueado_em?: string;
  created_at: string;
}

/**
 * Tabela SQL: responsaveis
 * Chave Primária: id (SERIAL ou UUID)
 */
export interface Responsavel {
  id: number;
  uuid: string;
  nome: string;
  parentesco: string; // Ex: 'Pai', 'Mãe', 'Tutor'
  telefone: string;
  email: string;
  endereco_padrao: string;
  bairro: string;
  cidade: string;
  created_at: string;
}

/**
 * Tabela SQL: alunos
 * Chave Primária: id (SERIAL ou UUID)
 * Chaves Estrangeiras: id_responsavel -> responsaveis(id), id_motorista -> motoristas(id)
 */
export interface Aluno {
  id: number;
  uuid: string;
  id_responsavel: number;
  id_motorista: number;
  nome: string;
  nome_mascarado_lgpd: string; // Ex: "Maria C."
  data_nascimento: string;
  escola_destino: string;
  turma: string;
  turno: 'MANHA' | 'TARDE' | 'INTEGRAL';
  endereco_embarque_real: string; // Restrito / Não exposto por extenso no painel do motorista
  endereco_mascarado: string; // Ex: "Rua F... - Próximo à Praça" (Requisito Explícito)
  ponto_referencia_generico: string;
  bairro: string;
  foto_url: string;
  contato_emergencia?: string;
  observacoes_medicas?: string;
  created_at: string;
}

/**
 * Tabela SQL: viagens_diario
 * Chave Primária: id (SERIAL ou UUID)
 * Chave Estrangeira: id_motorista -> motoristas(id)
 */
export interface ViagemDiario {
  id: number;
  uuid: string;
  id_motorista: number;
  data: string; // YYYY-MM-DD
  periodo: PeriodoViagem;
  status: StatusViagem;
  hora_inicio?: string;
  hora_fim?: string;
  rota_nome: string;
  distancia_km_estimada: number;
  created_at: string;
}

/**
 * Tabela SQL: paradas_viagem
 * Chave Primária: id (SERIAL ou UUID)
 * Chaves Estrangeiras: id_viagem -> viagens_diario(id), id_aluno -> alunos(id)
 */
export interface ParadaViagem {
  id: number;
  id_viagem: number;
  id_aluno: number;
  ordem_sequencia: number;
  status_embarque: StatusEmbarque;
  hora_prevista: string;
  hora_embarque?: string;
  hora_desembarque?: string;
  latitude: number;
  longitude: number;
  observacao?: string;
  motivo_ausencia?: string;
  notificado_ausencia_em?: string;
  codigo_vinculo?: string;
}

/**
 * DTO Sanitizado (LGPD & Zero-Cache) para o Painel do Motorista.
 * Nenhum endereço residencial completo por extenso viaja neste objeto.
 */
export interface ParadaMotoristaSanitizada {
  parada_id: number;
  viagem_id: number;
  aluno_id: number;
  ordem_sequencia: number;
  nome_aluno_sanitizado: string; // Ex: "Maria C."
  nome_completo_para_chamada?: string; // Disponível em visualização restrita
  endereco_mascarado: string; // Ex: "Rua F... - Próximo à Praça"
  ponto_referencia_generico: string;
  escola_destino: string;
  status_embarque: StatusEmbarque;
  hora_prevista: string;
  hora_embarque?: string;
  hora_desembarque?: string;
  motivo_ausencia?: string;
  responsavel_contato_mascarado: string; // Ex: "(21) 9****-4567"
  telefone_para_chamada: string;
  // Coordenadas protegidas para navegação externa pontual (Waze / Google Maps)
  waze_nav_url: string;
  google_maps_nav_url: string;
}

export interface ViagemMotoristaZeroCache {
  viagem: ViagemDiario;
  motorista: Motorista;
  paradas: ParadaMotoristaSanitizada[];
  sessao_segura: {
    token_expira_em_segundos: number;
    dispositivo_autorizado: boolean;
    modo_zero_cache: boolean;
  };
}

export interface AlunoParadaDetalhada extends ParadaViagem {
  aluno: Aluno;
  responsavel: Responsavel;
}

export interface ViagemDetalhada extends ViagemDiario {
  motorista: Motorista;
  paradas: AlunoParadaDetalhada[];
}

export interface GPSCoordinate {
  latitude: number;
  longitude: number;
  speedKmH: number;
  heading: number;
  timestamp: string;
  accuracyMeters: number;
  currentAddress: string;
  nextStopName: string;
  etaNextStopMinutes: number;
}
