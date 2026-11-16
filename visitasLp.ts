/**
 * ABERTURAS DO LINK DA PÁGINA (landing page)
 * ----------------------------------------------------------------------------
 * Serve para saber se quem recebeu a mensagem de apresentação abriu o link. Cada link leva um código curto
 * (ex.: https://vanescolar.ai.studio/lp.html?l=ab12cd3) e a página avisa o servidor quando é aberta.
 *
 * PRIVACIDADE: guarda só o código, o horário e se parece robô (pré-visualização do WhatsApp, buscadores).
 * NÃO guarda IP, aparelho nem qualquer dado pessoal.
 * ----------------------------------------------------------------------------
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { FirestoreLike } from './persistence';

export interface VisitaLp { codigo: string; t: string; bot: boolean }

export interface ResumoLinkLp {
  codigo: string;
  primeiraAbertura: string | null;
  ultimaAbertura: string | null;
  aberturas: number;
  aberturasRobo: number;
}

export interface VisitasStore {
  carregar(): Promise<VisitaLp[]>;
  gravar(v: VisitaLp): Promise<void>;
  limpar(): Promise<void>;
}

/** Código do link: 4 a 16 letras minúsculas ou números. */
export const codigoLpValido = (s: unknown): s is string => typeof s === 'string' && /^[a-z0-9]{4,16}$/.test(s);

/** Pré-visualizadores de link (WhatsApp, Facebook, Telegram…), buscadores e ferramentas de linha de comando. */
const PADRAO_ROBO = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|slack|discord|skype|curl|wget|python|java\/|go-http|axios|node-fetch|headless|lighthouse|monitor|scanner/i;
export const pareceRobo = (userAgent: unknown): boolean => typeof userAgent !== 'string' || userAgent.length < 10 || PADRAO_ROBO.test(userAgent);

export class VisitasArquivo implements VisitasStore {
  constructor(private arquivo: string) {}
  async carregar() {
    if (!fs.existsSync(this.arquivo)) return [];
    return fs.readFileSync(this.arquivo, 'utf8').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
  }
  async gravar(v: VisitaLp) {
    fs.mkdirSync(path.dirname(this.arquivo), { recursive: true });
    fs.appendFileSync(this.arquivo, JSON.stringify(v) + '\n');
  }
  async limpar() { if (fs.existsSync(this.arquivo)) fs.unlinkSync(this.arquivo); }
}

export class VisitasFirestore implements VisitasStore {
  constructor(private db: FirestoreLike, private colecao = 'vanescolar_visitas_lp') {}
  async carregar() {
    const snap = await this.db.collection(this.colecao).get();
    return snap.docs.flatMap((d) => { const x = d.data(); return x && codigoLpValido(x.codigo) ? [{ codigo: x.codigo, t: String(x.t), bot: !!x.bot }] : []; });
  }
  async gravar(v: VisitaLp) {
    await this.db.collection(this.colecao).doc(`v-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`).set(v);
  }
  async limpar() {
    const snap = await this.db.collection(this.colecao).get();
    for (const d of snap.docs) await this.db.collection(this.colecao).doc(d.id).delete();
  }
}

const MAX_CODIGOS = 2000;
const INTERVALO_MIN_MS = 60_000;

export class VisitasLp {
  private visitas: VisitaLp[] = [];
  private ultimo = new Map<string, number>();
  private carregado = false;
  constructor(private store: VisitasStore | null) {}

  private async garantirCarga() {
    if (this.carregado) return;
    this.carregado = true;
    if (!this.store) return;
    try { this.visitas = await this.store.carregar(); }
    catch (err: any) { console.error('[VisitasLp] Falha ao ler as aberturas gravadas:', err?.message || err); }
  }

  /** Registra uma abertura. Devolve false quando foi ignorada (repetida em menos de 1 minuto ou código novo demais). */
  async registrar(codigo: string, bot: boolean, agora = Date.now()): Promise<boolean> {
    await this.garantirCarga();
    const chave = `${codigo}|${bot ? 'r' : 'h'}`;
    const antes = this.ultimo.get(chave);
    if (antes !== undefined && agora - antes < INTERVALO_MIN_MS) return false;
    if (!this.visitas.some((v) => v.codigo === codigo) && new Set(this.visitas.map((v) => v.codigo)).size >= MAX_CODIGOS) return false;
    this.ultimo.set(chave, agora);
    const v: VisitaLp = { codigo, t: new Date(agora).toISOString(), bot };
    this.visitas.push(v);
    if (this.store) { try { await this.store.gravar(v); } catch (err: any) { console.error('[VisitasLp] Falha ao gravar:', err?.message || err); } }
    return true;
  }

  /** Um resumo por código, da abertura mais recente para a mais antiga. */
  async resumo(): Promise<ResumoLinkLp[]> {
    await this.garantirCarga();
    const porCodigo = new Map<string, ResumoLinkLp>();
    for (const v of this.visitas) {
      const r = porCodigo.get(v.codigo) ?? { codigo: v.codigo, primeiraAbertura: null, ultimaAbertura: null, aberturas: 0, aberturasRobo: 0 };
      if (v.bot) r.aberturasRobo++;
      else {
        r.aberturas++;
        if (!r.primeiraAbertura || v.t < r.primeiraAbertura) r.primeiraAbertura = v.t;
        if (!r.ultimaAbertura || v.t > r.ultimaAbertura) r.ultimaAbertura = v.t;
      }
      porCodigo.set(v.codigo, r);
    }
    return [...porCodigo.values()].sort((a, b) => String(b.ultimaAbertura ?? '').localeCompare(String(a.ultimaAbertura ?? '')));
  }

  async limpar() {
    this.visitas = []; this.ultimo.clear();
    if (this.store) await this.store.limpar();
  }
}
