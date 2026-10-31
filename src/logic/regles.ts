import { B, BI, RES, RL, CATS, type Batiment, type ResKey, type CatKey } from '../data/catalogue'
import { saisonDe, dateMin, SAISONS, ORDRE_SAISONS, type Saison } from './calendrier'

/** Bâtiment payé dont la construction se termine au passage du cycle `fin`. */
export interface Chantier { id: string; fin: number; cout: Partial<Record<ResKey, number>> }
export interface Etat {
  /** numéro du cycle en cours : un cycle = un mois (voir calendrier.ts) */
  jour: number
  stocks: Record<string, number>
  bat: Record<string, number>
  ordre: string[]
  villageois: number | null
  mo: number | null
  empl: string[]
  chantiers?: Chantier[]
}
/** pause : saisons pendant lesquelles la règle ne s'applique pas (champs enneigés l'hiver…) */
export interface Regle { id: string; bat: string; res: ResKey; sens: 1 | -1; mode: 'de' | 'fixe'; n: number | null; pause?: Saison[] }
export interface Effet {
  id: string; bat: string; type: 'cout' | 'note'
  sens: 1 | -1; val: number | null; unit: 'fixe' | '%'; res: ResKey
  cible: string            // 'tous' | 'cat:<cat>' | <id bâtiment>
  note: string
}
/** durees : mois de chantier par bâtiment, quand ils diffèrent de DUREE_CHANTIER */
export interface Regles { regles: Regle[]; effets: Effet[]; durees?: Record<string, number> }
export interface Village { id: number; etat: Etat; regles: Regles; version: number; updated_at: string; updated_by: string | null }
export interface LogEntry { type: 'jour' | 'constr' | 'mj'; texte: string }

export const D100_MOYENNE = 50.5

export const cnt = (e: Etat, id: string) => e.bat?.[id] || 0
/** La règle s'applique-t-elle pendant ce cycle ? */
export const actif = (g: Regle, cycle: number) => !g.pause?.includes(saisonDe(cycle))

/* ── Chantiers ── */
export const DUREE_CHANTIER = 1
export const dureeChantier = (r: Regles, id: string) => r.durees?.[id] ?? DUREE_CHANTIER
export const chantiers = (e: Etat) => e.chantiers || []
/** Paye b et ouvre son chantier ; le bâtiment n'existe qu'une fois le chantier terminé. */
export function lancerChantier(e: Etat, r: Regles, b: Batiment): Chantier {
  const cout = effCost(e, r, b)
  for (const [k, n] of Object.entries(cout) as [ResKey, number][]) e.stocks[k] = (e.stocks[k] || 0) - n
  const c = { id: b.id, fin: e.jour + dureeChantier(r, b.id), cout }
  ;(e.chantiers ||= []).push(c)
  return c
}
/** Ajoute au village les chantiers arrivés à terme (à appeler après avoir avancé le cycle). */
export function terminerChantiers(e: Etat, tous = false): string[] {
  const finis = chantiers(e).filter(c => tous || c.fin <= e.jour)
  if (!finis.length) return []
  e.chantiers = chantiers(e).filter(c => !finis.includes(c))
  for (const c of finis) e.bat[c.id] = (e.bat[c.id] || 0) + 1
  e.ordre = normOrdre(e)
  return finis.map(c => c.id)
}

export function reqOk(e: Etat, b: Batiment) { return b.req.every(g => g.some(id => cnt(e, id) > 0)) }
export function emplOk(e: Etat, b: Batiment) {
  if (b.empl === 'T') return true
  const em = e.empl || []
  if (b.empl === 'PE') return em.includes('P') || em.includes('E')
  return em.includes(b.empl)
}

function targetOk(cible: string, b: Batiment) { return !cible || cible === 'tous' || cible === 'cat:' + b.cat || cible === b.id }

