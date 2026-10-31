/*
 * Plan du village : une grille de cases (i, j), i vers l'est, j vers le sud.
 * Le cœur (maisons, ateliers, commerces) entoure la place centrale et fixe la taille de l'enceinte ;
 * les bâtiments de production (champs, mines, carrières, élevages…) sont à l'écart, hors des murs.
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

export const anneau = ([i, j]: Case) => Math.max(Math.abs(i), Math.abs(j))
export const cleCase = ([i, j]: Case) => i + ',' + j
/** identifiant stable d'un exemplaire : « champs:1 » est le deuxième champ dans l'ordre du village */
export const cleInstance = (ordre: string[], k: number) => `${ordre[k]}:${ordre.slice(0, k).filter(x => x === ordre[k]).length}`
/** les routes qui sortent par les quatre portes restent dégagées */
export function surRoute([i, j]: Case, n: number) {
  if (anneau([i, j]) <= n) return false
  return (j > 0 && (i === 0 || i === 1)) || (i > 0 && (j === 0 || j === -1)) || (j < 0 && (i === 0 || i === -1)) || (i < 0 && (j === 0 || j === 1))
}

export interface Plan {
  /** k : index dans l'ordre du village */
  bat: { k: number; id: string; c: Case }[]
  /** k : index du chantier ; c : null pour un chantier de l'enceinte */
  chantiers: { k: number; id: string; c: Case | null }[]
  /** demi-côté du cœur, en cases : l'enceinte passe juste après */
  n: number
  occupees: Set<string>
}

function* spirale(): Generator<Case> {
  yield [0, 0]
  for (let r = 1; r < 60; r++) {
    const ring: Case[] = []
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) if (Math.max(Math.abs(i), Math.abs(j)) === r) ring.push([i, j])
    ring.sort((p, q) => Math.atan2(p[1], p[0]) - Math.atan2(q[1], q[0]))
    yield* ring
  }
}

export function calculerPlan(ordre: string[], places: Record<string, Case> = {}, chantiers: { id: string; place?: Case }[] = []): Plan {
  const occupees = new Set<string>()
  const bat: Plan['bat'] = [], ch: Plan['chantiers'] = []
  const prendre = (c: Case) => { occupees.add(cleCase(c)); return c }
  type A = { cible: { c: Case | null }; id: string }
  const coeur: A[] = [], dehors: A[] = []

  // 1. cases choisies par les joueurs
  ordre.forEach((id, k) => {
    if (!BI[id] || dansEnceinte(id)) return
    const p = places[cleInstance(ordre, k)]
    const x = { k, id, c: null as Case | null }
    if (p && !occupees.has(cleCase(p))) x.c = prendre(p)
    else (exterieur(id) ? dehors : coeur).push({ cible: x, id })
    bat.push(x as Plan['bat'][number])
  })
  chantiers.forEach((c, k) => {
    const x = { k, id: c.id, c: null as Case | null }
    ch.push(x)
    if (!BI[c.id] || dansEnceinte(c.id)) return
    if (c.place && !occupees.has(cleCase(c.place))) x.c = prendre(c.place)
    else (exterieur(c.id) ? dehors : coeur).push({ cible: x, id: c.id })
  })

  // 2. le cœur se remplit en spirale autour de la place
  const sp = spirale()
  for (const a of coeur) {
    let c = sp.next().value as Case
    while (occupees.has(cleCase(c))) c = sp.next().value as Case
    a.cible.c = prendre(c)
  }
  let n = 1
  for (const x of [...bat, ...ch]) if (x.c && !exterieur(x.id)) n = Math.max(n, anneau(x.c))

  // 3. la production s'installe hors des murs, du côté qui lui convient
  for (const a of dehors) {
    const voulu = cote(a.id)
    let meilleur: Case | null = null, score = Infinity
    // une rangée d'avance laissée à l'enceinte, pour que le cœur puisse grandir sans buter sur un champ
    for (let r = n + 3; r <= n + 15; r++) for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      const c: Case = [i, j]
      if (anneau(c) !== r || occupees.has(cleCase(c)) || surRoute(c, n)) continue
      let d = Math.abs(Math.atan2(j, i) - voulu); if (d > Math.PI) d = 2 * Math.PI - d
      const s = r + d * 3
      if (s < score) { score = s; meilleur = c }
    }
    a.cible.c = prendre(meilleur ?? [n + 16, 0])
  }
  return { bat, chantiers: ch, n, occupees }
}

/**
 * Cases où l'on peut poser le bâtiment id : libres et hors des routes des portes.
 * Le cœur grandit d'une rangée à la fois (dans les murs ou juste à côté) ;
 * la production se met où l'on veut, mais pas contre les murs.
 */
export function casesLibres(p: Plan, id: string): Case[] {
  let max = p.n
  for (const x of [...p.bat, ...p.chantiers]) if (x.c) max = Math.max(max, anneau(x.c))
  const dehors = exterieur(id)
  const lim = dehors ? Math.max(p.n + 7, max + 2) : p.n + 1, out: Case[] = []
  for (let i = -lim; i <= lim; i++) for (let j = -lim; j <= lim; j++) {
    const c: Case = [i, j]
    if (p.occupees.has(cleCase(c)) || surRoute(c, p.n) || (dehors && anneau(c) === p.n + 1)) continue
    out.push(c)
  }
  return out
}

/** Enregistre la case actuelle de chaque bâtiment et chantier : plus rien ne bouge quand le village grandit. */
export function figerPlan(ordre: string[], places: Record<string, Case>, chantiers: { id: string; place?: Case }[]) {
  const p = calculerPlan(ordre, places, chantiers)
  for (const x of p.bat) places[cleInstance(ordre, x.k)] = x.c
  for (const x of p.chantiers) if (x.c) chantiers[x.k].place = x.c
}
