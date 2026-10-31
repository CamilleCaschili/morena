import { B, BI, RES, RL, CATS, JAUGES, nomBat, type Batiment, type ResKey, type CatKey, type JaugeKey } from '../data/catalogue'
import {
  PRIX, PRIX_QUALITE, BOISSONS, qualiteDuJet, COMMERCE, METIERS, MILITAIRES, GRADES, NAISSANCE_TOUS, desGisement,
  type Boisson, type Grade, type Recette,
} from '../data/economie'
import { saisonDe, dateMin, SAISONS, ORDRE_SAISONS, type Saison } from './calendrier'
import { calculerPlan, casesLibres, cleCase, figerPlan, type Case } from './plan'

/** Bâtiment payé dont la construction se termine au passage du cycle `fin`. */
/** place : case du plan où le bâtiment apparaîtra (voir plan.ts) */
export interface Chantier { id: string; fin: number; cout: Partial<Record<ResKey, number>>; gisement?: string; place?: Case }
/** Gisement prospecté ; une Mine construite dessus le fait produire chaque mois. */
export interface Gisement { id: string; res: ResKey; qualite: number; mine: boolean }
export interface Etat {
  /** numéro du cycle en cours : un cycle = un mois (voir calendrier.ts) */
  jour: number
  stocks: Record<string, number>
  bat: Record<string, number>
  ordre: string[]
  /** population civile, artisans compris (null : pas encore renseignée, la main-d'œuvre n'est alors pas vérifiée) */
  villageois: number | null
  /** ancien champ, plus utilisé : la main-d'œuvre se calcule (voir mainOeuvre) */
  mo: number | null
  empl: string[]
  chantiers?: Chantier[]
  artisans?: Record<string, number>
  armee?: Partial<Record<Grade, number>>
  gisements?: Gisement[]
  qualites?: Partial<Record<Boisson, number>>
  /** case choisie pour chaque exemplaire (clé « id:n », voir cleInstance) ; les autres sont placés automatiquement */
  places?: Record<string, Case>
  /** bonus ou malus de jauges décidés par le MJ (événements) */
  ajustJauges?: Partial<Record<JaugeKey, number>>
}
/** pause : saisons pendant lesquelles la règle ne s'applique pas (champs enneigés l'hiver…) ; faces : dé utilisé (100 par défaut) */
export interface Regle { id: string; bat: string; res: ResKey; sens: 1 | -1; mode: 'de' | 'fixe'; n: number | null; faces?: number; pause?: Saison[]; libelle?: string }
/** unit 'palier' : −val si le coût dépasse val, sinon −val/2 (scierie, maçonnerie) */
export interface Effet {
  id: string; bat: string; type: 'cout' | 'note'
  sens: 1 | -1; val: number | null; unit: 'fixe' | '%' | 'palier'; res: ResKey
  cible: string            // 'tous' | 'cat:<cat>' | <id bâtiment>
  note: string
}
/**
 * durees : mois de chantier par bâtiment, quand ils diffèrent de DUREE_CHANTIER
 * prix : prix en PO qui remplacent ceux du tableur (null = pas d'échange)
 * metiers : bâtiment qui demande chaque métier d'artisan ('' = aucun), quand il diffère du tableur
 */
export interface Regles {
  regles: Regle[]; effets: Effet[]; durees?: Record<string, number>
  prix?: Partial<Record<ResKey, number | null>>
  metiers?: Record<string, string>
}
export interface Village { id: number; etat: Etat; regles: Regles; version: number; updated_at: string; updated_by: string | null }
export interface LogEntry { type: 'jour' | 'constr' | 'mj'; texte: string }

export const D100_MOYENNE = 50.5
export const moyenneDe = (faces: number) => (faces + 1) / 2
export const facesDe = (g: Regle) => g.faces || 100
export const lancer = (faces: number) => 1 + Math.floor(Math.random() * faces)

export const cnt = (e: Etat, id: string) => e.bat?.[id] || 0
/** La règle s'applique-t-elle pendant ce cycle ? */
export const actif = (g: Regle, cycle: number) => !g.pause?.includes(saisonDe(cycle))
export const nomRegle = (g: Regle) => g.libelle ?? nomBat(g.bat)

/* ── Nombres : l'or se compte au centième ── */
export const arrondi = (n: number) => Math.round(n * 100) / 100
export const nbTxt = (n: number) => String(arrondi(n)).replace('.', ',')

/* ── Chantiers ── */
export const DUREE_CHANTIER = 1
export const dureeChantier = (r: Regles, id: string) => r.durees?.[id] ?? DUREE_CHANTIER
export const chantiers = (e: Etat) => e.chantiers || []
const enCours = (e: Etat, id: string) => chantiers(e).filter(c => c.id === id).length

