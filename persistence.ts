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
 *  - file      : arquivo JSON em DATA_DIR (VPS ou testes locais)
 *  - memory    : sem persistência (comportamento antigo)
 * Se PERSISTENCE não for informado: firestore quando FIREBASE_SERVICE_ACCOUNT
 * ou FIRESTORE=true estiver definido; file quando DATA_DIR estiver definido;
 * caso contrário memory.
 *
 * Cada "documento" é gravado como texto JSON (limite do Firestore: 1 MB por
 * documento, suficiente para o MVP).
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';

export type DocName = 'users' | 'invitations' | 'state' | 'settings';
export const DOC_NAMES: DocName[] = ['users', 'invitations', 'state', 'settings'];

export interface DocStore {
  readonly kind: string;
  read(name: DocName): Promise<string | null>;
  write(name: DocName, json: string): Promise<void>;
}

/** Armazenamento em arquivos JSON (um arquivo por documento). */
export class FileStore implements DocStore {
  readonly kind = 'file';
  constructor(private dir: string) {
    fs.mkdirSync(dir, { recursive: true });
  }
  private file(name: DocName) {
    return path.join(this.dir, `${name}.json`);
  }
  async read(name: DocName) {
    try {
      return await fs.promises.readFile(this.file(name), 'utf8');
    } catch (err: any) {
      if (err?.code === 'ENOENT') return null;
      throw err;
    }
  }
  async write(name: DocName, json: string) {
    const tmp = `${this.file(name)}.tmp`;
    await fs.promises.writeFile(tmp, json, 'utf8');
    await fs.promises.rename(tmp, this.file(name)); // gravação atômica
  }
}

/** Subconjunto mínimo da API do Firestore que usamos (facilita testes com um "falso"). */
export interface FirestoreLike {
  collection(name: string): {
    doc(id: string): {
      get(): Promise<{ exists: boolean; data(): any }>;
      set(data: any): Promise<unknown>;
    };
  };
}

export class FirestoreStore implements DocStore {
  readonly kind = 'firestore';
  constructor(private db: FirestoreLike, private collectionName = 'vanescolar') {}
  async read(name: DocName) {
    const snap = await this.db.collection(this.collectionName).doc(name).get();
    return snap.exists ? (snap.data()?.json ?? null) : null;
  }
  async write(name: DocName, json: string) {
    await this.db
      .collection(this.collectionName)
      .doc(name)
      .set({ json, updatedAt: new Date().toISOString() });
  }
}

/** Cria o Firestore real (firebase-admin) usando conta de serviço ou credenciais padrão do Google Cloud. */
export async function createFirestoreFromEnv(): Promise<FirestoreLike> {
  const admin: any = await import('firebase-admin');
  const appMod = admin.default ?? admin;
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || undefined;
  if (!appMod.apps?.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (raw) {
      const cred = JSON.parse(raw);
      appMod.initializeApp({ credential: appMod.credential.cert(cred), projectId: projectId || cred.project_id });
    } else {
      appMod.initializeApp({ credential: appMod.credential.applicationDefault(), projectId });
    }
  }
  return appMod.firestore();
}

export function chooseStoreKind(env: NodeJS.ProcessEnv = process.env): 'firestore' | 'file' | 'memory' {
  const forced = (env.PERSISTENCE || '').toLowerCase();
  if (forced === 'firestore' || forced === 'file' || forced === 'memory') return forced;
  if (env.FIREBASE_SERVICE_ACCOUNT || env.FIRESTORE === 'true') return 'firestore';
  if (env.DATA_DIR) return 'file';
  return 'memory';
}

export type Snapshot = Record<DocName, unknown>;

export class Persistence {
  private lastSaved = new Map<DocName, string>();
  private timer: NodeJS.Timeout | null = null;
  private saving: Promise<void> = Promise.resolve();
  private getSnapshot: (() => Snapshot) | null = null;

  /** Motivo (código curto, sem dados sensíveis) pelo qual o armazenamento durável não está ativo. */
  reason = '';

  constructor(private store: DocStore | null, private delayMs = 2000) {}

  /** Desativa a gravação (ex.: falha ao ler o estado salvo). Evita sobrescrever dados reais com estado vazio. */
  disable(reason: string) {
    this.store = null;
    this.reason = reason;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  get kind() {
    return this.store ? this.store.kind : 'memory';
  }

  /** Lê os documentos salvos. Retorna null para documentos inexistentes. */
  async load(): Promise<Partial<Record<DocName, any>>> {
    const out: Partial<Record<DocName, any>> = {};
    if (!this.store) return out;
    for (const name of DOC_NAMES) {
      const raw = await this.store.read(name);
      if (raw) {
        out[name] = JSON.parse(raw);
        this.lastSaved.set(name, raw);
      }
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

  /** Grava agora os documentos que mudaram desde a última gravação. */
  flush(): Promise<void> {
    if (!this.store || !this.getSnapshot) return Promise.resolve();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const store = this.store;
    const snapshot = this.getSnapshot();
    this.saving = this.saving.then(async () => {
      for (const name of DOC_NAMES) {
        const json = JSON.stringify(snapshot[name] ?? null);
        if (this.lastSaved.get(name) === json) continue;
        await store.write(name, json);
        this.lastSaved.set(name, json);
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
      return new Persistence(new FirestoreStore(await createFirestoreFromEnv()));
    }
    if (kind === 'file') {
      return new Persistence(new FileStore(env.DATA_DIR || path.resolve(process.cwd(), 'data')));
    }
  } catch (err: any) {
    console.error('[Persistência] Não foi possível iniciar o armazenamento, usando memória:', err?.message || err);
    reason = err instanceof SyntaxError ? 'FIREBASE_SERVICE_ACCOUNT_nao_e_json_valido' : 'falha_ao_iniciar_firestore';
  }
  const p = new Persistence(null);
  p.reason = reason;
  return p;
}
