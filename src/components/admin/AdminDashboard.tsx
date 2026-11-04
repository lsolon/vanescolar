import React, { useState, useEffect } from 'react';
import { TransportRepository } from '../../services/api';
import { AuthService } from '../../services/auth';
import { 
  Users, 
  Bus, 
  KeyRound, 
  Settings, 
  BarChart3, 
  ShieldCheck, 
  LogOut,
  ChevronRight,
  UserCheck,
  UserX,
  Plus,
  Trash2,
  RefreshCcw,
  Loader2
} from 'lucide-react';

interface AdminDashboardProps {
  onLogout: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onLogout }) => {
  const [activeTab, setActiveTab] = useState<'METRICS' | 'DRIVERS' | 'INVITES' | 'PARENTS' | 'SETTINGS'>('METRICS');
  const [metrics, setMetrics] = useState<any>(null);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [parents, setParents] = useState<any[]>([]);
  const [adminEmails, setAdminEmails] = useState<string[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [invitationNota, setInvitationNota] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [adminLoginEmail, setAdminLoginEmail] = useState('');
  const [adminLoginSenha, setAdminLoginSenha] = useState('');

  // Modal Novo Motorista Admin
  const [modalNovoMotoristaAberto, setModalNovoMotoristaAberto] = useState(false);
  const [drvNome, setDrvNome] = useState('');
  const [drvEmail, setDrvEmail] = useState('');
  const [drvSenha, setDrvSenha] = useState('');
  const [drvHorarios, setDrvHorarios] = useState<string[]>(['Manhã', 'Tarde']);
  const [drvCapacidade, setDrvCapacidade] = useState(16);
  const [drvPlaca, setDrvPlaca] = useState('');
  const [drvWhatsapp, setDrvWhatsapp] = useState('');
  const [drvModelo, setDrvModelo] = useState('Renault Master Executiva');

  // Verifica token ao montar
  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    setIsAuthenticated(!!token);
  }, []);

  const loadData = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) {
      setIsAuthenticated(false);
      return;
    }
    setLoading(true);
    try {
      if (activeTab === 'METRICS') {
        const data = await TransportRepository.getAdminMetrics();
        setMetrics(data.metrics);
      } else if (activeTab === 'DRIVERS') {
        const data = await TransportRepository.listarMotoristasAdmin();
        setDrivers(data.motoristas || []);
      } else if (activeTab === 'INVITES') {
        const data = await TransportRepository.listarConvitesMotorista();
        setInvites(data.convites || []);
      } else if (activeTab === 'PARENTS') {
        const data = await TransportRepository.listarResponsaveisAdmin();
        setParents(data.responsaveis || []);
      } else if (activeTab === 'SETTINGS') {
        const data = await TransportRepository.getAdminSettings();
        setAdminEmails(data.adminEmails || []);
      }
    } catch (err: any) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('adminToken');
      }
      setIsAuthenticated(false);
      setAuthError(err?.message || 'Sessão administrativa expirada ou não autorizada. Faça login novamente.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [activeTab, isAuthenticated]);

  const handleLogout = async () => {
    await TransportRepository.logoutAdmin();
    setIsAuthenticated(false);
    onLogout();
  };

  const handleToggleDriver = async (id: number) => {
    try {
      await TransportRepository.toggleMotoristaStatus(id);
      loadData();
    } catch (err) {
      alert('Falha ao alterar status');
    }
  };

  const handleAddAdminEmail = async () => {
    if (!newAdminEmail.includes('@')) return;
    try {
      await TransportRepository.updateAdminEmails([...adminEmails, newAdminEmail]);
      setNewAdminEmail('');
      loadData();
    } catch (err) {
      alert('Erro ao atualizar e-mails');
    }
  };

  const handleRemoveAdminEmail = async (email: string) => {
    try {
      await TransportRepository.updateAdminEmails(adminEmails.filter(e => e !== email));
      loadData();
    } catch (err) {
      alert('Erro ao remover e-mail');
    }
  };

  const handleGenerateInvite = async () => {
    try {
      await TransportRepository.gerarConviteMotorista(invitationNota);
      setInvitationNota('');
      loadData();
    } catch (err) {
      alert('Erro ao gerar convite');
    }
  };

  const handleCriarMotoristaAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await TransportRepository.criarMotoristaAdmin({
        fullName: drvNome,
        email: drvEmail,
        password: drvSenha,
        horarios: drvHorarios,
        capacidade: Number(drvCapacidade) || 16,
        veiculoPlaca: drvPlaca || 'RIO-2024',
        whatsapp: drvWhatsapp || '(21) 98765-4321',
        veiculoModelo: drvModelo || 'Renault Master'
      });
      setModalNovoMotoristaAberto(false);
      setDrvNome('');
      setDrvEmail('');
      setDrvSenha('');
      setDrvCapacidade(16);
      setDrvPlaca('');
      setDrvWhatsapp('');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao criar motorista');
    }
  };

  const handleRevokeInvite = async (code: string) => {
    try {
      await TransportRepository.revogarConviteMotorista(code);
      loadData();
    } catch (err) {
      alert('Erro ao revogar');
    }
  };

  const handleAdminLogin = async () => {
    setLoading(true);
    setAuthError(null);
    try {
      await TransportRepository.loginAdminGoogle();
      setIsAuthenticated(true);
      loadData();
    } catch (err: any) {
      setAuthError(err.message || 'Falha na autenticação administrativa.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminDirectLogin = async () => {
    setLoading(true);
    setAuthError(null);
    try {
      await TransportRepository.loginAdminDirect(adminLoginEmail.trim(), adminLoginSenha);
      setIsAuthenticated(true);
      loadData();
    } catch (err: any) {
      setAuthError(err.message || 'Falha na autenticação direta.');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-6">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black text-white mb-2">Acesso Restrito</h1>
          <p className="text-sm text-slate-400 mb-8">Este painel é exclusivo para administradores autorizados.</p>
          
          {authError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 mb-6">
              {authError}
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={handleAdminLogin}
              disabled={loading}
              className="w-full py-3 px-4 bg-indigo-500 hover:bg-indigo-400 text-white font-bold rounded-xl flex items-center justify-center gap-3 transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                  <span>Entrar com Google</span>
                </>
              )}
            </button>

            <form
              onSubmit={(e) => { e.preventDefault(); handleAdminDirectLogin(); }}
              className="space-y-2 pt-2 border-t border-slate-800 text-left"
            >
              <p className="text-[11px] text-slate-500 text-center">ou entre com e-mail e senha de administrador</p>
              <input
                type="email"
                autoComplete="username"
                value={adminLoginEmail}
                onChange={(e) => setAdminLoginEmail(e.target.value)}
                placeholder="E-mail do administrador"
                required
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white placeholder-slate-500"
              />
              <input
                type="password"
                autoComplete="current-password"
                value={adminLoginSenha}
                onChange={(e) => setAdminLoginSenha(e.target.value)}
                placeholder="Senha de administrador"
                required
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white placeholder-slate-500"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 text-indigo-300 font-bold rounded-xl transition-all cursor-pointer border border-indigo-500/30 text-xs disabled:opacity-50"
              >
                Entrar como administrador
              </button>
            </form>
          </div>

          <button
            onClick={onLogout}
            className="mt-6 text-xs text-slate-500 hover:text-white underline cursor-pointer"
          >
            Voltar para a página inicial
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* HEADER */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white flex items-center gap-2">
                Painel <span className="text-indigo-400">Admin</span>
              </h1>
              <p className="text-xs text-slate-400">Controle Central de Operações</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={loadData}
              className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 transition-colors"
              title="Recarregar dados"
            >
              <RefreshCcw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 font-bold text-sm transition-all border border-rose-500/20"
            >
              <LogOut className="w-4 h-4" />
              Sair
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col md:flex-row p-6 gap-6">
        {/* SIDEBAR NAVIGATION */}
        <aside className="w-full md:w-64 space-y-2">
          <button
            onClick={() => setActiveTab('METRICS')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${activeTab === 'METRICS' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:bg-slate-900'}`}
          >
            <BarChart3 className="w-5 h-5" />
            Visão Geral
          </button>
          <button
            onClick={() => setActiveTab('DRIVERS')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${activeTab === 'DRIVERS' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:bg-slate-900'}`}
          >
            <Bus className="w-5 h-5" />
            Motoristas
          </button>
          <button
            onClick={() => setActiveTab('INVITES')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${activeTab === 'INVITES' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:bg-slate-900'}`}
          >
            <KeyRound className="w-5 h-5" />
            Convites
          </button>
          <button
            onClick={() => setActiveTab('PARENTS')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${activeTab === 'PARENTS' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:bg-slate-900'}`}
          >
            <Users className="w-5 h-5" />
            Responsáveis
          </button>
          <div className="pt-4 mt-4 border-t border-slate-800">
            <button
              onClick={() => setActiveTab('SETTINGS')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${activeTab === 'SETTINGS' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:bg-slate-900'}`}
            >
              <Settings className="w-5 h-5" />
              Configurações
            </button>
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 bg-slate-900/50 border border-slate-800 rounded-3xl p-6 overflow-hidden flex flex-col">
          {loading && !metrics && !drivers.length && !invites.length && !parents.length && (
            <div className="flex-1 flex flex-center justify-center items-center">
              <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
            </div>
          )}

          {/* TAB: METRICS */}
          {activeTab === 'METRICS' && metrics && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-white mb-6">Métricas do Sistema</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-6 bg-slate-950 border border-slate-800 rounded-3xl">
                  <p className="text-xs text-slate-500 font-bold uppercase mb-2">Motoristas</p>
                  <p className="text-4xl font-black text-indigo-400">{metrics.totalDrivers}</p>
                </div>
                <div className="p-6 bg-slate-950 border border-slate-800 rounded-3xl">
                  <p className="text-xs text-slate-500 font-bold uppercase mb-2">Responsáveis</p>
                  <p className="text-4xl font-black text-cyan-400">{metrics.totalParents}</p>
                </div>
                <div className="p-6 bg-slate-950 border border-slate-800 rounded-3xl">
                  <p className="text-xs text-slate-500 font-bold uppercase mb-2">Alunos</p>
                  <p className="text-4xl font-black text-amber-400">{metrics.totalStudents}</p>
                </div>
                <div className="p-6 bg-slate-950 border border-slate-800 rounded-3xl">
                  <p className="text-xs text-slate-500 font-bold uppercase mb-2">Convites Ativos</p>
                  <p className="text-4xl font-black text-emerald-400">{metrics.activeInvites}</p>
                </div>
              </div>
              
              <div className="mt-8 p-6 bg-slate-950 border border-slate-800 rounded-3xl">
                <h3 className="text-sm font-bold text-white mb-4">Últimas Atividades Auditadas</h3>
                <div className="space-y-3">
                   <p className="text-xs text-slate-400 italic">Sincronizado com logs de auditoria do servidor...</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB: DRIVERS */}
          {activeTab === 'DRIVERS' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">Gestão de Motoristas</h2>
                <button
                  onClick={() => setModalNovoMotoristaAberto(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500 text-white text-xs font-bold hover:bg-indigo-400 transition-all shadow-lg shadow-indigo-500/20 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Cadastrar Motorista
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-slate-500 font-bold">
                    <tr>
                      <th className="pb-4 pr-4">Nome</th>
                      <th className="pb-4 pr-4">E-mail / WhatsApp</th>
                      <th className="pb-4 pr-4">Veículo / Placa</th>
                      <th className="pb-4 pr-4">Turnos</th>
                      <th className="pb-4 pr-4">Capacidade</th>
                      <th className="pb-4 pr-4">Status</th>
                      <th className="pb-4">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {drivers.map(drv => (
                      <tr key={drv.id} className="text-slate-300">
                        <td className="py-4 pr-4 font-semibold text-white">{drv.fullName}</td>
                        <td className="py-4 pr-4 text-xs">
                          <div>{drv.email}</div>
                          {drv.whatsapp && <div className="text-emerald-400 font-mono text-[11px] mt-0.5">{drv.whatsapp}</div>}
                        </td>
                        <td className="py-4 pr-4 text-xs">
                          <div>{drv.veiculoModelo || 'Renault Master'}</div>
                          <div className="font-mono text-slate-400">{drv.veiculoPlaca}</div>
                        </td>
                        <td className="py-4 pr-4 text-xs">
                          <div className="flex flex-wrap gap-1">
                            {Array.isArray(drv.horarios) ? drv.horarios.map((h: string) => (
                              <span key={h} className="bg-indigo-500/10 text-indigo-300 px-1.5 py-0.5 rounded text-[10px] border border-indigo-500/20">
                                {h}
                              </span>
                            )) : <span className="text-slate-500">Manhã, Tarde</span>}
                          </div>
                        </td>
                        <td className="py-4 pr-4 text-xs font-mono">{drv.capacidade || 16} vagas</td>
                        <td className="py-4 pr-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${drv.status === 'ATIVO' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                            {drv.status || 'ATIVO'}
                          </span>
                        </td>
                        <td className="py-4">
                          <button 
                            onClick={() => handleToggleDriver(drv.id)}
                            className={`p-2 rounded-lg transition-colors ${drv.status === 'INATIVO' ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' : 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20'}`}
                            title={drv.status === 'INATIVO' ? 'Ativar motorista' : 'Inativar motorista'}
                          >
                            {drv.status === 'INATIVO' ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: INVITES */}
          {activeTab === 'INVITES' && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h2 className="text-xl font-bold text-white">Gestão de Convites</h2>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={invitationNota}
                    onChange={(e) => setInvitationNota(e.target.value)}
                    placeholder="Nota para o convite..."
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={handleGenerateInvite}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500 text-white text-xs font-bold hover:bg-indigo-400 transition-all shadow-lg shadow-indigo-500/20"
                  >
                    <Plus className="w-4 h-4" />
                    Novo Convite
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {invites.map(inv => (
                  <div key={inv.code} className={`p-4 rounded-2xl border ${inv.used ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-950 border-indigo-500/30'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-mono text-indigo-400 font-black tracking-widest">{inv.code}</span>
                      {!inv.used && !inv.revoked && (
                        <button 
                          onClick={() => handleRevokeInvite(inv.code)}
                          className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-300 mb-4">{inv.nota || 'Sem observações'}</p>
                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span>Criado em: {new Date(inv.createdAt).toLocaleDateString()}</span>
                      <span className={`font-bold ${inv.used ? 'text-emerald-500' : inv.revoked ? 'text-rose-500' : 'text-amber-500'}`}>
                        {inv.used ? 'UTILIZADO' : inv.revoked ? 'REVOGADO' : 'PENDENTE'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: PARENTS */}
          {activeTab === 'PARENTS' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-white mb-6">Gestão de Responsáveis</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-slate-500 font-bold">
                    <tr>
                      <th className="pb-4 pr-4">Nome</th>
                      <th className="pb-4 pr-4">E-mail</th>
                      <th className="pb-4 pr-4">Aluno Vinculado</th>
                      <th className="pb-4 pr-4">Status Verificação</th>
                      <th className="pb-4">Vínculos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {parents.map(p => (
                      <tr key={p.id} className="text-slate-300">
                        <td className="py-4 pr-4 font-semibold text-white">{p.fullName}</td>
                        <td className="py-4 pr-4">{p.email}</td>
                        <td className="py-4 pr-4 text-xs italic">{p.studentName || 'Não vinculado'}</td>
                        <td className="py-4 pr-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${p.emailVerified ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                            {p.emailVerified ? 'VERIFICADO' : 'PENDENTE'}
                          </span>
                        </td>
                        <td className="py-4">
                          <button className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white">
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: SETTINGS */}
          {activeTab === 'SETTINGS' && (
            <div className="space-y-8">
              <h2 className="text-xl font-bold text-white mb-6">Configurações de Acesso</h2>
              
              <div className="max-w-xl space-y-6">
                <div className="p-6 bg-slate-950 border border-slate-800 rounded-3xl space-y-4">
                  <h3 className="text-sm font-bold text-indigo-400 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" />
                    Lista de Super Administradores
                  </h3>
                  <p className="text-xs text-slate-400">Estes e-mails têm acesso total ao Painel Admin via Login Google.</p>
                  
                  <div className="space-y-2">
                    {adminEmails.map(email => (
                      <div key={email} className="flex items-center justify-between p-3 bg-slate-900 border border-slate-800 rounded-xl">
                        <span className="text-xs font-semibold text-slate-200">{email}</span>
                        {email !== 'leandrosolon@gmail.com' && (
                          <button 
                            onClick={() => handleRemoveAdminEmail(email)}
                            className="text-rose-400 hover:text-rose-300 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <input
                      type="email"
                      value={newAdminEmail}
                      onChange={(e) => setNewAdminEmail(e.target.value)}
                      placeholder="Novo e-mail admin..."
                      className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      onClick={handleAddAdminEmail}
                      className="px-4 py-2 bg-indigo-500 text-white rounded-xl text-xs font-bold hover:bg-indigo-400"
                    >
                      Adicionar
                    </button>
                  </div>
                </div>

                <div className="p-6 bg-rose-500/5 border border-rose-500/10 rounded-3xl">
                  <h3 className="text-sm font-bold text-rose-400 mb-2">Zona de Perigo</h3>
                  <p className="text-xs text-slate-400 mb-4">Ações irreversíveis do sistema.</p>
                  <button className="px-4 py-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-bold hover:bg-rose-500/20">
                    Redefinir Todas as Sessões do Sistema
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* MODAL DE CADASTRO DE MOTORISTA PELO SUPER ADMIN */}
      {modalNovoMotoristaAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400">
                  <Bus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Cadastrar Novo Motorista</h3>
                  <p className="text-[11px] text-slate-400">Defina horários, capacidade, placa e contato do motorista</p>
                </div>
              </div>
              <button
                onClick={() => setModalNovoMotoristaAberto(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCriarMotoristaAdmin} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Nome Completo *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Tio Carlos Souza"
                    value={drvNome}
                    onChange={(e) => setDrvNome(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">E-mail de Acesso *</label>
                  <input
                    type="email"
                    required
                    placeholder="carlos@vanescolar.com.br"
                    value={drvEmail}
                    onChange={(e) => setDrvEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Senha Inicial *</label>
                  <input
                    type="password"
                    required
                    placeholder="Mínimo 10 caracteres"
                    value={drvSenha}
                    onChange={(e) => setDrvSenha(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">WhatsApp de Contato</label>
                  <input
                    type="text"
                    placeholder="(21) 98765-4321"
                    value={drvWhatsapp}
                    onChange={(e) => setDrvWhatsapp(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Modelo Veículo</label>
                  <input
                    type="text"
                    placeholder="Renault Master"
                    value={drvModelo}
                    onChange={(e) => setDrvModelo(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Placa *</label>
                  <input
                    type="text"
                    required
                    placeholder="RIO-2026"
                    value={drvPlaca}
                    onChange={(e) => setDrvPlaca(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Capacidade (Alunos)</label>
                  <input
                    type="number"
                    min={1}
                    max={40}
                    value={drvCapacidade}
                    onChange={(e) => setDrvCapacidade(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1.5">Horários de Operação (Turnos)</label>
                <div className="flex items-center gap-4">
                  {['Manhã', 'Tarde', 'Noite'].map((turno) => (
                    <label key={turno} className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={drvHorarios.includes(turno)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setDrvHorarios([...drvHorarios, turno]);
                          } else {
                            setDrvHorarios(drvHorarios.filter(h => h !== turno));
                          }
                        }}
                        className="rounded border-slate-800 text-indigo-500 focus:ring-indigo-500"
                      />
                      <span>{turno}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalNovoMotoristaAberto(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white font-bold rounded-xl shadow-md cursor-pointer"
                >
                  Criar Conta de Motorista
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