/* ── Gisements ── */
export const gisements = (e: Etat) => e.gisements || []
/** Gisements sans mine ni chantier de mine */
export const gisementsLibres = (e: Etat) => gisements(e).filter(g => !g.mine && !chantiers(e).some(c => c.gisement === g.id))

/** Paye b et ouvre son chantier ; le bâtiment n'existe qu'une fois le chantier terminé. */
/** repousses reçoit les bâtiments de production que le cœur, en grandissant, a poussés plus loin */
export function lancerChantier(e: Etat, r: Regles, b: Batiment, gisement?: string, place?: Case, repousses: string[] = []): Chantier {
  const cout = effCost(e, r, b)
  for (const [k, n] of Object.entries(cout) as [ResKey, number][]) e.stocks[k] = (e.stocks[k] || 0) - n
  const c: Chantier = { id: b.id, fin: e.jour + dureeChantier(r, b.id), cout }
  if (b.req.some(g => g.includes('@gisement'))) c.gisement = gisement ?? gisementsLibres(e)[0]?.id
  // la case est fixée dès le lancement, comme celles de tout le village : plus rien ne bouge ensuite
  repousses.push(...figerPlan(normOrdre(e), e.places ||= {}, chantiers(e)))
  const avant = calculerPlan(normOrdre(e), e.places, chantiers(e))
  ;(e.chantiers ||= []).push(c)
  if (place && casesLibres(avant, b.id).some(x => cleCase(x) === cleCase(place))) c.place = place
  else { const p = calculerPlan(normOrdre(e), e.places, chantiers(e)).chantiers; c.place = p[p.length - 1]?.c ?? undefined }
  if (!c.place) delete c.place
  repousses.push(...figerPlan(normOrdre(e), e.places, chantiers(e)))
  return c
}
/** Ajoute au village les chantiers arrivés à terme (à appeler après avoir avancé le cycle). */
export function terminerChantiers(e: Etat, tous = false): string[] {
  const finis = chantiers(e).filter(c => tous || c.fin <= e.jour)
  if (!finis.length) return []
  e.chantiers = chantiers(e).filter(c => !finis.includes(c))
  for (const c of finis) {
    e.bat[c.id] = (e.bat[c.id] || 0) + 1
    const g = gisements(e).find(x => x.id === c.gisement)
    if (g) g.mine = true
    e.ordre = normOrdre(e)
    // le nouvel exemplaire est le dernier de l'ordre : il garde la case de son chantier
    if (c.place) (e.places ||= {})[`${c.id}:${e.bat[c.id] - 1}`] = c.place
  }
  return finis.map(c => c.id)
}
/** Bière ou vin : tire la qualité au d20 au premier brasseur ou vignoble. Renvoie le texte pour le journal. */
export function tirerQualite(e: Etat, b: Batiment, d20: number): string {
  const k = BOISSONS[b.id as keyof typeof BOISSONS]
  if (!k || e.qualites?.[k]) return ''
  const q = qualiteDuJet(d20)
  ;(e.qualites ||= {})[k] = q
  return ` Qualité ${k === 'biere' ? 'de la bière' : 'du vin'} : niveau ${q} (d20 : ${d20}).`
}

/* ── Main-d'œuvre, artisans et armée ── */
export const estDefense = (b: Batiment) => b.cat === 'defense'
export const nbArmee = (e: Etat) => GRADES.reduce((s, g) => s + (e.armee?.[g] || 0), 0)
export const nbArtisans = (e: Etat) => Object.values(e.artisans || {}).reduce((s, n) => s + n, 0)
export interface MainOeuvre { villageois: number; artisans: number; occupes: number; libres: number; armee: number; occupesArmee: number; libresArmee: number }
/** null tant que le MJ n'a pas indiqué le nombre de villageois */
export function mainOeuvre(e: Etat): MainOeuvre | null {
  if (e.villageois == null) return null
  let occupes = 0, occupesArmee = 0
  const compter = (id: string, n: number) => { const b = BI[id]; if (!b) return; if (estDefense(b)) occupesArmee += b.mo * n; else occupes += b.mo * n }
  for (const [id, n] of Object.entries(e.bat || {})) compter(id, n)
  for (const c of chantiers(e)) compter(c.id, 1)
  const artisans = nbArtisans(e), armee = nbArmee(e)
  return { villageois: e.villageois, artisans, occupes, libres: e.villageois - artisans - occupes, armee, occupesArmee, libresArmee: armee - occupesArmee }
}
export function moOk(e: Etat, b: Batiment) {
  const m = mainOeuvre(e)
  if (!m || !b.mo) return true
  return (estDefense(b) ? m.libresArmee : m.libres) >= b.mo
}
/** Bâtiment → métier d'artisan qu'il demande */
export function metierDe(r: Regles, id: string): string | null {
  for (const [m, d] of Object.entries(METIERS)) if ((r.metiers?.[m] ?? d.bat) === id) return m
  return null
}
export const batDuMetier = (r: Regles, m: string) => r.metiers?.[m] ?? METIERS[m]?.bat ?? ''
/** Artisans de ce métier qui ne travaillent pas encore dans un bâtiment */
export function artisansLibres(e: Etat, r: Regles, m: string) {
  const id = batDuMetier(r, m)
  return (e.artisans?.[m] || 0) - (id ? cnt(e, id) + enCours(e, id) : 0)
}
export function artisanOk(e: Etat, r: Regles, b: Batiment) {
  const m = metierDe(r, b.id)
  return !m || artisansLibres(e, r, m) > 0
}

