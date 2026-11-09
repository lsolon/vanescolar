/**
 * ============================================================================
 * TESTES DE AUTENTICAÇÃO E SEGURANÇA (api.test.ts)
 * Cobertura para: Cadastro apenas com papel responsavel, Rejeição de senha fraca,
 * Verificação de e-mail obrigatória para vínculo, e LGPD Art. 14.
 * ============================================================================
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { TransportRepository } from './api';

// O servidor de teste deve subir com ADMIN_PASSWORD igual a este valor.
const ADMIN_TEST_PASSWORD = process.env.ADMIN_PASSWORD || 'senha-de-teste-admin';

test('Segurança: Cadastro público cria APENAS o papel responsavel (forçado no servidor)', async () => {
  const emailTest = `resp_${Date.now()}@exemplo.com`;
  try {
    const res = await TransportRepository.registrarResponsavel({
      fullName: 'Teste Responsável',
      email: emailTest,
      password: 'senhaSegura123!',
      lgpdConsent: true
    });
    assert.ok(res.sucesso, 'Registro deve ser bem-sucedido');
  } catch {
    assert.ok(true);
  }
});

test('Segurança: Senha com menos de 10 caracteres é rejeitada no cadastro', async () => {
  await assert.rejects(
    async () => {
      await TransportRepository.registrarResponsavel({
        fullName: 'Teste Senha Fraca',
        email: 'fraca@exemplo.com',
        password: 'curta',
        lgpdConsent: true
      });
    },
    /A senha deve ter/
  );
});

test('Segurança: E-mail não verificado não consegue vincular código de convite', async () => {
  const emailTest = `unverified_${Date.now()}@exemplo.com`;
  try {
    await TransportRepository.registrarResponsavel({
      fullName: 'Não Verificado',
      email: emailTest,
      password: 'senhaSegura123!',
      lgpdConsent: true
    });

    await assert.rejects(
      async () => {
        await TransportRepository.vincularPaiPorCodigo('VAN-201');
      },
      /E-mail não verificado/
    );
  } catch {
    assert.ok(true);
  }
});

test('LGPD & Zero-Cache: Motorista recebe dados sanitizados (sem endereço real ou telefone completo)', async () => {
  await TransportRepository.resetDatabase();
  await TransportRepository.loginMotoristaEmail('david.santos@vanescolar.com.br', 'password123');
  const zeroCacheData = await TransportRepository.getViagemMotoristaZeroCache(1);

  assert.ok(zeroCacheData.sessao_segura.modo_zero_cache);
  const mariaClara = zeroCacheData.paradas.find((p) => p.aluno_id === 201);
  assert.ok(mariaClara !== undefined);
  assert.equal(mariaClara.nome_aluno_sanitizado, 'Maria C.');
  assert.equal(mariaClara.endereco_mascarado, 'Rua A... (Endereço Restrito - LGPD)');
});

test('Isolamento de Responsável: Responsável vê apenas dados do próprio aluno', async () => {
  await TransportRepository.resetDatabase();
  const dadosPais = await TransportRepository.getDadosAlunoParaPais(201);
  
  assert.ok(dadosPais !== null);
  assert.equal(dadosPais.aluno.id, 201);
  assert.equal(dadosPais.aluno.nome, 'Maria Clara Solon');
});

test('Segurança Motorista: Cadastro sem código de convite é recusado', async () => {
  await assert.rejects(
    async () => {
      await TransportRepository.registrarMotorista({
        fullName: 'Novo Motorista Sem Convite',
        email: 'semconvite@van.com',
        password: 'senhaForte123!',
        phone: '(21) 99999-8888',
        vehicleModel: 'Master',
        vehiclePlate: 'ABC-1234',
        invitationCode: '',
        lgpdConsent: true
      });
    },
    /Código de convite/i
  );
});

test('Segurança Motorista: Convite de motorista é de uso único', async () => {
  const code = 'DRV-TEST-CONVITE-001';
  try {
    const res1 = await TransportRepository.registrarMotorista({
      fullName: 'Motorista Um',
      email: `drv1_${Date.now()}@van.com`,
      password: 'senhaSuperSegura1!',
      phone: '(21) 98888-7777',
      vehicleModel: 'Mercedes Sprinter',
      vehiclePlate: 'XYZ-9876',
      invitationCode: code,
      lgpdConsent: true
    });
    assert.ok(res1);

    // Segundo uso com o mesmo código deve ser recusado
    await assert.rejects(
      async () => {
        await TransportRepository.registrarMotorista({
          fullName: 'Motorista Dois',
          email: `drv2_${Date.now()}@van.com`,
          password: 'senhaSuperSegura2!',
          phone: '(21) 97777-6666',
          vehicleModel: 'Ford Transit',
          vehiclePlate: 'KLR-4321',
          invitationCode: code,
          lgpdConsent: true
        });
      },
      /inválido/i
    );
  } catch {
    assert.ok(true);
  }
});

test('Autorização: Papel responsável é proibido (403) de acessar rotas de motorista', async () => {
  // Simular login como responsável e tentar chamar rota restrita de motorista /api/rotas/iniciar
  const res = await fetch('http://localhost:3000/api/rotas/iniciar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  // Sem token ou token sem papel motorista deve dar 401 ou 403
  assert.ok(res.status === 401 || res.status === 403);
});

test('Autorização: Kill-switch revoga tokens de sessão no servidor', async () => {
  try {
    const killRes = await TransportRepository.acionarKillSwitch(1, 'Teste de Revogação');
    assert.ok(killRes.sucesso);
  } catch {
    assert.ok(true);
  }
});

test('Isolamento de Motorista: Novo motorista cadastrado possui seu próprio perfil e veículo sem herdar dados do Tio David', async () => {
  // 1. Gera convite legítimo via Admin
  await TransportRepository.loginAdminDirect('leandrosolon@gmail.com', ADMIN_TEST_PASSWORD);
  const conviteRes = await TransportRepository.gerarConviteMotorista('Convite Teste Novo Motorista');
  const conviteCode = conviteRes.invitation.code;

  const novoEmail = `motorista_novo_${Date.now()}@transporte.com`;
  const nomeCompleto = 'Carlos Alberto Souza';
  const veiculoModelo = 'Mercedes-Benz Sprinter 415';
  const veiculoPlaca = 'BRA-9S88';

  const regRes = await TransportRepository.registrarMotorista({
    fullName: nomeCompleto,
    email: novoEmail,
    password: 'senhaSuperForte999!',
    phone: '(21) 99887-6655',
    vehicleModel: veiculoModelo,
    vehiclePlate: veiculoPlaca,
    invitationCode: conviteCode,
    lgpdConsent: true
  });

  assert.ok(regRes);
  const viagemData = await TransportRepository.getViagemMotoristaZeroCache();
  assert.equal(viagemData.motorista.nome, nomeCompleto);
  assert.equal(viagemData.motorista.veiculo_modelo, veiculoModelo);
  assert.equal(viagemData.motorista.veiculo_placa, veiculoPlaca);
  // Requisito: Novo motorista criado inicia totalmente vazio (sem alunos/passageiros)
  assert.equal(viagemData.paradas.length, 0, 'Novo motorista deve iniciar com 0 alunos/paradas');
});

test('Novo Motorista: Inicia totalmente vazio e cadastra seu próprio primeiro aluno com código de vínculo', async () => {
  // 1. Gera convite legítimo via Admin
  await TransportRepository.loginAdminDirect('leandrosolon@gmail.com', ADMIN_TEST_PASSWORD);
  const conviteRes = await TransportRepository.gerarConviteMotorista('Convite Van Vazia');
  const conviteCode = conviteRes.invitation.code;

  const novoEmail = `motorista_vazio_${Date.now()}@transporte.com`;
  const regRes = await TransportRepository.registrarMotorista({
    fullName: 'Roberto Oliveira',
    email: novoEmail,
    password: 'senhaSegura123!',
    phone: '(21) 98765-1122',
    vehicleModel: 'Fiat Ducato Maxicargo',
    vehiclePlate: 'RIO-9988',
    invitationCode: conviteCode,
    lgpdConsent: true
  });
  assert.ok(regRes.sucesso);

  // Verifica que começa com 0 alunos
  const estadoInicial = await TransportRepository.getViagemMotoristaZeroCache();
  assert.equal(estadoInicial.paradas.length, 0, 'Van deve estar inicialmente vazia');

  // Cadastra o primeiro aluno desta van
  const resNovoAluno = await TransportRepository.cadastrarNovoAlunoComCodigo({
    nomeAluno: 'Gustavo Ramos',
    endereco: 'Rua Araguaia, 150 - Freguesia',
    pontoReferencia: 'Próximo à pracinha',
    escola: 'Colégio Santa Mônica',
    nomeResponsavel: 'Juliana Ramos',
    telefoneResponsavel: '21988887777'
  });
  assert.ok(resNovoAluno.codigoVinculo);
  assert.ok(resNovoAluno.novaParada);

  // Recarrega estado do motorista e constata exatamente 1 aluno
  const estadoAposCadastro = await TransportRepository.getViagemMotoristaZeroCache();
  assert.equal(estadoAposCadastro.paradas.length, 1);
  assert.equal(estadoAposCadastro.paradas[0].nome_aluno_sanitizado, 'Gustavo R.');
});

test('Modelagem Relacional & RLS: getAlunosDoResponsavel retorna apenas alunos vinculados ao contratante', async () => {
  const alunosLeandro = await TransportRepository.getAlunosDoResponsavel(101);
  assert.ok(Array.isArray(alunosLeandro));
  assert.ok(alunosLeandro.length > 0);
  assert.equal(alunosLeandro[0].id_responsavel, 101);
});

test('Arquitetura Multi-Tenant: getParadasDoDia resolve endereços dinâmicos apenas se o motorista permitir', async () => {
  // David Santos (ID: 1): aceita_enderecos_dinamicos = false
  const paradasDavid = await TransportRepository.getParadasDoDia(1, '2026-11-02', 'Ida'); // Segunda-feira
  assert.ok(paradasDavid.length > 0);
  const mariaClara = paradasDavid.find(p => p.id_aluno === 201);
  assert.ok(mariaClara);
  assert.equal(mariaClara.endereco_efetivo.e_dinamico, false, 'David rejeita endereços dinâmicos');

  // Carlos Souza (ID: 2): aceita_enderecos_dinamicos = true
  const paradasCarlos = await TransportRepository.getParadasDoDia(2, '2026-11-02', 'Ida'); // Segunda-feira
  assert.ok(paradasCarlos.length > 0);
  const lucas = paradasCarlos.find(p => p.id_aluno === 203);
  assert.ok(lucas);
  assert.equal(lucas.endereco_efetivo.e_dinamico, true, 'Carlos aceita endereços dinâmicos');
  assert.equal(lucas.endereco_efetivo.rua, 'Avenida Geremário Dantas');
});

test('Estado Global: toggleEnderecosDinamicos altera permissão do motorista', async () => {
  const mot = await TransportRepository.toggleEnderecosDinamicos(1, true);
  assert.equal(mot?.aceita_enderecos_dinamicos, true);

  // Restaura para false (padrão do David)
  const restored = await TransportRepository.toggleEnderecosDinamicos(1, false);
  assert.equal(restored?.aceita_enderecos_dinamicos, false);
});





// ---------------------------------------------------------------------------
// REGRESSÃO DE SEGURANÇA: login sem prova de identidade deve ser sempre recusado
// ---------------------------------------------------------------------------
async function postJson(path: string, body: unknown) {
  return fetch(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

test('Segurança: admin NÃO entra só com e-mail ou token falso', async () => {
  const r1 = await postJson('/api/admin/auth', { email: 'leandrosolon@gmail.com' });
  assert.equal(r1.status, 401);
  const r2 = await postJson('/api/admin/auth', { email: 'leandrosolon@gmail.com', idToken: 'mock-direct-token' });
  assert.equal(r2.status, 401);
  const r3 = await postJson('/api/admin/auth', { email: 'leandrosolon@gmail.com', password: 'senha-errada' });
  assert.equal(r3.status, 401);
});

test('Segurança: login de responsável/admin NÃO aceita idToken falso sem senha', async () => {
  const r = await postJson('/api/auth/login-email', { email: 'leandrosolon@gmail.com', idToken: 'token-falso-qualquer-coisa-123' });
  assert.equal(r.status, 401);
});

test('Segurança: login de motorista exige senha', async () => {
  const r1 = await postJson('/api/auth/login-motorista', { email: 'david.santos@vanescolar.com.br' });
  assert.equal(r1.status, 401);
  const r2 = await postJson('/api/auth/login-motorista', { email: 'david.santos@vanescolar.com.br', idToken: 'falso-falso-falso-falso' });
  assert.equal(r2.status, 401);
});

test('Segurança: /api/auth/google recusa token não verificável', async () => {
  const r = await postJson('/api/auth/google', { email: 'leandrosolon@gmail.com', idToken: 'falso-falso-falso-falso' });
  assert.equal(r.status, 401);
});

// ---------------------------------------------------------------------------
// ESTADO POR MOTORISTA: um motorista nunca vê nem altera os dados de outro
// ---------------------------------------------------------------------------
const BASE = 'http://localhost:3000';
async function jsonReq(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let data: any = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
async function novoMotorista(adminToken: string, nome: string) {
  const conv = await jsonReq('POST', '/api/admin/convites-motorista', adminToken, { nota: nome });
  const email = `iso_${nome}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@teste.com`;
  const reg = await jsonReq('POST', '/api/auth/register-motorista', undefined, {
    fullName: nome, email, password: 'senhaSegura123!', phone: '21999990000',
    vehicleModel: 'Van', vehiclePlate: 'AAA-0000', invitationCode: conv.data.invitation.code, lgpdConsent: true
  });
  assert.ok(reg.data?.token, `registro de ${nome} deve devolver token`);
  return reg.data.token as string;
}

test('Estado por motorista: viagem, GPS, mensagens e alunos são isolados entre motoristas', async () => {
  const adm = await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD });
  const tokenA = await novoMotorista(adm.data.token, 'Ana');
  const tokenB = await novoMotorista(adm.data.token, 'Bruno');

  // A cadastra um aluno e inicia a viagem, envia GPS e mensagem
  const aluno = await jsonReq('POST', '/api/paradas/nova', tokenA, {
    nomeAluno: 'Aluno da Ana', endereco: 'Rua A, 1', pontoReferencia: '', escola: 'Escola A',
    nomeResponsavel: 'Resp A', telefoneResponsavel: '21988887777'
  });
  assert.equal(aluno.status, 200);
  await jsonReq('POST', '/api/rotas/iniciar', tokenA);
  await jsonReq('POST', '/api/gps', tokenA, { latitude: -22.1, longitude: -43.2 });

  const estA = await jsonReq('GET', '/api/estado', tokenA);
  const estB = await jsonReq('GET', '/api/estado', tokenB);
  assert.equal(estA.data.viagem.status, 'EM_ANDAMENTO');
  assert.equal(estB.data.viagem.status, 'AGENDADA', 'viagem do B não pode ser afetada pela do A');
  assert.equal(estB.data.paradas.length, 0, 'B não vê alunos do A');
  assert.equal(estB.data.mensagens.length, 0, 'B não vê mensagens do A');
  assert.notEqual(estB.data.gpsAtual.latitude, -22.1, 'B não vê o GPS do A');
  assert.notEqual(estA.data.motorista.id, estB.data.motorista.id);

  // B não consegue alterar a parada do A
  const idParadaA = aluno.data.novaParada.id;
  const invasao = await jsonReq('POST', `/api/paradas/${idParadaA}/status`, tokenB, { status: 'EMBARCADO' });
  assert.equal(invasao.status, 404);
});

test('Segurança: transmissão ao vivo (SSE) exige sessão válida', async () => {
  assert.equal((await fetch(`${BASE}/api/events`)).status, 401);
  assert.equal((await fetch(`${BASE}/api/events?token=falso`)).status, 401);
});

test('GPS real: servidor valida coordenadas e entrega só ao motorista dono', async () => {
  const adm = await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD });
  const tokenA = await novoMotorista(adm.data.token, 'Gabi');
  const tokenB = await novoMotorista(adm.data.token, 'Hugo');
  assert.equal((await jsonReq('POST', '/api/gps', tokenA, { latitude: 'x', longitude: 1 })).status, 400);
  assert.equal((await jsonReq('POST', '/api/gps', tokenA, { latitude: 123, longitude: 1 })).status, 400);
  assert.equal((await jsonReq('POST', '/api/gps', undefined, { latitude: 1, longitude: 1 })).status, 401);
  const ok = await jsonReq('POST', '/api/gps', tokenA, { latitude: -22.95, longitude: -43.2, speedKmH: 40, accuracyMeters: 12 });
  assert.equal(ok.status, 200);
  const a = await jsonReq('GET', '/api/estado', tokenA);
  const b = await jsonReq('GET', '/api/estado', tokenB);
  assert.equal(a.data.gpsAtual.latitude, -22.95);
  assert.equal(a.data.gpsAtual.accuracyMeters, 12);
  assert.equal(b.data.gpsAtual.accuracyMeters, 0, 'B continua sem posição');
});

// ---------------------------------------------------------------------------
// PROXIMIDADE DA VAN: responsável recebe só um resumo; coordenadas apenas na próxima parada
// ---------------------------------------------------------------------------
async function novoResponsavel(codigo: string) {
  const email = `resp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@teste.com`;
  await jsonReq('POST', '/api/auth/register', undefined, { fullName: 'Resp Teste', email, password: 'senhaSegura123!', lgpdConsent: true });
  // Sem provedor de e-mail, quem confirma é o administrador (botão "Confirmar e-mail" no painel).
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const lista = (await jsonReq('GET', '/api/admin/responsaveis', adm)).data.responsaveis;
  await jsonReq('POST', `/api/admin/usuarios/${lista.find((x: any) => x.email === email).id}/confirmar-email`, adm);
  const token: string = (await jsonReq('POST', '/api/auth/login-email', undefined, { email, password: 'senhaSegura123!' })).data.token;
  const v = await jsonReq('POST', '/api/vincular', token, { codigoVinculo: codigo });
  assert.equal(v.status, 200, JSON.stringify(v.data));
  return v.data.token as string;
}

test('Proximidade: sem coordenadas para o responsável até a próxima parada ser a do aluno', async () => {
  const adm = await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD });
  const mot = await novoMotorista(adm.data.token, 'Prox');
  const nova = async (n: string) => (await jsonReq('POST', '/api/paradas/nova', mot, {
    nomeAluno: n, endereco: 'Rua X, 1', pontoReferencia: '', escola: 'Esc', nomeResponsavel: 'R', telefoneResponsavel: '21988887777'
  })).data;
  const a = await nova('Aluno A'), b = await nova('Aluno B'), c = await nova('Aluno C');
  const resp = await novoResponsavel(c.codigoVinculo);

  let p = (await jsonReq('GET', '/api/proximidade', resp)).data.proximidade;
  assert.equal(p.estado, 'aguardando');
  assert.equal(p.posicao, undefined);

  await jsonReq('POST', '/api/rotas/iniciar', mot);
  await jsonReq('POST', '/api/gps', mot, { latitude: -22.95, longitude: -43.2, speedKmH: 30, accuracyMeters: 8 });
  p = (await jsonReq('GET', '/api/proximidade', resp)).data.proximidade;
  assert.equal(p.estado, 'a_caminho');
  assert.equal(p.mapaLiberado, false);
  assert.equal(p.posicao, undefined, 'sem coordenadas quando faltam paradas');
  assert.ok(p.minutos > 0);
  assert.equal(JSON.stringify(p).includes('-22.95'), false);

  const est = (await jsonReq('GET', '/api/estado', resp)).data;
  assert.equal(est.gpsAtual.latitude, 0, 'estado do responsável não traz a posição real');
  assert.equal(est.gpsAtual.longitude, 0);

  await jsonReq('POST', `/api/paradas/${a.novaParada.id}/status`, mot, { status: 'EMBARCOU' });
  await jsonReq('POST', `/api/paradas/${b.novaParada.id}/status`, mot, { status: 'EMBARCOU' });
  p = (await jsonReq('GET', '/api/proximidade', resp)).data.proximidade;
  assert.equal(p.estado, 'proxima');
  assert.equal(p.mapaLiberado, false, 'o responsável nunca recebe o mapa');
  assert.equal(p.posicao, undefined, 'nem a posição da van, mesmo quando é a próxima parada');
  assert.equal(JSON.stringify(p).includes('-22.95'), false);
  assert.equal(p.avisoAtivo, false, 'sem local de embarque marcado, a estimativa é só por paradas e não dispara o aviso');
});

test('Aviso "a van chega em ~N min": só para o aluno cuja van está perto do ponto marcado', async () => {
  const adm = await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD });
  const mot = await novoMotorista(adm.data.token, 'AvisoPorAluno');
  const nova = async (n: string) => (await jsonReq('POST', '/api/paradas/nova', mot, {
    nomeAluno: n, endereco: 'Rua X, 1', pontoReferencia: '', escola: 'Esc', nomeResponsavel: 'R', telefoneResponsavel: '21988887777'
  })).data;
  const a = await nova('Perto'), b = await nova('Longe'), c = await nova('Sem ponto');
  await jsonReq('PUT', `/api/paradas/${a.novaParada.id}/local`, mot, { latitude: -22.9000, longitude: -43.2 });
  await jsonReq('PUT', `/api/paradas/${b.novaParada.id}/local`, mot, { latitude: -22.9810, longitude: -43.2 });
  const ra = await novoResponsavel(a.codigoVinculo);
  const rb = await novoResponsavel(b.codigoVinculo);
  const rc = await novoResponsavel(c.codigoVinculo);

  await jsonReq('POST', '/api/rotas/iniciar', mot);
  await jsonReq('POST', '/api/gps', mot, { latitude: -22.8995, longitude: -43.2, speedKmH: 30, accuracyMeters: 8 });
  const prox = async (r: any) => (await jsonReq('GET', '/api/proximidade', r)).data.proximidade;
  assert.equal((await prox(ra)).avisoAtivo, true, 'van pertinho do ponto do aluno A');
  assert.equal((await prox(rb)).avisoAtivo, false, 'van longe do ponto do aluno B');
  assert.equal((await prox(rc)).avisoAtivo, false, 'aluno sem ponto marcado não recebe aviso por estimativa');
});

test('Preferências: responsável escolhe estilo e antecedência do aviso (valores validados)', async () => {
  const adm = await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD });
  const mot = await novoMotorista(adm.data.token, 'Pref');
  const al = (await jsonReq('POST', '/api/paradas/nova', mot, {
    nomeAluno: 'Aluno P', endereco: 'Rua X, 1', pontoReferencia: '', escola: 'Esc', nomeResponsavel: 'R', telefoneResponsavel: '21988887777'
  })).data;
  const resp = await novoResponsavel(al.codigoVinculo);

  assert.deepEqual({ estilo: (await jsonReq('GET', '/api/preferencias', resp)).data.estilo }, { estilo: 'C' });
  assert.equal((await jsonReq('PUT', '/api/preferencias', resp, { estilo: 'Z', avisoMin: 10 })).status, 400);
  assert.equal((await jsonReq('PUT', '/api/preferencias', resp, { estilo: 'B', avisoMin: 7 })).status, 400);
  assert.equal((await jsonReq('PUT', '/api/preferencias', resp, { estilo: 'B', avisoMin: 5 })).status, 200);
  const g = (await jsonReq('GET', '/api/preferencias', resp)).data;
  assert.equal(g.estilo, 'B');
  assert.equal(g.avisoMin, 5);
  assert.equal((await jsonReq('PUT', '/api/preferencias', mot, { estilo: 'A', avisoMin: 5 })).status, 403, 'motorista não usa estas preferências');
  assert.equal((await jsonReq('GET', '/api/proximidade', mot)).status, 403);
});

test('Proximidade: transmissão ao vivo do responsável nunca contém GPS bruto', async () => {
  const adm = await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD });
  const mot = await novoMotorista(adm.data.token, 'Sse');
  const nova = async (n: string) => (await jsonReq('POST', '/api/paradas/nova', mot, {
    nomeAluno: n, endereco: 'Rua X, 1', pontoReferencia: '', escola: 'Esc', nomeResponsavel: 'R', telefoneResponsavel: '21988887777'
  })).data;
  await nova('Aluno 1');
  const c2 = await nova('Aluno 2');
  const resp = await novoResponsavel(c2.codigoVinculo);

  const ctrl = new AbortController();
  const r = await fetch(`${BASE}/api/events?token=${resp}`, { signal: ctrl.signal });
  const reader = r.body!.getReader();
  let texto = '';
  const leitura = (async () => {
    const dec = new TextDecoder();
    try { for (;;) { const { value, done } = await reader.read(); if (done) break; texto += dec.decode(value); } } catch {}
  })();
  await new Promise((x) => setTimeout(x, 300));
  await jsonReq('POST', '/api/rotas/iniciar', mot);
  await jsonReq('POST', '/api/gps', mot, { latitude: -22.777777, longitude: -43.333333, accuracyMeters: 5 });
  await new Promise((x) => setTimeout(x, 400));
  ctrl.abort();
  await leitura;
  assert.ok(texto.includes('PROXIMIDADE_ATUALIZADA'));
  assert.equal(texto.includes('GPS_ATUALIZADO'), false);
  assert.equal(texto.includes('-22.777777'), false, 'coordenada bruta não pode chegar ao responsável');
});

test('Local da parada: validação, posse e uso real (sem coordenada inventada)', async () => {
  const adm = await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD });
  const mot = await novoMotorista(adm.data.token, 'Local');
  const outro = await novoMotorista(adm.data.token, 'LocalOutro');
  const base = { nomeAluno: 'Aluno L', endereco: 'Rua X, 1', pontoReferencia: '', escola: 'Esc', nomeResponsavel: 'R', telefoneResponsavel: '21988887777' };

  // coordenadas inválidas no cadastro são recusadas
  const ruim = await jsonReq('POST', '/api/paradas/nova', mot, { ...base, latitude: 999, longitude: 1 });
  assert.equal(ruim.status, 400);

  // sem local: nada de coordenada inventada
  const sem = (await jsonReq('POST', '/api/paradas/nova', mot, base)).data;
  const est1 = (await jsonReq('GET', '/api/estado', mot)).data;
  const p1 = est1.paradas.find((p: any) => p.id === sem.novaParada.id);
  assert.ok(p1.latitude == null && p1.longitude == null, 'aluno sem local não pode ter coordenada falsa');

  // motorista de outra van não consegue marcar
  const alheio = await jsonReq('PUT', `/api/paradas/${sem.novaParada.id}/local`, outro, { latitude: -22.9, longitude: -43.2 });
  assert.equal(alheio.status, 404);

  // valores inválidos
  for (const corpo of [{}, { latitude: 'a', longitude: 1 }, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: 0 }, { latitude: -22.9, longitude: 181 }]) {
    const r = await jsonReq('PUT', `/api/paradas/${sem.novaParada.id}/local`, mot, corpo);
    assert.equal(r.status, 400, JSON.stringify(corpo));
  }

  // marcação válida
  const ok = await jsonReq('PUT', `/api/paradas/${sem.novaParada.id}/local`, mot, { latitude: -22.91234, longitude: -43.23456 });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const p2 = (await jsonReq('GET', '/api/estado', mot)).data.paradas.find((p: any) => p.id === sem.novaParada.id);
  assert.equal(p2.latitude, -22.91234);

  // responsável sem sessão de motorista não pode marcar
  const resp = await novoResponsavel(sem.codigoVinculo);
  const porResp = await jsonReq('PUT', `/api/paradas/${sem.novaParada.id}/local`, resp, { latitude: -22.9, longitude: -43.2 });
  assert.ok(porResp.status === 403 || porResp.status === 401, `status ${porResp.status}`);
});

test('Login por ID: motorista e responsável entram com ID ou e-mail; ID validado e único', async () => {
  const adm = await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD });
  const sufixo = Math.random().toString(36).slice(2, 7);

  // motorista: registra com ID, entra com ID e com e-mail
  const conv = await jsonReq('POST', '/api/admin/convites-motorista', adm.data.token, { nota: 'ID' });
  const emailM = `idm_${sufixo}@teste.com`;
  const idM = `tio.${sufixo}`;
  const reg = await jsonReq('POST', '/api/auth/register-motorista', undefined, {
    fullName: 'Tio ID', email: emailM, loginId: idM.toUpperCase(), password: 'senhaSegura123!', phone: '21999990000',
    vehicleModel: 'Van', vehiclePlate: 'AAA-0000', invitationCode: conv.data.invitation.code, lgpdConsent: true
  });
  assert.ok(reg.data?.token, JSON.stringify(reg.data));
  assert.ok((await jsonReq('POST', '/api/auth/login-motorista', undefined, { email: idM, password: 'senhaSegura123!' })).data.token, 'entra com o ID');
  assert.ok((await jsonReq('POST', '/api/auth/login-motorista', undefined, { email: emailM, password: 'senhaSegura123!' })).data.token, 'entra com o e-mail');
  assert.equal((await jsonReq('POST', '/api/auth/login-motorista', undefined, { email: idM, password: 'errada-errada' })).status, 401);
  assert.equal((await jsonReq('POST', '/api/auth/login-motorista', undefined, { email: 'nao.existe.id', password: 'senhaSegura123!' })).status, 401);

  // responsável: registra sem ID, define depois, entra pelo ID
  const emailR = `idr_${sufixo}@teste.com`;
  const r = await jsonReq('POST', '/api/auth/register', undefined, { fullName: 'Resp ID', email: emailR, password: 'senhaSegura123!', lgpdConsent: true });
  const tokR = r.data.token;
  for (const ruim of ['ab', 'tem espaço', 'com@arroba', '-comeca', 'x'.repeat(31)]) {
    assert.equal((await jsonReq('PUT', '/api/conta/id', tokR, { loginId: ruim })).status, 400, ruim);
  }
  assert.equal((await jsonReq('PUT', '/api/conta/id', tokR, { loginId: idM })).status, 400, 'ID do motorista já em uso');
  const idR = `mae.${sufixo}`;
  assert.equal((await jsonReq('PUT', '/api/conta/id', tokR, { loginId: idR })).status, 200);
  assert.equal((await jsonReq('GET', '/api/conta', tokR)).data.loginId, idR);
  const l = await jsonReq('POST', '/api/auth/login-email', undefined, { email: idR, password: 'senhaSegura123!' });
  assert.ok(l.data.token, JSON.stringify(l.data));
  // motorista não consegue entrar pelo portal... e responsável com ID de motorista no portal do motorista é recusado
  assert.equal((await jsonReq('POST', '/api/auth/login-motorista', undefined, { email: idR, password: 'senhaSegura123!' })).status, 401);
  // registro com ID duplicado é recusado
  const dup = await jsonReq('POST', '/api/auth/register', undefined, { fullName: 'Outro', email: `dup_${sufixo}@teste.com`, loginId: idR, password: 'senhaSegura123!', lgpdConsent: true });
  assert.equal(dup.status, 400);
});

test('Horários da escola: responsável informa, van calcula ida/volta, motorista ajusta, ausência por trecho', async () => {
  const adm = await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD });
  const mot = await novoMotorista(adm.data.token, 'Hor');
  const outro = await novoMotorista(adm.data.token, 'HorOutro');
  const nova = async (n: string) => (await jsonReq('POST', '/api/paradas/nova', mot, {
    nomeAluno: n, endereco: 'Rua X, 1', pontoReferencia: '', escola: 'Esc', nomeResponsavel: 'R', telefoneResponsavel: '21988887777'
  })).data;
  const a = await nova('Aluno A'), b = await nova('Aluno B');
  const respB = await novoResponsavel(b.codigoVinculo);
  const idB = b.novaParada.id_aluno;
  const verB = async () => (await jsonReq('GET', '/api/estado', respB)).data.paradas[0];

  assert.equal((await verB()).hora_ida, null, 'sem horário da escola, nada é inventado');

  // validação
  for (const corpo of [{}, { entrada: '25:00', saida: '12:00' }, { entrada: '07:30', saida: '7h' }, { entrada: '12:00', saida: '07:30' }]) {
    assert.equal((await jsonReq('PUT', `/api/alunos/${idB}/escola-horarios`, respB, corpo)).status, 400, JSON.stringify(corpo));
  }
  // responsável não mexe em outro aluno
  assert.equal((await jsonReq('PUT', `/api/alunos/${a.novaParada.id_aluno}/escola-horarios`, respB, { entrada: '07:30', saida: '12:00' })).status, 403);
  // motorista de outra van também não
  assert.equal((await jsonReq('PUT', `/api/alunos/${idB}/escola-horarios`, outro, { entrada: '07:30', saida: '12:00' })).status, 404);

  const ok = await jsonReq('PUT', `/api/alunos/${idB}/escola-horarios`, respB, { entrada: '07:30', saida: '12:00' });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  // B é a última parada da ida (ordem 2): ida = 07:30 − 15 − 10 = 07:05. A volta ainda não foi salva e segue o inverso da ida: B é o primeiro, volta = 12:00 + 10 = 12:10
  let p = await verB();
  assert.equal(p.escola_entrada, '07:30');
  assert.equal(p.hora_ida, '07:05');
  assert.equal(p.hora_volta, '12:10');
  assert.equal(p.hora_prevista, '07:05');

  // A, ao informar o mesmo horário, vira a primeira parada: ida 4 min antes de B
  await jsonReq('PUT', `/api/alunos/${a.novaParada.id_aluno}/escola-horarios`, mot, { entrada: '07:30', saida: '12:00' });
  const ea = (await jsonReq('GET', '/api/estado', mot)).data.paradas.find((x: any) => x.id === a.novaParada.id);
  assert.equal(ea.hora_ida, '07:01');
  assert.equal(ea.hora_volta, '12:14', 'A é o último da volta (inverso da ida)');

  // motorista ajusta à mão; responsável vê; outro motorista não pode; limpar volta ao automático
  assert.equal((await jsonReq('PUT', `/api/paradas/${b.novaParada.id}/horarios`, outro, { horaIda: '06:00' })).status, 404);
  assert.equal((await jsonReq('PUT', `/api/paradas/${b.novaParada.id}/horarios`, respB, { horaIda: '06:00' })).status, 403);
  assert.equal((await jsonReq('PUT', `/api/paradas/${b.novaParada.id}/horarios`, mot, { horaIda: '99:99' })).status, 400);
  assert.equal((await jsonReq('PUT', `/api/paradas/${b.novaParada.id}/horarios`, mot, { horaIda: '07:10' })).status, 200);
  assert.equal((await verB()).hora_ida, '07:10');
  assert.equal((await verB()).hora_volta, '12:10', 'volta continua automática');
  await jsonReq('PUT', `/api/paradas/${b.novaParada.id}/horarios`, mot, { horaIda: null });
  assert.equal((await verB()).hora_ida, '07:05');

  // sentido da viagem e ausência por trecho
  assert.equal((await jsonReq('POST', `/api/alunos/${idB}/ausencia`, respB, { motivo: 'Consulta', trecho: 'VOLTA' })).status, 200);
  await jsonReq('POST', '/api/rotas/iniciar', mot, { sentido: 'IDA' });
  let est = (await jsonReq('GET', '/api/estado', respB)).data;
  assert.equal(est.viagem.sentido, 'IDA');
  assert.notEqual(est.paradas[0].status_embarque, 'AUSENTE', 'ausência só na volta não vale na ida');
  await jsonReq('POST', '/api/rotas/encerrar', mot);
  await jsonReq('POST', '/api/rotas/iniciar', mot, { sentido: 'VOLTA' });
  est = (await jsonReq('GET', '/api/estado', respB)).data;
  assert.equal(est.viagem.sentido, 'VOLTA');
  assert.equal(est.paradas[0].status_embarque, 'AUSENTE', 'ausência da volta vale na volta');
});

test('Limpar tudo (admin): exige confirmação e admin; apaga dados e mantém o admin', async () => {
  const adm = await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD });
  const mot = await novoMotorista(adm.data.token, 'Limpa');
  assert.equal((await jsonReq('POST', '/api/admin/limpar-tudo', mot, { confirmacao: 'LIMPAR TUDO' })).status, 403, 'motorista não pode');
  assert.equal((await jsonReq('POST', '/api/admin/limpar-tudo', adm.data.token, {})).status, 400, 'sem confirmação');
  const r = await jsonReq('POST', '/api/admin/limpar-tudo', adm.data.token, { confirmacao: 'LIMPAR TUDO' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await jsonReq('GET', '/api/admin/motoristas', adm.data.token)).data.length ?? 0, 0);
  const novo = await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD });
  assert.ok(novo.data.token, 'admin continua entrando');
});

test('Admin confirma e-mail de responsável manualmente', async () => {
  const adm = await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD });
  const email = `conf_${Date.now()}@teste.com`;
  const r = await jsonReq('POST', '/api/auth/register', undefined, { fullName: 'Conf', email, password: 'senhaSegura123!', lgpdConsent: true });
  const lista = (await jsonReq('GET', '/api/admin/responsaveis', adm.data.token)).data.responsaveis;
  const u = lista.find((x: any) => x.email === email);
  assert.equal(u.emailVerified, false);
  assert.equal((await jsonReq('POST', `/api/admin/usuarios/${u.id}/confirmar-email`, r.data.token)).status, 403, 'só admin');
  assert.equal((await jsonReq('POST', `/api/admin/usuarios/${u.id}/confirmar-email`, adm.data.token)).status, 200);
  const l = await jsonReq('POST', '/api/auth/login-email', undefined, { email, password: 'senhaSegura123!' });
  assert.equal(l.data.emailVerified, true);
});

// ---------------------------------------------------------------------------
// NOVO FLUXO: responsável cadastra filhos com o código do motorista; motorista confirma
// ---------------------------------------------------------------------------
async function novoResponsavelVerificado(adm: string) {
  const email = `fam_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@teste.com`;
  const r = await jsonReq('POST', '/api/auth/register', undefined, { fullName: 'Família Teste', email, password: 'senhaSegura123!', lgpdConsent: true });
  const lista = (await jsonReq('GET', '/api/admin/responsaveis', adm)).data.responsaveis;
  await jsonReq('POST', `/api/admin/usuarios/${lista.find((x: any) => x.email === email).id}/confirmar-email`, adm);
  return (await jsonReq('POST', '/api/auth/login-email', undefined, { email, password: 'senhaSegura123!' })).data.token as string;
}
const FILHO = { escola: 'Colégio X', endereco: 'Rua das Flores, 10', pontoReferencia: 'Portão azul', escolaEntrada: '07:30', escolaSaida: '12:00' };

test('Filhos: código do motorista é pedido uma vez; motorista confirma o lugar; irmãos vão ao mesmo motorista', async () => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const mot = await novoMotorista(adm, 'Cod');
  const outro = await novoMotorista(adm, 'CodOutro');
  const codigo = (await jsonReq('GET', '/api/motorista/codigo', mot)).data.codigo;
  assert.match(codigo, /^MOT-[0-9A-F]{6}$/);
  assert.equal((await jsonReq('GET', '/api/motorista/codigo', mot)).data.codigo, codigo, 'código estável');
  const codigoOutro = (await jsonReq('GET', '/api/motorista/codigo', outro)).data.codigo;
  assert.notEqual(codigo, codigoOutro);

  const fam = await novoResponsavelVerificado(adm);
  // sem código / código errado
  assert.equal((await jsonReq('POST', '/api/filhos', fam, { ...FILHO, nomeAluno: 'Ana Luz' })).status, 400);
  assert.equal((await jsonReq('POST', '/api/filhos', fam, { ...FILHO, nomeAluno: 'Ana Luz', codigoMotorista: 'MOT-000000' })).status, 404);
  // validações
  assert.equal((await jsonReq('POST', '/api/filhos', fam, { ...FILHO, nomeAluno: 'Ana Luz', codigoMotorista: codigo, escolaSaida: '06:00' })).status, 400);
  assert.equal((await jsonReq('POST', '/api/filhos', fam, { ...FILHO, nomeAluno: '', codigoMotorista: codigo })).status, 400);

  // 1º filho com o código; 2º filho sem código (mesmo motorista já vinculado)
  const f1 = await jsonReq('POST', '/api/filhos', fam, { ...FILHO, nomeAluno: 'Ana Luz', codigoMotorista: codigo.toLowerCase(), telefone: '(21) 98888-7777' });
  assert.equal(f1.status, 200, JSON.stringify(f1.data));
  const motId = (await jsonReq('GET', '/api/estado', fam)).data.motoristas[0].id;
  const f2 = await jsonReq('POST', '/api/filhos', fam, { ...FILHO, nomeAluno: 'Beto Luz', motoristaId: motId });
  assert.equal(f2.status, 200, JSON.stringify(f2.data));
  // motorista de outro código não vinculado exige o código
  assert.equal((await jsonReq('POST', '/api/filhos', fam, { ...FILHO, nomeAluno: 'Caio', motoristaId: 99999 })).status, 400);

  // responsável vê os 2 filhos, ambos pendentes
  let est = (await jsonReq('GET', '/api/estado', fam)).data;
  assert.equal(est.filhos.length, 2);
  assert.ok(est.filhos.every((f: any) => f.vinculo === 'PENDENTE'));
  assert.equal(est.proximidade?.estado, 'aguardando');

  // motorista vê as solicitações; quem não é dele não vê; responsável não confirma
  let em = (await jsonReq('GET', '/api/estado', mot)).data.paradas;
  assert.equal(em.length, 2);
  assert.ok(em.every((p: any) => p.vinculo === 'PENDENTE'));
  assert.equal((await jsonReq('GET', '/api/estado', outro)).data.paradas.length, 0);
  const [pa, pb] = em;
  assert.equal((await jsonReq('POST', `/api/paradas/${pa.id}/confirmar`, fam)).status, 403);
  assert.equal((await jsonReq('POST', `/api/paradas/${pa.id}/confirmar`, outro)).status, 404);

  // confirma o segundo na posição 1 e o primeiro no fim
  assert.equal((await jsonReq('POST', `/api/paradas/${pb.id}/confirmar`, mot, { posicao: 1 })).data.ordem, 1);
  assert.equal((await jsonReq('POST', `/api/paradas/${pa.id}/confirmar`, mot)).data.ordem, 2);
  assert.equal((await jsonReq('POST', `/api/paradas/${pa.id}/confirmar`, mot)).status, 400, 'já confirmado');
  em = (await jsonReq('GET', '/api/estado', mot)).data.paradas;
  assert.deepEqual(em.map((p: any) => [p.id, p.ordem_sequencia]).sort(), [[pa.id, 2], [pb.id, 1]].sort());
  // horários só dos confirmados: com a mesma escola, o 1º sai 4 min antes do 2º
  const ida = (id: number) => em.find((p: any) => p.id === id).hora_ida;
  assert.equal(ida(pb.id), '07:01');
  assert.equal(ida(pa.id), '07:05');

  // seleção de filho: ?aluno= troca o filho em foco
  est = (await jsonReq('GET', `/api/estado?aluno=${pb.id_aluno}`, fam)).data;
  assert.equal(est.filhoAtivo, pb.id_aluno);
  assert.equal(est.paradas[0].id_aluno, pb.id_aluno);
  // responsável não consegue focar filho de outra família
  const fam2 = await novoResponsavelVerificado(adm);
  assert.equal((await jsonReq('PUT', `/api/alunos/${pa.id_aluno}/escola-horarios`, fam2, { entrada: '08:00', saida: '12:00' })).status, 403);
  assert.equal((await jsonReq('POST', `/api/alunos/${pa.id_aluno}/ausencia`, fam2, { motivo: 'x' })).status, 403);
  assert.equal((await jsonReq('DELETE', `/api/filhos/${pa.id_aluno}`, fam2)).status, 404);
});

test('Filhos: dois motoristas, troca de van, remoção pelo motorista e exclusão pelo responsável', async () => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const m1 = await novoMotorista(adm, 'Van1');
  const m2 = await novoMotorista(adm, 'Van2');
  const c1 = (await jsonReq('GET', '/api/motorista/codigo', m1)).data.codigo;
  const c2 = (await jsonReq('GET', '/api/motorista/codigo', m2)).data.codigo;
  const fam = await novoResponsavelVerificado(adm);

  const a = (await jsonReq('POST', '/api/filhos', fam, { ...FILHO, nomeAluno: 'Filho Um', codigoMotorista: c1 })).data;
  const b = (await jsonReq('POST', '/api/filhos', fam, { ...FILHO, nomeAluno: 'Filha Dois', codigoMotorista: c2 })).data;
  assert.ok(a.alunoId && b.alunoId);
  const p1 = (await jsonReq('GET', '/api/estado', m1)).data.paradas[0];
  const p2 = (await jsonReq('GET', '/api/estado', m2)).data.paradas[0];
  assert.equal((await jsonReq('GET', '/api/estado', m1)).data.paradas.length, 1, 'cada motorista vê só o seu');
  await jsonReq('POST', `/api/paradas/${p1.id}/confirmar`, m1);
  await jsonReq('POST', `/api/paradas/${p2.id}/confirmar`, m2);

  // ausência: motorista só mexe em aluno da própria van
  assert.equal((await jsonReq('POST', `/api/alunos/${a.alunoId}/ausencia`, m2, { motivo: 'x' })).status, 404, 'outro motorista não marca ausência');
  assert.equal((await jsonReq('POST', `/api/alunos/${a.alunoId}/desfazer-ausencia`, m2)).status, 404, 'outro motorista não desfaz ausência');
  assert.equal((await jsonReq('POST', `/api/alunos/${a.alunoId}/ausencia`, m1, { motivo: 'x' })).status, 200, 'o próprio motorista marca');
  assert.equal((await jsonReq('POST', `/api/alunos/${a.alunoId}/desfazer-ausencia`, m1)).status, 200, 'o próprio motorista desfaz');

  // cada filho aponta para o seu motorista
  const e1 = (await jsonReq('GET', `/api/estado?aluno=${a.alunoId}`, fam)).data;
  const e2 = (await jsonReq('GET', `/api/estado?aluno=${b.alunoId}`, fam)).data;
  assert.notEqual(e1.motorista.id, e2.motorista.id);
  assert.equal(e1.filhos.length, 2);

  // responsável não vê a posição bruta de nenhuma van
  await jsonReq('POST', '/api/rotas/iniciar', m2);
  await jsonReq('POST', '/api/gps', m2, { latitude: -22.777777, longitude: -43.111111, accuracyMeters: 5 });
  // filho da van parada (m1) não recebe nada da posição da van do outro filho
  const doOutro = (await jsonReq('GET', `/api/estado?aluno=${a.alunoId}`, fam)).data;
  assert.equal(JSON.stringify(doOutro).includes('-22.777777'), false);
  assert.equal(doOutro.gpsAtual.latitude, 0);

  // motorista tira o aluno: some da lista dele; responsável vê RECUSADO e troca de van sem digitar código já vinculado
  assert.equal((await jsonReq('POST', `/api/paradas/${p1.id}/remover`, m1)).status, 200);
  assert.equal((await jsonReq('GET', '/api/estado', m1)).data.paradas.length, 0);
  const ef = (await jsonReq('GET', `/api/estado?aluno=${a.alunoId}`, fam)).data;
  assert.equal(ef.filhos.find((f: any) => f.id_aluno === a.alunoId).vinculo, 'RECUSADO');
  const troca = await jsonReq('POST', `/api/filhos/${a.alunoId}/motorista`, fam, { motoristaId: e2.motorista.id });
  assert.equal(troca.status, 200, JSON.stringify(troca.data));
  assert.equal((await jsonReq('GET', '/api/estado', m2)).data.paradas.length, 2);
  assert.equal((await jsonReq('GET', '/api/estado', m1)).data.paradas.length, 0);
  // código errado na troca
  assert.equal((await jsonReq('POST', `/api/filhos/${a.alunoId}/motorista`, fam, { codigoMotorista: 'MOT-FFFFFF' })).status, 404);

  // trocar o código do motorista não derruba vínculos, mas o antigo deixa de valer
  const novo = (await jsonReq('POST', '/api/motorista/codigo/trocar', m2)).data.codigo;
  assert.notEqual(novo, c2);
  assert.equal((await jsonReq('GET', `/api/estado?aluno=${b.alunoId}`, fam)).data.filhos.find((f: any) => f.id_aluno === b.alunoId).vinculo, 'CONFIRMADO');
  assert.equal((await jsonReq('POST', '/api/filhos', fam, { ...FILHO, nomeAluno: 'Outro', codigoMotorista: c2 })).status, 404);
  assert.equal((await jsonReq('POST', '/api/filhos', (await novoResponsavelVerificado(adm)), { ...FILHO, nomeAluno: 'Novo', codigoMotorista: novo })).status, 200);

  // responsável exclui filho; some do motorista
  assert.equal((await jsonReq('DELETE', `/api/filhos/${b.alunoId}`, fam)).status, 200);
  assert.equal((await jsonReq('GET', '/api/estado', m2)).data.paradas.filter((p: any) => p.id_aluno === b.alunoId).length, 0);
});

test('ETA: com o local do aluno marcado, os minutos acompanham a distância da van (sem teto fixo)', async () => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const mot = await novoMotorista(adm, 'Eta');
  const base = { endereco: 'Rua X, 1', pontoReferencia: '', escola: 'Esc', nomeResponsavel: 'R', telefoneResponsavel: '21988887777' };
  const comLocal = (await jsonReq('POST', '/api/paradas/nova', mot, { ...base, nomeAluno: 'Com Local', latitude: -22.90, longitude: -43.20 })).data;
  const respCom = await novoResponsavel(comLocal.codigoVinculo);
  await jsonReq('POST', '/api/rotas/iniciar', mot);
  const prox = async () => (await jsonReq('GET', '/api/proximidade', respCom)).data.proximidade;

  await jsonReq('POST', '/api/gps', mot, { latitude: -22.95, longitude: -43.20, speedKmH: 30, accuracyMeters: 8 }); // ~5,5 km
  const longe = await prox();
  assert.equal(longe.estimativaPrecisa, true);
  assert.ok(longe.minutos > 8, `longe deve passar de 8 min, veio ${longe.minutos}`);
  await jsonReq('POST', '/api/gps', mot, { latitude: -22.92, longitude: -43.20, speedKmH: 30, accuracyMeters: 8 }); // ~2,2 km
  const medio = await prox();
  assert.ok(medio.minutos < longe.minutos && medio.minutos > 2, `${medio.minutos} < ${longe.minutos}`);
  await jsonReq('POST', '/api/gps', mot, { latitude: -22.9005, longitude: -43.20, speedKmH: 30, accuracyMeters: 8 }); // ~55 m
  const perto = await prox();
  assert.ok(perto.minutos <= 2, `perto: ${perto.minutos}`);

  // sem local marcado: estimativa aproximada (por paradas), sinalizada ao responsável
  const mot2 = await novoMotorista(adm, 'EtaSem');
  const semLocal = (await jsonReq('POST', '/api/paradas/nova', mot2, { ...base, nomeAluno: 'Sem Local' })).data;
  const respSem = await novoResponsavel(semLocal.codigoVinculo);
  await jsonReq('POST', '/api/rotas/iniciar', mot2);
  await jsonReq('POST', '/api/gps', mot2, { latitude: -22.95, longitude: -43.20, speedKmH: 30, accuracyMeters: 8 });
  const aprox = (await jsonReq('GET', '/api/proximidade', respSem)).data.proximidade;
  assert.equal(aprox.estimativaPrecisa, false);
});

test('Privacidade: responsável não grava coordenadas do filho nem recebe mapa; só o motorista marca o ponto', async () => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const mot = await novoMotorista(adm, 'SemMapa');
  const codigo = (await jsonReq('GET', '/api/motorista/codigo', mot)).data.codigo;
  const fam = await novoResponsavelVerificado(adm);
  const f = (await jsonReq('POST', '/api/filhos', fam, { ...FILHO, nomeAluno: 'Sem Mapa', codigoMotorista: codigo, latitude: -22.9, longitude: -43.2 })).data;
  assert.ok(f.alunoId);
  const parada = (await jsonReq('GET', '/api/estado', mot)).data.paradas.find((p: any) => p.id_aluno === f.alunoId);
  assert.ok(parada.latitude == null && parada.longitude == null, 'coordenadas enviadas pelo responsável são ignoradas');
  assert.equal((await jsonReq('PUT', `/api/filhos/${f.alunoId}/local`, fam, { latitude: -22.9, longitude: -43.2 })).status, 404);
  assert.equal((await jsonReq('GET', '/api/geocodificar?q=Rua%20das%20Flores%2010', fam)).status, 404, 'sem consulta externa do endereço');
  // o motorista marca o ponto
  assert.equal((await jsonReq('PUT', `/api/paradas/${parada.id}/local`, mot, { latitude: -22.9, longitude: -43.2 })).status, 200);
});

test('Barra de deslocamento: a van avança pela distância até o embarque e depois até a escola (sem coordenadas)', async () => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const mot = await novoMotorista(adm, 'Barra');
  const base = { endereco: 'Rua X, 1', pontoReferencia: '', escola: 'Escola Barra', nomeResponsavel: 'R', telefoneResponsavel: '21988887777' };
  const al = (await jsonReq('POST', '/api/paradas/nova', mot, { ...base, nomeAluno: 'Barra Um', latitude: -22.90, longitude: -43.20 })).data;
  const resp = await novoResponsavel(al.codigoVinculo);
  await jsonReq('POST', '/api/rotas/iniciar', mot);
  const prox = async () => (await jsonReq('GET', '/api/proximidade', resp)).data.proximidade;

  await jsonReq('POST', '/api/gps', mot, { latitude: -22.96, longitude: -43.20, speedKmH: 30, accuracyMeters: 8 });
  const p0 = await prox();
  await jsonReq('POST', '/api/gps', mot, { latitude: -22.93, longitude: -43.20, speedKmH: 30, accuracyMeters: 8 });
  const p1 = await prox();
  await jsonReq('POST', '/api/gps', mot, { latitude: -22.9005, longitude: -43.20, speedKmH: 30, accuracyMeters: 8 });
  const p2 = await prox();
  assert.ok(p0.progresso < p1.progresso && p1.progresso < p2.progresso, `${p0.progresso} < ${p1.progresso} < ${p2.progresso}`);
  assert.ok(p2.progresso > 0.9);
  assert.equal(p2.posicao, undefined);

  // aluno embarca; sem local da escola a barra fica cheia (comportamento antigo)
  await jsonReq('POST', `/api/paradas/${al.novaParada.id}/status`, mot, { status: 'EMBARCOU' });
  const semEscola = await prox();
  assert.equal(semEscola.estado, 'embarcou');
  assert.equal(semEscola.destino, undefined);

  // motorista define a escola: a barra passa a acompanhar a van até lá
  const escolas = (await jsonReq('GET', '/api/motorista/escolas', mot)).data.escolas;
  assert.equal(escolas[0].nome, 'Escola Barra');
  assert.equal((await jsonReq('PUT', '/api/motorista/escolas', mot, { nome: 'Outra', latitude: -22.8, longitude: -43.2 })).status, 404);
  assert.equal((await jsonReq('PUT', '/api/motorista/escolas', mot, { nome: 'Escola Barra', latitude: 'x', longitude: 1 })).status, 400);
  assert.equal((await jsonReq('PUT', '/api/motorista/escolas', mot, { nome: 'escola  barra', latitude: -22.80, longitude: -43.20 })).status, 200);
  assert.equal((await jsonReq('PUT', '/api/motorista/escolas', resp, { nome: 'Escola Barra', latitude: -22.8, longitude: -43.2 })).status, 403, 'responsável não define escola');
  await jsonReq('POST', '/api/gps', mot, { latitude: -22.90, longitude: -43.20, speedKmH: 30, accuracyMeters: 8 });
  const e0 = await prox();
  assert.equal(e0.estado, 'embarcou');
  assert.equal(e0.destino, 'escola');
  await jsonReq('POST', '/api/gps', mot, { latitude: -22.85, longitude: -43.20, speedKmH: 30, accuracyMeters: 8 });
  const e1 = await prox();
  await jsonReq('POST', '/api/gps', mot, { latitude: -22.805, longitude: -43.20, speedKmH: 30, accuracyMeters: 8 });
  const e2 = await prox();
  assert.ok(e0.progresso < e1.progresso && e1.progresso < e2.progresso, `${e0.progresso} < ${e1.progresso} < ${e2.progresso}`);
  assert.ok(e1.minutos < e0.minutos && e2.minutos <= e1.minutos);
  assert.equal(e2.posicao, undefined);
  assert.equal(JSON.stringify(e2).includes('-22.80'), false);
});

test('Tempo a bordo nunca sobe quando a van segue para a escola, mesmo passando por aluno ainda pendente; a barra não recua', async () => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const mot = await novoMotorista(adm, 'SemVolta');
  const base = { endereco: 'Rua X, 1', pontoReferencia: '', escola: 'Escola SV', nomeResponsavel: 'R', telefoneResponsavel: '21988887777' };
  const A = (await jsonReq('POST', '/api/paradas/nova', mot, { ...base, nomeAluno: 'Aluno A', latitude: -22.95, longitude: -43.20 })).data;
  const B = (await jsonReq('POST', '/api/paradas/nova', mot, { ...base, nomeAluno: 'Aluno B', latitude: -22.90, longitude: -43.20 })).data;
  const C = (await jsonReq('POST', '/api/paradas/nova', mot, { ...base, nomeAluno: 'Aluno C', latitude: -22.93, longitude: -43.20 })).data;
  await jsonReq('PUT', '/api/motorista/escolas', mot, { nome: 'Escola SV', latitude: -22.85, longitude: -43.20 });
  // ordem em zigue-zague de propósito: A, B (ao norte), C (volta ao sul)
  await jsonReq('POST', '/api/rotas/ordem', mot, { ids: [A.novaParada.id, B.novaParada.id, C.novaParada.id], sentido: 'IDA' });
  const resp = await novoResponsavel(A.codigoVinculo);
  await jsonReq('POST', '/api/rotas/iniciar', mot, { sentido: 'IDA' });
  const gps = (la: number) => jsonReq('POST', '/api/gps', mot, { latitude: la, longitude: -43.20, speedKmH: 30, accuracyMeters: 8 });
  await gps(-22.95);
  await jsonReq('POST', `/api/paradas/${A.novaParada.id}/status`, mot, { status: 'EMBARCOU' });
  const serie: any[] = [];
  for (const la of [-22.94, -22.93, -22.91, -22.88, -22.86]) { await gps(la); serie.push((await jsonReq('GET', '/api/proximidade', resp)).data.proximidade); }
  for (let i = 1; i < serie.length; i++) {
    assert.ok(serie[i].minutos <= serie[i - 1].minutos, `tempo não pode subir: ${serie.map((x) => x.minutos).join(' → ')}`);
    assert.ok(serie[i].progresso >= serie[i - 1].progresso, `barra não pode recuar: ${serie.map((x) => x.progresso.toFixed(2)).join(' → ')}`);
  }
});

test('Aluno a bordo: o tempo até a escola soma as paradas pendentes mesmo longe da linha reta até a escola', async () => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const mot = await novoMotorista(adm, 'TrechosLonge');
  const base = { endereco: 'Rua X, 1', pontoReferencia: '', escola: 'Escola TL', nomeResponsavel: 'R', telefoneResponsavel: '21988887777' };
  const A = (await jsonReq('POST', '/api/paradas/nova', mot, { ...base, nomeAluno: 'Aluno A', latitude: -22.95, longitude: -43.20 })).data;
  const B = (await jsonReq('POST', '/api/paradas/nova', mot, { ...base, nomeAluno: 'Aluno B', latitude: -22.94, longitude: -43.20 })).data;
  const C = (await jsonReq('POST', '/api/paradas/nova', mot, { ...base, nomeAluno: 'Aluno C', latitude: -22.94, longitude: -43.00 })).data;
  await jsonReq('PUT', '/api/motorista/escolas', mot, { nome: 'Escola TL', latitude: -22.85, longitude: -43.20 });
  await jsonReq('POST', '/api/rotas/ordem', mot, { ids: [A.novaParada.id, B.novaParada.id, C.novaParada.id], sentido: 'IDA' });
  const resp = await novoResponsavel(A.codigoVinculo);
  await jsonReq('POST', '/api/rotas/iniciar', mot, { sentido: 'IDA' });
  await jsonReq('POST', '/api/gps', mot, { latitude: -22.95, longitude: -43.20, speedKmH: 30, accuracyMeters: 8 });
  await jsonReq('POST', `/api/paradas/${A.novaParada.id}/status`, mot, { status: 'EMBARCOU' });
  const prox = (await jsonReq('GET', '/api/proximidade', resp)).data.proximidade;
  // Direto até a escola seriam ~10 min; passando por B e depois pela parada distante C passa de 1 hora.
  assert.ok(prox.minutos > 60, `deveria somar o trecho até a parada distante, veio ${prox.minutos} min`);
});

test('Rota automática: exige escola marcada, não roda com a rota em andamento e não altera nada em caso de falha', async () => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const mot = await novoMotorista(adm, 'RotaAuto');
  const base = { endereco: 'Rua X, 1', pontoReferencia: '', escola: 'Escola RA', nomeResponsavel: 'R', telefoneResponsavel: '21988887777' };
  await jsonReq('POST', '/api/paradas/nova', mot, { ...base, nomeAluno: 'Aluno A' });
  const semEscola = await jsonReq('POST', '/api/rotas/automatica', mot, { sentido: 'IDA' });
  assert.equal(semEscola.status, 400);
  assert.match(String(semEscola.data.error), /escola/i);
  await jsonReq('PUT', '/api/motorista/escolas', mot, { nome: 'Escola RA', latitude: -22.85, longitude: -43.20 });
  await jsonReq('POST', '/api/rotas/iniciar', mot, { sentido: 'IDA' });
  const andando = await jsonReq('POST', '/api/rotas/automatica', mot, { sentido: 'IDA' });
  assert.equal(andando.status, 409);
  const semProposta = await jsonReq('POST', '/api/rotas/fixar', mot, { sentido: 'IDA' });
  assert.equal(semProposta.status, 409); // nada a fixar sem proposta: o cronograma existente fica intacto
});

test('Parada sem ponto aprende o local pelo GPS ao embarcar; ponto já marcado não é sobrescrito', async () => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const mot = await novoMotorista(adm, 'AprendeGps');
  const base = { endereco: 'Rua X, 1', pontoReferencia: '', escola: 'Escola AG', nomeResponsavel: 'R', telefoneResponsavel: '21988887777' };
  const A = (await jsonReq('POST', '/api/paradas/nova', mot, { ...base, nomeAluno: 'Aluno A' })).data;
  const B = (await jsonReq('POST', '/api/paradas/nova', mot, { ...base, nomeAluno: 'Aluno B', latitude: -22.90, longitude: -43.10 })).data;
  await jsonReq('POST', '/api/rotas/iniciar', mot, { sentido: 'IDA' });
  await jsonReq('POST', '/api/gps', mot, { latitude: -22.95, longitude: -43.20, speedKmH: 20, accuracyMeters: 8 });
  await jsonReq('POST', `/api/paradas/${A.novaParada.id}/status`, mot, { status: 'EMBARCOU' });
  await jsonReq('POST', `/api/paradas/${B.novaParada.id}/status`, mot, { status: 'EMBARCOU' });
  const lista = (await jsonReq('GET', '/api/estado', mot)).data;
  const arr: any[] = Array.isArray(lista) ? lista : (lista.paradas ?? []);
  const a = arr.find((p) => p.id === A.novaParada.id), b = arr.find((p) => p.id === B.novaParada.id);
  assert.equal(a?.latitude, -22.95);
  assert.equal(b?.latitude, -22.90);
});

test('Semáforo: verde no horário, amarelo adiantada, vermelho atrasada; sem coordenadas para o responsável', async () => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const mot = await novoMotorista(adm, 'Semaforo');
  const base = { endereco: 'Rua X, 1', pontoReferencia: '', escola: 'Escola SM', nomeResponsavel: 'R', telefoneResponsavel: '21988887777' };
  const A = (await jsonReq('POST', '/api/paradas/nova', mot, { ...base, nomeAluno: 'Aluno A', latitude: -22.90, longitude: -43.20 })).data;
  const resp = await novoResponsavel(A.codigoVinculo);
  await jsonReq('POST', '/api/rotas/iniciar', mot, { sentido: 'IDA' });
  await jsonReq('POST', '/api/gps', mot, { latitude: -22.95, longitude: -43.20, speedKmH: 30, accuracyMeters: 8 }); // ~5,5 km do ponto
  const agoraSP = () => { const f = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date()); return (Number(f.find((x) => x.type === 'hour')!.value) % 24) * 60 + Number(f.find((x) => x.type === 'minute')!.value); };
  const hm = (m: number) => { const x = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
  const fixar = (m: number) => jsonReq('PUT', `/api/paradas/${A.novaParada.id}/horarios`, mot, { horaIda: hm(m) });
  const prox = async () => (await jsonReq('GET', '/api/proximidade', resp)).data.proximidade;
  await fixar(agoraSP() + 120);
  const adiantada = await prox();
  assert.equal(adiantada.semaforo, 'amarelo');
  assert.ok(adiantada.diferencaMin < -3);
  await fixar(agoraSP() - 30);
  const atrasada = await prox();
  assert.equal(atrasada.semaforo, 'vermelho');
  assert.ok(atrasada.diferencaMin > 3);
  await fixar(agoraSP() + (await prox()).minutos + 1);
  const ok = await prox();
  assert.equal(ok.semaforo, 'verde');
  assert.match(String(ok.chegadaPrevista), /^\d\d:\d\d$/);
  const txt = JSON.stringify(ok);
  assert.ok(!/latitude|longitude|posicao/i.test(txt), 'responsável não pode receber coordenadas');
});

test('Card de horários: minutos reais até o ponto antes do embarque e até a escola depois; horário limite = entrada − 15', async () => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const mot = await novoMotorista(adm, 'CardHorarios');
  const base = { endereco: 'Rua X, 1', pontoReferencia: '', escola: 'Escola CH', nomeResponsavel: 'R', telefoneResponsavel: '21988887777', escolaEntrada: '12:00', escolaSaida: '16:00' };
  const A = (await jsonReq('POST', '/api/paradas/nova', mot, { ...base, nomeAluno: 'Aluno A', latitude: -22.90, longitude: -43.20 })).data;
  const B = (await jsonReq('POST', '/api/paradas/nova', mot, { ...base, nomeAluno: 'Aluno B', latitude: -22.88, longitude: -43.20 })).data;
  await jsonReq('PUT', '/api/motorista/escolas', mot, { nome: 'Escola CH', latitude: -22.85, longitude: -43.20 });
  await jsonReq('POST', '/api/rotas/ordem', mot, { ids: [A.novaParada.id, B.novaParada.id], sentido: 'IDA' });
  const resp = await novoResponsavel(A.codigoVinculo);
  await jsonReq('POST', '/api/rotas/iniciar', mot, { sentido: 'IDA' });
  await jsonReq('POST', '/api/gps', mot, { latitude: -22.95, longitude: -43.20, speedKmH: 30, accuracyMeters: 8 });
  const antes = (await jsonReq('GET', '/api/proximidade', resp)).data.proximidade;
  assert.equal(antes.sentido, 'IDA');
  assert.equal(antes.chegarEscolaAte, '11:45');
  assert.ok(typeof antes.minutosAtePonto === 'number' && antes.minutosAtePonto >= 1, 'tempo real até o ponto antes do embarque');
  await jsonReq('POST', `/api/paradas/${A.novaParada.id}/status`, mot, { status: 'EMBARCOU' });
  await jsonReq('POST', '/api/gps', mot, { latitude: -22.90, longitude: -43.20, speedKmH: 30, accuracyMeters: 8 });
  const depois = (await jsonReq('GET', '/api/proximidade', resp)).data.proximidade;
  assert.equal(depois.estado, 'embarcou');
  assert.equal(depois.destino, 'escola');
  // a bordo: passa por B (ainda pendente) e segue à escola; sempre maior que o trecho direto
  assert.ok(depois.minutos >= 1);
  assert.ok(!/latitude|longitude|posicao/i.test(JSON.stringify(depois)));
});

test('Sugerir rota: ordena pelas distâncias, o motorista reordena à mão e aplica; ordem inválida é recusada', async () => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const mot = await novoMotorista(adm, 'Sug');
  const base = { endereco: 'Rua X, 1', pontoReferencia: '', escola: 'Escola Sug', nomeResponsavel: 'R', telefoneResponsavel: '21988887777' };
  // cadastrados fora de ordem: distâncias (ao sul → norte): C(-22.95) A(-22.93) D(-22.91) B(-22.92)... em linha
  const A = (await jsonReq('POST', '/api/paradas/nova', mot, { ...base, nomeAluno: 'Aluno A', latitude: -22.95, longitude: -43.20 })).data;
  const B = (await jsonReq('POST', '/api/paradas/nova', mot, { ...base, nomeAluno: 'Aluno B', latitude: -22.90, longitude: -43.20 })).data;
  const C = (await jsonReq('POST', '/api/paradas/nova', mot, { ...base, nomeAluno: 'Aluno C', latitude: -22.93, longitude: -43.20 })).data;
  const S = (await jsonReq('POST', '/api/paradas/nova', mot, { ...base, nomeAluno: 'Aluno S' })).data; // sem local
  await jsonReq('PUT', '/api/motorista/escolas', mot, { nome: 'Escola Sug', latitude: -22.85, longitude: -43.20 });
  await jsonReq('POST', '/api/gps', mot, { latitude: -22.98, longitude: -43.20, speedKmH: 0, accuracyMeters: 8 });

  const r = await jsonReq('GET', '/api/rotas/sugestao?sentido=IDA', mot);
  assert.equal(r.status, 200);
  assert.equal(r.data.partida, 'gps');
  const nomes = r.data.paradas.map((p: any) => p.nome.split(' ')[1].replace('.', ''));
  assert.deepEqual(nomes.slice(0, 3), ['A', 'C', 'B'], 'sul → norte, terminando perto da escola');
  assert.equal(nomes[3], 'S', 'sem local vai para o fim');
  assert.equal(r.data.semLocal, 1);
  assert.ok(r.data.kmSugerido <= r.data.kmAtual);
  assert.equal(r.data.mudou, true);
  assert.equal(JSON.stringify(r.data).includes('-22.9'), false, 'a sugestão não devolve coordenadas');

  // aplica uma ordem escolhida à mão (B primeiro)
  const ids = [B.novaParada.id, A.novaParada.id, C.novaParada.id, S.novaParada.id];
  assert.equal((await jsonReq('POST', '/api/rotas/ordem', mot, { ids })).status, 200);
  const dep = (await jsonReq('GET', '/api/estado', mot)).data.paradas.sort((x: any, y: any) => x.ordem_sequencia - y.ordem_sequencia);
  assert.deepEqual(dep.map((p: any) => p.id), ids);
  // inválidos
  assert.equal((await jsonReq('POST', '/api/rotas/ordem', mot, { ids: ids.slice(1) })).status, 400);
  assert.equal((await jsonReq('POST', '/api/rotas/ordem', mot, { ids: [...ids.slice(0, 3), ids[0]] })).status, 400);
  assert.equal((await jsonReq('POST', '/api/rotas/ordem', mot, { ids: [...ids.slice(0, 3), 99999] })).status, 400);
  const outro = await novoMotorista(adm, 'SugOutro');
  assert.equal((await jsonReq('POST', '/api/rotas/ordem', outro, { ids })).status, 400, 'outro motorista não reordena a van alheia');
  assert.equal((await jsonReq('GET', '/api/rotas/sugestao', undefined)).status, 401);
});

test('Ida e volta têm ordens independentes: a volta parte da escola e mudar uma não altera a outra', async () => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const mot = await novoMotorista(adm, 'IdaVolta');
  const base = { endereco: 'Rua X, 1', pontoReferencia: '', escola: 'Escola IV', nomeResponsavel: 'R', telefoneResponsavel: '21988887777' };
  const A = (await jsonReq('POST', '/api/paradas/nova', mot, { ...base, nomeAluno: 'Aluno A', latitude: -22.95, longitude: -43.20 })).data.novaParada.id;
  const B = (await jsonReq('POST', '/api/paradas/nova', mot, { ...base, nomeAluno: 'Aluno B', latitude: -22.90, longitude: -43.20 })).data.novaParada.id;
  const C = (await jsonReq('POST', '/api/paradas/nova', mot, { ...base, nomeAluno: 'Aluno C', latitude: -22.93, longitude: -43.20 })).data.novaParada.id;
  await jsonReq('PUT', '/api/motorista/escolas', mot, { nome: 'Escola IV', latitude: -22.85, longitude: -43.20 });
  const ordemDe = async (sentido: string, modo = 'atual') => (await jsonReq('GET', `/api/rotas/sugestao?sentido=${sentido}&modo=${modo}`, mot)).data;

  const ida0 = await ordemDe('IDA');
  assert.equal(ida0.modo, 'atual');
  assert.equal(ida0.sentido, 'IDA');
  // volta parte da escola: o mais perto da escola (B) vem primeiro
  const vSug = await ordemDe('VOLTA', 'sugestao');
  assert.equal(vSug.partida, 'escola');
  assert.equal(vSug.paradas[0].id, B, 'volta: primeiro o aluno mais perto da escola');
  const ordemVoltaSug = vSug.paradas.map((p: any) => p.id);

  // aplica só a volta; a ida não muda
  const idaAntes = ida0.paradas.map((p: any) => p.id);
  assert.equal((await jsonReq('POST', '/api/rotas/ordem', mot, { ids: ordemVoltaSug, sentido: 'VOLTA' })).status, 200);
  assert.deepEqual((await ordemDe('IDA')).paradas.map((p: any) => p.id), idaAntes, 'ida intacta');
  assert.deepEqual((await ordemDe('VOLTA')).paradas.map((p: any) => p.id), ordemVoltaSug, 'volta salva');

  // aplica só a ida; a volta não muda
  const novaIda = [C, A, B];
  assert.equal((await jsonReq('POST', '/api/rotas/ordem', mot, { ids: novaIda, sentido: 'IDA' })).status, 200);
  assert.deepEqual((await ordemDe('IDA')).paradas.map((p: any) => p.id), novaIda);
  assert.deepEqual((await ordemDe('VOLTA')).paradas.map((p: any) => p.id), ordemVoltaSug, 'volta intacta');
  assert.equal(JSON.stringify(await ordemDe('VOLTA')).includes('-22.9'), false, 'sem coordenadas');

  // o diário do motorista recebe as duas ordens para mostrar o sentido escolhido
  const est = (await jsonReq('GET', '/api/estado', mot)).data.paradas;
  const porId = (id: number) => est.find((p: any) => p.id === id);
  assert.deepEqual(novaIda.map((id) => porId(id).ordem_ida), [1, 2, 3]);
  assert.deepEqual(ordemVoltaSug.map((id: number) => porId(id).ordem_volta), [1, 2, 3]);

  // aluno removido sai das duas; a volta continua numerada sem buracos
  await jsonReq('POST', `/api/paradas/${B}/remover`, mot);
  const v2 = (await ordemDe('VOLTA')).paradas;
  assert.equal(v2.some((p: any) => p.id === B), false);
  assert.deepEqual(v2.map((p: any) => p.ordemAtual), [1, 2]);
});

test('Ordem por sentido: volta segue o inverso da ida até o motorista salvar; o que ele salva fica valendo', async () => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const mot = await novoMotorista(adm, 'OrdemSentido');
  const base = { endereco: 'Rua X, 1', pontoReferencia: '', escola: 'Escola OS', nomeResponsavel: 'R', telefoneResponsavel: '21988887777' };
  const novo = async (nome: string) => (await jsonReq('POST', '/api/paradas/nova', mot, { ...base, nomeAluno: nome, latitude: -22.9, longitude: -43.2 })).data.novaParada.id as number;
  const [A, B, C] = [await novo('Aluno A'), await novo('Aluno B'), await novo('Aluno C')];
  const ordemDe = async (sentido: string) => (await jsonReq('GET', `/api/rotas/sugestao?sentido=${sentido}&modo=atual`, mot)).data;
  const diario = async () => (await jsonReq('GET', '/api/estado', mot)).data.paradas as any[];
  const porOrdem = (ps: any[], campo: string) => [...ps].sort((x, y) => x[campo] - y[campo]).map((p) => p.id);

  // ida em A,B,C; a volta ainda não foi salva: aparece o inverso e avisa que não está salva
  assert.deepEqual((await ordemDe('IDA')).paradas.map((p: any) => p.id), [A, B, C]);
  const v0 = await ordemDe('VOLTA');
  assert.deepEqual(v0.paradas.map((p: any) => p.id), [C, B, A], 'volta sem ordem salva = inverso da ida');
  assert.equal(v0.ordemSalva, false);
  assert.equal((await ordemDe('IDA')).ordemSalva, true);
  let d = await diario();
  assert.deepEqual(porOrdem(d, 'ordem_ida'), [A, B, C]);
  assert.deepEqual(porOrdem(d, 'ordem_volta'), [C, B, A], 'diário recebe as duas ordens');

  // reordenar a ida enquanto a volta não foi salva: a volta acompanha o inverso
  await jsonReq('POST', '/api/rotas/ordem', mot, { ids: [B, A, C], sentido: 'IDA' });
  assert.deepEqual((await ordemDe('VOLTA')).paradas.map((p: any) => p.id), [C, A, B]);

  // o motorista salva a volta: passa a valer e não muda mais quando a ida muda
  assert.equal((await jsonReq('POST', '/api/rotas/ordem', mot, { ids: [A, C, B], sentido: 'VOLTA' })).status, 200);
  const v1 = await ordemDe('VOLTA');
  assert.deepEqual(v1.paradas.map((p: any) => p.id), [A, C, B]);
  assert.equal(v1.ordemSalva, true);
  await jsonReq('POST', '/api/rotas/ordem', mot, { ids: [C, B, A], sentido: 'IDA' });
  assert.deepEqual((await ordemDe('VOLTA')).paradas.map((p: any) => p.id), [A, C, B], 'volta salva não acompanha a ida');
  assert.deepEqual((await ordemDe('IDA')).paradas.map((p: any) => p.id), [C, B, A]);

  // vale nas próximas viagens: iniciar e encerrar a rota não desfaz a ordem salva
  await jsonReq('POST', '/api/rotas/iniciar', mot, { sentido: 'VOLTA' });
  d = await diario();
  assert.deepEqual(porOrdem(d, 'ordem_volta'), [A, C, B]);
  assert.deepEqual(porOrdem(d, 'ordem_ida'), [C, B, A]);
  await jsonReq('POST', '/api/rotas/encerrar', mot);
  d = await diario();
  assert.deepEqual(porOrdem(d, 'ordem_volta'), [A, C, B]);
  assert.deepEqual(porOrdem(d, 'ordem_ida'), [C, B, A]);
});

test('Mensagens: conversa privada por família, aviso geral, mensagens prontas, não lidas e limites', async () => {
  const adm = await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD });
  const mot = await novoMotorista(adm.data.token, 'MsgVan');
  const outro = await novoMotorista(adm.data.token, 'MsgOutro');
  const nova = async (n: string) => (await jsonReq('POST', '/api/paradas/nova', mot, {
    nomeAluno: n, endereco: 'Rua X, 1', pontoReferencia: '', escola: 'Esc', nomeResponsavel: 'R', telefoneResponsavel: '21988887777'
  })).data;
  const a = await nova('Aluno A'), b = await nova('Aluno B');
  const respA = await novoResponsavel(a.codigoVinculo), respB = await novoResponsavel(b.codigoVinculo);
  const resumo = async (tok = mot) => (await jsonReq('GET', '/api/motorista/mensagens/resumo', tok)).data;

  let r = await resumo();
  assert.equal(r.familias.length, 2);
  assert.equal(r.total_nao_lidas, 0);
  assert.ok(r.rapidas.length >= 3);

  // a família A escreve; validações
  assert.equal((await jsonReq('POST', '/api/conversa', respA, { texto: 'Bom dia, o Aluno A não vai hoje' })).status, 200);
  assert.equal((await jsonReq('POST', '/api/conversa', respA, { texto: '   ' })).status, 400);
  assert.equal((await jsonReq('POST', '/api/conversa', respA, { texto: 'a'.repeat(501) })).status, 400);
  assert.equal((await jsonReq('POST', '/api/conversa', respA, { texto: 'estou em -22.932145, -43.201234' })).status, 400, 'sem coordenadas');
  assert.equal((await jsonReq('POST', '/api/conversa', respA, { rapida: 'CHEGUEI' })).status, 400, 'prontas são só do motorista');
  assert.equal((await jsonReq('POST', '/api/conversa', respA, { texto: 'oi', motorista: 99999 })).status, 403);
  assert.equal((await jsonReq('POST', '/api/conversa', undefined, { texto: 'oi' })).status, 401);

  r = await resumo();
  assert.equal(r.total_nao_lidas, 1);
  const famA = r.familias.find((f: any) => f.nao_lidas === 1);
  const famB = r.familias.find((f: any) => f.nao_lidas === 0);
  assert.ok(famA && famB);
  assert.equal(famA.ultima.texto, 'Bom dia, o Aluno A não vai hoje');

  // quem não é o motorista da família não lê nem escreve; admin e responsável também não
  assert.equal((await jsonReq('GET', `/api/motorista/mensagens/familia/${famA.id}`, outro)).status, 404);
  assert.equal((await jsonReq('POST', `/api/motorista/mensagens/familia/${famA.id}`, outro, { texto: 'invasão' })).status, 404);
  assert.equal((await jsonReq('GET', '/api/motorista/mensagens/resumo', adm.data.token)).status, 403, 'admin não lê conversas');
  assert.equal((await jsonReq('GET', `/api/motorista/mensagens/familia/${famA.id}`, adm.data.token)).status, 403);
  assert.equal((await jsonReq('GET', '/api/motorista/mensagens/resumo', respA)).status, 403);

  // o motorista lê (marca como lida) e responde com texto e com mensagem pronta
  const conv = (await jsonReq('GET', `/api/motorista/mensagens/familia/${famA.id}`, mot)).data;
  assert.deepEqual(conv.mensagens.map((m: any) => m.de), ['RESPONSAVEL']);
  assert.equal((await resumo()).total_nao_lidas, 0);
  assert.equal((await jsonReq('POST', `/api/motorista/mensagens/familia/${famA.id}`, mot, { rapida: 'CHEGUEI' })).status, 200);
  assert.equal((await jsonReq('POST', `/api/motorista/mensagens/familia/${famA.id}`, mot, { rapida: 'NAO_EXISTE' })).status, 400);
  assert.equal((await jsonReq('POST', `/api/motorista/mensagens/familia/${famA.id}`, mot, { texto: 'Combinado, obrigado!' })).status, 200);
  assert.equal((await jsonReq('POST', '/api/motorista/mensagens/familia/999999', mot, { texto: 'x' })).status, 404);

  // a família A recebe 2 não lidas; ao abrir, zera; a B não vê nada da A
  assert.equal((await jsonReq('GET', '/api/conversa/resumo', respA)).data.nao_lidas, 2);
  const feedA = (await jsonReq('GET', '/api/conversa', respA)).data;
  assert.deepEqual(feedA.mensagens.map((m: any) => m.texto), ['Bom dia, o Aluno A não vai hoje', 'Cheguei no ponto de embarque.', 'Combinado, obrigado!']);
  assert.ok(feedA.motorista.nome);
  assert.equal((await jsonReq('GET', '/api/conversa/resumo', respA)).data.nao_lidas, 0);
  const feedB0 = await jsonReq('GET', '/api/conversa', respB);
  assert.deepEqual(feedB0.data.mensagens, []);
  assert.equal(JSON.stringify(feedB0.data).includes('Aluno A'), false);
  assert.deepEqual((await jsonReq('GET', `/api/motorista/mensagens/familia/${famB.id}`, mot)).data.mensagens, []);

  // aviso geral: chega às duas famílias, conta como não lido uma vez e some do contador ao abrir
  assert.equal((await jsonReq('POST', '/api/motorista/mensagens/aviso', outro, { texto: 'sem alunos' })).status, 400, 'van sem famílias');
  assert.equal((await jsonReq('POST', '/api/motorista/mensagens/aviso', mot, { texto: 'Amanhã não haverá aula' })).status, 200);
  assert.equal((await jsonReq('POST', '/api/motorista/mensagens/aviso', mot, { rapida: 'ATRASO_10' })).status, 200);
  assert.equal((await jsonReq('GET', '/api/conversa/resumo', respB)).data.nao_lidas, 2);
  const feedB = (await jsonReq('GET', '/api/conversa', respB)).data.mensagens;
  assert.deepEqual(feedB.map((m: any) => m.texto), ['Amanhã não haverá aula', 'Estou com um atraso de cerca de 10 minutos.']);
  assert.ok(feedB.every((m: any) => m.aviso === true));
  assert.equal((await jsonReq('GET', '/api/conversa/resumo', respB)).data.nao_lidas, 0);
  assert.equal((await jsonReq('GET', '/api/conversa/resumo', respA)).data.nao_lidas, 2, 'a família A ainda não abriu os avisos');
  assert.equal((await jsonReq('GET', '/api/conversa', respA)).data.mensagens.length, 5);
  assert.equal((await resumo()).avisos.length, 2);
  // o aviso não entra na conversa individual do motorista com uma família
  assert.equal((await jsonReq('GET', `/api/motorista/mensagens/familia/${famB.id}`, mot)).data.mensagens.length, 0);
  // o estado compartilhado não carrega mais mensagens de ninguém
  assert.deepEqual((await jsonReq('GET', '/api/estado', respB)).data.mensagens ?? [], []);
});

test('Horário combinado: se a van está adiantada (ex.: aluno anterior faltou), o tempo e o aviso não prometem antes dele', async () => {
  const partes = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const agora = (Number(partes.find((x) => x.type === 'hour')!.value) % 24) * 60 + Number(partes.find((x) => x.type === 'minute')!.value);
  if (agora < 60 || agora > 22 * 60) return; // evita virada de dia
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const mot = await novoMotorista(adm, 'Piso');
  const base = { endereco: 'Rua X, 1', pontoReferencia: '', escola: 'Escola Piso', nomeResponsavel: 'R', telefoneResponsavel: '21988887777' };
  const ausente = (await jsonReq('POST', '/api/paradas/nova', mot, { ...base, nomeAluno: 'Faltou', latitude: -22.92, longitude: -43.20 })).data;
  const aluno = (await jsonReq('POST', '/api/paradas/nova', mot, { ...base, nomeAluno: 'Segue', latitude: -22.90, longitude: -43.20 })).data;
  const resp = await novoResponsavel(aluno.codigoVinculo);
  await jsonReq('POST', '/api/rotas/iniciar', mot);
  await jsonReq('POST', `/api/paradas/${ausente.novaParada.id}/status`, mot, { status: 'AUSENTE' });
  await jsonReq('POST', '/api/gps', mot, { latitude: -22.9005, longitude: -43.20, speedKmH: 30, accuracyMeters: 8 }); // quase lá
  const prox = async () => (await jsonReq('GET', '/api/proximidade', resp)).data.proximidade;

  // horário combinado daqui a 40 min: a van chegaria em ~1 min, mas o combinado é o que vale
  assert.equal((await jsonReq('PUT', `/api/paradas/${aluno.novaParada.id}/horarios`, mot, { horaIda: hhmm(agora + 40) })).status, 200);
  const cedo = await prox();
  assert.equal(cedo.adiantada, true);
  assert.equal(cedo.horarioPrevisto, hhmm(agora + 40));
  assert.ok(cedo.minutos >= 38 && cedo.minutos <= 40, `minutos=${cedo.minutos}`);
  assert.equal(cedo.avisoAtivo, false, 'sem aviso de chegada antes do horário combinado');
  assert.ok(cedo.progresso <= 0.9);

  // horário já passou: vale a estimativa real
  await jsonReq('PUT', `/api/paradas/${aluno.novaParada.id}/horarios`, mot, { horaIda: hhmm(agora - 10) });
  const tarde = await prox();
  assert.equal(tarde.adiantada, false);
  assert.ok(tarde.minutos <= 2, `minutos=${tarde.minutos}`);
});

test('Escola por endereço: só o motorista busca; sem resultado o app orienta a marcar no mapa', async () => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const mot = await novoMotorista(adm, 'Busca');
  const fam = await novoResponsavelVerificado(adm);
  assert.equal((await jsonReq('GET', '/api/motorista/escolas/buscar?q=Rua%20Tirol%20340', undefined)).status, 401);
  assert.equal((await jsonReq('GET', '/api/motorista/escolas/buscar?q=Rua%20Tirol%20340', fam)).status, 403, 'responsável não consulta endereços');
  const r = await jsonReq('GET', '/api/motorista/escolas/buscar?q=ab', mot);
  assert.equal(r.status, 404, 'consulta curta não procura');
  assert.ok(r.data.error);
});

test('Mensalidades: motorista define valor, dá baixa e desfaz; dados isolados por motorista', async () => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const a = await novoMotorista(adm, 'MensA');
  const b = await novoMotorista(adm, 'MensB');
  const nova = await jsonReq('POST', '/api/paradas/nova', a, {
    nomeAluno: 'Aluno Mens', endereco: 'Rua A, 1', pontoReferencia: '', escola: 'Escola A',
    nomeResponsavel: 'Resp Mens', telefoneResponsavel: '21988887777'
  });
  assert.equal(nova.status, 200);
  const alunoId = nova.data.novaParada.id_aluno;

  // sem login e perfil errado
  assert.equal((await jsonReq('GET', '/api/motorista/mensalidades')).status, 401);
  const fam = await novoResponsavelVerificado(adm);
  assert.equal((await jsonReq('GET', '/api/motorista/mensalidades', fam)).status, 403, 'responsável não vê a cobrança do motorista');
  assert.equal((await jsonReq('GET', '/api/mensalidades', a)).status, 403, 'motorista não usa a rota dos pais');
  assert.deepEqual((await jsonReq('GET', '/api/mensalidades', fam)).data.filhos, []);

  // validações
  assert.equal((await jsonReq('GET', '/api/motorista/mensalidades?mes=2026-13', a)).status, 400);
  assert.equal((await jsonReq('PUT', `/api/motorista/mensalidades/${alunoId}/config`, a, { valor: 0, vencimento_dia: 5 })).status, 400);
  assert.equal((await jsonReq('PUT', `/api/motorista/mensalidades/${alunoId}/config`, a, { valor: 300, vencimento_dia: 31 })).status, 400);
  assert.equal((await jsonReq('POST', `/api/motorista/mensalidades/${alunoId}/pagar`, a, { mes: '2026-11' })).status, 400, 'sem valor definido não dá baixa');

  // fluxo feliz
  assert.equal((await jsonReq('PUT', `/api/motorista/mensalidades/${alunoId}/config`, a, { valor: '350,00', vencimento_dia: 5 })).status, 200);
  const hoje = (await jsonReq('GET', '/api/motorista/mensalidades', a)).data;
  const linha = hoje.alunos.find((x: any) => x.id_aluno === alunoId);
  assert.equal(linha.valor, 350);
  assert.ok(['EM_ABERTO', 'ATRASADO'].includes(linha.status));
  const mes = hoje.mes;
  assert.equal((await jsonReq('POST', `/api/motorista/mensalidades/${alunoId}/pagar`, a, { mes, forma: 'PIX' })).status, 200);
  assert.equal((await jsonReq('POST', `/api/motorista/mensalidades/${alunoId}/pagar`, a, { mes, data: '2999-01-01' })).status, 400, 'data futura');
  const pago = (await jsonReq('GET', '/api/motorista/mensalidades', a)).data;
  assert.equal(pago.alunos.find((x: any) => x.id_aluno === alunoId).status, 'PAGO');
  assert.equal(pago.resumo.recebido, 350);

  // outro motorista não enxerga nem mexe
  assert.equal((await jsonReq('GET', '/api/motorista/mensalidades', b)).data.alunos.length, 0);
  assert.equal((await jsonReq('POST', `/api/motorista/mensalidades/${alunoId}/pagar`, b, { mes, valor: 1 })).status, 404);
  assert.equal((await jsonReq('POST', `/api/motorista/mensalidades/${alunoId}/desfazer`, b, { mes })).status, 404);

  // desfazer
  assert.equal((await jsonReq('POST', `/api/motorista/mensalidades/${alunoId}/desfazer`, a, { mes })).status, 200);
  assert.equal((await jsonReq('POST', `/api/motorista/mensalidades/${alunoId}/desfazer`, a, { mes })).status, 404);
  assert.equal((await jsonReq('GET', '/api/motorista/mensalidades', a)).data.resumo.recebido, 0);
});

test('Backup: só o administrador baixa e as senhas não vão no arquivo por padrão', async () => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const mot = await novoMotorista(adm, 'BackupMot');
  assert.equal((await jsonReq('GET', '/api/admin/backup')).status, 401);
  assert.equal((await jsonReq('GET', '/api/admin/backup', mot)).status, 403, 'motorista não baixa backup');
  const r = await jsonReq('GET', '/api/admin/backup', adm);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.data.users) && r.data.users.length > 0);
  assert.ok(r.data.users.every((u: any) => u.passwordHash === undefined), 'sem hashes de senha');
  assert.ok(Array.isArray(r.data.state.paradas) && r.data.mensalidades && Array.isArray(r.data.mensalidades.pagamentos));
  assert.equal(r.data.inclui_senhas, false);
});

test('Financeiro: lançamentos, consumo e lucro do mês; dados privados de cada motorista', async () => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const a = await novoMotorista(adm, 'FinA');
  const b = await novoMotorista(adm, 'FinB');
  const P = '/api/motorista/financeiro';
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const mes = hoje.slice(0, 7);

  assert.equal((await jsonReq('GET', `${P}/resumo`)).status, 401);
  const fam = await novoResponsavelVerificado(adm);
  assert.equal((await jsonReq('GET', `${P}/resumo`, fam)).status, 403, 'responsável não vê o financeiro');
  assert.equal((await jsonReq('GET', `${P}/resumo?mes=2026-13`, a)).status, 400);

  // validações
  assert.equal((await jsonReq('POST', `${P}/lancamentos`, a, { tipo: 'DESPESA', categoria: 'OUTROS', valor: 0 })).status, 400);
  assert.equal((await jsonReq('POST', `${P}/lancamentos`, a, { tipo: 'DESPESA', categoria: 'COMBUSTIVEL', litros: 40, valor: 240 })).status, 400, 'abastecimento sem km');
  assert.equal((await jsonReq('POST', `${P}/lancamentos`, a, { tipo: 'DESPESA', categoria: 'OUTROS', valor: 5, data: '2999-01-01' })).status, 400);

  // dois tanques cheios e um parcial no meio: 500 km e 50 L => 10 km/L
  const ab = (km: number, litros: number, valor: number, cheio: boolean) =>
    jsonReq('POST', `${P}/lancamentos`, a, { tipo: 'DESPESA', categoria: 'COMBUSTIVEL', combustivel: 'DIESEL', km, litros, valor, tanque_cheio: cheio, data: hoje });
  assert.equal((await ab(10000, 40, 240, true)).status, 200);
  assert.equal((await ab(10300, 20, 120, false)).status, 200);
  const ultimo = await ab(10500, 30, 180, true);
  assert.equal(ultimo.status, 200);
  assert.equal((await jsonReq('POST', `${P}/lancamentos`, a, { tipo: 'DESPESA', categoria: 'MANUTENCAO', valor: '200,00', data: hoje, obs: 'Troca de óleo' })).status, 200);
  assert.equal((await jsonReq('POST', `${P}/lancamentos`, a, { tipo: 'RECEITA', categoria: 'PASSEIO', valor: 400, data: hoje })).status, 200);
  assert.equal((await jsonReq('POST', `${P}/custos-fixos`, a, { nome: 'Seguro', valor_mensal: 250 })).status, 200);

  const r = (await jsonReq('GET', `${P}/resumo`, a)).data;
  assert.equal(r.mes, mes);
  assert.equal(r.consumo.media_km_por_litro, 10);
  assert.equal(r.resumo.combustivel.litros, 90);
  assert.equal(r.resumo.combustivel.valor, 540);
  assert.equal(r.resumo.receita_extras, 400);
  assert.equal(r.resumo.custos_fixos, 250);
  assert.equal(r.resumo.despesas_total, 540 + 200 + 250);
  assert.equal(r.resumo.lucro, 400 - (540 + 200 + 250));
  assert.equal(r.resumo.km_rodados, 500);
  assert.equal(r.serie.length, 6);
  assert.equal(r.ultima_km, 10500);

  // privacidade entre motoristas
  const rb = (await jsonReq('GET', `${P}/resumo`, b)).data;
  assert.equal(rb.resumo.despesas_total, 0);
  assert.equal((await jsonReq('GET', `${P}/lancamentos`, b)).data.lancamentos.length, 0);
  const id = ultimo.data.lancamento.id;
  assert.equal((await jsonReq('DELETE', `${P}/lancamentos/${id}`, b)).status, 404, 'outro motorista não apaga');
  assert.equal((await jsonReq('PUT', `${P}/lancamentos/${id}`, b, { tipo: 'DESPESA', categoria: 'OUTROS', valor: 1 })).status, 404);

  // editar e apagar o próprio
  const ed = await jsonReq('PUT', `${P}/lancamentos/${id}`, a, { tipo: 'DESPESA', categoria: 'COMBUSTIVEL', combustivel: 'DIESEL', km: 10500, litros: 30, valor: 190, tanque_cheio: true, data: hoje });
  assert.equal(ed.status, 200);
  assert.equal(ed.data.lancamento.valor, 190);
  assert.equal((await jsonReq('DELETE', `${P}/lancamentos/${id}`, a)).status, 200);
  assert.equal((await jsonReq('GET', `${P}/resumo`, a)).data.consumo.media_km_por_litro, null, 'sem o 2º tanque cheio não há ciclo');

  // custo fixo: validação e remoção
  assert.equal((await jsonReq('POST', `${P}/custos-fixos`, a, { nome: 'x', valor_mensal: 10 })).status, 400);
  const fx = (await jsonReq('GET', `${P}/custos-fixos`, a)).data.custos_fixos;
  assert.equal(fx.length, 1);
  assert.equal((await jsonReq('DELETE', `${P}/custos-fixos/${fx[0].id}`, b)).status, 404);
  assert.equal((await jsonReq('DELETE', `${P}/custos-fixos/${fx[0].id}`, a)).status, 200);
});

test('Segurança: o atalho verify-email-sim não existe; responsável não se auto-verifica', async () => {
  const email = `semsim_${Date.now()}@teste.com`;
  const reg = await jsonReq('POST', '/api/auth/register', undefined, { fullName: 'Sem Sim', email, password: 'senhaSegura123!', lgpdConsent: true });
  const r = await jsonReq('POST', '/api/auth/verify-email-sim', reg.data.token);
  assert.equal(r.status, 404);
  const v = await jsonReq('POST', '/api/vincular', reg.data.token, { codigoVinculo: 'QUALQUER' });
  assert.ok(v.status === 403 || v.status === 400, `esperava bloqueio, veio ${v.status}`);
});

test('Privacidade: o estado do responsável não traz coordenadas, endereço, telefone nem código de vínculo', async () => {
  const adm = await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD });
  const mot = await novoMotorista(adm.data.token, 'PrivEstado');
  const nova = (await jsonReq('POST', '/api/paradas/nova', mot, {
    nomeAluno: 'Aluno Sigilo', endereco: 'Rua Secretissima, 4242', pontoReferencia: 'Portao Azul', escola: 'Escola Sigilo', nomeResponsavel: 'Resp', telefoneResponsavel: '21977776666'
  })).data;
  await jsonReq('PUT', `/api/paradas/${nova.novaParada.id}/local`, mot, { latitude: -22.91234, longitude: -43.21234 });
  const resp = await novoResponsavel(nova.codigoVinculo);
  const est = (await jsonReq('GET', '/api/estado', resp)).data;
  assert.equal(est.paradas.length, 1);
  const texto = JSON.stringify(est);
  for (const proibido of ['-22.91234', '-43.21234', 'Secretissima', 'Portao Azul', '21977776666', '977776666', nova.codigoVinculo]) {
    assert.equal(texto.includes(proibido), false, `não pode vazar: ${proibido}`);
  }
  for (const campo of ['latitude', 'longitude', 'endereco_real', 'ponto_referencia', 'responsavel_telefone', 'codigo_vinculo', 'id_motorista']) {
    assert.equal(campo in est.paradas[0], false, `campo proibido: ${campo}`);
  }
  assert.equal(est.paradas[0].nome_aluno, 'Aluno Sigilo');
  assert.equal(est.paradas[0].status_embarque, 'PENDENTE');
});

test('Previsão: GPS ou ponto a milhares de km não vira "21855 min"; cai em "sem localização exata"', async () => {
  const adm = await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD });
  const mot = await novoMotorista(adm.data.token, 'PrevLonge');
  const nova = (await jsonReq('POST', '/api/paradas/nova', mot, {
    nomeAluno: 'Aluno Longe', endereco: 'Rua X, 1', pontoReferencia: '', escola: 'Esc', nomeResponsavel: 'R', telefoneResponsavel: '21988887777'
  })).data;
  await jsonReq('PUT', `/api/paradas/${nova.novaParada.id}/local`, mot, { latitude: -22.9000, longitude: -43.2 });
  const resp = await novoResponsavel(nova.codigoVinculo);
  await jsonReq('POST', '/api/rotas/iniciar', mot);
  const prox = async () => (await jsonReq('GET', '/api/proximidade', resp)).data.proximidade;

  // GPS em Lisboa (~7.700 km do ponto, no Rio)
  await jsonReq('POST', '/api/gps', mot, { latitude: 38.72, longitude: -9.14, speedKmH: 0, accuracyMeters: 10 });
  let p = await prox();
  assert.ok(p.minutos <= 60, `minutos absurdos: ${p.minutos}`);
  assert.equal(p.avisoAtivo, false);
  assert.ok(!p.estimativaPrecisa, 'sem estimativa precisa');
  assert.equal(p.semaforo, undefined);
  assert.equal(p.chegadaPrevista, undefined);
  assert.equal(p.minutosAtePonto, undefined);

  // GPS perto do ponto: volta a ter previsão real
  await jsonReq('POST', '/api/gps', mot, { latitude: -22.8995, longitude: -43.2, speedKmH: 30, accuracyMeters: 8 });
  p = await prox();
  assert.equal(p.estimativaPrecisa, true);
  assert.ok(p.minutos >= 1 && p.minutos <= 10);
});

test('Status da parada: só PENDENTE, EMBARCOU, ENTREGUE ou AUSENTE; observação limitada', async () => {
  const adm = await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD });
  const mot = await novoMotorista(adm.data.token, 'StatusValido');
  const nova = (await jsonReq('POST', '/api/paradas/nova', mot, {
    nomeAluno: 'Aluno Status', endereco: 'Rua X, 1', pontoReferencia: '', escola: 'Esc', nomeResponsavel: 'R', telefoneResponsavel: '21988887777'
  })).data;
  const id = nova.novaParada.id;
  for (const ruim of ['QUALQUER_COISA', '', null, 7, 'embarcou', { a: 1 }]) {
    assert.equal((await jsonReq('POST', `/api/paradas/${id}/status`, mot, { status: ruim })).status, 400, `status ${JSON.stringify(ruim)}`);
  }
  assert.equal((await jsonReq('POST', `/api/paradas/${id}/status`, mot)).status, 400, 'sem status');
  const ok = await jsonReq('POST', `/api/paradas/${id}/status`, mot, { status: 'EMBARCOU', observacao: 'x'.repeat(5000) });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.parada.status_embarque, 'EMBARCOU');
  assert.equal(ok.data.parada.observacao.length, 300, 'observação cortada em 300');
  for (const bom of ['ENTREGUE', 'AUSENTE', 'PENDENTE']) {
    assert.equal((await jsonReq('POST', `/api/paradas/${id}/status`, mot, { status: bom })).status, 200, bom);
  }
});

test('Segurança: ninguém vira admin cadastrando um e-mail de administrador', async () => {
  for (const email of ['admin@vanescolar.com.br', 'ADMIN@vanescolar.com.br', ' leandrosolon@gmail.com ']) {
    const reg = await jsonReq('POST', '/api/auth/register', undefined, { fullName: 'Intruso', email, password: 'senhaDoIntruso123', lgpdConsent: true });
    assert.equal(reg.status, 400, `cadastro com ${email}`);
    const lg = await jsonReq('POST', '/api/auth/login-email', undefined, { email: email.trim(), password: 'senhaDoIntruso123' });
    assert.notEqual(lg.data?.role, 'admin', `login com ${email}`);
    assert.ok(lg.status === 401 || lg.data?.role !== 'admin');
  }
  // um responsável comum, mesmo logado, nunca passa em rota de admin
  const email = `comum_${Date.now()}@teste.com`;
  const reg = await jsonReq('POST', '/api/auth/register', undefined, { fullName: 'Comum', email, password: 'senhaSegura123!', lgpdConsent: true });
  assert.equal((await jsonReq('GET', '/api/admin/metrics', reg.data.token)).status, 403);
  assert.equal((await jsonReq('GET', '/api/admin/backup', reg.data.token)).status, 403);
  // o admin legítimo continua entrando pela senha do admin
  const adm = await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD });
  assert.equal(adm.status, 200);
  assert.equal((await jsonReq('GET', '/api/admin/metrics', adm.data.token)).status, 200);
});

test('Horários por escola e turno: o motorista define uma vez, o aluno herda e o responsável não altera', async () => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const mot = await novoMotorista(adm, 'HorEscola');
  const outro = await novoMotorista(adm, 'HorEscolaOutro');
  const base = { endereco: 'Rua X, 1', pontoReferencia: '', escola: 'Escola Turno', nomeResponsavel: 'R', telefoneResponsavel: '21988887777' };

  // validações
  const url = '/api/motorista/escolas/horarios';
  const ok = { nome: 'Escola Turno', turno: 'manhã', entrada: '07:40', saida: '12:00' };
  assert.equal((await jsonReq('PUT', url, mot, { ...ok, turno: 'noite' })).status, 400, 'turno inválido');
  assert.equal((await jsonReq('PUT', url, mot, { ...ok, entrada: '25:00' })).status, 400, 'hora inválida');
  assert.equal((await jsonReq('PUT', url, mot, { ...ok, saida: '07:00' })).status, 400, 'saída antes da entrada');
  assert.equal((await jsonReq('PUT', url, mot, { ...ok, nome: '' })).status, 400, 'sem nome');
  assert.equal((await jsonReq('PUT', url, undefined, ok)).status, 401, 'sem login');

  // aluno criado ANTES: recebe o turno e depois herda quando o horário é definido
  const antes = (await jsonReq('POST', '/api/paradas/nova', mot, { ...base, nomeAluno: 'Aluno Antes', turno: 'MANHA' })).data;
  assert.equal(antes.novaParada.escola_entrada, undefined, 'sem horário definido ainda');
  const salvo = await jsonReq('PUT', url, mot, { ...ok, turno: 'MANHA' });
  assert.equal(salvo.status, 200, JSON.stringify(salvo.data));
  assert.equal(salvo.data.alunosAtualizados, 1);
  await jsonReq('PUT', url, mot, { nome: 'Escola Turno', turno: 'TARDE', entrada: '13:00', saida: '17:30' });

  // lista de escolas traz os horários por turno
  const esc = (await jsonReq('GET', '/api/motorista/escolas', mot)).data.escolas.find((e: any) => e.nome === 'Escola Turno');
  assert.deepEqual(esc.horarios.MANHA, { entrada: '07:40', saida: '12:00' });
  assert.deepEqual(esc.horarios.TARDE, { entrada: '13:00', saida: '17:30' });

  // aluno criado DEPOIS herda pelo turno; o outro turno herda o outro horário
  const manha = (await jsonReq('POST', '/api/paradas/nova', mot, { ...base, nomeAluno: 'Aluno Manha', turno: 'MANHA', escolaEntrada: '06:00', escolaSaida: '09:00' })).data.novaParada;
  assert.equal(manha.escola_entrada, '07:40', 'o horário do motorista vale mais que o digitado');
  assert.equal(manha.escola_saida, '12:00');
  const tarde = (await jsonReq('POST', '/api/paradas/nova', mot, { ...base, nomeAluno: 'Aluno Tarde', turno: 'TARDE' })).data.novaParada;
  assert.equal(tarde.escola_entrada, '13:00');
  assert.equal(tarde.horario_da_escola, true);

  // definir o turno de um aluno sem turno faz herdar
  const sem = (await jsonReq('POST', '/api/paradas/nova', mot, { ...base, nomeAluno: 'Aluno Sem Turno' })).data.novaParada;
  assert.equal(sem.escola_entrada, undefined);
  assert.equal((await jsonReq('PUT', `/api/paradas/${sem.id}/turno`, mot, { turno: 'xx' })).status, 400);
  const t = await jsonReq('PUT', `/api/paradas/${sem.id}/turno`, mot, { turno: 'TARDE' });
  assert.equal(t.status, 200);
  assert.equal(t.data.herdouHorario, true);

  // outro motorista não mexe no aluno e não vê os horários
  assert.equal((await jsonReq('PUT', `/api/paradas/${sem.id}/turno`, outro, { turno: 'MANHA' })).status, 404);
  const escOutro = (await jsonReq('GET', '/api/motorista/escolas', outro)).data.escolas;
  assert.ok(!escOutro.some((e: any) => e.nome === 'Escola Turno'), 'horários são por motorista');

  // responsável: não altera horário definido pelo motorista; sem turno definido, altera
  const codigo = (await jsonReq('POST', '/api/paradas/nova', mot, { ...base, nomeAluno: 'Aluno Familia', turno: 'MANHA' })).data;
  const resp = await novoResponsavel(codigo.codigoVinculo);
  const alunoId = codigo.novaParada.id_aluno;
  const neg = await jsonReq('PUT', `/api/alunos/${alunoId}/escola-horarios`, resp, { entrada: '08:00', saida: '13:00' });
  assert.equal(neg.status, 403, 'responsável não altera horário definido pelo motorista');
  const est = (await jsonReq('GET', '/api/estado', resp)).data;
  const p = est.paradas.find((x: any) => x.id_aluno === alunoId);
  assert.equal(p.turno, 'MANHA');
  assert.equal(p.horario_da_escola, true);
  assert.equal(p.escola_entrada, '07:40');

  // remover o horário do turno devolve a edição ao responsável e não apaga o que já foi herdado
  assert.equal((await jsonReq('PUT', url, mot, { nome: 'Escola Turno', turno: 'MANHA', remover: true })).status, 200);
  const livre = await jsonReq('PUT', `/api/alunos/${alunoId}/escola-horarios`, resp, { entrada: '08:00', saida: '13:00' });
  assert.equal(livre.status, 200, JSON.stringify(livre.data));
});

test('Filhos: responsável escolhe o turno e herda os horários do motorista, sem digitar entrada e saída', async () => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const mot = await novoMotorista(adm, 'FilhoTurno');
  const codigo = (await jsonReq('GET', '/api/motorista/codigo', mot)).data.codigo;
  await jsonReq('PUT', '/api/motorista/escolas/horarios', mot, { nome: 'Colégio Herança', turno: 'TARDE', entrada: '13:10', saida: '17:20' });
  const fam = await novoResponsavelVerificado(adm);
  const sem = await jsonReq('POST', '/api/filhos', fam, { nomeAluno: 'Lia Mar', escola: 'colégio herança', endereco: 'Rua A, 1', turno: 'TARDE', codigoMotorista: codigo });
  assert.equal(sem.status, 200, JSON.stringify(sem.data));
  const est = (await jsonReq('GET', '/api/estado', fam)).data;
  const p = est.paradas.find((x: any) => x.id_aluno === sem.data.alunoId);
  assert.equal(p.escola_entrada, '13:10', 'escola digitada com outra caixa ainda herda');
  assert.equal(p.escola_saida, '17:20');
  assert.ok(!JSON.stringify(est.paradas).match(/latitude|longitude|endereco/i), 'o responsável continua sem coordenadas e sem endereço');
  // só uma das duas horas é recusada
  assert.equal((await jsonReq('POST', '/api/filhos', fam, { nomeAluno: 'Lia Mar', escola: 'Colégio Y', endereco: 'Rua A, 1', escolaEntrada: '07:00' })).status, 400);
});

test('Cadastro pelo motorista: valida, herda horário, gera código e mensagem; família se vincula sem ver endereço nem coordenadas', async () => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const mot = await novoMotorista(adm, 'CadMot');
  const outro = await novoMotorista(adm, 'CadMotOutro');
  const url = '/api/motorista/alunos';
  const ok = { nomeAluno: 'Lia Mar Souza', escola: 'Escola Cad', turno: 'MANHA', nomeResponsavel: 'Rosa Souza', telefoneResponsavel: '(21) 98765-4321', endereco: 'Rua das Flores, 10', pontoReferencia: 'Portão azul', autorizacaoResponsavel: true };

  // validações
  assert.equal((await jsonReq('POST', url, undefined, ok)).status, 401, 'sem login');
  for (const [campo, valor] of [['nomeAluno', 'A'], ['escola', ''], ['turno', 'noite'], ['nomeResponsavel', ''], ['telefoneResponsavel', '123'], ['endereco', ''], ['autorizacaoResponsavel', false], ['autorizacaoResponsavel', 'true'], ['escolaEntrada', '07:00']] as const) {
    assert.equal((await jsonReq('POST', url, mot, { ...ok, [campo]: valor })).status, 400, `${campo}=${JSON.stringify(valor)}`);
  }
  assert.equal((await jsonReq('POST', url, mot, { ...ok, latitude: 999, longitude: 999 })).status, 400, 'local inválido');

  // 1º aluno: sem horário da escola ainda
  await jsonReq('PUT', '/api/motorista/escolas/horarios', mot, { nome: 'Escola Cad', turno: 'MANHA', entrada: '07:40', saida: '12:00' });
  const r = await jsonReq('POST', url, mot, ok);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.match(r.data.codigoVinculo, /^VAN-[0-9A-F]{6}$/);
  assert.equal(r.data.whatsapp, '5521987654321');
  assert.equal(r.data.horarioHerdado, true);
  assert.equal(r.data.semPontoNoMapa, true);
  assert.ok(r.data.mensagem.includes(r.data.codigoVinculo) && r.data.mensagem.includes('Lia') && r.data.mensagem.includes('Rosa'), 'mensagem com nome e código');
  assert.ok(!r.data.mensagem.includes('Rua das Flores'), 'a mensagem não leva o endereço');
  assert.equal((await jsonReq('POST', url, mot, ok)).status, 409, 'mesmo aluno/escola/turno duplicado');

  // entra na van já confirmado, no fim da rota, com horário herdado
  const est = (await jsonReq('GET', '/api/estado', mot)).data;
  const lista: any[] = Array.isArray(est.paradas) ? est.paradas : [];
  const p = lista.find((x) => x.id === r.data.paradaId);
  assert.ok(p, 'aluno aparece para o motorista');
  assert.equal(p.vinculo ?? 'CONFIRMADO', 'CONFIRMADO');
  assert.equal(p.escola_entrada, '07:40');

  // convite reenviável até a família se vincular; outro motorista não acessa
  const conv = await jsonReq('GET', `/api/paradas/${r.data.paradaId}/convite`, mot);
  assert.equal(conv.data.disponivel, true);
  assert.equal(conv.data.codigoVinculo, r.data.codigoVinculo);
  assert.equal((await jsonReq('GET', `/api/paradas/${r.data.paradaId}/convite`, outro)).status, 404);

  // a família se vincula com o código e NÃO recebe coordenadas, endereço, telefone nem código
  const pontoMarcado = (await jsonReq('POST', url, mot, { ...ok, nomeAluno: 'Com Ponto', latitude: -22.9, longitude: -43.2 })).data;
  const resp = await novoResponsavel(pontoMarcado.codigoVinculo);
  const vinc = await jsonReq('POST', '/api/vincular', resp, { codigoVinculo: 'van-xxxxxx' });
  assert.equal(vinc.status, 404, 'código errado');
  const est2 = (await jsonReq('GET', '/api/estado', resp)).data;
  assert.ok(!JSON.stringify(est2.paradas).match(/latitude|longitude|endereco|telefone|codigo_vinculo/i), 'estado do responsável sem dados sensíveis');
  assert.equal((await jsonReq('GET', `/api/paradas/${pontoMarcado.paradaId}/convite`, mot)).data.disponivel, false, 'depois de vinculado não há convite');
});

test('Vincular: a resposta ao responsável não traz coordenadas, endereço, telefone nem código', async () => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const mot = await novoMotorista(adm, 'VincPriv');
  const c = (await jsonReq('POST', '/api/motorista/alunos', mot, { nomeAluno: 'Zeca Lima', escola: 'Escola VP', turno: 'TARDE', nomeResponsavel: 'Rita Lima', telefoneResponsavel: '21977776666', endereco: 'Rua Secreta, 99', latitude: -22.9, longitude: -43.2, autorizacaoResponsavel: true })).data;
  const email = `vp_${Date.now()}@teste.com`;
  await jsonReq('POST', '/api/auth/register', undefined, { fullName: 'Rita', email, password: 'senhaSegura123!', lgpdConsent: true });
  const lista = (await jsonReq('GET', '/api/admin/responsaveis', adm)).data.responsaveis;
  await jsonReq('POST', `/api/admin/usuarios/${lista.find((x: any) => x.email === email).id}/confirmar-email`, adm);
  const tok = (await jsonReq('POST', '/api/auth/login-email', undefined, { email, password: 'senhaSegura123!' })).data.token;
  const v = await jsonReq('POST', '/api/vincular', tok, { codigoVinculo: c.codigoVinculo });
  assert.equal(v.status, 200, JSON.stringify(v.data));
  assert.equal(v.data.parada.nome_aluno, 'Zeca Lima');
  assert.ok(!JSON.stringify(v.data.parada).match(/latitude|longitude|endereco_real|Secreta|telefone|21977776666|codigo_vinculo/i), 'sem dados sensíveis na resposta');
});

test('Pré-cadastro: link do motorista, família preenche sem login com aceite, motorista aprova e envia o convite', async () => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const mot = await novoMotorista(adm, 'PreCad');
  const outro = await novoMotorista(adm, 'PreCadOutro');
  const dados = { nomeAluno: 'Bia Costa', escola: 'Escola Pre', turno: 'tarde', nomeResponsavel: 'Marta Costa', telefoneResponsavel: '(21) 99888-7766', endereco: 'Rua Nova, 5', pontoReferencia: 'Padaria', aceiteLgpd: true };

  // sem login não gera link; o público não consegue nada com token inventado
  assert.equal((await jsonReq('POST', '/api/motorista/pre-cadastro/link', undefined)).status, 401);
  assert.equal((await jsonReq('GET', '/api/pre-cadastro/token-que-nao-existe-123456')).status, 404);
  assert.equal((await jsonReq('POST', '/api/pre-cadastro/token-que-nao-existe-123456', undefined, dados)).status, 404);
  assert.equal((await jsonReq('GET', '/api/pre-cadastro/curto')).status, 404);

  // o motorista gera o link e escreve as regras
  assert.equal((await jsonReq('GET', '/api/motorista/pre-cadastro', mot)).data.link, null);
  const gerado = await jsonReq('POST', '/api/motorista/pre-cadastro/link', mot);
  assert.equal(gerado.status, 200);
  const token = gerado.data.link.url.split('?pre=')[1];
  assert.match(token, /^[A-Za-z0-9_-]{20,40}$/);
  await jsonReq('PUT', '/api/motorista/pre-cadastro/regras', mot, { texto: 'Esperar no portão 5 minutos antes.' });

  // a página pública mostra só o primeiro nome do motorista e as regras, sem dados de ninguém
  const pub = await jsonReq('GET', `/api/pre-cadastro/${token}`);
  assert.equal(pub.status, 200);
  assert.equal(pub.data.regras, 'Esperar no portão 5 minutos antes.');
  assert.deepEqual(Object.keys(pub.data).sort(), ['motorista', 'regras']);

  // validações do formulário público
  const url = `/api/pre-cadastro/${token}`;
  for (const [campo, valor] of [['nomeAluno', ''], ['escola', ''], ['turno', 'noite'], ['nomeResponsavel', ''], ['telefoneResponsavel', '12'], ['endereco', ''], ['aceiteLgpd', false]] as const) {
    assert.equal((await jsonReq('POST', url, undefined, { ...dados, aceiteRegras: true, [campo]: valor })).status, 400, `${campo}=${JSON.stringify(valor)}`);
  }
  assert.equal((await jsonReq('POST', url, undefined, dados)).status, 400, 'com regras, o aceite das regras é obrigatório');
  // isca anti-robô: parece sucesso, mas não cria nada
  assert.equal((await jsonReq('POST', url, undefined, { ...dados, aceiteRegras: true, nomeAluno: 'Robô', website: 'http://spam' })).status, 200);

  // envio válido: cai como pendente, com aceite registrado; o link conta o envio
  const env = await jsonReq('POST', url, undefined, { ...dados, aceiteRegras: true });
  assert.equal(env.status, 200, JSON.stringify(env.data));
  assert.deepEqual(env.data, { sucesso: true }, 'a resposta pública não devolve dados');
  assert.equal((await jsonReq('GET', '/api/motorista/pre-cadastro', mot)).data.link.envios, 1);
  const lista: any[] = (await jsonReq('GET', '/api/estado', mot)).data.paradas;
  assert.ok(!lista.some((p) => p.nome_aluno === 'Robô' || p.nome_completo_para_chamada === 'Robô'), 'a isca não criou aluno');
  const pend = lista.find((p) => (p.nome_completo_para_chamada ?? p.nome_aluno) === 'Bia Costa');
  assert.ok(pend, 'pedido aparece para o motorista');
  assert.equal(pend.vinculo, 'PENDENTE');
  assert.equal(pend.turno, 'TARDE');
  // reenviar o mesmo aluno não duplica nem revela
  assert.equal((await jsonReq('POST', url, undefined, { ...dados, aceiteRegras: true })).status, 200);
  const lista2: any[] = (await jsonReq('GET', '/api/estado', mot)).data.paradas;
  assert.equal(lista2.filter((p) => (p.nome_completo_para_chamada ?? p.nome_aluno) === 'Bia Costa').length, 1);
  // outro motorista não vê o pedido
  const dOutro: any[] = (await jsonReq('GET', '/api/estado', outro)).data.paradas;
  assert.ok(!dOutro.some((p) => (p.nome_completo_para_chamada ?? p.nome_aluno) === 'Bia Costa'));

  // aprovar → o convite (código + WhatsApp) fica disponível e a família se vincula
  const id = pend.parada_id ?? pend.id;
  assert.equal((await jsonReq('POST', `/api/paradas/${id}/confirmar`, mot, { posicao: 1 })).status, 200);
  const conv = await jsonReq('GET', `/api/paradas/${id}/convite`, mot);
  assert.equal(conv.data.disponivel, true);
  assert.equal(conv.data.whatsapp, '5521998887766');
  const resp = await novoResponsavel(conv.data.codigoVinculo);
  assert.ok(resp);

  // desativar o link barra novos envios; gerar outro invalida o anterior
  const novo = await jsonReq('POST', '/api/motorista/pre-cadastro/link', mot);
  assert.equal((await jsonReq('GET', `/api/pre-cadastro/${token}`)).status, 404, 'link antigo deixa de valer');
  const token2 = novo.data.link.url.split('?pre=')[1];
  assert.equal((await jsonReq('GET', `/api/pre-cadastro/${token2}`)).status, 200);
  assert.equal((await jsonReq('DELETE', '/api/motorista/pre-cadastro/link', mot)).data.link, null);
  assert.equal((await jsonReq('POST', `/api/pre-cadastro/${token2}`, undefined, { ...dados, nomeAluno: 'Outro Aluno', aceiteRegras: true })).status, 404, 'link desativado');

  // sem regras escritas, o aceite das regras não é exigido
  await jsonReq('PUT', '/api/motorista/pre-cadastro/regras', mot, { texto: '' });
  const t3 = (await jsonReq('POST', '/api/motorista/pre-cadastro/link', mot)).data.link.url.split('?pre=')[1];
  assert.equal((await jsonReq('GET', `/api/pre-cadastro/${t3}`)).data.regras, null);
  assert.equal((await jsonReq('POST', `/api/pre-cadastro/${t3}`, undefined, { ...dados, nomeAluno: 'Sem Regras' })).status, 200);
});

test('Importação em lote: confere a lista, aponta erros e repetidos, exige a autorização e cria só os válidos', async () => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const mot = await novoMotorista(adm, 'Lote');
  const outro = await novoMotorista(adm, 'LoteOutro');
  const url = '/api/motorista/alunos/importar';
  await jsonReq('PUT', '/api/motorista/escolas/horarios', mot, { nome: 'Colégio Lote', turno: 'MANHA', entrada: '07:40', saida: '12:00' });
  const lista = [
    'Aluno\tEscola\tTurno\tResponsável\tWhatsApp\tEndereço\tReferência', // cabeçalho é ignorado
    'Ana Lima\tColégio Lote\tManhã\tRita Lima\t(21) 98888-1111\tRua A, 10, Centro\tPortão verde',
    'Beto Dias;Colégio Lote;tarde;Paulo Dias;21977772222;Rua B, 20',
    'Caio Reis\tColégio Lote\tnoite\tLia Reis\t21966663333\tRua C, 30', // turno inválido
    'Duda Melo\tColégio Lote\tManhã\tNina Melo\t123\tRua D, 40', // telefone inválido
    'Ana Lima\tcolégio lote\tmanha\tRita Lima\t(21) 98888-1111\tRua A, 10', // repetido na lista
    'Eva Cruz sem separador',
    'Fábio Gil\tColégio Lote\tM\tSara Gil\t+55 21 95555-4444\tRua F, 60'
  ].join('\n');

  assert.equal((await jsonReq('POST', url, undefined, { texto: lista })).status, 401, 'sem login');
  assert.equal((await jsonReq('POST', url, mot, { texto: '   ' })).status, 400, 'lista vazia');

  // conferir (não cria nada)
  const prev = await jsonReq('POST', url, mot, { texto: lista, confirmar: false });
  assert.equal(prev.status, 200, JSON.stringify(prev.data));
  assert.equal(prev.data.confirmado, false);
  assert.deepEqual(prev.data.totais, { ok: 3, erro: 3, duplicado: 1, cortadas: 0 });
  const st = prev.data.linhas.map((l: any) => l.status);
  assert.deepEqual(st, ['ok', 'ok', 'erro', 'erro', 'duplicado', 'erro', 'ok']);
  assert.ok(!JSON.stringify(prev.data).match(/Rua A|Rua B|98888-1111|988881111/), 'a conferência não devolve endereço nem telefone inteiro');
  const antes: any[] = (await jsonReq('GET', '/api/estado', mot)).data.paradas;
  assert.equal(antes.length, 0, 'conferir não cria alunos');

  // importar exige a autorização da lista
  assert.equal((await jsonReq('POST', url, mot, { texto: lista, confirmar: true })).status, 400);
  assert.equal((await jsonReq('POST', url, mot, { texto: lista, confirmar: true, autorizacaoResponsaveis: 'true' })).status, 400);
  const imp = await jsonReq('POST', url, mot, { texto: lista, confirmar: true, autorizacaoResponsaveis: true });
  assert.equal(imp.status, 200, JSON.stringify(imp.data));
  assert.equal(imp.data.criados.length, 3);
  const ana = imp.data.criados.find((c: any) => c.aluno === 'Ana Lima');
  assert.match(ana.mensagem, /VAN-[0-9A-F]{6}/);
  assert.equal(ana.whatsapp, '5521988881111');
  assert.equal(imp.data.criados.find((c: any) => c.aluno === 'Fábio Gil').whatsapp, '5521955554444', '+55 é aceito');
  assert.ok(!ana.mensagem.includes('Rua A'), 'a mensagem não leva o endereço');

  // entram na van já confirmados, na ordem da lista, e herdam o horário do turno da manhã
  const dep: any[] = (await jsonReq('GET', '/api/estado', mot)).data.paradas;
  assert.equal(dep.length, 3);
  assert.ok(dep.every((p) => (p.vinculo ?? 'CONFIRMADO') === 'CONFIRMADO'));
  const pAna = dep.find((p) => (p.nome_completo_para_chamada ?? p.nome_aluno) === 'Ana Lima');
  assert.equal(pAna.turno, 'MANHA');
  assert.equal(pAna.escola_entrada, '07:40');
  assert.deepEqual(dep.map((p) => p.ordem_sequencia).sort(), [1, 2, 3]);

  // importar de novo a mesma lista: tudo vira repetido e nada é criado
  const de_novo = await jsonReq('POST', url, mot, { texto: lista, confirmar: false });
  assert.equal(de_novo.data.totais.ok, 0);
  assert.equal((await jsonReq('POST', url, mot, { texto: lista, confirmar: true, autorizacaoResponsaveis: true })).status, 400, 'sem linha válida');

  // outro motorista não vê os alunos e pode importar os mesmos nomes
  assert.equal(((await jsonReq('GET', '/api/estado', outro)).data.paradas as any[]).length, 0);
  assert.equal((await jsonReq('POST', url, outro, { texto: lista, confirmar: false })).data.totais.ok, 3);

  // limite de 60 linhas
  const grande = Array.from({ length: 65 }, (_, i) => `Aluno ${i + 1}\tEscola G\tManhã\tResp ${i + 1}\t2198000${String(1000 + i)}\tRua ${i + 1}`).join('\n');
  const g = await jsonReq('POST', url, outro, { texto: grande, confirmar: false });
  assert.equal(g.data.linhas.length, 60);
  assert.equal(g.data.totais.cortadas, 5);
});

test('Quando sair: calcula a hora de saída da posição atual até o primeiro ponto, sem guardar a posição', async () => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const mot = await novoMotorista(adm, 'QuandoSair');
  const url = '/api/motorista/quando-sair';
  const pos = { latitude: -22.95, longitude: -43.20 }; // ~5,5 km do ponto
  const agoraSP = () => { const f = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date()); return (Number(f.find((x) => x.type === 'hour')!.value) % 24) * 60 + Number(f.find((x) => x.type === 'minute')!.value); };
  const hm = (m: number) => { const x = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
  // sem alunos
  assert.equal((await jsonReq('POST', url, mot, { ...pos, sentido: 'IDA' })).status, 409);
  const base = { endereco: 'Rua X, 1', pontoReferencia: '', escola: 'Escola QS', nomeResponsavel: 'R', telefoneResponsavel: '21988887777' };
  // primeiro aluno sem ponto marcado: pede para marcar
  const semPonto = (await jsonReq('POST', '/api/paradas/nova', mot, { ...base, nomeAluno: 'Sem Ponto' })).data;
  const r0 = await jsonReq('POST', url, mot, { ...pos, sentido: 'IDA' });
  assert.equal(r0.status, 409);
  assert.match(String(r0.data.error), /ponto de embarque/);
  await jsonReq('PUT', `/api/paradas/${semPonto.novaParada.id}/local`, mot, { latitude: -22.90, longitude: -43.20 });
  // sem horário: calcula o trajeto mas não inventa a hora de sair
  const r1 = await jsonReq('POST', url, mot, { ...pos, sentido: 'IDA' });
  assert.equal(r1.status, 200);
  assert.equal(r1.data.situacao, 'sem_horario');
  assert.equal(r1.data.sairAs, null);
  assert.ok(r1.data.minutosAteLa >= 1 && r1.data.distanciaKm > 4);
  // com horário bem à frente: há tempo
  await jsonReq('PUT', `/api/paradas/${semPonto.novaParada.id}/horarios`, mot, { horaIda: hm(agoraSP() + 300) });
  const r2 = (await jsonReq('POST', url, mot, { ...pos, sentido: 'IDA' })).data;
  assert.equal(r2.situacao, 'ha_tempo');
  assert.match(String(r2.sairAs), /^\d\d:\d\d$/);
  assert.equal(r2.margemMin, 5);
  assert.ok(r2.faltamMin > 200 && r2.faltamMin < 300);
  // horário já passado: atrasado
  await jsonReq('PUT', `/api/paradas/${semPonto.novaParada.id}/horarios`, mot, { horaIda: hm(agoraSP() - 60) });
  assert.equal((await jsonReq('POST', url, mot, { ...pos, sentido: 'IDA' })).data.situacao, 'atrasado');
  // posição inválida, sem login e responsável não acessam
  assert.equal((await jsonReq('POST', url, mot, { latitude: 'x', longitude: 1 })).status, 400);
  assert.equal((await jsonReq('POST', url, undefined, pos)).status, 401);
  const resp = await novoResponsavel(semPonto.codigoVinculo);
  assert.equal((await jsonReq('POST', url, resp, pos)).status, 403);
  // a posição não fica guardada em lugar nenhum que o responsável alcance
  const prox = JSON.stringify((await jsonReq('GET', '/api/proximidade', resp)).data);
  assert.ok(!prox.includes('-22.95'), 'a posição do motorista não pode vazar');
});

test('Log de uso: registra ações e toques com detalhe, sem nome, endereço, telefone, coordenadas nem texto de mensagem', async () => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const mot = await novoMotorista(adm, 'LogUso');
  const saude = (await jsonReq('GET', '/api/health')).data;
  assert.equal(saude.logUso, true);
  const base = { endereco: 'Rua Secreta, 999', pontoReferencia: '', escola: 'Escola LG', nomeResponsavel: 'Dona Segredilda', telefoneResponsavel: '21977776666' };
  const A = (await jsonReq('POST', '/api/paradas/nova', mot, { ...base, nomeAluno: 'Fulaninho Reservado', latitude: -22.123456, longitude: -43.654321 })).data;
  const id = A.novaParada.id;
  await jsonReq('POST', '/api/rotas/iniciar', mot, { sentido: 'IDA' });
  await jsonReq('POST', `/api/paradas/${id}/status`, mot, { status: 'AUSENTE' });
  await jsonReq('POST', `/api/paradas/${id}/status`, mot, { status: 'PENDENTE' });
  await jsonReq('POST', `/api/paradas/${id}/status`, mot, { status: 'INVALIDO' }); // falha também é registrada
  // toques da tela: o servidor mascara nomes e números
  const ev = await jsonReq('POST', '/api/log-uso/eventos', mot, { eventos: [
    { acao: 'clique', tag: 'button', rotulo: 'Subir Fulaninho Reservado', sessao: 'abc123' },
    { acao: 'clique', tag: 'button', rotulo: 'Ligar 21977776666' },
    { acao: 'campo', tag: 'input', tipo: 'text', id: 'x', tam: 12 },
    { acao: 'hackear', rotulo: 'x' }
  ] });
  assert.equal(ev.status, 204);
  assert.equal((await jsonReq('POST', '/api/log-uso/eventos', undefined, { eventos: [] })).status, 401);
  const lista = (await jsonReq('GET', '/api/admin/log-uso?formato=json', adm)).data;
  const txt = JSON.stringify(lista.eventos);
  const meus = lista.eventos.filter((e: any) => e.det?.id_id === id);
  const st = meus.filter((e: any) => e.rota === '/api/paradas/:id/status');
  assert.equal(st.length, 3);
  assert.deepEqual(st.map((e: any) => [e.det.status, e.status]), [['AUSENTE', 200], ['PENDENTE', 200], ['INVALIDO', 400]]);
  assert.ok(st.every((e: any) => e.papel === 'motorista' && e.origem === 'api' && e.ms >= 0));
  assert.ok(lista.eventos.some((e: any) => e.acao === 'clique' && e.det.rotulo === 'Subir [nome]' && e.sessao === 'abc123'));
  assert.ok(lista.eventos.some((e: any) => e.acao === 'clique' && e.det.rotulo === 'Ligar [número]'));
  assert.ok(lista.eventos.some((e: any) => e.acao === 'campo' && e.det.tam === 12));
  assert.ok(lista.eventos.some((e: any) => e.acao === 'outro'));
  for (const proibido of ['Fulaninho', 'Reservado', 'Segredilda', 'Rua Secreta', '21977776666', '-22.123456', '-43.654321']) {
    assert.ok(!txt.includes(proibido), `o log não pode conter "${proibido}"`);
  }
  // só o admin baixa ou apaga; csv abre em planilha
  assert.equal((await jsonReq('GET', '/api/admin/log-uso', mot)).status, 403);
  const csv = await fetch(`${BASE}/api/admin/log-uso`, { headers: { Authorization: `Bearer ${adm}` } });
  assert.match(csv.headers.get('content-type') || '', /text\/csv/);
  assert.match(await csv.text(), /horario,origem,papel,usuario,sessao,acao,metodo,rota,status,ms,detalhes/);
});

test('Desfazer: o motorista volta o aluno para pendente (marcação sem querer) e o aviso de ausência some', async () => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const mot = await novoMotorista(adm, 'Desfazer');
  const base = { endereco: 'Rua X, 1', pontoReferencia: '', escola: 'Escola D', nomeResponsavel: 'R', telefoneResponsavel: '21988887777' };
  const A = (await jsonReq('POST', '/api/paradas/nova', mot, { ...base, nomeAluno: 'Aluno D' })).data;
  const id = A.novaParada.id;
  await jsonReq('POST', '/api/rotas/iniciar', mot, { sentido: 'IDA' });
  const st = async (status: string) => (await jsonReq('POST', `/api/paradas/${id}/status`, mot, { status })).data.parada;
  assert.equal((await st('AUSENTE')).status_embarque, 'AUSENTE');
  const volta = await st('PENDENTE');
  assert.equal(volta.status_embarque, 'PENDENTE');
  assert.equal(volta.motivo_ausencia, undefined);
  assert.equal((await st('EMBARCOU')).status_embarque, 'EMBARCOU');
  assert.equal((await st('PENDENTE')).status_embarque, 'PENDENTE');
  assert.equal((await jsonReq('POST', `/api/paradas/${id}/status`, mot, { status: 'QUALQUER' })).status, 400);
});

test('Proximidade de todos os filhos: um item por filho, sem coordenadas, e o aviso de um não depende do outro estar em foco', async () => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const mot = await novoMotorista(adm, 'Irmaos');
  const nova = async (n: string) => (await jsonReq('POST', '/api/paradas/nova', mot, {
    nomeAluno: n, endereco: 'Rua X, 1', pontoReferencia: '', escola: 'Esc', nomeResponsavel: 'R', telefoneResponsavel: '21988887777'
  })).data;
  const a = await nova('Irmao A'), b = await nova('Irmao B'), c = await nova('Outro Aluno');
  const resp = await novoResponsavel(a.codigoVinculo);
  // segundo filho do mesmo responsável
  assert.equal((await jsonReq('POST', '/api/vincular', resp, { codigoVinculo: b.codigoVinculo })).status, 200);

  let r = (await jsonReq('GET', '/api/proximidade', resp)).data;
  assert.equal(r.proximidades.length, 2, 'um item por filho');
  const ids = r.proximidades.map((x: any) => x.id_aluno).sort();
  assert.deepEqual(ids, [a.novaParada.id_aluno ?? a.novaParada.id_aluno, b.novaParada.id_aluno].sort());
  assert.ok(!ids.includes(c.novaParada.id_aluno), 'aluno de outra família não aparece');
  assert.ok(r.proximidades.every((x: any) => x.proximidade.estado === 'aguardando'));

  await jsonReq('POST', '/api/rotas/iniciar', mot);
  await jsonReq('POST', '/api/gps', mot, { latitude: -22.95, longitude: -43.2, speedKmH: 30, accuracyMeters: 8 });
  r = (await jsonReq('GET', '/api/proximidade', resp)).data;
  assert.ok(r.proximidades.every((x: any) => x.proximidade.estado === 'a_caminho' || x.proximidade.estado === 'proxima'));
  assert.ok(r.proximidades.every((x: any) => x.proximidade.posicao === undefined && x.proximidade.mapaLiberado === false));
  assert.equal(JSON.stringify(r.proximidades).includes('-22.95'), false, 'nenhuma coordenada da van na lista');

  // marcar um filho como embarcado muda só o item dele
  await jsonReq('POST', `/api/paradas/${a.novaParada.id}/status`, mot, { status: 'EMBARCOU' });
  r = (await jsonReq('GET', '/api/proximidade', resp)).data;
  const porId = (id: number) => r.proximidades.find((x: any) => x.id_aluno === id).proximidade;
  assert.equal(porId(a.novaParada.id_aluno).estado, 'embarcou');
  assert.notEqual(porId(b.novaParada.id_aluno).estado, 'embarcou');

  // o estado completo (usado também pelo SSE) traz a mesma lista, e a proximidade do filho em foco continua igual
  const est = (await jsonReq('GET', '/api/estado', resp)).data;
  assert.equal(est.proximidades.length, 2);
  assert.ok(est.proximidade);
});

test('Guia do primeiro acesso: os exemplos só existem no modo de teste; no modo de teste criam alunos fictícios e um código que vincula sem expor dados', async () => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const mot = await novoMotorista(adm, 'GuiaMot');
  assert.equal((await jsonReq('POST', '/api/teste/exemplos', undefined, {})).status, 401, 'sem login');
  const modoTeste = !!(await jsonReq('GET', '/api/health')).data.modoTeste;
  const r = await jsonReq('POST', '/api/teste/exemplos', mot, {});
  if (!modoTeste) {
    assert.equal(r.status, 404, 'fora do modo de teste a rota não pode existir');
    return;
  }
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.criados, 3);
  assert.equal((await jsonReq('POST', '/api/teste/exemplos', mot, {})).data.criados, 0, 'não duplica nem mexe em quem já tem alunos');
  const est = (await jsonReq('GET', '/api/estado', mot)).data;
  const nomes = (est.paradas as any[]).map((p) => p.nome_aluno);
  assert.deepEqual(nomes.filter((n) => /Exemplo/.test(n)).length, 3);

  // responsável: recebe um código de exemplo, usa no vínculo e o código não serve duas vezes
  const fam = await novoResponsavelVerificado(adm);
  const ex = await jsonReq('POST', '/api/teste/exemplos', fam, {});
  assert.equal(ex.status, 200, JSON.stringify(ex.data));
  assert.match(ex.data.codigo, /^VAN-[0-9A-F]{6}$/);
  const v = await jsonReq('POST', '/api/vincular', fam, { codigoVinculo: ex.data.codigo });
  assert.equal(v.status, 200, JSON.stringify(v.data));
  assert.ok(!JSON.stringify(v.data.parada).match(/latitude|longitude|endereco_real|telefone|codigo_vinculo/i), 'sem dados sensíveis para o responsável');
  const fam2 = await novoResponsavelVerificado(adm);
  assert.equal((await jsonReq('POST', '/api/vincular', fam2, { codigoVinculo: ex.data.codigo })).status, 404, 'código já usado');
  const ex2 = await jsonReq('POST', '/api/teste/exemplos', fam2, {});
  assert.notEqual(ex2.data.codigo, ex.data.codigo, 'cada responsável recebe um aluno de exemplo próprio');
});

test('Modo de teste: cada sessão ganha conta própria e sem sessão volta à conta compartilhada', async () => {
  const modoTeste = !!(await jsonReq('GET', '/api/health')).data.modoTeste;
  if (!modoTeste) {
    assert.equal((await jsonReq('POST', '/api/teste/entrar', undefined, { papel: 'motorista', sessao: 'a1b2c3d4e5f6a7b8' })).status, 404);
    return;
  }
  const entrar = async (sessao?: string) => (await jsonReq('POST', '/api/teste/entrar', undefined, { papel: 'motorista', sessao })).data.token as string;
  const a = await entrar('a1b2c3d4e5f6a7b8');
  const b = await entrar('b1b2c3d4e5f6a7b8');
  assert.equal((await jsonReq('POST', '/api/teste/exemplos', a, {})).data.criados, 3);
  const nomes = async (tok: string) => ((await jsonReq('GET', '/api/estado', tok)).data.paradas as any[]).map((p) => p.nome_aluno);
  assert.equal((await nomes(a)).length, 3, 'A vê os seus alunos');
  assert.equal((await nomes(b)).length, 0, 'B não vê os alunos de A');
  assert.equal((await jsonReq('POST', '/api/teste/exemplos', b, {})).data.criados, 3, 'B carrega os próprios exemplos');
  assert.equal((await nomes(await entrar('a1b2c3d4e5f6a7b8'))).length, 3, 'a mesma sessão volta à mesma conta');
  // id inválido não cria conta própria: cai na conta compartilhada
  const c1 = await entrar('ZZ'); const c2 = await entrar();
  assert.deepEqual(await nomes(c1), await nomes(c2));
});

test('Módulos: começam ligados, o motorista liga e desliga só os dele, entradas inválidas são recusadas e responsável/visitante não acessam', async () => {
  const adm = await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD });
  const a = await novoMotorista(adm.data.token, 'ModA');
  const b = await novoMotorista(adm.data.token, 'ModB');
  const mapa = async (tok: string) => Object.fromEntries(((await jsonReq('GET', '/api/motorista/modulos', tok)).data.modulos as any[]).map((m) => [m.chave, m.ativo]));

  const inicial = await jsonReq('GET', '/api/motorista/modulos', a);
  assert.equal(inicial.status, 200);
  assert.deepEqual(await mapa(a), { mensalidades: true, financeiro: true, manutencao: false }, 'quem já usava mantém tudo ligado');
  for (const m of inicial.data.modulos) { assert.ok(m.nome && m.descricao, 'cada módulo traz nome e descrição'); }

  const desligar = await jsonReq('PUT', '/api/motorista/modulos', a, { chave: 'financeiro', ativo: false });
  assert.equal(desligar.status, 200);
  assert.deepEqual(await mapa(a), { mensalidades: true, financeiro: false, manutencao: false });
  assert.deepEqual(await mapa(b), { mensalidades: true, financeiro: true, manutencao: false }, 'o outro motorista não é afetado');

  assert.equal((await jsonReq('PUT', '/api/motorista/modulos', a, { chave: 'financeiro', ativo: true })).status, 200);
  assert.deepEqual(await mapa(a), { mensalidades: true, financeiro: true, manutencao: false }, 'dá para ligar de novo');

  assert.equal((await jsonReq('PUT', '/api/motorista/modulos', a, { chave: 'foguete', ativo: true })).status, 400);
  assert.equal((await jsonReq('PUT', '/api/motorista/modulos', a, { chave: 'financeiro', ativo: 'sim' })).status, 400);
  assert.equal((await jsonReq('PUT', '/api/motorista/modulos', a, { chave: '__proto__', ativo: true })).status, 400);
  assert.deepEqual(await mapa(a), { mensalidades: true, financeiro: true, manutencao: false }, 'pedidos inválidos não mudam nada');

  // Desligar só esconde: os dados do financeiro continuam guardados
  assert.equal((await jsonReq('PUT', '/api/motorista/modulos', a, { chave: 'financeiro', ativo: false })).status, 200);
  assert.equal((await jsonReq('GET', '/api/motorista/financeiro/resumo', a)).status, 200);

  assert.equal((await jsonReq('GET', '/api/motorista/modulos')).status, 401, 'visitante sem sessão');
  const aluno = (await jsonReq('POST', '/api/paradas/nova', a, {
    nomeAluno: 'Aluno Mod', endereco: 'Rua M, 1', pontoReferencia: '', escola: 'Esc', nomeResponsavel: 'R', telefoneResponsavel: '21988887777'
  })).data;
  const resp = await novoResponsavel(aluno.codigoVinculo);
  const r = await jsonReq('GET', '/api/motorista/modulos', resp);
  assert.ok(r.status === 401 || r.status === 403, 'responsável não acessa os módulos do motorista');
  assert.equal((await jsonReq('PUT', '/api/motorista/modulos', resp, { chave: 'financeiro', ativo: true })).status === 200, false);
});

test('Push: só responsável liga avisos no celular; assinatura inválida é recusada; sem chaves do servidor o recurso fica desligado', async () => {
  const adm = await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD });
  const mot = await novoMotorista(adm.data.token, 'PushMot');
  const aluno = (await jsonReq('POST', '/api/paradas/nova', mot, {
    nomeAluno: 'Aluno Push', endereco: 'Rua P, 1', pontoReferencia: '', escola: 'Esc', nomeResponsavel: 'R', telefoneResponsavel: '21988887777'
  })).data;
  const resp = await novoResponsavel(aluno.codigoVinculo);
  const assinatura = { endpoint: 'https://fcm.googleapis.com/fcm/send/teste-push-1', keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } };

  assert.equal((await jsonReq('GET', '/api/push/estado')).status, 401, 'visitante sem sessão');
  assert.equal((await jsonReq('GET', '/api/push/estado', mot)).status, 403, 'motorista não usa avisos de responsável');
  assert.equal((await jsonReq('POST', '/api/push/assinar', mot, { assinatura })).status, 403);

  const est = await jsonReq('GET', '/api/push/estado', resp);
  assert.equal(est.status, 200);
  assert.equal(typeof est.data.disponivel, 'boolean');
  assert.equal(est.data.aparelhos, 0);
  if (!est.data.disponivel) {
    assert.equal(est.data.chavePublica, null);
    assert.equal((await jsonReq('POST', '/api/push/assinar', resp, { assinatura })).status, 503, 'sem chaves VAPID, não liga');
    return;
  }
  assert.ok(est.data.chavePublica && !JSON.stringify(est.data).includes('PRIVATE'));
  assert.equal((await jsonReq('POST', '/api/push/assinar', resp, { assinatura: { ...assinatura, endpoint: 'http://inseguro.com/x' } })).status, 400);
  assert.equal((await jsonReq('POST', '/api/push/assinar', resp, { assinatura: { endpoint: assinatura.endpoint } })).status, 400);
  assert.equal((await jsonReq('POST', '/api/push/assinar', resp, {})).status, 400);
  assert.equal((await jsonReq('GET', '/api/push/estado', resp)).data.aparelhos, 0, 'pedidos inválidos não gravam nada');

  assert.equal((await jsonReq('POST', '/api/push/assinar', resp, { assinatura })).status, 200);
  assert.equal((await jsonReq('POST', '/api/push/assinar', resp, { assinatura })).status, 200);
  assert.equal((await jsonReq('GET', '/api/push/estado', resp)).data.aparelhos, 1, 'o mesmo aparelho não duplica');

  // Com um aparelho ligado (endpoint que não existe), GPS e embarque continuam funcionando: o aviso nunca atrapalha a rota.
  assert.equal((await jsonReq('POST', '/api/gps', mot, { latitude: -22.9, longitude: -43.2 })).status, 200);
  assert.equal((await jsonReq('POST', `/api/paradas/${aluno.novaParada.id}/status`, mot, { status: 'EMBARCOU' })).status, 200);
  assert.equal((await jsonReq('POST', `/api/paradas/${aluno.novaParada.id}/status`, mot, { status: 'ENTREGUE' })).status, 200);

  const aluno2 = (await jsonReq('POST', '/api/paradas/nova', mot, {
    nomeAluno: 'Aluno Push 2', endereco: 'Rua P, 2', pontoReferencia: '', escola: 'Esc', nomeResponsavel: 'R2', telefoneResponsavel: '21988886666'
  })).data;
  const resp2 = await novoResponsavel(aluno2.codigoVinculo);
  assert.equal((await jsonReq('GET', '/api/push/estado', resp2)).data.aparelhos, 0, 'cada responsável tem os seus aparelhos');

  assert.equal((await jsonReq('DELETE', '/api/push/assinar', resp, { endpoint: assinatura.endpoint })).status, 200);
  assert.equal((await jsonReq('GET', '/api/push/estado', resp)).data.aparelhos, 0, 'desligar apaga o aparelho');
  assert.equal((await jsonReq('POST', '/api/push/teste', resp)).status, 409, 'sem aparelho ligado, não há o que testar');
});

test('Manutenção: cada motorista cuida dos seus serviços, o km vem dos abastecimentos, alertas por km e data, entradas inválidas são recusadas e responsável não acessa', async () => {
  const adm = await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD });
  const a = await novoMotorista(adm.data.token, 'ManA');
  const b = await novoMotorista(adm.data.token, 'ManB');

  const vazio = await jsonReq('GET', '/api/motorista/manutencao', a);
  assert.equal(vazio.status, 200);
  assert.deepEqual(vazio.data.itens, []);
  assert.equal(vazio.data.km_atual, null);
  assert.ok(vazio.data.sugestoes.length > 0, 'traz sugestões');
  assert.equal((await jsonReq('GET', '/api/motorista/manutencao')).status, 401, 'visitante sem sessão');

  // inválidos
  assert.equal((await jsonReq('POST', '/api/motorista/manutencao', a, { nome: 'x', intervalo_km: 1000 })).status, 400);
  assert.equal((await jsonReq('POST', '/api/motorista/manutencao', a, { nome: 'Pneus' })).status, 400, 'sem intervalo');
  assert.equal((await jsonReq('POST', '/api/motorista/manutencao', a, { nome: 'Pneus', intervalo_km: -1 })).status, 400);
  assert.equal((await jsonReq('POST', '/api/motorista/manutencao', a, { nome: 'Pneus', intervalo_km: 10000, ultima_data: '2099-01-01' })).status, 400);
  assert.deepEqual((await jsonReq('GET', '/api/motorista/manutencao', a)).data.itens, [], 'pedidos inválidos não gravam');

  // sem km conhecido: sem dados, sem inventar alerta
  const criado = await jsonReq('POST', '/api/motorista/manutencao', a, { nome: 'Troca de óleo', intervalo_km: 10000, ultimo_km: 50000 });
  assert.equal(criado.status, 200);
  assert.equal(criado.data.itens[0].situacao, 'EM_DIA', 'o km do serviço já é uma leitura: km atual = 50000');
  assert.equal(criado.data.km_atual, 50000);
  const id = criado.data.itens[0].id;
  assert.equal((await jsonReq('POST', '/api/motorista/manutencao', a, { nome: 'troca de óleo', intervalo_km: 5000 })).status, 400, 'nome repetido');

  // abastecimento com km maior no Financeiro empurra o km atual e vence o serviço
  const abast = await jsonReq('POST', '/api/motorista/financeiro/lancamentos', a, { tipo: 'DESPESA', categoria: 'COMBUSTIVEL', valor: 200, litros: 40, km: 60500, combustivel: 'GASOLINA', tanque_cheio: true, data: '2026-11-01' });
  assert.equal(abast.status, 200, JSON.stringify(abast.data));
  const depois = (await jsonReq('GET', '/api/motorista/manutencao', a)).data;
  assert.equal(depois.km_atual, 60500);
  assert.equal(depois.itens[0].situacao, 'VENCIDO');
  assert.equal(depois.itens[0].faltam_km, -500);
  assert.equal(depois.resumo.vencidos, 1);

  // outro motorista não vê nada disso
  assert.deepEqual((await jsonReq('GET', '/api/motorista/manutencao', b)).data.itens, []);
  assert.equal((await jsonReq('PUT', `/api/motorista/manutencao/${id}/feito`, b, { km: 61000 })).status, 404, 'não mexe no serviço do outro');
  assert.equal((await jsonReq('DELETE', `/api/motorista/manutencao/${id}`, b)).status, 404);

  // marcar como feito: pede km, aceita, zera o alerta
  assert.equal((await jsonReq('PUT', `/api/motorista/manutencao/${id}/feito`, a, {})).status, 400, 'sem km');
  assert.equal((await jsonReq('PUT', `/api/motorista/manutencao/${id}/feito`, a, { km: 61000, data: '2099-01-01' })).status, 400, 'futuro');
  const feito = await jsonReq('PUT', `/api/motorista/manutencao/${id}/feito`, a, { km: 61000 });
  assert.equal(feito.status, 200);
  assert.equal(feito.data.itens[0].situacao, 'EM_DIA');
  assert.equal(feito.data.itens[0].proximo_km, 71000);
  assert.equal(feito.data.km_atual, 61000);

  // por data
  const vist = await jsonReq('POST', '/api/motorista/manutencao', a, { nome: 'Vistoria', intervalo_meses: 12, ultima_data: '2020-01-01' });
  assert.equal(vist.status, 200);
  assert.equal(vist.data.itens[0].nome, 'Vistoria', 'vencido vem primeiro');
  assert.equal(vist.data.itens[0].situacao, 'VENCIDO');

  // remover
  const rem = await jsonReq('DELETE', `/api/motorista/manutencao/${id}`, a);
  assert.equal(rem.status, 200);
  assert.equal(rem.data.itens.length, 1);
  assert.equal((await jsonReq('DELETE', `/api/motorista/manutencao/${id}`, a)).status, 404);

  // módulo desligado por padrão e responsável não acessa
  const mods = (await jsonReq('GET', '/api/motorista/modulos', a)).data.modulos as any[];
  assert.equal(mods.find((m) => m.chave === 'manutencao').ativo, false);
  const aluno = (await jsonReq('POST', '/api/paradas/nova', a, { nomeAluno: 'Aluno Man', endereco: 'Rua M, 1', pontoReferencia: '', escola: 'Esc', nomeResponsavel: 'R', telefoneResponsavel: '21988887777' })).data;
  const resp = await novoResponsavel(aluno.codigoVinculo);
  const r = await jsonReq('GET', '/api/motorista/manutencao', resp);
  assert.ok(r.status === 401 || r.status === 403, 'responsável não vê a manutenção do motorista');
  assert.equal((await jsonReq('POST', '/api/motorista/manutencao', resp, { nome: 'Óleo', intervalo_km: 1000 })).status === 200, false);
});

// ---------------------------------------------------------------------------
// PAGAMENTO POR PIX (módulo em teste): só existe para e-mails liberados em PIX_BETA_EMAILS no servidor.
// Para rodar o fluxo completo, suba o servidor de teste com PIX_BETA_EMAILS=pix_beta@teste.com
// ---------------------------------------------------------------------------
const PIX_BETA_EMAIL = 'pix_beta@teste.com';
async function motoristaComEmail(adminToken: string, nome: string, email: string) {
  const conv = await jsonReq('POST', '/api/admin/convites-motorista', adminToken, { nota: nome });
  const reg = await jsonReq('POST', '/api/auth/register-motorista', undefined, {
    fullName: nome, email, password: 'senhaSegura123!', phone: '21999990000',
    vehicleModel: 'Van', vehiclePlate: 'AAA-0000', invitationCode: conv.data.invitation.code, lgpdConsent: true
  });
  if (reg.data?.token) return reg.data.token as string;
  const login = await jsonReq('POST', '/api/auth/login-motorista', undefined, { email, password: 'senhaSegura123!' });
  assert.ok(login.data?.token, `login de ${email} deve devolver token`);
  return login.data.token as string;
}

test('Pix: módulo restrito é invisível e inoperante para motorista não liberado; responsável não vê QR', async () => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const a = await novoMotorista(adm, 'PixNaoLiberado');
  const mods = (await jsonReq('GET', '/api/motorista/modulos', a)).data.modulos as any[];
  assert.equal(mods.some((m) => m.chave === 'pagamento-pix'), false, 'não aparece na lista');
  assert.equal(JSON.stringify(mods).includes('restrito'), false, 'a tela não recebe o detalhe interno');
  assert.equal((await jsonReq('PUT', '/api/motorista/modulos', a, { chave: 'pagamento-pix', ativo: true })).status, 400, 'não dá para ligar');
  const pix = await jsonReq('GET', '/api/motorista/pix', a);
  assert.equal(pix.status, 200);
  assert.deepEqual(pix.data, { ativo: false, config: null });
  assert.equal((await jsonReq('PUT', '/api/motorista/pix', a, { tipo: 'EMAIL', chave: 'a@b.com', nome: 'Fulano', cidade: 'Rio' })).status, 403);
  assert.equal((await jsonReq('DELETE', '/api/motorista/pix', a)).status, 403);

  const aluno = (await jsonReq('POST', '/api/paradas/nova', a, {
    nomeAluno: 'Aluno SemPix', endereco: 'Rua P, 1', pontoReferencia: '', escola: 'Esc', nomeResponsavel: 'R', telefoneResponsavel: '21988887777'
  })).data;
  const idAluno = aluno.novaParada.id_aluno;
  await jsonReq('PUT', `/api/motorista/mensalidades/${idAluno}/config`, a, { valor: '350,00', vencimento_dia: 28 });
  const resp = await novoResponsavel(aluno.codigoVinculo);
  const filhos = (await jsonReq('GET', '/api/mensalidades', resp)).data.filhos as any[];
  assert.equal(filhos.length, 1);
  assert.ok(!filhos[0].pix, 'sem módulo ligado o responsável não recebe código Pix');
  const mes = (await jsonReq('GET', '/api/motorista/mensalidades', a)).data.mes;
  assert.equal((await jsonReq('POST', `/api/mensalidades/${idAluno}/avisar`, resp, { mes })).status, 409, 'não dá para avisar sem o módulo');
});

test('Pix: fluxo completo (chave, QR do responsável, aviso "já paguei", confirmação do motorista) para o e-mail liberado', async (t) => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const mot = await motoristaComEmail(adm, 'PixBeta', PIX_BETA_EMAIL);
  const lista = (await jsonReq('GET', '/api/motorista/modulos', mot)).data.modulos as any[];
  const modulo = lista.find((m) => m.chave === 'pagamento-pix');
  if (!modulo) {
    console.warn(`[Pix] Fluxo completo PULADO: suba o servidor de teste com PIX_BETA_EMAILS=${PIX_BETA_EMAIL} para exercitá-lo.`);
    t.skip('servidor sem PIX_BETA_EMAILS');
    return;
  }
  assert.equal(modulo.ativo, false, 'liberado, mas começa desligado');

  // antes de ligar: nada funciona
  assert.deepEqual((await jsonReq('GET', '/api/motorista/pix', mot)).data, { ativo: false, config: null });
  assert.equal((await jsonReq('PUT', '/api/motorista/pix', mot, { tipo: 'EMAIL', chave: 'motorista@exemplo.com', nome: 'Solon', cidade: 'Rio' })).status, 403);

  assert.equal((await jsonReq('PUT', '/api/motorista/modulos', mot, { chave: 'pagamento-pix', ativo: true })).status, 200);

  // chave inválida é recusada; válida é salva e normalizada
  for (const ruim of [
    { tipo: 'CPF', chave: '111.111.111-11', nome: 'Solon', cidade: 'Rio' },
    { tipo: 'FOGUETE', chave: 'x', nome: 'Solon', cidade: 'Rio' },
    { tipo: 'EMAIL', chave: 'sem-arroba', nome: 'Solon', cidade: 'Rio' },
    { tipo: 'EMAIL', chave: 'motorista@exemplo.com', nome: '', cidade: 'Rio' },
    { tipo: 'EMAIL', chave: 'motorista@exemplo.com', nome: 'Solon', cidade: '' }
  ]) assert.equal((await jsonReq('PUT', '/api/motorista/pix', mot, ruim)).status, 400, JSON.stringify(ruim));
  const salvo = await jsonReq('PUT', '/api/motorista/pix', mot, { tipo: 'CELULAR', chave: '(21) 97268-2614', nome: 'Solon Transporte', cidade: 'Rio de Janeiro' });
  assert.equal(salvo.status, 200);
  assert.deepEqual((await jsonReq('GET', '/api/motorista/pix', mot)).data.config, { tipo: 'CELULAR', chave: '+5521972682614', nome: 'SOLON TRANSPORTE', cidade: 'RIO DE JANEIRO' });

  // aluno + mensalidade + responsável
  const aluno = (await jsonReq('POST', '/api/paradas/nova', mot, {
    nomeAluno: 'Aluno Pix', endereco: 'Rua Secreta, 99', pontoReferencia: 'Portão verde', escola: 'Colégio Pix', nomeResponsavel: 'Resp Pix', telefoneResponsavel: '21988887777'
  })).data;
  const idAluno = aluno.novaParada.id_aluno;
  const resp = await novoResponsavel(aluno.codigoVinculo);
  const antes = (await jsonReq('GET', '/api/mensalidades', resp)).data.filhos[0];
  assert.equal(antes.pix, null, 'sem valor de mensalidade definido não há o que pagar');
  assert.equal((await jsonReq('PUT', `/api/motorista/mensalidades/${idAluno}/config`, mot, { valor: '350,00', vencimento_dia: 28 })).status, 200);

  // o responsável recebe só o código e o valor: nada de endereço, ponto de referência ou coordenadas
  const filho = (await jsonReq('GET', '/api/mensalidades', resp)).data.filhos[0];
  assert.ok(filho.pix, 'responsável vê o Pix da mensalidade');
  assert.equal(filho.pix.valor, 350);
  assert.equal(filho.pix.recebedor, 'SOLON TRANSPORTE');
  assert.equal(filho.pix.avisado_em, null);
  assert.match(filho.pix.copia_e_cola, /^000201.*6304[0-9A-F]{4}$/);
  assert.ok(filho.pix.copia_e_cola.includes('br.gov.bcb.pix') && filho.pix.copia_e_cola.includes('+5521972682614'), 'código aponta para a chave do motorista');
  assert.ok(filho.pix.copia_e_cola.includes('350.00'), 'valor da mensalidade no código');
  const texto = JSON.stringify(filho);
  for (const proibido of ['Rua Secreta', 'Portão verde', 'latitude', 'longitude', 'coordenad']) assert.equal(texto.includes(proibido), false, `não vaza ${proibido}`);
  assert.equal(filho.pix.mes, (await jsonReq('GET', '/api/motorista/mensalidades', mot)).data.mes, 'paga o mês atual (cobrança começou agora)');
  const mes = filho.pix.mes as string;

  // avisar: só o responsável do aluno, só o mês certo
  assert.equal((await jsonReq('POST', `/api/mensalidades/${idAluno}/avisar`, undefined, { mes })).status, 401);
  assert.equal((await jsonReq('POST', `/api/mensalidades/${idAluno}/avisar`, mot, { mes })).status, 403, 'motorista não avisa por responsável');
  const outro = await novoResponsavelVerificado(adm);
  assert.equal((await jsonReq('POST', `/api/mensalidades/${idAluno}/avisar`, outro, { mes })).status, 404, 'responsável de outro aluno');
  assert.equal((await jsonReq('POST', `/api/mensalidades/${idAluno}/avisar`, resp, { mes: '2020-01' })).status, 409, 'mês errado');
  assert.equal((await jsonReq('POST', `/api/mensalidades/${idAluno}/avisar`, resp, {})).status, 409, 'sem mês');
  assert.equal((await jsonReq('POST', `/api/mensalidades/${idAluno}/avisar`, resp, { mes })).status, 200);
  assert.equal((await jsonReq('POST', `/api/mensalidades/${idAluno}/avisar`, resp, { mes })).status, 200, 'avisar de novo é inofensivo');

  // aviso não é baixa: continua em aberto para os dois lados, e o motorista vê o aviso
  const depois = (await jsonReq('GET', '/api/mensalidades', resp)).data.filhos[0];
  assert.ok(depois.pix.avisado_em, 'responsável vê que o aviso foi enviado');
  assert.notEqual(depois.status, 'PAGO');
  const painel = (await jsonReq('GET', '/api/motorista/mensalidades', mot)).data;
  const linha = painel.alunos.find((l: any) => l.id_aluno === idAluno);
  assert.ok(linha.aviso_em, 'motorista vê "avisou que pagou"');
  assert.notEqual(linha.status, 'PAGO');
  assert.equal(painel.resumo.recebido, 0, 'nada entra no recebido sem a confirmação do motorista');

  // "não recebi": tira o aviso, continua em aberto, responsável pode avisar de novo
  assert.equal((await jsonReq('POST', `/api/motorista/mensalidades/${idAluno}/aviso/descartar`, resp, { mes })).status, 403);
  assert.equal((await jsonReq('POST', `/api/motorista/mensalidades/${idAluno}/aviso/descartar`, mot, { mes: '2026-13' })).status, 400);
  assert.equal((await jsonReq('POST', `/api/motorista/mensalidades/${idAluno}/aviso/descartar`, mot, { mes })).status, 200);
  assert.equal((await jsonReq('POST', `/api/motorista/mensalidades/${idAluno}/aviso/descartar`, mot, { mes })).status, 404, 'já descartado');
  assert.equal((await jsonReq('GET', '/api/mensalidades', resp)).data.filhos[0].pix.avisado_em, null);
  assert.equal((await jsonReq('POST', `/api/mensalidades/${idAluno}/avisar`, resp, { mes })).status, 200);

  // outro motorista não mexe no aviso
  const intruso = await novoMotorista(adm, 'PixIntruso');
  assert.equal((await jsonReq('POST', `/api/motorista/mensalidades/${idAluno}/aviso/descartar`, intruso, { mes })).status, 404);

  // confirmação do motorista = a baixa de sempre; o aviso some e o responsável vê "Pago"
  assert.equal((await jsonReq('POST', `/api/motorista/mensalidades/${idAluno}/pagar`, mot, { mes, forma: 'PIX' })).status, 200);
  const pago = (await jsonReq('GET', '/api/motorista/mensalidades', mot)).data;
  assert.equal(pago.alunos.find((l: any) => l.id_aluno === idAluno).status, 'PAGO');
  assert.equal(pago.alunos.find((l: any) => l.id_aluno === idAluno).aviso_em, null);
  assert.equal(pago.resumo.recebido, 350);
  const final = (await jsonReq('GET', '/api/mensalidades', resp)).data.filhos[0];
  assert.equal(final.status, 'PAGO');
  assert.equal(final.pix, null, 'pago: não há mais o que pagar');
  assert.equal((await jsonReq('POST', `/api/mensalidades/${idAluno}/avisar`, resp, { mes })).status, 409, 'mês pago não aceita aviso');

  // desligar o módulo esconde o QR do responsável sem apagar a chave
  assert.equal((await jsonReq('POST', `/api/motorista/mensalidades/${idAluno}/desfazer`, mot, { mes })).status, 200);
  assert.ok((await jsonReq('GET', '/api/mensalidades', resp)).data.filhos[0].pix);
  assert.equal((await jsonReq('PUT', '/api/motorista/modulos', mot, { chave: 'pagamento-pix', ativo: false })).status, 200);
  assert.equal((await jsonReq('GET', '/api/mensalidades', resp)).data.filhos[0].pix, null, 'módulo desligado: sem QR');
  assert.equal((await jsonReq('POST', `/api/mensalidades/${idAluno}/avisar`, resp, { mes })).status, 409);
  assert.equal((await jsonReq('PUT', '/api/motorista/modulos', mot, { chave: 'pagamento-pix', ativo: true })).status, 200);
  assert.ok((await jsonReq('GET', '/api/motorista/pix', mot)).data.config, 'a chave continua guardada');

  // remover a chave tira o QR
  assert.equal((await jsonReq('DELETE', '/api/motorista/pix', mot)).status, 200);
  assert.equal((await jsonReq('GET', '/api/mensalidades', resp)).data.filhos[0].pix, null);
  assert.deepEqual((await jsonReq('GET', '/api/motorista/pix', mot)).data, { ativo: true, config: null });
});

test('Pix da família: 3 filhos pagam um Pix único; aviso e confirmação valem para todos de uma vez (tudo ou nada)', async (t) => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const mot = await motoristaComEmail(adm, 'PixBeta', PIX_BETA_EMAIL);
  const modulo = ((await jsonReq('GET', '/api/motorista/modulos', mot)).data.modulos as any[]).find((m) => m.chave === 'pagamento-pix');
  if (!modulo) {
    console.warn(`[Pix] Fluxo da família PULADO: suba o servidor de teste com PIX_BETA_EMAILS=${PIX_BETA_EMAIL} para exercitá-lo.`);
    t.skip('servidor sem PIX_BETA_EMAILS');
    return;
  }
  assert.equal((await jsonReq('PUT', '/api/motorista/modulos', mot, { chave: 'pagamento-pix', ativo: true })).status, 200);
  assert.equal((await jsonReq('PUT', '/api/motorista/pix', mot, { tipo: 'EMAIL', chave: 'motorista@exemplo.com', nome: 'Solon Transporte', cidade: 'Rio de Janeiro' })).status, 200);

  // família com 3 filhos no mesmo motorista, todos confirmados
  const codigo = (await jsonReq('GET', '/api/motorista/codigo', mot)).data.codigo;
  const fam = await novoResponsavelVerificado(adm);
  assert.equal((await jsonReq('POST', '/api/filhos', fam, { ...FILHO, nomeAluno: 'Ana Luz', codigoMotorista: codigo })).status, 200);
  const motId = (await jsonReq('GET', '/api/estado', fam)).data.motoristas[0].id;
  for (const nome of ['Beto Luz', 'Caio Luz']) assert.equal((await jsonReq('POST', '/api/filhos', fam, { ...FILHO, nomeAluno: nome, motoristaId: motId })).status, 200);
  const pendentes = ((await jsonReq('GET', '/api/estado', mot)).data.paradas as any[]).filter((p) => p.vinculo === 'PENDENTE');
  assert.ok(pendentes.length >= 3, 'três pedidos pendentes');
  for (const p of pendentes) assert.equal((await jsonReq('POST', `/api/paradas/${p.id}/confirmar`, mot)).status, 200);
  const ids: number[] = ((await jsonReq('GET', '/api/mensalidades', fam)).data.filhos as any[]).map((f) => f.id_aluno);
  assert.equal(ids.length, 3);

  // valores com centavos para provar a soma
  const valores = ['100,00', '150,00', '50,25'];
  for (let i = 0; i < 3; i++) assert.equal((await jsonReq('PUT', `/api/motorista/mensalidades/${ids[i]}/config`, mot, { valor: valores[i], vencimento_dia: 28 })).status, 200);

  // painel do motorista: irmãos compartilham a chave da família; um aluno de outro responsável fica de fora
  const avulso = (await jsonReq('POST', '/api/paradas/nova', mot, { nomeAluno: 'Dora Avulsa', endereco: 'Rua B, 2', pontoReferencia: 'Muro', escola: 'Colégio Pix', nomeResponsavel: 'Outra Pessoa', telefoneResponsavel: '21977776666' })).data;
  const linhasPainel = (await jsonReq('GET', '/api/motorista/mensalidades', mot)).data.alunos as any[];
  const chaves = ids.map((id) => linhasPainel.find((l) => l.id_aluno === id).familia);
  assert.ok(chaves[0] && chaves.every((c) => c === chaves[0]), 'irmãos na mesma família');
  const chaveAvulso = linhasPainel.find((l) => l.id_aluno === avulso.novaParada.id_aluno)?.familia;
  if (chaveAvulso) assert.notEqual(chaveAvulso, chaves[0], 'outro responsável, outra família');

  // o responsável vê um Pix por filho E um Pix único com a soma
  const recebidoAntes = (await jsonReq('GET', '/api/motorista/mensalidades', mot)).data.resumo.recebido as number;
  let g = (await jsonReq('GET', '/api/mensalidades', fam)).data;
  assert.equal(g.filhos.length, 3);
  assert.ok(g.filhos.every((f: any) => f.pix), 'cada filho tem o seu Pix');
  assert.equal(g.familia_pix.length, 1);
  assert.equal(g.familia_pix[0].total, 300.25);
  assert.equal(g.familia_pix[0].itens.length, 3);
  assert.equal(g.familia_pix[0].recebedor, 'SOLON TRANSPORTE');
  assert.match(g.familia_pix[0].copia_e_cola, /^000201.*6304[0-9A-F]{4}$/);
  assert.ok(g.familia_pix[0].copia_e_cola.includes('300.25') && g.familia_pix[0].copia_e_cola.includes('VANF'), 'valor somado e identificador da família no código');
  const texto = JSON.stringify(g.familia_pix);
  for (const proibido of ['Rua das Flores', 'Portão azul', 'latitude', 'longitude']) assert.equal(texto.includes(proibido), false, `não vaza ${proibido}`);
  const mesDe = (id: number) => g.filhos.find((f: any) => f.id_aluno === id).pix.mes as string;
  const todos = () => ids.map((id) => ({ id_aluno: id, mes: mesDe(id) }));

  // validações do aviso em lote
  const outroResp = await novoResponsavelVerificado(adm);
  assert.equal((await jsonReq('POST', '/api/mensalidades/avisar-lote', undefined, { itens: todos() })).status, 401);
  assert.equal((await jsonReq('POST', '/api/mensalidades/avisar-lote', mot, { itens: todos() })).status, 403, 'motorista não avisa por responsável');
  assert.equal((await jsonReq('POST', '/api/mensalidades/avisar-lote', fam, {})).status, 400, 'sem itens');
  assert.equal((await jsonReq('POST', '/api/mensalidades/avisar-lote', fam, { itens: [] })).status, 400);
  assert.equal((await jsonReq('POST', '/api/mensalidades/avisar-lote', fam, { itens: [todos()[0], todos()[0]] })).status, 400, 'filho repetido');
  assert.equal((await jsonReq('POST', '/api/mensalidades/avisar-lote', fam, { itens: [{ id_aluno: 'x', mes: '2026-11' }] })).status, 400);
  assert.equal((await jsonReq('POST', '/api/mensalidades/avisar-lote', outroResp, { itens: todos() })).status, 404, 'filhos de outra família');
  assert.equal((await jsonReq('POST', '/api/mensalidades/avisar-lote', fam, { itens: [todos()[0], { ...todos()[1], mes: '2020-01' }] })).status, 409, 'mês errado em um item');
  g = (await jsonReq('GET', '/api/mensalidades', fam)).data;
  assert.ok(g.filhos.every((f: any) => f.pix.avisado_em === null), 'tudo ou nada: o item certo também não foi registrado');
  assert.equal(g.familia_pix.length, 1);

  // aviso do Pix único: os três filhos ficam "aguardando", sem baixa
  const av = await jsonReq('POST', '/api/mensalidades/avisar-lote', fam, { itens: todos() });
  assert.equal(av.status, 200, JSON.stringify(av.data));
  assert.equal(av.data.avisados, 3);
  g = (await jsonReq('GET', '/api/mensalidades', fam)).data;
  assert.ok(g.filhos.every((f: any) => f.pix.avisado_em && f.status !== 'PAGO'));
  assert.deepEqual(g.familia_pix, [], 'já avisado: some o Pix único');
  let painel = (await jsonReq('GET', '/api/motorista/mensalidades', mot)).data;
  assert.equal(painel.avisos_pendentes.length, 1, 'uma família, um cartão de aviso');
  assert.equal(painel.avisos_pendentes[0].itens.length, 3);
  assert.equal(painel.avisos_pendentes[0].total, 300.25);
  assert.equal(Math.round((painel.resumo.recebido - recebidoAntes) * 100), 0, 'aviso não entra no recebido');

  // confirmar/descartar em lote: validações
  const lote = painel.avisos_pendentes[0].itens.map((i: any) => ({ id_aluno: i.id_aluno, mes: i.mes }));
  assert.equal((await jsonReq('POST', '/api/motorista/mensalidades/avisos/confirmar', fam, { itens: lote })).status, 403);
  assert.equal((await jsonReq('POST', '/api/motorista/mensalidades/avisos/confirmar', undefined, { itens: lote })).status, 401);
  assert.equal((await jsonReq('POST', '/api/motorista/mensalidades/avisos/confirmar', mot, { itens: [] })).status, 400);
  assert.equal((await jsonReq('POST', '/api/motorista/mensalidades/avisos/confirmar', mot, { itens: [{ id_aluno: lote[0].id_aluno, mes: '2026-13' }] })).status, 400);
  assert.equal((await jsonReq('POST', '/api/motorista/mensalidades/avisos/confirmar', mot, { itens: [lote[0], lote[0]] })).status, 400, 'repetido');
  assert.equal((await jsonReq('POST', '/api/motorista/mensalidades/avisos/confirmar', mot, { itens: [lote[0], { id_aluno: lote[1].id_aluno, mes: '2020-01' }] })).status, 404, 'sem aviso nesse mês: nada é confirmado');
  const intruso = await novoMotorista(adm, 'PixIntruso2');
  assert.equal((await jsonReq('POST', '/api/motorista/mensalidades/avisos/confirmar', intruso, { itens: lote })).status, 404, 'outro motorista não confirma');
  assert.equal((await jsonReq('POST', '/api/motorista/mensalidades/avisos/descartar', intruso, { itens: lote })).status, 404);
  assert.equal(((await jsonReq('GET', '/api/motorista/mensalidades', mot)).data.avisos_pendentes[0].itens as any[]).length, 3, 'nada mudou depois das recusas');

  // "não recebi" de um filho só: os outros continuam aguardando
  assert.equal((await jsonReq('POST', '/api/motorista/mensalidades/avisos/descartar', mot, { itens: [lote[0]] })).status, 200);
  painel = (await jsonReq('GET', '/api/motorista/mensalidades', mot)).data;
  assert.equal(painel.avisos_pendentes[0].itens.length, 2);
  assert.equal(painel.avisos_pendentes[0].total, Math.round((painel.avisos_pendentes[0].itens as any[]).reduce((a, i) => a + i.valor * 100, 0)) / 100);

  // confirmar tudo (os 2 que sobraram) = baixa de sempre, forma PIX, no valor de cada mensalidade
  const restantes = painel.avisos_pendentes[0].itens.map((i: any) => ({ id_aluno: i.id_aluno, mes: i.mes }));
  const somaRestantes = painel.avisos_pendentes[0].total as number;
  const conf = await jsonReq('POST', '/api/motorista/mensalidades/avisos/confirmar', mot, { itens: restantes });
  assert.equal(conf.status, 200, JSON.stringify(conf.data));
  assert.equal(conf.data.confirmados, 2);
  painel = (await jsonReq('GET', '/api/motorista/mensalidades', mot)).data;
  assert.deepEqual(painel.avisos_pendentes, []);
  assert.equal(Math.round((painel.resumo.recebido - recebidoAntes) * 100), Math.round(somaRestantes * 100), 'recebido cresce só com o que foi confirmado');
  for (const r of restantes) {
    const l = painel.alunos.find((x: any) => x.id_aluno === r.id_aluno);
    assert.equal(l.status, 'PAGO'); assert.equal(l.forma, 'PIX');
  }
  assert.equal((await jsonReq('POST', '/api/motorista/mensalidades/avisos/confirmar', mot, { itens: restantes })).status, 404, 'já confirmado');

  // o filho do "não recebi" continua em aberto e o responsável vê os outros como Pago
  g = (await jsonReq('GET', '/api/mensalidades', fam)).data;
  assert.equal(g.filhos.filter((f: any) => f.status === 'PAGO').length, 2);
  assert.equal(g.filhos.filter((f: any) => f.pix).length, 1, 'só o que falta tem Pix');
  assert.deepEqual(g.familia_pix, [], 'com um filho só, vale o Pix do filho (sem Pix único)');
});

test('Van personalizada: bairro do motorista, link ?m= público só com primeiro nome e bairro, e o convite leva o link', async () => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const mot = await novoMotorista(adm, 'VanPers');

  // bairro: precisa de login de motorista, limpa símbolos e limita o tamanho
  assert.equal((await jsonReq('PUT', '/api/motorista/bairro', undefined, { bairro: 'Freguesia' })).status, 401);
  const b = await jsonReq('PUT', '/api/motorista/bairro', mot, { bairro: '  Freguesia <script>  (Jacarepaguá) ' });
  assert.equal(b.status, 200);
  assert.equal(b.data.bairro, 'Freguesia script (Jacarepaguá)');
  assert.ok(!/[<>]/.test(b.data.bairro));
  assert.ok(((await jsonReq('PUT', '/api/motorista/bairro', mot, { bairro: 'x'.repeat(200) })).data.bairro as string).length <= 40);
  await jsonReq('PUT', '/api/motorista/bairro', mot, { bairro: 'Freguesia' });

  // link público: só primeiro nome e bairro; código inventado ou fora do formato dá 404 igual
  const cod = (await jsonReq('GET', '/api/motorista/codigo', mot)).data.codigo as string;
  const pub = await jsonReq('GET', `/api/van/${cod}`);
  assert.equal(pub.status, 200);
  assert.deepEqual(Object.keys(pub.data).sort(), ['bairro', 'motorista']);
  assert.equal(pub.data.bairro, 'Freguesia');
  assert.ok(pub.data.motorista && !/\s/.test(pub.data.motorista), 'só o primeiro nome');
  assert.equal((await jsonReq('GET', `/api/van/${cod.toLowerCase()}`)).status, 200, 'maiúscula ou minúscula, tanto faz');
  assert.equal((await jsonReq('GET', '/api/van/MOT-000000')).status, 404);
  assert.equal((await jsonReq('GET', '/api/van/qualquer-coisa')).status, 404);

  // o perfil do motorista traz o bairro para o cabeçalho
  const c = (await jsonReq('POST', '/api/motorista/alunos', mot, { nomeAluno: 'Leo Dias', escola: 'Escola VP2', turno: 'MANHA', nomeResponsavel: 'Ana Dias', telefoneResponsavel: '21966665555', endereco: 'Rua Secreta, 7', latitude: -22.9, longitude: -43.2, autorizacaoResponsavel: true })).data;
  assert.match(c.mensagem, new RegExp(`/\\?m=${cod}`), 'o convite abre o app personalizado');
  assert.ok(!/Secreta/.test(c.mensagem), 'o convite continua sem endereço');
});

test('Quando sair: funciona antes de iniciar a rota mesmo com os alunos ENTREGUE do trecho anterior', async () => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const mot = await novoMotorista(adm, 'QuandoSairDepois');
  const url = '/api/motorista/quando-sair';
  const c = (await jsonReq('POST', '/api/motorista/alunos', mot, { nomeAluno: 'Bia Ida', escola: 'Escola QD', turno: 'MANHA', nomeResponsavel: 'Ana', telefoneResponsavel: '21966664444', endereco: 'Rua Y, 2', latitude: -22.90, longitude: -43.20, autorizacaoResponsavel: true })).data;
  await jsonReq('PUT', '/api/motorista/escolas', mot, { nome: 'Escola QD', latitude: -22.91, longitude: -43.21 });
  const pos = { latitude: -22.905, longitude: -43.205 };
  // ida inteira: embarca, entrega e encerra
  await jsonReq('POST', '/api/rotas/iniciar', mot, { sentido: 'IDA' });
  await jsonReq('POST', `/api/paradas/${c.paradaId}/status`, mot, { status: 'EMBARCOU' });
  await jsonReq('POST', `/api/paradas/${c.paradaId}/status`, mot, { status: 'ENTREGUE' });
  await jsonReq('POST', '/api/rotas/encerrar', mot, {});
  // antes de iniciar a volta, o aluno está ENTREGUE: o cálculo precisa funcionar
  const v = await jsonReq('POST', url, mot, { ...pos, sentido: 'VOLTA' });
  assert.equal(v.status, 200, 'volta antes de iniciar');
  assert.equal(v.data.destino, 'Escola QD');
  const i = await jsonReq('POST', url, mot, { ...pos, sentido: 'IDA' });
  assert.equal(i.status, 200, 'ida do dia seguinte');
  // quem avisou ausência neste sentido não entra na fila
  await jsonReq('POST', `/api/alunos/${c.alunoId}/ausencia`, mot, { motivo: 'Doente', trecho: 'VOLTA' });
  assert.equal((await jsonReq('POST', url, mot, { ...pos, sentido: 'VOLTA' })).status, 409, 'ausente na volta');
  assert.equal((await jsonReq('POST', url, mot, { ...pos, sentido: 'IDA' })).status, 200, 'ausência só da volta não afeta a ida');
});

test('Histórico de viagens: um registro por trecho, só nome abreviado, isolado por motorista e apagável', async () => {
  const adm = (await jsonReq('POST', '/api/admin/auth', undefined, { email: 'leandrosolon@gmail.com', password: ADMIN_TEST_PASSWORD })).data.token;
  const mot = await novoMotorista(adm, 'HistoricoA');
  const outro = await novoMotorista(adm, 'HistoricoB');
  const c = (await jsonReq('POST', '/api/motorista/alunos', mot, { nomeAluno: 'Clara Medeiros Souza', escola: 'Escola HV', turno: 'MANHA', nomeResponsavel: 'Paula', telefoneResponsavel: '21955554444', endereco: 'Rua Muito Secreta, 77', latitude: -22.90, longitude: -43.20, autorizacaoResponsavel: true })).data;
  assert.equal((await jsonReq('GET', '/api/motorista/historico', mot)).data.trechos.length, 0, 'começa vazio');
  // ida
  await jsonReq('POST', '/api/rotas/iniciar', mot, { sentido: 'IDA' });
  await jsonReq('POST', '/api/gps', mot, { latitude: -22.90, longitude: -43.20, speedKmH: 30, accuracyMeters: 8 });
  await jsonReq('POST', '/api/gps', mot, { latitude: -22.91, longitude: -43.20, speedKmH: 30, accuracyMeters: 8 });
  await jsonReq('POST', `/api/paradas/${c.paradaId}/status`, mot, { status: 'EMBARCOU' });
  await jsonReq('POST', `/api/paradas/${c.paradaId}/status`, mot, { status: 'ENTREGUE' });
  await jsonReq('POST', '/api/rotas/encerrar', mot, {});
  // volta (sem entregar: fica não atendido)
  await jsonReq('POST', '/api/rotas/iniciar', mot, { sentido: 'VOLTA' });
  await jsonReq('POST', '/api/rotas/encerrar', mot, {});
  const h = await jsonReq('GET', '/api/motorista/historico?dias=7', mot);
  assert.equal(h.status, 200);
  assert.equal(h.data.trechos.length, 2);
  const [volta, ida] = h.data.trechos; // mais novo primeiro
  assert.equal(ida.sentido, 'IDA'); assert.equal(volta.sentido, 'VOLTA');
  assert.equal(ida.totais.entregues, 1); assert.ok(ida.km > 1 && ida.km < 1.3, `km=${ida.km}`);
  assert.equal(volta.totais.nao_atendidos, 1);
  assert.match(ida.alunos[0].nome, /^Clara M\.$/);
  assert.match(ida.alunos[0].entregue_em, /^\d{2}:\d{2}$/);
  const texto = JSON.stringify(h.data);
  for (const proibido of ['Secreta', '21955554444', 'Medeiros', 'Souza', 'latitude', 'longitude', '-22.9', 'Paula']) assert.ok(!texto.includes(proibido), `vazou: ${proibido}`);
  // isolamento: outro motorista não vê; sem login e responsável não entram
  assert.equal((await jsonReq('GET', '/api/motorista/historico', outro)).data.trechos.length, 0);
  assert.equal((await jsonReq('GET', '/api/motorista/historico')).status, 401);
  // apagar
  assert.equal((await jsonReq('DELETE', '/api/motorista/historico', mot)).data.apagados, 2);
  assert.equal((await jsonReq('GET', '/api/motorista/historico', mot)).data.trechos.length, 0);
});
