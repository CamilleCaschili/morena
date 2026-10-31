/*
 * Plan du village : une grille de cases (i, j), i vers l'est, j vers le sud.
 * Le cœur (maisons, ateliers, commerces) entoure la place centrale et fixe la taille de l'enceinte ;
 * les bâtiments de production (champs, mines, carrières, élevages…) sont à l'écart, hors des murs,
 * et sont repoussés plus loin quand le cœur grandit jusqu'à eux.
 * Les petits bâtiments partagent une case : 4 maisons, ou 2 échoppes.
 * Une case choisie par les joueurs est gardée dans l'état du village (places, ou chantier.place).
 */
import { BI, type Shape } from '../data/catalogue'

export type Case = [number, number]
/** formes qui dessinent l'enceinte au lieu d'occuper une case */
export const ENCEINTE: Shape[] = ['palissade', 'mur', 'fosse', 'porte']
const FORMES_EXT: Shape[] = ['champ', 'verger', 'vigne', 'ruches', 'camp', 'mine', 'carriere']
const IDS_EXT = ['elevage', 'elevage_ext', 'silos', 'moulin_vent', 'moulin_eau', 'charbonniere', 'scierie', 'scierie_ind', 'tannerie']
// côté préféré hors des murs (angle de atan2(j, i)) : bois, pierre et mines au nord, cultures à l'est, bêtes à l'ouest
const NORD = -Math.PI / 2, EST = 0, OUEST = Math.PI
const COTE: Record<string, number> = { elevage: OUEST, elevage_ext: OUEST, tannerie: OUEST, apiculteur: OUEST, chasseurs: NORD, trappeurs: NORD }

export const dansEnceinte = (id: string) => !!BI[id] && ENCEINTE.includes(BI[id].shape)
export const exterieur = (id: string) => { const b = BI[id]; return !!b && (FORMES_EXT.includes(b.shape) || IDS_EXT.includes(b.id)) }
function cote(id: string) {
  if (id in COTE) return COTE[id]
  const s = BI[id]?.shape
  return s === 'mine' || s === 'carriere' || s === 'camp' || ['charbonniere', 'scierie', 'scierie_ind'].includes(id) ? NORD : EST
}
/** petits bâtiments qui partagent une case : g = groupe, cap = nombre par case */
export function groupeDe(id: string): { g: string; cap: number } | null {
  if (id === 'maison_bois' || id === 'maison_pierre') return { g: 'maison', cap: 4 }
  const b = BI[id]
  if (b && (b.shape === 'maison' || b.shape === 'etal') && !b.opt.big && !exterieur(id)) return { g: 'echoppe', cap: 2 }
  return null
}
/** position dans la case (en fraction de case) et échelle d'un bâtiment qui la partage */
export function sousCase(s: number, cap: number): { dx: number; dz: number; echelle: number } {
  if (cap >= 4) return { dx: s % 2 ? 0.24 : -0.24, dz: s < 2 ? -0.24 : 0.24, echelle: 0.56 }
  if (cap === 2) return { dx: s ? 0.24 : -0.24, dz: 0, echelle: 0.7 }
  return { dx: 0, dz: 0, echelle: 1 }
}

export const anneau = ([i, j]: Case) => Math.max(Math.abs(i), Math.abs(j))
export const cleCase = ([i, j]: Case) => i + ',' + j
/** identifiant stable d'un exemplaire : « champs:1 » est le deuxième champ dans l'ordre du village */
export const cleInstance = (ordre: string[], k: number) => `${ordre[k]}:${ordre.slice(0, k).filter(x => x === ordre[k]).length}`
/** les routes qui sortent par les quatre portes restent dégagées */
export function surRoute([i, j]: Case, n: number) {
  if (anneau([i, j]) <= n) return false
  return (j > 0 && (i === 0 || i === 1)) || (i > 0 && (j === 0 || j === -1)) || (j < 0 && (i === 0 || i === -1)) || (i < 0 && (j === 0 || j === 1))
}

/** s : place dans la case, cap : nombre de bâtiments que la case peut accueillir */
interface Cible { k: number; id: string; c: Case | null; s: number; cap: number }
export interface Plan {
  /** k : index dans l'ordre du village */
  bat: (Cible & { c: Case })[]
  /** k : index du chantier ; c : null pour un chantier de l'enceinte */
  chantiers: Cible[]
  /** demi-côté du cœur, en cases : l'enceinte passe juste après */
  n: number
  /** ce qu'il y a dans chaque case occupée */
  contenu: Map<string, { g: string | null; n: number; cap: number }>
}

/** La case peut-elle recevoir ce bâtiment ? (vide, ou partagée avec des bâtiments du même groupe) */
export function accepte(contenu: Plan['contenu'], id: string, c: Case) {
  const x = contenu.get(cleCase(c))
  if (!x) return true
  const g = groupeDe(id)
  return !!g && x.g === g.g && x.n < x.cap
}

const SPIRALE: Case[] = (() => {
  const out: Case[] = [[0, 0]]
  for (let r = 1; r < 40; r++) {
    const ring: Case[] = []
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) if (Math.max(Math.abs(i), Math.abs(j)) === r) ring.push([i, j])
    ring.sort((p, q) => Math.atan2(p[1], p[0]) - Math.atan2(q[1], q[0]))
    out.push(...ring)
  }
  return out
})()