/* ── Constructibilité ── */
const groupeOk = (e: Etat, g: string[]) => g.some(id => id === '@gisement' ? gisementsLibres(e).length > 0 : cnt(e, id) > 0)
export function reqOk(e: Etat, b: Batiment) { return b.req.every(g => groupeOk(e, g)) }
export const reqsDe = (e: Etat, b: Batiment) => b.req.map(g => ({ ok: groupeOk(e, g), txt: g.map(nomBat).join(' ou ') }))
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
    const v = ef.unit === '%' ? Math.round(cur * (1 + ef.sens * ef.val / 100))
      : ef.unit === 'palier' ? cur + ef.sens * (cur > ef.val ? ef.val : Math.round(ef.val / 2))
      : cur + ef.sens * ef.val
    c[ef.res] = Math.max(0, v)
  }
  for (const k of Object.keys(c) as ResKey[]) if (!c[k]) delete c[k]
  return c
}

export function costOk(e: Etat, r: Regles, b: Batiment) {
  if (!b.cost) return false
  return Object.entries(effCost(e, r, b)).every(([k, v]) => (e.stocks[k] || 0) >= (v as number))
}

export type Statut = 'ok' | 'cost' | 'mo' | 'artisan' | 'req' | 'empl' | 'special'
export function statut(e: Etat, r: Regles, b: Batiment): Statut {
  if (!b.cost) return 'special'
  if (!emplOk(e, b)) return 'empl'
  if (!reqOk(e, b)) return 'req'
  if (!artisanOk(e, r, b)) return 'artisan'
  if (!moOk(e, b)) return 'mo'
  if (!costOk(e, r, b)) return 'cost'
  return 'ok'
}

/* ── Jauges : chaque exemplaire construit apporte ses points ── */
export function jauges(e: Etat): Record<JaugeKey, { total: number; detail: string[] }> {
  const out = Object.fromEntries((Object.keys(JAUGES) as JaugeKey[]).map(k => [k, { total: 0, detail: [] as string[] }])) as Record<JaugeKey, { total: number; detail: string[] }>
  for (const [id, n] of Object.entries(e.bat || {})) {
    const b = BI[id]; if (!b || !n) continue
    for (const k of Object.keys(out) as JaugeKey[]) if (b.jauges[k]) {
      out[k].total += b.jauges[k] * n
      out[k].detail.push(`${b.nom}${n > 1 ? ' ×' + n : ''} : ${fmt(b.jauges[k] * n)}`)
    }
  }
  for (const k of Object.keys(out) as JaugeKey[]) {
    const a = e.ajustJauges?.[k]
    if (a) { out[k].total += a; out[k].detail.push(`Ajustement du MJ : ${fmt(a)}`) }
  }
  return out
}

