/**
 * LOG DE USO (fase de testes)
 * ----------------------------------------------------------------------------
 * Registra o que acontece no app: cada ação que altera dados (rota, status, resultado, tempo) e cada toque na tela
 * (botão, aba, erro). Serve para ver depois, em ordem, o que foi feito e como.
 *
 * PRIVACIDADE (LGPD de menores): o log NÃO guarda nome, endereço, telefone, coordenadas, senha, token, texto de
 * mensagem nem IP. Guarda só números internos (id da parada), nomes de ação, horários e resultados.
 * Fica desligado em produção (DEMO_MODE=false e sem MODO_TESTE_SEM_LOGIN) a não ser que LOG_USO=true.
 * ----------------------------------------------------------------------------
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { FirestoreLike } from './persistence';

export interface EventoUso {
  t: string;
  origem: 'api' | 'tela';
  inst: string;
  papel: string;
  uid?: number | string;
  sessao?: string;
  acao: string;
  rota?: string;
  metodo?: string;
  status?: number;
  ms?: number;
  det?: Record<string, string | number | boolean>;
}

export interface LogStore {
  gravarLote(eventos: EventoUso[]): Promise<void>;
  lerTudo(): Promise<EventoUso[]>;
  limpar(): Promise<void>;
}

export class LogArquivo implements LogStore {
  constructor(private arquivo: string) {}
  async gravarLote(eventos: EventoUso[]) {
    fs.mkdirSync(path.dirname(this.arquivo), { recursive: true });
    fs.appendFileSync(this.arquivo, eventos.map((e) => JSON.stringify(e)).join('\n') + '\n');
  }
  async lerTudo() {
    if (!fs.existsSync(this.arquivo)) return [];
    return fs.readFileSync(this.arquivo, 'utf8').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
  }
  async limpar() { if (fs.existsSync(this.arquivo)) fs.unlinkSync(this.arquivo); }
}

/** Firestore: um documento por lote (até algumas centenas de eventos), na coleção `<prefixo>_log_uso`. */
export class LogFirestore implements LogStore {
  constructor(private db: FirestoreLike, private colecao = 'vanescolar_log_uso') {}
  async gravarLote(eventos: EventoUso[]) {
    const id = `lote-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    await this.db.collection(this.colecao).doc(id).set({ json: JSON.stringify(eventos), criadoEm: new Date().toISOString() });
  }
  async lerTudo() {
    const snap = await this.db.collection(this.colecao).get();
    return snap.docs.flatMap((d) => { try { return JSON.parse(d.data()?.json ?? '[]'); } catch { return []; } });
  }
  async limpar() {
    const snap = await this.db.collection(this.colecao).get();
    for (const d of snap.docs) await this.db.collection(this.colecao).doc(d.id).delete();
  }
}

const MEMORIA_MAX = 5000;

export class LogUso {
  private pendente: EventoUso[] = [];
  private memoria: EventoUso[] = [];
  private timer: NodeJS.Timeout | null = null;
  constructor(public ativo: boolean, public instancia: string, private store: LogStore | null) {}

  registrar(e: Omit<EventoUso, 't' | 'inst'>) {
    if (!this.ativo) return;
    const ev: EventoUso = { t: new Date().toISOString(), inst: this.instancia, ...e };
    this.memoria.push(ev);
    if (this.memoria.length > MEMORIA_MAX) this.memoria.splice(0, this.memoria.length - MEMORIA_MAX);
    if (this.store) {
      this.pendente.push(ev);
      if (this.pendente.length >= 200) void this.flush();
    }
  }

  iniciar() {
    if (!this.ativo || !this.store || this.timer) return;
    this.timer = setInterval(() => { void this.flush(); }, 5000);
    this.timer.unref?.();
  }

  async flush() {
    if (!this.store || this.pendente.length === 0) return;
    const lote = this.pendente.splice(0, this.pendente.length);
    try { await this.store.gravarLote(lote); }
    catch (err: any) { console.error('[LogUso] Falha ao gravar o lote:', err?.message || err); this.pendente.unshift(...lote.slice(-500)); }
  }

  /** Tudo o que foi registrado (todas as instâncias, quando há armazenamento), em ordem de horário. */
  async exportar(): Promise<EventoUso[]> {
    await this.flush();
    const todos = this.store ? await this.store.lerTudo() : this.memoria.slice();
    return todos.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  }

  async limpar() {
    this.memoria = []; this.pendente = [];
    if (this.store) await this.store.limpar();
  }
}

const csvCel = (v: unknown) => { const s = v === undefined || v === null ? '' : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function emCsv(eventos: EventoUso[]): string {
  const cab = ['horario', 'origem', 'papel', 'usuario', 'sessao', 'acao', 'metodo', 'rota', 'status', 'ms', 'detalhes'];
  const linhas = eventos.map((e) => [e.t, e.origem, e.papel, e.uid, e.sessao, e.acao, e.metodo, e.rota, e.status, e.ms, e.det ? JSON.stringify(e.det) : ''].map(csvCel).join(','));
  return '﻿' + [cab.join(','), ...linhas].join('\n');
}
