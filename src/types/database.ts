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

export type StatusEmbarque = 'PENDENTE' | 'EMBARCOU' | 'ENTREGUE' | 'AUSENTE' | 'Aguardando';

export type StatusViagem = 'AGENDADA' | 'EM_ANDAMENTO' | 'FINALIZADA' | 'CANCELADA';

export type PeriodoViagem = 'MANHA_IDA' | 'MANHA_VOLTA' | 'TARDE_IDA' | 'TARDE_VOLTA';

export type DiaSemana = 'SEGUNDA' | 'TERCA' | 'QUARTA' | 'QUINTA' | 'SEXTA' | 'SABADO' | 'DOMINGO';

export interface EnderecoDetalhado {
  rua: string;
  numero: string;
  bairro?: string;
  cidade?: string;
  latitude: number;
  longitude: number;
  complemento?: string;
  ponto_referencia?: string;
}

export interface EnderecosDinamicosSemana {
  SEGUNDA?: EnderecoDetalhado;
  TERCA?: EnderecoDetalhado;
  QUARTA?: EnderecoDetalhado;
  QUINTA?: EnderecoDetalhado;
  SEXTA?: EnderecoDetalhado;
  SABADO?: EnderecoDetalhado;
  DOMINGO?: EnderecoDetalhado;
}

/**
 * 1. Tabela: Motorista (Configurações e Tenant)
 * Chave Primária: id (UUID - Tenant ID)
 */
export interface Motorista {
  id: number | string;
  uuid: string;
  nome: string;
  telefone: string;
  cnh: string;
  foto_url: string;
  veiculo_modelo: string;
  veiculo_placa: string;
  /** Bairro/região do motorista (cabeçalho "Van do João • Freguesia"); opcional */
  bairro?: string;
  veiculo_capacidade: number;
  status_operacional: 'ATIVO' | 'INATIVO' | 'EM_ROTA';
  aceita_enderecos_dinamicos: boolean; // Flag que define se este motorista permite endereços por dia da semana
  horarios?: string[];
  dispositivo_bloqueado?: boolean;
  motivo_bloqueio?: string;
  bloqueado_em?: string;
  totp_enabled?: boolean;
  created_at: string;
}

/**
 * 2. Tabela: Responsável (O Contratante - Acesso e Faturamento)
 * Chave Primária: id (UUID)
 * Filtro Multi-Tenant: id_motorista
 */
export interface Responsavel {
  id: number | string;
  uuid: string;
  id_motorista: number | string; // Filtro Multi-Tenant (RLS lógico)
  nome: string;
  nome_completo: string; // Exibição no painel e contratos
  cpf: string; // Para geração de faturas (Mercado Pago/Pix)
  telefone_whatsapp: string; // Acionamentos rápidos
  telefone: string;
  email: string;
  endereco_cobranca: string; // Endereço fiscal, independente do embarque
  endereco_padrao?: string;
  parentesco?: string;
  bairro?: string;
  cidade?: string;
  created_at: string;
}

/**
 * 3. Tabela: Aluno (O Passageiro - Logística)
 * Chave Primária: id (UUID)
 * Chaves Estrangeiras: id_responsavel, id_motorista
 */
export interface Aluno {
  id: number | string;
  uuid: string;
  id_responsavel: number | string; // Vínculo com contratante
  id_motorista: number | string; // Filtro Multi-Tenant
  nome: string;
  nome_aluno: string; // Nome da criança
  escola_id: string; // Vínculo com a instituição
  escola_destino?: string;
  turma?: string;
  data_nascimento?: string;
  turno: 'MANHA' | 'TARDE' | 'NOITE' | 'INTEGRAL';
  endereco_embarque: EnderecoDetalhado; // Lat/Long, rua e número padrão
  endereco_desembarque: EnderecoDetalhado; // Lat/Long, rua e número padrão
  enderecos_dinamicos?: EnderecosDinamicosSemana; // Mapeamento por dia (só processado se o motorista permitir)
  referencia_mascarada: string; // String curta para a tela do motorista
  nome_mascarado_lgpd?: string;
  endereco_embarque_real?: string;
  endereco_mascarado?: string;
  ponto_referencia_generico?: string;
  bairro?: string;
  foto_url?: string;
  contato_emergencia?: string;
  observacoes_medicas?: string;
  created_at: string;
}

