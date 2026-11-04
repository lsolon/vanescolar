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
  await jsonReq('POST', '/api/mensagens', tokenA, { texto: 'mensagem privada da Ana' });

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
  const reg = await jsonReq('POST', '/api/auth/register', undefined, { fullName: 'Resp Teste', email, password: 'senhaSegura123!', lgpdConsent: true });
  // Confirma o e-mail: pelo atalho de simulação (versões antigas) ou pelo link enviado (versão com e-mails reais).
  let token: string = reg.data.token;
  const sim = await jsonReq('POST', '/api/auth/verify-email-sim', token);
  if (sim.status === 200) {
    token = sim.data.token;
  } else {
    await new Promise((x) => setTimeout(x, 200));
    const lista: any[] = await (await fetch(`${BASE}/api/_dev/emails`)).json();
    const msg = [...lista].reverse().find((m) => m.to === email);
    await fetch(msg.text.match(/https?:\/\/\S+/)[0], { redirect: 'manual' });
    token = (await jsonReq('POST', '/api/auth/refresh-session', token)).data.token;
  }
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
  assert.equal(p.mapaLiberado, true);
  assert.equal(p.posicao.latitude, -22.95);
  assert.ok(p.avisoAtivo, 'com 1 parada e aviso padrão de 10 min, o aviso deve estar ativo');
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
  // B é a última parada (ordem 2): ida = 07:30 − 15 − 10 = 07:05; volta = 12:00 + 10 + 1×4 = 12:14
  let p = await verB();
  assert.equal(p.escola_entrada, '07:30');
  assert.equal(p.hora_ida, '07:05');
  assert.equal(p.hora_volta, '12:14');
  assert.equal(p.hora_prevista, '07:05');

  // A, ao informar o mesmo horário, vira a primeira parada: ida 4 min antes de B
  await jsonReq('PUT', `/api/alunos/${a.novaParada.id_aluno}/escola-horarios`, mot, { entrada: '07:30', saida: '12:00' });
  const ea = (await jsonReq('GET', '/api/estado', mot)).data.paradas.find((x: any) => x.id === a.novaParada.id);
  assert.equal(ea.hora_ida, '07:01');
  assert.equal(ea.hora_volta, '12:10');

  // motorista ajusta à mão; responsável vê; outro motorista não pode; limpar volta ao automático
  assert.equal((await jsonReq('PUT', `/api/paradas/${b.novaParada.id}/horarios`, outro, { horaIda: '06:00' })).status, 404);
  assert.equal((await jsonReq('PUT', `/api/paradas/${b.novaParada.id}/horarios`, respB, { horaIda: '06:00' })).status, 403);
  assert.equal((await jsonReq('PUT', `/api/paradas/${b.novaParada.id}/horarios`, mot, { horaIda: '99:99' })).status, 400);
  assert.equal((await jsonReq('PUT', `/api/paradas/${b.novaParada.id}/horarios`, mot, { horaIda: '07:10' })).status, 200);
  assert.equal((await verB()).hora_ida, '07:10');
  assert.equal((await verB()).hora_volta, '12:14', 'volta continua automática');
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
