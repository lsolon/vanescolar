/**
 * ============================================================================
 * PERSISTÊNCIA DO SERVIDOR (persistence.ts)
 * ----------------------------------------------------------------------------
 * O servidor mantém o estado em memória (rápido) e esta camada o grava em um
 * armazenamento durável: carrega ao iniciar, salva após mudanças (com pequeno
 * atraso para agrupar escritas) e força a gravação ao receber SIGTERM.
 *
 * Armazenamentos disponíveis (variável PERSISTENCE):
 *  - firestore : Google Firestore (funciona no AI Studio / Cloud Run e no VPS)
 *  - file      : arquivos JSON em DATA_DIR (VPS ou testes locais)
 *  - memory    : sem persistência (comportamento antigo)
 * Se PERSISTENCE não for informado: firestore quando FIREBASE_SERVICE_ACCOUNT
 * ou FIRESTORE=true estiver definido; file quando DATA_DIR estiver definido;
 * caso contrário memory.
 *
 * FORMATO (v2): um registro por entidade (um usuário, uma parada, um motorista
 * com a sua viagem, um pagamento...). Cada registro tem no máximo alguns KB, então
 * o limite de 1 MB por documento do Firestore deixa de ser um problema, e cada
 * gravação envia só o que mudou. Em cada coleção há um registro "__meta" com uma
 * revisão, que permite às outras instâncias saber (1 leitura) se precisam reler.
 *
 * MIGRAÇÃO: se a coleção nova ainda não existe, os dados são lidos do formato
 * antigo (um documento grande por assunto) e gravados no novo. O formato antigo
 * NÃO é apagado, então dá para voltar à versão anterior do app sem perder nada.
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export type DocName = 'users' | 'invitations' | 'state' | 'settings' | 'mensalidades' | 'financeiro' | 'mensagens';
export const DOC_NAMES: DocName[] = ['users', 'invitations', 'state', 'settings', 'mensalidades', 'financeiro', 'mensagens'];

const META = '__meta';

/** Armazenamento de registros: para cada assunto (DocName), um conjunto de chave → texto JSON. */
export interface RecordStore {
  readonly kind: string;
  /** Todos os registros do assunto, incluindo o "__meta". Vazio se ainda não existe. */
  readAll(name: DocName): Promise<Record<string, string>>;
  readKey(name: DocName, key: string): Promise<string | null>;
  write(name: DocName, key: string, json: string): Promise<void>;
  remove(name: DocName, key: string): Promise<void>;
  /** Formato antigo (um documento por assunto), só para migrar. */
  readLegacy(name: DocName): Promise<string | null>;
}

/** Armazenamento em arquivos JSON (um arquivo por assunto, com todos os registros). */
export class FileStore implements RecordStore {
  readonly kind = 'file';
  constructor(private dir: string) {
    fs.mkdirSync(dir, { recursive: true });
  }
  private file(name: DocName) { return path.join(this.dir, `${name}.records.json`); }
  private async load(name: DocName): Promise<Record<string, string>> {
    try { return JSON.parse(await fs.promises.readFile(this.file(name), 'utf8')); }
    catch (err: any) { if (err?.code === 'ENOENT') return {}; throw err; }
  }
  private queue: Promise<void> = Promise.resolve();
  private mutate(name: DocName, fn: (r: Record<string, string>) => void) {
    this.queue = this.queue.then(async () => {
      const r = await this.load(name);
      fn(r);
      const tmp = `${this.file(name)}.tmp`;
      await fs.promises.writeFile(tmp, JSON.stringify(r), 'utf8');
      await fs.promises.rename(tmp, this.file(name)); // gravação atômica
    });
    return this.queue;
  }
  readAll(name: DocName) { return this.load(name); }
  async readKey(name: DocName, key: string) { return (await this.load(name))[key] ?? null; }
  write(name: DocName, key: string, json: string) { return this.mutate(name, (r) => { r[key] = json; }); }
  remove(name: DocName, key: string) { return this.mutate(name, (r) => { delete r[key]; }); }
  async readLegacy(name: DocName) {
    try { return await fs.promises.readFile(path.join(this.dir, `${name}.json`), 'utf8'); }
    catch (err: any) { if (err?.code === 'ENOENT') return null; throw err; }
  }
}

/** Subconjunto mínimo da API do Firestore que usamos (facilita testes com um "falso"). */
export interface FirestoreLike {
  collection(name: string): {
    doc(id: string): {
      get(): Promise<{ exists: boolean; data(): any }>;
      set(data: any): Promise<unknown>;
      delete(): Promise<unknown>;
    };
    get(): Promise<{ docs: Array<{ id: string; data(): any }> }>;
  };
}