/** Coût réel après effets spéciaux des bâtiments construits. */
export function effCost(e: Etat, r: Regles, b: Batiment): Partial<Record<ResKey, number>> {
  if (!b.cost) return {}
  const c: Partial<Record<ResKey, number>> = { ...b.cost }
  for (const ef of r.effets || []) {
    if (ef.type !== 'cout' || !cnt(e, ef.bat) || ef.val == null || !(ef.res in c) || !targetOk(ef.cible, b)) continue
    const cur = c[ef.res] as number
    const v = ef.unit === '%' ? Math.round(cur * (1 + ef.sens * ef.val / 100)) : cur + ef.sens * ef.val
    c[ef.res] = Math.max(0, v)
  }
  for (const k of Object.keys(c) as ResKey[]) if (!c[k]) delete c[k]
  return c
}

export function costOk(e: Etat, r: Regles, b: Batiment) {
  if (!b.cost) return false
  return Object.entries(effCost(e, r, b)).every(([k, v]) => (e.stocks[k] || 0) >= (v as number))
}

export type Statut = 'ok' | 'cost' | 'req' | 'empl' | 'special'
export function statut(e: Etat, r: Regles, b: Batiment): Statut {
  if (!b.cost) return 'special'
  if (!emplOk(e, b)) return 'empl'
  if (!reqOk(e, b)) return 'req'
  if (!costOk(e, r, b)) return 'cost'
  return 'ok'
}

export interface Prevision { fixe: number; des: number; undef: boolean; attendu: number }
/** Production attendue pendant le cycle `cycle` (par défaut le cycle en cours). */
export function prevision(e: Etat, r: Regles, cycle = e.jour): Record<ResKey, Prevision> {
  const f = Object.fromEntries(RES.map(x => [x.k, { fixe: 0, des: 0, undef: false, attendu: 0 }])) as Record<ResKey, Prevision>
  for (const g of r.regles || []) {
    const c = cnt(e, g.bat)
    if (!c || !f[g.res] || !actif(g, cycle)) continue
    if (g.n == null) { f[g.res].undef = true; continue }
    if (g.mode === 'de') {
      if (g.sens > 0) f[g.res].des += c * g.n
      else f[g.res].fixe -= Math.round(c * g.n * D100_MOYENNE)
    } else f[g.res].fixe += g.sens * c * g.n
  }
  if (e.villageois) f.nourriture.fixe -= e.villageois
  for (const k of Object.keys(f) as ResKey[]) f[k].attendu = f[k].fixe + f[k].des * D100_MOYENNE
  return f
}

/** Production attendue pour chaque saison : la base des estimations sur plusieurs mois. */
export function previsionSaisons(e: Etat, r: Regles): Record<Saison, Record<ResKey, Prevision>> {
  // un cycle représentatif de chaque saison : avril, juillet, octobre, janvier
  const rep: Record<Saison, number> = { printemps: 4, ete: 7, automne: 10, hiver: 1 }
  return Object.fromEntries(ORDRE_SAISONS.map(s => [s, prevision(e, r, rep[s])])) as Record<Saison, Record<ResKey, Prevision>>
}

/** Mois d'attente moyens avant de pouvoir payer b, saisons comprises (Infinity si une ressource n'est pas produite). */
export function attente(e: Etat, r: Regles, b: Batiment, fs = previsionSaisons(e, r)): number {
  const cout = Object.entries(effCost(e, r, b)) as [ResKey, number][]
  const manque = cout.map(([k, v]) => [k, v - (e.stocks[k] || 0)] as const).filter(([, m]) => m > 0)
  if (!manque.length) return 0
  if (manque.some(([k]) => ORDRE_SAISONS.every(s => fs[s][k].attendu <= 0))) return Infinity
  const cumul = Object.fromEntries(manque.map(([k]) => [k, 0])) as Record<string, number>
  for (let m = 1; m <= 600; m++) {
    const f = fs[saisonDe(e.jour + m - 1)]
    let ok = true
    for (const [k, besoin] of manque) { cumul[k] += f[k].attendu; if (cumul[k] < besoin) ok = false }
    if (ok) return m
  }
  return Infinity
}

/** Ordre d'apparition des bâtiments sur la carte, cohérent avec les quantités. */
export function normOrdre(e: Etat): string[] {
  const want: Record<string, number> = { ...e.bat }
  const out: string[] = []
  for (const id of e.ordre || []) if (want[id] > 0 && BI[id]) { out.push(id); want[id]-- }
  for (const id of Object.keys(want)) for (let i = 0; i < want[id]; i++) if (BI[id]) out.push(id)
  return out
}

