/**
 * ============================================================================
 * LANDING PAGE & PORTAL DE ACESSO (LandingPage.tsx)
 * Suporte completo a Login Google, E-mail/Senha, Cadastro com LGPD Art. 14,
 * Indicador de Força de Senha, Verificação de E-mail e Recuperação.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { TransportRepository } from '../../services/api';
import {
  Bus,
  Users,
  ArrowRight,
  QrCode,
  Cpu,
  Smartphone,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  ShieldCheck,
  BarChart3,
  Settings
} from 'lucide-react';

interface LandingPageProps {
  onLoginDriver: () => void;
  onLoginParent: (codigoVinculo?: string) => void;
  onLoginAdmin: () => void;
  onOpenDualSimulator: () => void;
  onOpenQRModal: () => void;
  onOpenArchitecture: () => void;
  onLimparDados: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onLoginDriver,
  onLoginParent,
  onLoginAdmin,
  onOpenDualSimulator,
  onOpenQRModal,
  onOpenArchitecture,
  onLimparDados
}) => {
  const isDemoMode = (typeof window !== 'undefined' && window.location.search.includes('demo=true')) || import.meta.env.VITE_DEMO_MODE === 'true';

  const [activePortal, setActivePortal] = useState<'SELECT' | 'DRIVER' | 'PARENT' | 'REGISTER' | 'FORGOT' | 'DRIVER_REGISTER' | 'DRIVER_FORGOT' | 'ADMIN_INVITES'>('SELECT');

  // Modo de teste (servidor com MODO_TESTE_SEM_LOGIN=true)
  const [modoTeste, setModoTeste] = useState(false);
  useEffect(() => { TransportRepository.modoTesteAtivo().then(setModoTeste); }, []);
  const entrarTeste = async (papel: 'motorista' | 'responsavel') => {
    try {
      await TransportRepository.entrarModoTeste(papel);
      if (papel === 'motorista') onLoginDriver(); else onLoginParent();
    } catch (err: any) { alert(err.message || 'Falha no modo de teste.'); }
  };

  // Estados Motorista (Login)
  const [driverEmail, setDriverEmail] = useState(isDemoMode ? 'leandrosolon@gmail.com' : '');
  const [driverPassword, setDriverPassword] = useState(isDemoMode ? '123456abcd' : '');
  const [loadingDriver, setLoadingDriver] = useState(false);
  const [erroDriver, setErroDriver] = useState<string | null>(null);

  // Estados Cadastro Motorista
  const [drvFullName, setDrvFullName] = useState('');
  const [drvEmail, setDrvEmail] = useState('');
  const [drvLoginId, setDrvLoginId] = useState('');
  const [drvPassword, setDrvPassword] = useState('');
  const [drvConfirmPassword, setDrvConfirmPassword] = useState('');
  const [drvPhone, setDrvPhone] = useState('');
  const [drvVehicleModel, setDrvVehicleModel] = useState('');
  const [drvVehiclePlate, setDrvVehiclePlate] = useState('');
  const [drvInvitationCode, setDrvInvitationCode] = useState('');
  const [drvShowPassword, setDrvShowPassword] = useState(false);
  const [drvLgpdConsent, setDrvLgpdConsent] = useState(false);
  const [loadingDrvReg, setLoadingDrvReg] = useState(false);
  const [erroDrvReg, setErroDrvReg] = useState<string | null>(null);

  // Estados Admin Convites
  const [invitationsList, setInvitationsList] = useState<any[]>([]);
  const [invitationNota, setInvitationNota] = useState('');
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [erroAdmin, setErroAdmin] = useState<string | null>(null);

  // Estados Responsável (Login)
  const [parentEmail, setParentEmail] = useState(isDemoMode ? 'leandrosolon@gmail.com' : '');
  const [parentPassword, setParentPassword] = useState(isDemoMode ? '123456abcd' : '');
  const [loadingParent, setLoadingParent] = useState(false);
  const [erroParent, setErroParent] = useState<string | null>(null);

  // Estados Cadastro Responsável
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regLoginId, setRegLoginId] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [lgpdConsent, setLgpdConsent] = useState(false);
  const [loadingReg, setLoadingReg] = useState(false);
  const [erroReg, setErroReg] = useState<string | null>(null);
  const [sucessoReg, setSucessoReg] = useState<string | null>(null);

  // Verificação de E-mail / Vínculo
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [codigoVinculo, setCodigoVinculo] = useState('');
  const [loadingVinculo, setLoadingVinculo] = useState(false);
  const [erroVinculo, setErroVinculo] = useState<string | null>(null);

  // Esqueci minha senha
  const [forgotEmail, setForgotEmail] = useState('');
  const [loadingForgot, setLoadingForgot] = useState(false);
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);

  // Cálculo de força de senha
  const getPasswordStrength = (pass: string) => {
    if (pass.length === 0) return { label: '', color: 'bg-slate-800', width: 'w-0' };
    if (pass.length < 10) return { label: 'Fraca (mín. 10 caracteres)', color: 'bg-rose-500', width: 'w-1/3' };
    if (pass.length < 14 && !/[A-Z]/.test(pass)) return { label: 'Média', color: 'bg-amber-500', width: 'w-2/3' };
    return { label: 'Forte', color: 'bg-emerald-500', width: 'w-full' };
  };
  const strength = getPasswordStrength(regPassword);
  const drvStrength = getPasswordStrength(drvPassword);

  const handleDriverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingDriver(true);
    setErroDriver(null);
    try {
      const data = await TransportRepository.loginMotoristaEmail(driverEmail, driverPassword);
      if (data.role === 'admin') {
        setActivePortal('ADMIN_INVITES');
        handleCarregarConvites();
      } else {
        onLoginDriver();
      }
    } catch (err: any) {
      setErroDriver(err.message || 'Credenciais inválidas de motorista.');
    } finally {
      setLoadingDriver(false);
    }
  };

  const handleDriverGoogleLogin = async () => {
    setLoadingDriver(true);
    setErroDriver(null);
    try {
      const data = await TransportRepository.loginMotoristaGoogle();
      if (data.role === 'admin') {
        setActivePortal('ADMIN_INVITES');
        handleCarregarConvites();
      } else {
        onLoginDriver();
      }
    } catch (err: any) {
      setErroDriver(err.message || 'Falha na autenticação Google do motorista.');
    } finally {
      setLoadingDriver(false);
    }
  };

  const handleDriverRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingDrvReg(true);
    setErroDrvReg(null);

    if (drvPassword.length < 10) {
      setErroDrvReg('A senha do motorista deve ter no mínimo 10 caracteres.');
      setLoadingDrvReg(false);
      return;
    }
    if (drvPassword !== drvConfirmPassword) {
      setErroDrvReg('As senhas não coincidem.');
      setLoadingDrvReg(false);
      return;
    }
    if (!drvInvitationCode || drvInvitationCode.trim().length < 10) {
      setErroDrvReg('Código de convite de motorista inválido ou ausente.');
      setLoadingDrvReg(false);
      return;
    }
    if (!drvLgpdConsent) {
      setErroDrvReg('É necessário aceitar os Termos e Política de Privacidade.');
      setLoadingDrvReg(false);
      return;
    }

    try {
      await TransportRepository.registrarMotorista({
        fullName: drvFullName,
        email: drvEmail,
        ...(drvLoginId.trim() ? { loginId: drvLoginId.trim() } : {}),
        password: drvPassword,
        phone: drvPhone,
        vehicleModel: drvVehicleModel,
        vehiclePlate: drvVehiclePlate,
        invitationCode: drvInvitationCode.trim(),
        lgpdConsent: drvLgpdConsent
      });
      onLoginDriver();
    } catch (err: any) {
      setErroDrvReg(err.message || 'Erro no cadastro do motorista.');
    } finally {
      setLoadingDrvReg(false);
    }
  };

  const handleCarregarConvites = async () => {
    setLoadingAdmin(true);
    setErroAdmin(null);
    try {
      const data = await TransportRepository.listarConvitesMotorista();
      setInvitationsList(data.convites || []);
    } catch (err: any) {
      setErroAdmin('Não autorizado. Acesse como Administrador (e-mail configurado) para gerenciar convites.');
    } finally {
      setLoadingAdmin(false);
    }
  };

  const handleGerarConvite = async () => {
    setLoadingAdmin(true);
    setErroAdmin(null);
    try {
      await TransportRepository.gerarConviteMotorista(invitationNota);
      setInvitationNota('');
      await handleCarregarConvites();
    } catch (err: any) {
      setErroAdmin(err.message || 'Falha ao gerar convite. Verifique sua conexão e privilégios.');
    } finally {
      setLoadingAdmin(false);
    }
  };

  const handleRevogarConvite = async (code: string) => {
    setLoadingAdmin(true);
    try {
      await TransportRepository.revogarConviteMotorista(code);
      await handleCarregarConvites();
    } catch (err: any) {
      setErroAdmin(err.message || 'Erro ao revogar convite.');
    } finally {
      setLoadingAdmin(false);
    }
  };

  const handleParentLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingParent(true);
    setErroParent(null);
    try {
      const data = await TransportRepository.loginEmail(parentEmail, parentPassword);
      if (data.role === 'admin') {
        setActivePortal('ADMIN_INVITES');
        handleCarregarConvites();
        return;
      }
      if (data.emailVerified) {
        // Verificado: vai direto ao app (lá cadastra os filhos com o código do motorista).
        onLoginParent();
      } else {
        setErroParent('E-mail não verificado. Por favor, verifique seu e-mail antes de continuar.');
      }
    } catch (err: any) {
      setErroParent(err.message || 'E-mail ou senha incorretos.');
    } finally {
      setLoadingParent(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoadingParent(true);
    setErroParent(null);
    try {
      const data = await TransportRepository.loginGoogle();
      if (data.role === 'admin') {
        setActivePortal('ADMIN_INVITES');
        handleCarregarConvites();
        return;
      }
      onLoginParent();
    } catch (err: any) {
      setErroParent(err.message || 'Falha na autenticação Google.');
    } finally {
      setLoadingParent(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingReg(true);
    setErroReg(null);

    if (regPassword.length < 10) {
      setErroReg('A senha deve ter no mínimo 10 caracteres.');
      setLoadingReg(false);
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setErroReg('As senhas não coincidem.');
      setLoadingReg(false);
      return;
    }
    if (!lgpdConsent) {
      setErroReg('É obrigatório aceitar os Termos e o consentimento LGPD Art. 14.');
      setLoadingReg(false);
      return;
    }

    try {
      await TransportRepository.registrarResponsavel({
        fullName: regFullName,
        email: regEmail,
        ...(regLoginId.trim() ? { loginId: regLoginId.trim() } : {}),
        password: regPassword,
        lgpdConsent
      });
      setSucessoReg('Cadastro realizado com sucesso! Verifique seu e-mail para validação.');
      setIsEmailVerified(false);
      setActivePortal('PARENT');
      setParentEmail(regEmail);
    } catch (err: any) {
      setErroReg(err.message || 'Erro ao registrar conta.');
    } finally {
      setLoadingReg(false);
    }
  };


  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingForgot(true);
    setForgotMessage(null);
    try {
      const msg = await TransportRepository.forgotPassword(forgotEmail);
      setForgotMessage(msg);
    } catch {
      setForgotMessage('Se o e-mail estiver cadastrado, as instruções foram enviadas.');
    } finally {
      setLoadingForgot(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-400 selection:text-slate-950">
      {/* BARRA SUPERIOR */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-40 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-400 flex items-center justify-center text-slate-950 font-black text-xl shadow-md">
              🚐
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight text-white">
                Van<span className="text-amber-400">Escolar</span>
              </span>
              <p className="text-[11px] text-slate-400">Freguesia • Jacarepaguá, RJ</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isDemoMode && (
              <>
                <button
                  onClick={onOpenQRModal}
                  aria-label="Conectar 2 Celulares"
                  className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold border border-slate-700 flex items-center gap-1.5 min-h-[44px] sm:min-h-0 cursor-pointer"
                >
                  <QrCode className="w-4 h-4 text-amber-400" />
                  <span className="hidden sm:inline">Conectar 2 Celulares</span>
                </button>
                <button
                  onClick={onOpenDualSimulator}
                  aria-label="Abrir Simulador Duplo"
                  className="p-2 sm:px-3.5 sm:py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black transition-all flex items-center gap-1.5 min-h-[44px] sm:min-h-0 cursor-pointer"
                >
                  <Smartphone className="w-4 h-4" />
                  <span className="hidden md:inline">Simulador</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* CONTEÚDO PRINCIPAL */}
      <div className="max-w-4xl mx-auto w-full px-4 py-12 sm:py-16 flex-1 flex flex-col justify-center items-center">
        <h1 className="text-3xl sm:text-4xl font-black text-center tracking-tight text-white mb-3">
          Transporte Escolar Seguro e em Tempo Real
        </h1>
        <p className="text-sm sm:text-base text-slate-400 text-center max-w-xl mb-10">
          Selecione seu perfil para acessar o painel operacional ou o portal da família.
        </p>

        {modoTeste && activePortal === 'SELECT' && (
          <div className="w-full max-w-2xl mb-6 p-4 rounded-2xl border-2 border-dashed border-rose-500/60 bg-rose-500/10 text-center">
            <p className="text-xs font-bold text-rose-300 mb-3">MODO DE TESTE ATIVO — entrada sem login (não use em produção)</p>
            <div className="flex flex-wrap gap-3 justify-center">
              <button id="teste-motorista" onClick={() => entrarTeste('motorista')} className="px-4 py-2 rounded-xl bg-amber-400 text-slate-900 font-bold text-xs min-h-[44px] cursor-pointer">Entrar como Motorista (teste)</button>
              <button id="teste-responsavel" onClick={() => entrarTeste('responsavel')} className="px-4 py-2 rounded-xl bg-cyan-400 text-slate-900 font-bold text-xs min-h-[44px] cursor-pointer">Entrar como Responsável (teste)</button>
            </div>
          </div>
        )}

        {activePortal === 'SELECT' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-2xl">
            <button
              onClick={() => setActivePortal('DRIVER')}
              aria-label="Acessar Área do Motorista"
              className="p-8 rounded-3xl bg-slate-900 border-2 border-amber-500/30 hover:border-amber-400 hover:bg-slate-900/80 transition-all flex flex-col items-center text-center group shadow-xl min-h-[44px] cursor-pointer"
            >
              <div className="w-16 h-16 rounded-2xl bg-amber-400/20 text-amber-400 flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform">
                <Bus className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Sou Motorista</h2>
              <p className="text-xs text-slate-400 mb-6">
                Acesse o diário de bordo com conta individual e gerencie rotas.
              </p>
              <span className="inline-flex items-center gap-2 text-xs font-bold text-amber-400 group-hover:underline">
                Acessar Portal <ArrowRight className="w-4 h-4" />
              </span>
            </button>

            <button
              onClick={() => setActivePortal('PARENT')}
              aria-label="Acessar Portal dos Pais"
              className="p-8 rounded-3xl bg-slate-900 border-2 border-cyan-500/30 hover:border-cyan-400 hover:bg-slate-900/80 transition-all flex flex-col items-center text-center group shadow-xl min-h-[44px] cursor-pointer"
            >
              <div className="w-16 h-16 rounded-2xl bg-cyan-400/20 text-cyan-400 flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform">
                <Users className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Sou Responsável</h2>
              <p className="text-xs text-slate-400 mb-6">
                Acompanhe o trajeto da van e informe ausências com facilidade.
              </p>
              <span className="inline-flex items-center gap-2 text-xs font-bold text-cyan-400 group-hover:underline">
                Acessar Portal <ArrowRight className="w-4 h-4" />
              </span>
            </button>
          </div>
        )}

        {/* MOTORISTA LOGIN */}
        {activePortal === 'DRIVER' && (
          <div className="w-full max-w-md bg-slate-900 border border-amber-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl relative">
            <button
              onClick={() => setActivePortal('SELECT')}
              className="text-xs text-slate-400 hover:text-white mb-6 underline cursor-pointer"
            >
              ← Voltar à seleção de perfil
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-400 flex items-center justify-center">
                <Bus className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Login do Motorista</h2>
                <p className="text-xs text-slate-400">Autenticação individual do motorista</p>
              </div>
            </div>

            {/* GOOGLE FOR DRIVER */}
            <button
              type="button"
              onClick={handleDriverGoogleLogin}
              disabled={loadingDriver}
              className="w-full py-3 px-4 bg-white hover:bg-slate-100 text-slate-900 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-md min-h-[44px] cursor-pointer mb-4"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>Continuar com Google (Motorista)</span>
            </button>

            <div className="flex items-center my-4">
              <div className="flex-1 border-t border-slate-800" />
              <span className="px-3 text-[11px] text-slate-500 uppercase">ou e-mail corporativo</span>
              <div className="flex-1 border-t border-slate-800" />
            </div>

            <form onSubmit={handleDriverSubmit} className="space-y-4">
              <div>
                <label htmlFor="driver-email" className="block text-xs font-semibold text-slate-300 mb-1">
                  E-mail ou ID do Motorista
                </label>
                <input
                  id="driver-email"
                  name="email"
                  type="text"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="username"
                  required
                  value={driverEmail}
                  onChange={(e) => setDriverEmail(e.target.value)}
                  placeholder="ex: david.santos@vanescolar.com.br"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-400 min-h-[44px]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="driver-pass" className="text-xs font-semibold text-slate-300">
                    Senha
                  </label>
                  <button
                    type="button"
                    onClick={() => setActivePortal('FORGOT')}
                    className="text-[11px] text-amber-400 hover:underline cursor-pointer"
                  >
                    Esqueci minha senha
                  </button>
                </div>
                <input
                  id="driver-pass"
                  name="current-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={driverPassword}
                  onChange={(e) => setDriverPassword(e.target.value)}
                  placeholder="Digite sua senha"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-400 min-h-[44px]"
                />
              </div>

              {erroDriver && (
                <div role="alert" className="p-3 bg-rose-950/60 border border-rose-500/40 rounded-xl text-xs text-rose-300">
                  {erroDriver}
                </div>
              )}

              <button
                type="submit"
                disabled={loadingDriver}
                className="w-full py-3 px-4 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-md min-h-[44px] cursor-pointer disabled:opacity-50"
              >
                {loadingDriver ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Entrar no Painel</span>}
              </button>
            </form>

            <div className="mt-6 pt-4 border-t border-slate-800 text-center">
              <p className="text-xs text-slate-400 mb-2">Motorista novo?</p>
              <button
                type="button"
                onClick={() => setActivePortal('DRIVER_REGISTER')}
                className="text-xs font-bold text-amber-400 hover:underline cursor-pointer"
              >
                Criar conta de motorista (Requer Código de Convite)
              </button>
            </div>
          </div>
        )}

        {/* CADASTRO DE MOTORISTA (POR CONVITE) */}
        {activePortal === 'DRIVER_REGISTER' && (
          <div className="w-full max-w-md bg-slate-900 border border-amber-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl relative">
            <button
              onClick={() => setActivePortal('DRIVER')}
              className="text-xs text-slate-400 hover:text-white mb-6 underline cursor-pointer"
            >
              ← Voltar ao login do motorista
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-400 flex items-center justify-center">
                <Bus className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Cadastro de Motorista</h2>
                <p className="text-xs text-slate-400">Exige Código de Convite emitido por Admin</p>
              </div>
            </div>

            <form onSubmit={handleDriverRegisterSubmit} className="space-y-3.5">
              <div>
                <label htmlFor="drv-invitation" className="block text-xs font-semibold text-amber-300 mb-1">
                  Código de Convite (Obrigatório)
                </label>
                <input
                  id="drv-invitation"
                  name="invitationCode"
                  type="text"
                  required
                  value={drvInvitationCode}
                  onChange={(e) => setDrvInvitationCode(e.target.value)}
                  placeholder="Ex: DRV-A1B2C3D4E5"
                  className="w-full bg-slate-950 border border-amber-500/50 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono uppercase tracking-wider min-h-[44px]"
                />
              </div>

              <div>
                <label htmlFor="drv-name" className="block text-xs font-semibold text-slate-300 mb-1">
                  Nome Completo
                </label>
                <input
                  id="drv-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  value={drvFullName}
                  onChange={(e) => setDrvFullName(e.target.value)}
                  placeholder="ex: David Santos"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-400 min-h-[44px]"
                />
              </div>

              <div>
                <label htmlFor="drv-loginid" className="block text-xs font-semibold text-slate-300 mb-1">
                  ID de acesso (opcional)
                </label>
                <input
                  id="drv-loginid"
                  name="loginId"
                  type="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  maxLength={30}
                  placeholder="Ex.: tio.david — para entrar sem digitar o e-mail"
                  value={drvLoginId}
                  onChange={(e) => setDrvLoginId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 placeholder-slate-600"
                />
              </div>

              <div>
                <label htmlFor="drv-email" className="block text-xs font-semibold text-slate-300 mb-1">
                  E-mail Corporativo
                </label>
                <input
                  id="drv-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={drvEmail}
                  onChange={(e) => setDrvEmail(e.target.value)}
                  placeholder="ex: david@vanescolar.com.br"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-400 min-h-[44px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="drv-phone" className="block text-xs font-semibold text-slate-300 mb-1">
                    Telefone
                  </label>
                  <input
                    id="drv-phone"
                    name="tel"
                    type="tel"
                    autoComplete="tel"
                    required
                    value={drvPhone}
                    onChange={(e) => setDrvPhone(e.target.value)}
                    placeholder="(21) 98765-4321"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white min-h-[44px]"
                  />
                </div>
                <div>
                  <label htmlFor="drv-plate" className="block text-xs font-semibold text-slate-300 mb-1">
                    Placa da Van
                  </label>
                  <input
                    id="drv-plate"
                    name="plate"
                    type="text"
                    required
                    value={drvVehiclePlate}
                    onChange={(e) => setDrvVehiclePlate(e.target.value)}
                    placeholder="RIO-2024"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white min-h-[44px]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="drv-model" className="block text-xs font-semibold text-slate-300 mb-1">
                  Modelo do Veículo
                </label>
                <input
                  id="drv-model"
                  name="model"
                  type="text"
                  required
                  value={drvVehicleModel}
                  onChange={(e) => setDrvVehicleModel(e.target.value)}
                  placeholder="Renault Master Executiva 2.3"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white min-h-[44px]"
                />
              </div>

              <div>
                <label htmlFor="drv-pass" className="block text-xs font-semibold text-slate-300 mb-1">
                  Senha (mínimo de 10 caracteres)
                </label>
                <div className="relative">
                  <input
                    id="drv-pass"
                    name="new-password"
                    type={drvShowPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={drvPassword}
                    onChange={(e) => setDrvPassword(e.target.value)}
                    placeholder="Mínimo 10 caracteres"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-400 pr-10 min-h-[44px]"
                  />
                  <button
                    type="button"
                    onClick={() => setDrvShowPassword(!drvShowPassword)}
                    aria-label={drvShowPassword ? "Ocultar senha" : "Mostrar senha"}
                    className="absolute right-3 top-3 text-slate-400 hover:text-white"
                  >
                    {drvShowPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {drvPassword.length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full transition-all ${drvStrength.color} ${drvStrength.width}`} />
                    </div>
                    <span className="text-[10px] text-slate-400">{drvStrength.label}</span>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="drv-conf-pass" className="block text-xs font-semibold text-slate-300 mb-1">
                  Confirmar Senha
                </label>
                <input
                  id="drv-conf-pass"
                  name="new-password"
                  type={drvShowPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={drvConfirmPassword}
                  onChange={(e) => setDrvConfirmPassword(e.target.value)}
                  placeholder="Repita a senha"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-400 min-h-[44px]"
                />
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    checked={drvLgpdConsent}
                    onChange={(e) => setDrvLgpdConsent(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-amber-400 focus:ring-amber-400"
                  />
                  <span className="text-[11px] text-slate-300 leading-relaxed">
                    Aceito os <a href="/termos.html" target="_blank" rel="noreferrer" className="underline text-cyan-300"><strong>Termos de Uso</strong></a> e a <a href="/privacidade.html" target="_blank" rel="noreferrer" className="underline text-cyan-300"><strong>Política de Privacidade</strong></a>, incluindo os cuidados com os dados dos alunos.
                  </span>
                </label>
              </div>

              {erroDrvReg && (
                <div role="alert" className="p-3 bg-rose-950/60 border border-rose-500/40 rounded-xl text-xs text-rose-300">
                  {erroDrvReg}
                </div>
              )}

              <button
                type="submit"
                disabled={loadingDrvReg}
                className="w-full py-3 px-4 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-md min-h-[44px] cursor-pointer disabled:opacity-50"
              >
                {loadingDrvReg ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Cadastrar Conta de Motorista</span>}
              </button>
            </form>
          </div>
        )}

        {/* PAINEL ADMIN: GESTÃO DE CONVITES DE MOTORISTA */}
        {activePortal === 'ADMIN_INVITES' && (
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-3xl p-6 sm:p-8 shadow-2xl relative">
            <button
              onClick={() => setActivePortal('SELECT')}
              className="text-xs text-slate-400 hover:text-white mb-6 underline cursor-pointer"
            >
              ← Voltar
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-400 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Gerenciador de Convites de Motorista</h2>
                <p className="text-xs text-slate-400">Exclusivo para administradores do sistema</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
                <h3 className="text-xs font-bold text-slate-200">Gerar Novo Convite</h3>
                <input
                  type="text"
                  value={invitationNota}
                  onChange={(e) => setInvitationNota(e.target.value)}
                  placeholder="Nota / Nome do Motorista Destino (opcional)"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                />
                <button
                  onClick={handleGerarConvite}
                  disabled={loadingAdmin}
                  className="w-full py-2.5 px-4 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  {loadingAdmin ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Gerar Código de Convite (Validade 72h)</span>}
                </button>
              </div>

              {erroAdmin && (
                <div role="alert" className="p-3 bg-rose-950/60 border border-rose-500/40 rounded-xl text-xs text-rose-300">
                  {erroAdmin}
                </div>
              )}

              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-300">Convites Existentes</h3>
                {invitationsList.length === 0 ? (
                  <p className="text-xs text-slate-500 py-2">Nenhum convite pendente ou gerado.</p>
                ) : (
                  <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                    {invitationsList.map((inv) => (
                      <div key={inv.code} className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                        <div>
                          <div className="font-mono text-amber-300 font-bold tracking-wider">{inv.code}</div>
                          <div className="text-[10px] text-slate-400">{inv.nota || 'Sem nota'} • Expira em: {new Date(inv.expires_at).toLocaleTimeString('pt-BR')}</div>
                        </div>
                        <button
                          onClick={() => handleRevogarConvite(inv.code)}
                          className="px-2.5 py-1 bg-rose-950 text-rose-300 hover:bg-rose-900 rounded-lg text-[10px] font-semibold border border-rose-800 cursor-pointer"
                        >
                          Revogar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* RESPONSÁVEL: LOGIN & VÍNCULO */}
        {activePortal === 'PARENT' && (
          <div className="w-full max-w-md bg-slate-900 border border-cyan-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl relative">
            <button
              onClick={() => setActivePortal('SELECT')}
              className="text-xs text-slate-400 hover:text-white mb-6 underline cursor-pointer"
            >
              ← Voltar à seleção de perfil
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-cyan-400/20 text-cyan-400 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Portal da Família</h2>
                <p className="text-xs text-slate-400">Entre com sua conta ou cadastre-se</p>
              </div>
            </div>

            {/* BOTÃO GOOGLE */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loadingParent}
              className="w-full py-3 px-4 bg-white hover:bg-slate-100 text-slate-900 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-md min-h-[44px] cursor-pointer mb-4"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>Continuar com Google</span>
            </button>

            <div className="flex items-center my-4">
              <div className="flex-1 border-t border-slate-800" />
              <span className="px-3 text-[11px] text-slate-500 uppercase">ou e-mail</span>
              <div className="flex-1 border-t border-slate-800" />
            </div>

            {/* FORMULÁRIO DE LOGIN COM E-MAIL E SENHA */}
            {!isEmailVerified ? (
              <form onSubmit={handleParentLoginSubmit} className="space-y-4">
                <div>
                  <label htmlFor="parent-email" className="block text-xs font-semibold text-slate-300 mb-1">
                    E-mail ou ID
                  </label>
                  <input
                    id="parent-email"
                    name="email"
                    type="text"
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="username"
                    required
                    value={parentEmail}
                    onChange={(e) => setParentEmail(e.target.value)}
                    placeholder="ex: seu.email@exemplo.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-400 min-h-[44px]"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="parent-pass" className="text-xs font-semibold text-slate-300">
                      Senha
                    </label>
                    <button
                      type="button"
                      onClick={() => setActivePortal('FORGOT')}
                      className="text-[11px] text-cyan-400 hover:underline cursor-pointer"
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                  <input
                    id="parent-pass"
                    name="current-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={parentPassword}
                    onChange={(e) => setParentPassword(e.target.value)}
                    placeholder="Digite sua senha"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-400 min-h-[44px]"
                  />
                </div>

                {erroParent && (
                  <div role="alert" className="p-3 bg-rose-950/60 border border-rose-500/40 rounded-xl text-xs text-rose-300">
                    {erroParent}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loadingParent}
                  className="w-full py-3 px-4 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-md min-h-[44px] cursor-pointer disabled:opacity-50"
                >
                  {loadingParent ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Entrar</span>}
                </button>
              </form>
            ) : null}

            {/* BOTÃO CRIAR CONTA */}
            {!isEmailVerified && (
              <div className="mt-6 pt-4 border-t border-slate-800 text-center">
                <p className="text-xs text-slate-400 mb-2">Não tem uma conta?</p>
                <button
                  type="button"
                  onClick={() => setActivePortal('REGISTER')}
                  className="text-xs font-bold text-cyan-400 hover:underline cursor-pointer"
                >
                  Criar conta de responsável
                </button>
              </div>
            )}
          </div>
        )}

        {/* CADASTRO DE RESPONSÁVEL (COM LGPD ART. 14) */}
        {activePortal === 'REGISTER' && (
          <div className="w-full max-w-md bg-slate-900 border border-cyan-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl relative">
            <button
              onClick={() => setActivePortal('PARENT')}
              className="text-xs text-slate-400 hover:text-white mb-6 underline cursor-pointer"
            >
              ← Voltar ao login
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-cyan-400/20 text-cyan-400 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Criar Conta</h2>
                <p className="text-xs text-slate-400">Portal exclusivo para responsáveis</p>
              </div>
            </div>

            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div>
                <label htmlFor="reg-name" className="block text-xs font-semibold text-slate-300 mb-1">
                  Nome Completo
                </label>
                <input
                  id="reg-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  value={regFullName}
                  onChange={(e) => setRegFullName(e.target.value)}
                  placeholder="ex: Leandro Solon"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-400 min-h-[44px]"
                />
              </div>

              <div>
                <label htmlFor="reg-loginid" className="block text-xs font-semibold text-slate-300 mb-1">
                  ID de acesso (opcional)
                </label>
                <input
                  id="reg-loginid"
                  name="loginId"
                  type="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  maxLength={30}
                  placeholder="Ex.: tio.david — para entrar sem digitar o e-mail"
                  value={regLoginId}
                  onChange={(e) => setRegLoginId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 placeholder-slate-600"
                />
              </div>

              <div>
                <label htmlFor="reg-email" className="block text-xs font-semibold text-slate-300 mb-1">
                  E-mail
                </label>
                <input
                  id="reg-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="ex: seu.email@exemplo.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-400 min-h-[44px]"
                />
              </div>

              <div>
                <label htmlFor="reg-pass" className="block text-xs font-semibold text-slate-300 mb-1">
                  Senha (mínimo de 10 caracteres)
                </label>
                <div className="relative">
                  <input
                    id="reg-pass"
                    name="new-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Mínimo 10 caracteres"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-400 pr-10 min-h-[44px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    className="absolute right-3 top-3 text-slate-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {regPassword.length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full transition-all ${strength.color} ${strength.width}`} />
                    </div>
                    <span className="text-[10px] text-slate-400">{strength.label}</span>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="reg-conf-pass" className="block text-xs font-semibold text-slate-300 mb-1">
                  Confirmar Senha
                </label>
                <input
                  id="reg-conf-pass"
                  name="new-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={regConfirmPassword}
                  onChange={(e) => setRegConfirmPassword(e.target.value)}
                  placeholder="Repita a senha"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-400 min-h-[44px]"
                />
              </div>

              {/* CONSENTIMENTO LGPD ART. 14 */}
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    checked={lgpdConsent}
                    onChange={(e) => setLgpdConsent(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-cyan-400 focus:ring-cyan-400"
                  />
                  <span className="text-[11px] text-slate-300 leading-relaxed">
                    Concordo com os <a href="/termos.html" target="_blank" rel="noreferrer" className="underline text-cyan-300"><strong>Termos de Uso</strong></a> e a <a href="/privacidade.html" target="_blank" rel="noreferrer" className="underline text-cyan-300"><strong>Política de Privacidade</strong></a>, e dou meu consentimento específico para o tratamento de dados de menores sob minha responsabilidade conforme a <strong>LGPD (Art. 14)</strong>. (Versão do termo: v1.0-lgpd-art14)
                  </span>
                </label>
              </div>

              {erroReg && (
                <div role="alert" className="p-3 bg-rose-950/60 border border-rose-500/40 rounded-xl text-xs text-rose-300">
                  {erroReg}
                </div>
              )}

              <button
                type="submit"
                disabled={loadingReg}
                className="w-full py-3 px-4 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-md min-h-[44px] cursor-pointer disabled:opacity-50"
              >
                {loadingReg ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Criar Conta</span>}
              </button>
            </form>
          </div>
        )}

        {/* ESQUECI MINHA SENHA */}
        {activePortal === 'FORGOT' && (
          <div className="w-full max-w-md bg-slate-900 border border-cyan-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl relative">
            <button
              onClick={() => setActivePortal('PARENT')}
              className="text-xs text-slate-400 hover:text-white mb-6 underline cursor-pointer"
            >
              ← Voltar ao login
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-cyan-400/20 text-cyan-400 flex items-center justify-center">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Recuperar Senha</h2>
                <p className="text-xs text-slate-400">Instruções de redefinição por e-mail</p>
              </div>
            </div>

            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <div>
                <label htmlFor="forgot-email" className="block text-xs font-semibold text-slate-300 mb-1">
                  E-mail Cadastrado
                </label>
                <input
                  id="forgot-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="ex: seu.email@exemplo.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-400 min-h-[44px]"
                />
              </div>

              {forgotMessage && (
                <div role="alert" className="p-3 bg-emerald-950/60 border border-emerald-500/40 rounded-xl text-xs text-emerald-300">
                  {forgotMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={loadingForgot}
                className="w-full py-3 px-4 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-md min-h-[44px] cursor-pointer disabled:opacity-50"
              >
                {loadingForgot ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Enviar Instruções</span>}
              </button>
            </form>
          </div>
        )}

        {/* RODAPÉ */}
        <div className="mt-16 flex flex-col items-center gap-6">
          <div className="flex flex-wrap items-center justify-center gap-3 text-xs">
            {isDemoMode && (
              <>
                <button
                  onClick={() => {
                    if (window.confirm("Deseja limpar todos os dados de teste?")) {
                      onLimparDados();
                    }
                  }}
                  aria-label="Limpar dados e sair do teste"
                  className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold transition-all min-h-[44px] cursor-pointer"
                >
                  Limpar Dados & Sair do Teste
                </button>
                <button
                  onClick={onOpenArchitecture}
                  aria-label="Ver arquitetura SQL e VPS"
                  className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-cyan-400 border border-slate-800 font-semibold flex items-center gap-1.5 min-h-[44px] cursor-pointer"
                >
                  <BarChart3 className="w-4 h-4" />
                  <span>Arquitetura SQL & VPS</span>
                </button>
              </>
            )}
          </div>

          <button
            onClick={() => onLoginAdmin()}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-600 hover:text-slate-400 transition-all text-[10px] uppercase tracking-widest font-bold"
          >
            <Settings className="w-3.5 h-3.5" />
            Painel Admin
          </button>
        </div>
      </div>
    </main>
  );
};