/** Firestore: coleção `<prefixo>_<assunto>`, um documento por registro. Formato antigo: `vanescolar/<assunto>`. */
export class FirestoreStore implements RecordStore {
  readonly kind = 'firestore';
  constructor(private db: FirestoreLike, private legacyCollection = 'vanescolar', private prefix = 'vanescolar') {}
  private col(name: DocName) { return this.db.collection(`${this.prefix}_${name}`); }
  // O id do documento não pode ter "/": as chaves usam ":" e "-" apenas, mas protegemos mesmo assim.
  private id(key: string) { return key.replace(/\//g, '%2F'); }
  private unid(id: string) { return id.replace(/%2F/g, '/'); }
  async readAll(name: DocName) {
    const snap = await this.col(name).get();
    const out: Record<string, string> = {};
    for (const d of snap.docs) { const j = d.data()?.json; if (typeof j === 'string') out[this.unid(d.id)] = j; }
    return out;
  }
  async readKey(name: DocName, key: string) {
    const snap = await this.col(name).doc(this.id(key)).get();
    return snap.exists ? (snap.data()?.json ?? null) : null;
  }
  async write(name: DocName, key: string, json: string) {
    await this.col(name).doc(this.id(key)).set({ json, updatedAt: new Date().toISOString() });
  }
  async remove(name: DocName, key: string) { await this.col(name).doc(this.id(key)).delete(); }
  async readLegacy(name: DocName) {
    const snap = await this.db.collection(this.legacyCollection).doc(name).get();
    return snap.exists ? (snap.data()?.json ?? null) : null;
  }
}

/** Erro de credencial com código curto (seguro para exibir: nunca contém valores secretos). */
export class CredencialError extends Error {
  constructor(public codigo: string) { super(codigo); }
}

/** Cria o Firestore real (firebase-admin, API modular) usando conta de serviço ou credenciais padrão do Google Cloud. */
export async function createFirestoreFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<FirestoreLike> {
  const { initializeApp, getApps, cert, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const projectId = env.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID || undefined;
  if (!getApps().length) {
    const raw = env.FIREBASE_SERVICE_ACCOUNT;
    if (raw) {
      const cred = JSON.parse(raw);
      for (const campo of ['type', 'project_id', 'private_key', 'client_email']) {
        if (typeof cred?.[campo] !== 'string' || !cred[campo]) throw new CredencialError(`campo_ausente_${campo}`);
      }
      if (cred.type !== 'service_account') throw new CredencialError('type_nao_e_service_account');
      if (!String(cred.private_key).includes('BEGIN PRIVATE KEY')) throw new CredencialError('private_key_formato_invalido');
      if (projectId && projectId !== cred.project_id) throw new CredencialError('project_id_difere_de_FIREBASE_PROJECT_ID');
      initializeApp({ credential: cert(cred), projectId: projectId || cred.project_id });
    } else {
      initializeApp({ credential: applicationDefault(), projectId });
    }
  }
  return getFirestore() as unknown as FirestoreLike;
}

export function chooseStoreKind(env: NodeJS.ProcessEnv = process.env): 'firestore' | 'file' | 'memory' {
  const forced = (env.PERSISTENCE || '').toLowerCase();
  if (forced === 'firestore' || forced === 'file' || forced === 'memory') return forced;
  if (env.FIREBASE_SERVICE_ACCOUNT || env.FIRESTORE === 'true') return 'firestore';
  if (env.DATA_DIR) return 'file';
  return 'memory';
}

export type Snapshot = Record<DocName, unknown>;

type Registros = Record<string, string>;

/** Converte o valor de um assunto em registros (uma chave por entidade). */
export function paraRegistros(name: DocName, valor: any): Registros {
  const out: Registros = {};
  const j = (v: unknown) => JSON.stringify(v);
  if (valor === null || valor === undefined) return out;
  switch (name) {
    case 'users':
      for (const u of valor as any[]) out[`u-${u.id}`] = j(u);
      break;
    case 'invitations':
      for (const c of valor as any[]) out[`i-${c.code}`] = j(c);
      break;
    case 'settings':
      out['settings'] = j(valor);
      break;
    case 'state':
      for (const p of (valor.paradas ?? []) as any[]) out[`parada-${p.id}`] = j(p);
      for (const [id, t] of Object.entries(valor.trips ?? {})) out[`trip-${id}`] = j(t);
      break;
    case 'financeiro':
      for (const l of (valor.lancamentos ?? []) as any[]) out[`lan-${l.id_motorista}-${l.id}`] = j(l);
      for (const c of (valor.custos_fixos ?? []) as any[]) out[`fix-${c.id_motorista}-${c.id}`] = j(c);
      break;
    case 'mensagens':
      for (const m of (valor.mensagens ?? []) as any[]) out[`msg-${m.id_motorista}-${m.id}`] = j(m);
      break;
    case 'mensalidades':
      for (const [k, c] of Object.entries(valor.configs ?? {})) out[`cfg-${k}`] = j(c);
      for (const p of (valor.pagamentos ?? []) as any[]) out[`pg-${p.id_motorista}-${p.id_aluno}-${p.mes}`] = j(p);
      break;
  }
  return out;
}

/** Faz o caminho inverso: monta o valor do assunto a partir dos registros. */
export function dosRegistros(name: DocName, reg: Registros): any {
  const vals = (prefixo: string) => Object.entries(reg).filter(([k]) => k.startsWith(prefixo)).map(([k, v]) => [k, JSON.parse(v)] as const);
  const porId = (a: any, b: any) => (Number(a.id) || 0) - (Number(b.id) || 0);
  switch (name) {
    case 'users': return vals('u-').map(([, v]) => v).sort(porId);
    case 'invitations': return vals('i-').map(([, v]) => v).sort((a: any, b: any) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')));
    case 'settings': return reg['settings'] ? JSON.parse(reg['settings']) : undefined;
    case 'state': return {
      paradas: vals('parada-').map(([, v]) => v).sort(porId),
      trips: Object.fromEntries(vals('trip-').map(([k, v]) => [k.slice('trip-'.length), v]))
    };
    case 'financeiro': return {
      lancamentos: vals('lan-').map(([, v]) => v).sort(porId),
      custos_fixos: vals('fix-').map(([, v]) => v).sort(porId)
    };
    case 'mensagens': return { mensagens: vals('msg-').map(([, v]) => v).sort(porId) };
    case 'mensalidades': return {
      configs: Object.fromEntries(vals('cfg-').map(([k, v]) => [k.slice('cfg-'.length), v])),
      pagamentos: vals('pg-').map(([, v]) => v)
    };
  }
}

const novaRevisao = () => crypto.randomBytes(6).toString('hex');
const EM_LOTES = 10;

export class Persistence {
  /** Último conteúdo gravado/lido de cada registro (para gravar só o que mudou). */
  private lastSaved = new Map<DocName, Registros>();
  /** Revisão conhecida de cada assunto (para saber se outra instância gravou algo). */
  private rev = new Map<DocName, string>();
  private timer: NodeJS.Timeout | null = null;
  private saving: Promise<void> = Promise.resolve();
  private getSnapshot: (() => Snapshot) | null = null;

  /** Motivo (código curto, sem dados sensíveis) pelo qual o armazenamento durável não está ativo. */
  reason = '';

  constructor(private store: RecordStore | null, private delayMs = 2000) {}

  /** Desativa a gravação (ex.: falha ao ler o estado salvo). Evita sobrescrever dados reais com estado vazio. */
  disable(reason: string) {
    this.store = null;
    this.reason = reason;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  get kind() {
    return this.store ? this.store.kind : 'memory';
  }

  /** Lê os registros de um assunto; migra do formato antigo se a coleção nova ainda não existe. */
  private async lerAssunto(store: RecordStore, name: DocName): Promise<{ valor: any; existe: boolean }> {
    const todos = await store.readAll(name);
    if (todos[META] !== undefined) {
      const { [META]: meta, ...registros } = todos;
      this.lastSaved.set(name, registros);
      try { this.rev.set(name, JSON.parse(meta).rev); } catch { this.rev.delete(name); }
      return { valor: dosRegistros(name, registros), existe: true };
    }
    // Coleção nova ainda não inicializada: tenta o formato antigo (uma vez).
    const antigo = await store.readLegacy(name);
    if (antigo) {
      const valor = JSON.parse(antigo);
      // lastSaved vazio => a próxima gravação escreve tudo no formato novo (a migração).
      this.lastSaved.set(name, {});
      this.rev.delete(name);
      return { valor, existe: true };
    }
    this.lastSaved.set(name, {});
    this.rev.delete(name);
    return { valor: undefined, existe: false };
  }

  /** Lê os assuntos salvos. Retorna só os que existem. */
  async load(names: DocName[] = DOC_NAMES): Promise<Partial<Record<DocName, any>>> {
    const out: Partial<Record<DocName, any>> = {};
    if (!this.store) return out;
    for (const name of names) {
      const { valor, existe } = await this.lerAssunto(this.store, name);
      if (existe) out[name] = valor;
    }
    return out;
  }

  /**
   * Para várias instâncias do servidor: relê só os assuntos que OUTRA instância alterou.
   * Custa 1 leitura por assunto (o registro "__meta"); só relê tudo se a revisão mudou.
   */
  async reloadIfChanged(names: DocName[]): Promise<Partial<Record<DocName, any>>> {
    const out: Partial<Record<DocName, any>> = {};
    const store = this.store;
    if (!store) return out;
    for (const name of names) {
      const meta = await store.readKey(name, META);
      let revRemota: string | undefined;
      try { revRemota = meta ? JSON.parse(meta).rev : undefined; } catch {}
      if (revRemota === undefined || revRemota === this.rev.get(name)) continue;
      const { valor, existe } = await this.lerAssunto(store, name);
      if (existe) out[name] = valor;
    }
    return out;
  }

  attach(getSnapshot: () => Snapshot) {
    this.getSnapshot = getSnapshot;
  }

  /** Agenda uma gravação (várias chamadas seguidas viram uma só). */
  scheduleSave() {
    if (!this.store || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush().catch((err) => console.error('[Persistência] Falha ao salvar:', err?.message || err));
    }, this.delayMs);
  }

  /** Grava agora os registros que mudaram desde a última gravação. */
  flush(): Promise<void> {
    if (!this.store || !this.getSnapshot) return Promise.resolve();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const store = this.store;
    const snapshot = this.getSnapshot();
    // Copia os registros já aqui: o que for gravado é exatamente o que existia neste instante.
    const novos = new Map<DocName, Registros>();
    for (const name of DOC_NAMES) novos.set(name, paraRegistros(name, snapshot[name]));

    this.saving = this.saving.then(async () => {
      for (const name of DOC_NAMES) {
        const atuais = novos.get(name)!;
        const antes = this.lastSaved.get(name) ?? {};
        const gravar = Object.entries(atuais).filter(([k, v]) => antes[k] !== v);
        const apagar = Object.keys(antes).filter((k) => !(k in atuais));
        const primeiraVez = !this.rev.has(name);
        if (gravar.length === 0 && apagar.length === 0 && !primeiraVez) continue;
        for (let i = 0; i < gravar.length; i += EM_LOTES) {
          await Promise.all(gravar.slice(i, i + EM_LOTES).map(([k, v]) => store.write(name, k, v)));
        }
        for (let i = 0; i < apagar.length; i += EM_LOTES) {
          await Promise.all(apagar.slice(i, i + EM_LOTES).map((k) => store.remove(name, k)));
        }
        // A revisão só muda depois dos dados, para quem a ler já encontrar o conteúdo novo.
        const rev = novaRevisao();
        await store.write(name, META, JSON.stringify({ rev, v: 2 }));
        this.rev.set(name, rev);
        this.lastSaved.set(name, atuais);
      }
    });
    return this.saving;
  }
}

/** Monta a persistência escolhida pelo ambiente. Em caso de falha ao iniciar o Firestore, cai para memória. */
export async function createPersistence(env: NodeJS.ProcessEnv = process.env): Promise<Persistence> {
  const kind = chooseStoreKind(env);
  let reason = '';
  if (kind === 'memory') reason = env.PERSISTENCE === 'memory' ? 'PERSISTENCE=memory' : 'sem_FIREBASE_SERVICE_ACCOUNT_nem_DATA_DIR';
  try {
    if (kind === 'firestore') {
      return new Persistence(new FirestoreStore(await createFirestoreFromEnv(env)));
    }
    if (kind === 'file') {
      return new Persistence(new FileStore(env.DATA_DIR || path.resolve(process.cwd(), 'data')));
    }
  } catch (err: any) {
    console.error('[Persistência] Não foi possível iniciar o armazenamento, usando memória:', err?.message || err);
    reason = err instanceof SyntaxError ? 'FIREBASE_SERVICE_ACCOUNT_nao_e_json_valido'
      : err instanceof CredencialError ? `credencial_${err.codigo}`
      : `falha_ao_iniciar_firestore${typeof err?.code === 'string' ? '_' + err.code.replace(/[^a-z0-9/_-]/gi, '').slice(0, 40) : ''}`;
  }
  const p = new Persistence(null);
  p.reason = reason;
  return p;
}