function cibleLabel(c: string) {
  if (!c || c === 'tous') return 'de toutes les constructions'
  if (c.startsWith('cat:')) return `des bâtiments « ${CATS[c.slice(4) as CatKey] ?? c.slice(4)} »`
  return `de « ${BI[c]?.nom ?? c} »`
}
export function decrireEffet(ef: Effet) {
  if (ef.type === 'note') return ef.note || 'Effet à décrire'
  if (ef.val == null) return `Coût en ${RL[ef.res]?.toLowerCase() ?? '?'} modifié (valeur à préciser)`
  return `${ef.sens < 0 ? '−' : '+'}${ef.val}${ef.unit === '%' ? ' %' : ''} ${RL[ef.res].toLowerCase()} sur le coût ${cibleLabel(ef.cible)}` + (ef.note ? ` (${ef.note})` : '')
}
export const effetsDe = (r: Regles, id: string) => (r.effets || []).filter(x => x.bat === id)

export const decrirePause = (g: Regle) => g.pause?.length ? `à l'arrêt : ${g.pause.map(s => SAISONS[s].toLowerCase()).join(', ')}` : ''
export function decrireProduction(r: Regles, id: string): string[] {
  return (r.regles || []).filter(x => x.bat === id).map(x =>
    (x.n == null ? `${RL[x.res]} : à préciser`
      : `${x.sens > 0 ? '+' : '−'}${x.mode === 'de' ? x.n + 'd100' : x.n} ${RL[x.res].toLowerCase()} / mois`) + (x.pause?.length ? ` (${decrirePause(x)})` : ''))
}

/* ── Passage d'un cycle (un mois) ── */
export interface GroupeJour { regle: Regle; nb: number }
export function groupesJour(e: Etat, r: Regles): GroupeJour[] {
  return (r.regles || []).map(g => ({ regle: g, nb: cnt(e, g.bat) })).filter(x => x.nb > 0 && actif(x.regle, e.jour))
}
/** Règles de bâtiments construits qui ne s'appliquent pas ce mois-ci à cause de la saison. */
export function enPause(e: Etat, r: Regles): Regle[] {
  return (r.regles || []).filter(g => cnt(e, g.bat) > 0 && !actif(g, e.jour))
}
export const libelleChantier = (c: Chantier) => `${BI[c.id]?.nom ?? c.id}, terminé en ${dateMin(c.fin)}`
export interface CalculJour {
  delta: Record<ResKey, number>
  lignes: { regle: Regle; v: number | null; detail: string }[]
  ignorees: Regle[]
  pret: boolean
}
/** jets : clé `${regle.id}_${i}` → valeur 1..100 */
export function calculJour(e: Etat, r: Regles, jets: Record<string, number>): CalculJour {
  const delta = Object.fromEntries(RES.map(x => [x.k, 0])) as Record<ResKey, number>
  const lignes: CalculJour['lignes'] = []
  const ignorees: Regle[] = []
  for (const { regle: g, nb } of groupesJour(e, r)) {
    if (g.n == null) { ignorees.push(g); continue }
    if (g.mode === 'de') {
      const vals: number[] = []
      for (let i = 0; i < nb * g.n; i++) { const v = jets[g.id + '_' + i]; if (v == null) break; vals.push(v) }
      if (vals.length < nb * g.n) { lignes.push({ regle: g, v: null, detail: '' }); continue }
      const v = vals.reduce((a, b) => a + b, 0)
      delta[g.res] += g.sens * v
      lignes.push({ regle: g, v: g.sens * v, detail: vals.join(' + ') })
    } else {
      const v = nb * g.n
      delta[g.res] += g.sens * v
      lignes.push({ regle: g, v: g.sens * v, detail: '' })
    }
  }
  if (e.villageois) delta.nourriture -= e.villageois
  return { delta, lignes, ignorees, pret: lignes.every(l => l.v != null) }
}

export const fmt = (n: number) => (n > 0 ? '+' : '') + n
export const res = (k: ResKey) => RL[k].toLowerCase()
export { B, BI, RES, RL }
