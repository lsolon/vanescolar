import React, { useState } from 'react';
import { X, Database, Server, GitFork, FileCode, CheckCircle, Copy, Cpu } from 'lucide-react';

interface ArchitectureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ArchitectureModal: React.FC<ArchitectureModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'FOLDERS' | 'SQL' | 'API' | 'VPS'>('FOLDERS');
  const [copiado, setCopiado] = useState<boolean>(false);

  if (!isOpen) return null;

  const copiarTexto = (texto: string) => {
    navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  const sqlDDL = `-- ============================================================================
-- ESQUEMA RELACIONAL SQL NORMALIZADO (PostgreSQL 15+ / MySQL 8.0+)
-- Arquitetura para VPS Node.js - VanEscolar MVP
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TABELA DE MOTORISTAS
CREATE TABLE motoristas (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE,
    nome VARCHAR(120) NOT NULL,
    telefone VARCHAR(20) NOT NULL,
    cnh VARCHAR(20) NOT NULL UNIQUE,
    foto_url TEXT,
    veiculo_modelo VARCHAR(80) NOT NULL,
    veiculo_placa VARCHAR(10) NOT NULL UNIQUE,
    veiculo_capacidade INT NOT NULL DEFAULT 16,
    status_operacional VARCHAR(20) DEFAULT 'ATIVO' CHECK (status_operacional IN ('ATIVO', 'INATIVO', 'EM_ROTA')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. TABELA DE RESPONSÁVEIS
CREATE TABLE responsaveis (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE,
    nome VARCHAR(120) NOT NULL,
    parentesco VARCHAR(40) NOT NULL, -- 'Pai', 'Mãe', 'Tutor'
    telefone VARCHAR(20) NOT NULL,
    email VARCHAR(120) NOT NULL UNIQUE,
    senha_hash VARCHAR(255) NOT NULL,
    endereco_padrao TEXT NOT NULL,
    bairro VARCHAR(80) NOT NULL DEFAULT 'Freguesia (Jacarepaguá)',
    cidade VARCHAR(80) NOT NULL DEFAULT 'Rio de Janeiro',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. TABELA DE ALUNOS (Com FKs normalizadas)
CREATE TABLE alunos (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE,
    id_responsavel INT NOT NULL REFERENCES responsaveis(id) ON DELETE CASCADE,
    id_motorista INT NOT NULL REFERENCES motoristas(id) ON DELETE RESTRICT,
    nome VARCHAR(120) NOT NULL,
    data_nascimento DATE NOT NULL,
    escola_destino VARCHAR(120) NOT NULL,
    turma VARCHAR(50) NOT NULL,
    turno VARCHAR(20) NOT NULL CHECK (turno IN ('MANHA', 'TARDE', 'INTEGRAL')),
    endereco_embarque TEXT NOT NULL,
    bairro VARCHAR(80) NOT NULL,
    foto_url TEXT,
    observacoes_medicas TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. TABELA DE VIAGENS DIÁRIAS (Escala e Turnos)
CREATE TABLE viagens_diario (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE,
    id_motorista INT NOT NULL REFERENCES motoristas(id),
    data DATE NOT NULL DEFAULT CURRENT_DATE,
    periodo VARCHAR(20) NOT NULL CHECK (periodo IN ('MANHA_IDA', 'MANHA_VOLTA', 'TARDE_IDA', 'TARDE_VOLTA')),
    status VARCHAR(20) NOT NULL DEFAULT 'AGENDADA' CHECK (status IN ('AGENDADA', 'EM_ANDAMENTO', 'FINALIZADA', 'CANCELADA')),
    hora_inicio TIME,
    hora_fim TIME,
    rota_nome VARCHAR(100) NOT NULL,
    distancia_km_estimada DECIMAL(5,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. TABELA DE PARADAS DA VIAGEM (Itens do Diário de Bordo)
CREATE TABLE paradas_viagem (
    id SERIAL PRIMARY KEY,
    id_viagem INT NOT NULL REFERENCES viagens_diario(id) ON DELETE CASCADE,
    id_aluno INT NOT NULL REFERENCES alunos(id) ON DELETE RESTRICT,
    ordem_sequencia INT NOT NULL,
    status_embarque VARCHAR(20) NOT NULL DEFAULT 'PENDENTE' CHECK (status_embarque IN ('PENDENTE', 'EMBARCOU', 'ENTREGUE', 'AUSENTE')),
    hora_prevista TIME NOT NULL,
    hora_embarque TIME,
    hora_desembarque TIME,
    latitude DECIMAL(10, 7) NOT NULL,
    longitude DECIMAL(10, 7) NOT NULL,
    observacao TEXT,
    motivo_ausencia TEXT,
    notificado_ausencia_em TIMESTAMP WITH TIME ZONE,
    UNIQUE(id_viagem, id_aluno)
);

-- ÍNDICES DE PERFORMANCE PARA CONSULTAS EM TEMPO REAL
CREATE INDEX idx_paradas_viagem_aluno ON paradas_viagem(id_aluno);
CREATE INDEX idx_viagens_motorista_data ON viagens_diario(id_motorista, data);
CREATE INDEX idx_alunos_responsavel ON alunos(id_responsavel);`;

  const pastaEstrutura = `van-escolar/
├── src/
│   ├── components/
│   │   ├── driver/            # Interface isolada do Motorista
│   │   │   ├── DriverPanel.tsx       # Diário de Bordo e controle de rota
│   │   │   ├── StudentManifest.tsx   # Lista de chamada operacional
│   │   │   └── QuickActionButtons.tsx# Botões táteis (Embarcou/Entregue/Ausente)
│   │   ├── parents/           # Interface isolada dos Pais
│   │   │   ├── ParentApp.tsx         # Dashboard com telemetria e status
│   │   │   ├── AbsenceModal.tsx      # Diálogo rápido "Avisar Ausência"
│   │   │   └── DriverInfoCard.tsx    # Perfil e contato de David
│   │   └── shared/            # Componentes reaproveitáveis
│   │       ├── LiveMap.tsx           # Mapa visual interativo (Freguesia, RJ)
│   │       ├── DualDeviceView.tsx    # Simulação lado a lado (Celular Pais vs Motorista)
│   │       └── ArchitectureModal.tsx # Documentação e esquema SQL
│   ├── hooks/
│   │   ├── useGPS.ts          # Abstração de geolocalização / WebSocket
│   │   └── useTripSync.ts     # Sincronização em tempo real
│   ├── services/              # REPOSITORY PATTERN OBRIGATÓRIO
│   │   ├── api.ts             # Implementação com dados normalizados e promises
│   │   └── api.test.ts        # Testes unitários com Node.js test runner
│   ├── types/
│   │   └── database.ts        # Interfaces tipadas espelhando o banco SQL
│   ├── App.tsx                # Orquestrador com seletor de interfaces
│   └── main.tsx               # Ponto de entrada Vite
├── package.json
└── tsconfig.json`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full h-[88vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Cabeçalho */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-400/10 text-amber-400 border border-amber-400/20">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                Arquitetura de Solução & Especificação Técnica
              </h2>
              <p className="text-xs text-slate-400">
                Blueprint para transição do MVP React para backend Node.js + PostgreSQL em VPS
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas de Navegação */}
        <div className="flex items-center gap-2 px-5 py-2.5 bg-slate-950/40 border-b border-slate-800 text-xs overflow-x-auto">
          <button
            onClick={() => setActiveTab('FOLDERS')}
            className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'FOLDERS'
                ? 'bg-amber-400 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            Estrutura de Pastas
          </button>
          <button
            onClick={() => setActiveTab('SQL')}
            className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'SQL'
                ? 'bg-amber-400 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            Modelagem Relacional (SQL DDL)
          </button>
          <button
            onClick={() => setActiveTab('API')}
            className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'API'
                ? 'bg-amber-400 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            Repository & Endpoints REST
          </button>
          <button
            onClick={() => setActiveTab('VPS')}
            className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'VPS'
                ? 'bg-amber-400 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <GitFork className="w-3.5 h-3.5" />
            WebSockets & VPS Stack
          </button>
        </div>

        {/* Conteúdo da Aba */}
        <div className="flex-1 overflow-y-auto p-5 text-xs text-slate-300">
          {activeTab === 'FOLDERS' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-100">Árvore de Diretórios Recomendada</h3>
                <button
                  onClick={() => copiarTexto(pastaEstrutura)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 font-mono text-[11px]"
                >
                  {copiado ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiado ? 'Copiado!' : 'Copiar Estrutura'}</span>
                </button>
              </div>

              <pre className="p-4 bg-slate-950 rounded-2xl border border-slate-800 font-mono text-slate-300 text-xs overflow-x-auto leading-relaxed">
                {pastaEstrutura}
              </pre>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <h4 className="font-bold text-amber-400 mb-1">/services (Repository)</h4>
                  <p className="text-slate-400 text-[11px]">
                    Isola chamadas de dados e regras de negócio. No futuro, substitui o mock por chamadas HTTP Axios ao Node.js.
                  </p>
                </div>
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <h4 className="font-bold text-cyan-400 mb-1">/hooks (useGPS)</h4>
                  <p className="text-slate-400 text-[11px]">
                    Abstrai a telemetria. É facilmente substituível por um client Socket.io conectado ao broker Redis na VPS.
                  </p>
                </div>
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <h4 className="font-bold text-emerald-400 mb-1">/types (SQL DTOs)</h4>
                  <p className="text-slate-400 text-[11px]">
                    Tipagens TypeScript normalizadas de acordo com as chaves primárias e estrangeiras do PostgreSQL.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'SQL' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Esquema Relacional PostgreSQL / MySQL</h3>
                  <p className="text-[11px] text-slate-400">Estrutura com chaves estrangeiras, UUIDs e índices de alta performance</p>
                </div>
                <button
                  onClick={() => copiarTexto(sqlDDL)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 font-mono text-[11px]"
                >
                  {copiado ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiado ? 'Copiado!' : 'Copiar DDL'}</span>
                </button>
              </div>

              <pre className="p-4 bg-slate-950 rounded-2xl border border-slate-800 font-mono text-emerald-400 text-[11px] overflow-x-auto leading-relaxed max-h-[480px]">
                {sqlDDL}
              </pre>
            </div>
          )}

          {activeTab === 'API' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-100">Mapeamento de Rotas Node.js (Express / Fastify)</h3>
              <p className="text-slate-400">
                Cada método do nosso <code>TransportRepository</code> no frontend corresponde aos seguintes endpoints RESTful na API:
              </p>

              <div className="space-y-2 font-mono text-[11px]">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-bold">GET</span>
                    <span className="text-slate-200">/api/v1/viagens/ativa?motorista_id=1</span>
                  </div>
                  <span className="text-slate-500 font-sans text-xs">Busca diário de bordo com JOINs</span>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded font-bold">PATCH</span>
                    <span className="text-slate-200">/api/v1/viagens/:id/paradas/:alunoId/status</span>
                  </div>
                  <span className="text-slate-500 font-sans text-xs">Embarcou, Entregue ou Ausente</span>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded font-bold">POST</span>
                    <span className="text-slate-200">/api/v1/alunos/:id/ausencia</span>
                  </div>
                  <span className="text-slate-500 font-sans text-xs">Acionamento rápido dos Pais</span>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded font-bold">POST</span>
                    <span className="text-slate-200">/api/v1/viagens/:id/iniciar</span>
                  </div>
                  <span className="text-slate-500 font-sans text-xs">Ativa tracking de GPS e notifica pais</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'VPS' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-100">Topologia de Hospedagem na VPS (Produção)</h3>
              
              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 font-bold">1</div>
                  <div>
                    <h4 className="font-bold text-slate-200">NGINX Reverse Proxy + SSL (Certbot)</h4>
                    <p className="text-slate-400 text-[11px]">Gerencia portas 80/443 e faz upgrade de conexões WebSocket para o backend Node.</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 font-bold">2</div>
                  <div>
                    <h4 className="font-bold text-slate-200">Node.js API Server (PM2 Cluster)</h4>
                    <p className="text-slate-400 text-[11px]">Executa o serviço Express/Fastify e Socket.io em instâncias balanceadas.</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 font-bold">3</div>
                  <div>
                    <h4 className="font-bold text-slate-200">Redis (Pub/Sub de Telemetria GPS)</h4>
                    <p className="text-slate-400 text-[11px]">Distribui a cada 10s as coordenadas enviadas pelo tablet do motorista para os celulares dos pais com latência &lt; 50ms.</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 font-bold">4</div>
                  <div>
                    <h4 className="font-bold text-slate-200">PostgreSQL 15 (Persistência ACID)</h4>
                    <p className="text-slate-400 text-[11px]">Armazena o histórico do diário de bordo, dados cadastrais e logs de embarque.</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