/* ── Production ── */
export interface GroupeJour { regle: Regle; nb: number }
/** Règles du MJ et règles automatiques (mines sur gisement, entretien de l'armée), sans tenir compte de la saison. */
export function toutesRegles(e: Etat, r: Regles): GroupeJour[] {
  const out: GroupeJour[] = (r.regles || []).map(g => ({ regle: g, nb: cnt(e, g.bat) })).filter(x => x.nb > 0)
  for (const g of gisements(e)) if (g.mine) {
    const faces = desGisement(g.res, g.qualite)
    out.push({ regle: { id: 'gis_' + g.id, bat: 'mine', res: g.res, sens: 1, mode: faces > 1 ? 'de' : 'fixe', n: 1, faces, libelle: `Mine (${RL[g.res].toLowerCase()}, qualité ${g.qualite})` }, nb: 1 })
  }
  let nour = 0, boisson = 0, or = 0
  for (const k of GRADES) { const n = e.armee?.[k] || 0; nour += n * MILITAIRES[k].nourriture; boisson += n * MILITAIRES[k].boisson; or += n * MILITAIRES[k].or }
  const auto = (id: string, res: ResKey, n: number, libelle: string) => { if (n) out.push({ regle: { id, bat: '', res, sens: -1, mode: 'fixe', n, libelle }, nb: 1 }) }
  auto('armee_n', 'nourriture', nour, 'Armée (nourriture)')
  auto('armee_b', 'biere', boisson, 'Armée (bière, ou vin s’il en manque)')
  auto('armee_o', 'or', or, 'Solde des chevaliers')
  return out
}

/** des : nombre de dés par taille (100 → 2 signifie 2d100) */
export interface Prevision { fixe: number; des: Record<number, number>; undef: boolean; attendu: number }
export const desTxt = (d: Record<number, number>) => Object.entries(d).filter(([, n]) => n).sort((a, b) => Number(b[0]) - Number(a[0])).map(([f, n]) => `${n}d${f}`).join(' + ')
/** Production attendue pendant le cycle `cycle` (par défaut le cycle en cours). */
export function prevision(e: Etat, r: Regles, cycle = e.jour): Record<ResKey, Prevision> {
  const f = Object.fromEntries(RES.map(x => [x.k, { fixe: 0, des: {}, undef: false, attendu: 0 }])) as Record<ResKey, Prevision>
  const moy: Partial<Record<ResKey, number>> = {}
  for (const { regle: g, nb: c } of toutesRegles(e, r)) {
    if (!f[g.res] || !actif(g, cycle)) continue
    if (g.n == null) { f[g.res].undef = true; continue }
    if (g.mode === 'de') {
      const fa = facesDe(g)
      if (g.sens > 0) { f[g.res].des[fa] = (f[g.res].des[fa] || 0) + c * g.n; moy[g.res] = (moy[g.res] || 0) + c * g.n * moyenneDe(fa) }
      else f[g.res].fixe -= Math.round(c * g.n * moyenneDe(fa))
    } else f[g.res].fixe += g.sens * c * g.n
  }
  if (e.villageois) f.nourriture.fixe -= e.villageois
  for (const k of Object.keys(f) as ResKey[]) f[k].attendu = f[k].fixe + (moy[k] || 0)
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
  const signe = ef.sens < 0 ? '−' : '+'
  if (ef.unit === 'palier') return `${signe}${ef.val} ${RL[ef.res].toLowerCase()} sur le coût ${cibleLabel(ef.cible)} (${signe}${Math.round(ef.val / 2)} si le coût est de ${ef.val} ou moins)` + (ef.note ? ` (${ef.note})` : '')
  return `${signe}${ef.val}${ef.unit === '%' ? ' %' : ''} ${RL[ef.res].toLowerCase()} sur le coût ${cibleLabel(ef.cible)}` + (ef.note ? ` (${ef.note})` : '')
}
export const effetsDe = (r: Regles, id: string) => (r.effets || []).filter(x => x.bat === id)

export const decrirePause = (g: Regle) => g.pause?.length ? `à l'arrêt : ${g.pause.map(s => SAISONS[s].toLowerCase()).join(', ')}` : ''
export const quantiteTxt = (g: Regle, nb = 1) => g.n == null ? 'à préciser'
  : `${g.sens > 0 ? '+' : '−'}${g.mode === 'de' ? `${nb * g.n}d${facesDe(g)}` : nb * g.n}`
export function decrireProduction(r: Regles, id: string): string[] {
  return (r.regles || []).filter(x => x.bat === id).map(x =>
    (x.n == null ? `${RL[x.res]} : à préciser` : `${quantiteTxt(x)} ${RL[x.res].toLowerCase()} / mois`) + (x.pause?.length ? ` (${decrirePause(x)})` : ''))
}