export interface ViagemDiario {
  id: number | string;
  uuid: string;
  id_motorista: number | string;
  data: string;
  periodo: PeriodoViagem | string;
  status: StatusViagem | string;
  rota_nome: string;
  distancia_km_estimada?: number;
  created_at: string;
}

/**
 * 4. Tabela: Viagem_Diario / ParadaViagem (A Rota de Execução)
 */
export interface ParadaViagem {
  id: number | string;
  id_parada?: string;
  id_viagem: number | string;
  id_aluno: number | string;
  id_motorista?: number | string;
  tipo?: 'Ida' | 'Volta';
  ordem_sequencia: number;
  status_embarque: StatusEmbarque;
  hora_prevista: string;
  /** Horários previstos da van (ida e volta) e horário da escola informado pelo responsável */
  hora_ida?: string | null;
  hora_volta?: string | null;
  escola_entrada?: string;
  escola_saida?: string;
  /** Turno do aluno e se os horários vieram da escola/turno definidos pelo motorista */
  turno?: 'MANHA' | 'TARDE' | 'NOITE';
  /** Viagem (lista nomeada do motorista) em que o aluno está fixo. Só o motorista recebe. */
  viagem_nomeada_id?: string;
  horario_da_escola?: boolean;
  ausencia_trecho?: 'IDA' | 'VOLTA' | 'AMBOS';
  /** PENDENTE = aguardando o motorista confirmar; RECUSADO = motorista não aceitou/removeu */
  vinculo?: 'PENDENTE' | 'CONFIRMADO' | 'RECUSADO';
  hora_embarque?: string;
  hora_desembarque?: string;
  latitude: number;
  longitude: number;
  endereco_efetivo?: EnderecoDetalhado & { e_dinamico: boolean; descricao_efetiva: string };
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
  parada_id: number | string;
  viagem_id: number | string;
  aluno_id: number | string;
  ordem_sequencia: number;
  ordem_ida?: number;
  ordem_volta?: number;
  nome_aluno_sanitizado: string; // Ex: "Maria C."
  nome_completo_para_chamada?: string; // Disponível em visualização restrita
  endereco_mascarado: string; // Ex: "Rua F... - Próximo à Praça"
  ponto_referencia_generico: string;
  escola_destino: string;
  status_embarque: StatusEmbarque;
  hora_prevista: string;
  hora_ida?: string | null;
  hora_volta?: string | null;
  escola_entrada?: string;
  escola_saida?: string;
  turno?: 'MANHA' | 'TARDE' | 'NOITE';
  /** Viagem (lista nomeada do motorista) em que o aluno está fixo. Só o motorista recebe. */
  viagem_nomeada_id?: string;
  horario_da_escola?: boolean;
  vinculo?: 'PENDENTE' | 'CONFIRMADO' | 'RECUSADO';
  /** Ficha de adesão (só o motorista vê): dados extras que a família informou. */
  adesao?: { parentesco?: string; serie?: string; nascimento?: string; maiorIdade?: boolean; saude?: string; autorizados?: { nome: string; telefone: string }[]; emergencia?: { nome: string; telefone: string }; responsavelNome?: string };
  /** Escola do aluno (para a solicitação pendente) */
  escola_nome?: string;
  hora_embarque?: string;
  hora_desembarque?: string;
  motivo_ausencia?: string;
  responsavel_contato_mascarado: string; // Ex: "(21) 9****-4567"
  telefone_para_chamada: string;
  // Coordenadas protegidas para navegação externa pontual (Waze / Google Maps)
  waze_nav_url?: string;
  google_maps_nav_url?: string;
  /** false = o motorista ainda não marcou o local de embarque deste aluno */
  tem_localizacao?: boolean;
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