export function calculerPlan(ordre: string[], places: Record<string, Case> = {}, chantiers: { id: string; place?: Case }[] = []): Plan {
  const contenu: Plan['contenu'] = new Map()
  const reserve = new Set<string>()
  const prendre = (x: Cible, c: Case) => {
    const k = cleCase(c), g = groupeDe(x.id), y = contenu.get(k)
    if (y) { x.s = y.n; y.n++ } else { x.s = 0; contenu.set(k, { g: g?.g ?? null, n: 1, cap: g?.cap ?? 1 }) }
    x.cap = contenu.get(k)!.cap
    x.c = c
  }
  const bat: Cible[] = [], ch: Cible[] = []
  const coeur: Cible[] = [], prod: { x: Cible; p?: Case }[] = []
  const ranger = (x: Cible, p?: Case) => {
    if (exterieur(x.id)) { prod.push({ x, p }); if (p) reserve.add(cleCase(p)) }
    else if (p && accepte(contenu, x.id, p)) prendre(x, p)
    else coeur.push(x)
  }

  // 1. cœur : cases choisies ; la production garde sa case de côté le temps de remplir le cœur
  ordre.forEach((id, k) => {
    if (!BI[id] || dansEnceinte(id)) return
    const x: Cible = { k, id, c: null, s: 0, cap: 1 }
    bat.push(x)
    ranger(x, places[cleInstance(ordre, k)])
  })
  chantiers.forEach((c, k) => {
    const x: Cible = { k, id: c.id, c: null, s: 0, cap: 1 }
    ch.push(x)
    if (BI[c.id] && !dansEnceinte(c.id)) ranger(x, c.place)
  })

  // 2. le reste du cœur : d'abord les cases partagées qui ont de la place, puis en spirale autour de la place
  for (const x of coeur) {
    const g = groupeDe(x.id)
    const c = (g && SPIRALE.find(c => contenu.get(cleCase(c))?.g === g.g && accepte(contenu, x.id, c)))
      || SPIRALE.find(c => !reserve.has(cleCase(c)) && !contenu.has(cleCase(c)))!
    prendre(x, c)
  }
  let n = 1
  for (const x of [...bat, ...ch]) if (x.c) n = Math.max(n, anneau(x.c))

  // 3. la production reste où elle est si elle est bien hors des murs, sinon elle s'installe plus loin
  const dehors: Cible[] = []
  for (const { x, p } of prod) {
    if (p && anneau(p) >= n + 2 && !surRoute(p, n) && !contenu.has(cleCase(p))) prendre(x, p)
    else dehors.push(x)
  }
  for (const x of dehors) {
    const voulu = cote(x.id)
    let meilleur: Case | null = null, score = Infinity
    // une rangée d'avance laissée à l'enceinte, pour que le cœur puisse grandir sans buter sur un champ
    for (let r = n + 3; r <= n + 15; r++) for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      const c: Case = [i, j]
      if (anneau(c) !== r || contenu.has(cleCase(c)) || surRoute(c, n)) continue
      let d = Math.abs(Math.atan2(j, i) - voulu); if (d > Math.PI) d = 2 * Math.PI - d
      const s = r + d * 3
      if (s < score) { score = s; meilleur = c }
    }
    prendre(x, meilleur ?? [n + 16, 0])
  }
  return { bat: bat as Plan['bat'], chantiers: ch, n, contenu }
}

/**
 * Cases où l'on peut poser le bâtiment id : libres (ou partagées avec le même groupe), hors des routes des portes.
 * Le cœur grandit d'une rangée à la fois (dans les murs ou juste à côté) ;
 * la production se met où l'on veut hors des murs, avec une rangée d'écart.
 */
export function casesLibres(p: Plan, id: string): Case[] {
  let max = p.n
  for (const x of [...p.bat, ...p.chantiers]) if (x.c) max = Math.max(max, anneau(x.c))
  const dehors = exterieur(id)
  const lim = dehors ? Math.max(p.n + 7, max + 2) : p.n + 1, out: Case[] = []
  for (let i = -lim; i <= lim; i++) for (let j = -lim; j <= lim; j++) {
    const c: Case = [i, j]
    if (!accepte(p.contenu, id, c) || surRoute(c, p.n) || (dehors && anneau(c) < p.n + 2)) continue
    out.push(c)
  }
  return out
}

/**
 * Enregistre la case actuelle de chaque bâtiment et chantier : plus rien ne bouge quand le village grandit,
 * sauf la production que le cœur rattrape. Renvoie les bâtiments de production repoussés.
 */
export function figerPlan(ordre: string[], places: Record<string, Case>, chantiers: { id: string; place?: Case }[]): string[] {
  const p = calculerPlan(ordre, places, chantiers)
  const repousses: string[] = []
  for (const x of p.bat) {
    const k = cleInstance(ordre, x.k), avant = places[k]
    if (avant && cleCase(avant) !== cleCase(x.c)) repousses.push(x.id)
    places[k] = x.c
  }
  for (const x of p.chantiers) if (x.c) {
    const avant = chantiers[x.k].place
    if (avant && cleCase(avant) !== cleCase(x.c)) repousses.push(x.id)
    chantiers[x.k].place = x.c
  }
  return repousses
}