/* ── Passage d'un cycle (un mois) ── */
export function groupesJour(e: Etat, r: Regles): GroupeJour[] {
  return toutesRegles(e, r).filter(x => actif(x.regle, e.jour))
}
/** Règles de bâtiments construits qui ne s'appliquent pas ce mois-ci à cause de la saison. */
export function enPause(e: Etat, r: Regles): Regle[] {
  return (r.regles || []).filter(g => cnt(e, g.bat) > 0 && !actif(g, e.jour))
}
export const libelleChantier = (c: Chantier) => `${BI[c.id]?.nom ?? c.id}, terminé en ${dateMin(c.fin)}`
/** Ce passage de mois amène-t-il des naissances ? (un mois sur deux) */
export const naissanceDue = (e: Etat) => (e.villageois || 0) > 0 && e.jour % NAISSANCE_TOUS === 0
export const naissances = (e: Etat, d10: number) => Math.round((e.villageois || 0) * d10 / 100)
export interface CalculJour {
  delta: Record<ResKey, number>
  lignes: { regle: Regle; v: number | null; detail: string }[]
  ignorees: Regle[]
  pret: boolean
}
/** jets : clé `${regle.id}_${i}` → valeur du dé */
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
      lignes.push({ regle: g, v: g.sens * v, detail: `d${facesDe(g)} : ${vals.join(' + ')}` })
    } else {
      const v = nb * g.n
      delta[g.res] += g.sens * v
      lignes.push({ regle: g, v: g.sens * v, detail: '' })
    }
  }
  if (e.villageois) delta.nourriture -= e.villageois
  // l'armée boit du vin quand la bière manque
  const manqueBiere = -((e.stocks.biere || 0) + delta.biere)
  if (manqueBiere > 0 && lignes.some(l => l.regle.id === 'armee_b')) { delta.biere += manqueBiere; delta.vin -= manqueBiere }
  return { delta, lignes, ignorees, pret: lignes.every(l => l.v != null) }
}

/* ── Marché ── */
export function prixDe(e: Etat, r: Regles, k: ResKey): number | null {
  const p = r.prix?.[k]
  if (p !== undefined) return p
  if (k === 'biere' || k === 'vin') return PRIX_QUALITE[(e.qualites?.[k] || 1) - 1]
  return PRIX[k] ?? null
}
export const commerceOuvert = (e: Etat) => COMMERCE.some(id => cnt(e, id) > 0)
/** n > 0 : achat, n < 0 : vente. Renvoie le texte du journal, ou une erreur. */
export function echanger(e: Etat, r: Regles, k: ResKey, n: number): { ok: true; texte: string } | { ok: false; erreur: string } {
  const p = prixDe(e, r, k)
  if (p == null) return { ok: false, erreur: `${RL[k]} n’a pas de prix.` }
  const total = arrondi(p * Math.abs(n))
  if (n > 0 && (e.stocks.or || 0) < total) return { ok: false, erreur: `Il faut ${nbTxt(total)} PO.` }
  if (n < 0 && (e.stocks[k] || 0) < -n) return { ok: false, erreur: `Il n’y a que ${e.stocks[k] || 0} ${RL[k].toLowerCase()}.` }
  e.stocks[k] = (e.stocks[k] || 0) + n
  e.stocks.or = arrondi((e.stocks.or || 0) - Math.sign(n) * total)
  return { ok: true, texte: `${n > 0 ? 'Achat' : 'Vente'} : ${Math.abs(n)} ${RL[k].toLowerCase()} pour ${nbTxt(total)} PO.` }
}

/* ── Fabrication ── */
export const atelierOk = (e: Etat, x: Recette) => x.bat.some(id => cnt(e, id) > 0)
export function maxFabrication(e: Etat, x: Recette) {
  return Math.min(...(Object.entries(x.entrees) as [ResKey, number][]).map(([k, n]) => Math.floor((e.stocks[k] || 0) / n)))
}
export function fabriquer(e: Etat, x: Recette, n: number): string | false {
  if (n < 1 || !atelierOk(e, x) || maxFabrication(e, x) < n) return false
  for (const [k, q] of Object.entries(x.entrees) as [ResKey, number][]) e.stocks[k] = (e.stocks[k] || 0) - q * n
  for (const [k, q] of Object.entries(x.sorties) as [ResKey, number][]) e.stocks[k] = (e.stocks[k] || 0) + q * n
  const liste = (o: Partial<Record<ResKey, number>>) => (Object.entries(o) as [ResKey, number][]).map(([k, q]) => `${q * n} ${RL[k].toLowerCase()}`).join(', ')
  return `Fabrication : ${liste(x.sorties)} (avec ${liste(x.entrees)}).`
}

/** « Le cœur du village s'agrandit : Champs cultivés repoussé plus loin. » */
export const texteRepousses = (ids: string[]) => ids.length ? ` Le cœur du village s’agrandit : ${[...new Set(ids)].map(nomBat).join(', ')} ${ids.length > 1 ? 'repoussés' : 'repoussé'} plus loin.` : ''

export const fmt = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + nbTxt(Math.abs(n))
export const res = (k: ResKey) => RL[k].toLowerCase()
export { B, BI, RES, RL }
