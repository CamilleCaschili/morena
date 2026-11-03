/*
 * Plan du village sur la carte du MJ (carte.ts) : une grille de cases (i, j), i vers l'est, j vers le sud.
 * Le cœur (maisons, ateliers, commerces) occupe les rangées entre les deux palissades, autour de la place ;
 * la production a chacune son coin : vignes et vergers au vignoble, cultures et bêtes aux champs du sud-ouest,
 * mines près de leur gisement, bois et pierre au nord.
 * Les petits bâtiments partagent une case : 4 maisons, ou 2 échoppes.
 * Une case choisie par les joueurs est gardée dans l'état du village (places, ou chantier.place).
 */
import { BI, type Shape } from '../data/catalogue'
import { caseCoeur, caseDehors, caseVignoble, SITES, type P } from './carte'

export type Case = [number, number]
/** formes qui dessinent l'enceinte au lieu d'occuper une case */
export const ENCEINTE: Shape[] = ['palissade', 'mur', 'fosse', 'porte']
const FORMES_EXT: Shape[] = ['champ', 'verger', 'vigne', 'ruches', 'camp', 'mine', 'carriere']
const IDS_EXT = ['elevage', 'elevage_ext', 'silos', 'moulin_vent', 'moulin_eau', 'charbonniere', 'scierie', 'scierie_ind', 'tannerie']

export const dansEnceinte = (id: string) => !!BI[id] && ENCEINTE.includes(BI[id].shape)
export const exterieur = (id: string) => { const b = BI[id]; return !!b && (FORMES_EXT.includes(b.shape) || IDS_EXT.includes(b.id)) }

/** où chaque bâtiment de production préfère s'installer ; res : minerai du gisement d'une mine */
function attrait(id: string, res?: string): { p: P; vigne?: boolean } {
  const s = BI[id]?.shape
  if (s === 'vigne' || s === 'verger') return { p: [-7.2, 0.6], vigne: true }
  if (id === 'elevage' || id === 'elevage_ext') return { p: [-7, 12] }
  if (s === 'champ' || id === 'silos' || id === 'moulin_vent') return { p: [-3.5, 9.5] }
  if (s === 'ruches') return { p: [-8, 7.5] }
  if (id === 'moulin_eau') return { p: [2.6, 9] }
  if (id === 'tannerie') return { p: [5, 8.5] }
  if (s === 'mine') return { p: SITES[id === 'mine_fer' ? 'fer' : id === 'mine_precieuse' ? 'minerai_or' : res ?? ''] ?? [-8.5, -9] }
  if (s === 'carriere') return { p: [-8.5, -8] }
  if (id === 'chasseurs' || id === 'trappeurs') return { p: [6, -9] }
  if (s === 'camp' || ['charbonniere', 'scierie', 'scierie_ind'].includes(id)) return { p: [-5, -12] }
  return { p: [-4, 10] }
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

/** s : place dans la case, cap : nombre de bâtiments que la case peut accueillir ; coeur : case entre les palissades */
interface Cible { k: number; id: string; c: Case | null; s: number; cap: number; coeur: boolean }
export interface Plan {
  /** k : index dans l'ordre du village */
  bat: (Cible & { c: Case })[]
  /** k : index du chantier ; c : null pour un chantier de l'enceinte */
  chantiers: Cible[]
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
/** La carte permet-elle ce bâtiment sur cette case ? */
export const casePermise = (id: string, c: Case) => exterieur(id) ? caseDehors(c) && (caseVignoble(c) ? attrait(id).vigne === true : true) : caseCoeur(c)

const ZONE: Case[] = []
for (let i = -26; i <= 26; i++) for (let j = -26; j <= 26; j++) ZONE.push([i, j])
// le cœur se remplit en partant de la place, rangée par rangée
const SPIRALE = ZONE.filter(c => caseCoeur(c)).sort((a, b) => anneau(a) - anneau(b) || Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]))
const DEHORS = ZONE.filter(c => caseDehors(c))

export interface ChantierPlan { id: string; place?: Case; gisement?: string }
/** gisements : pour savoir de quel minerai est la mine d'un chantier */
export function calculerPlan(ordre: string[], places: Record<string, Case> = {}, chantiers: ChantierPlan[] = [], gisements: { id: string; res: string }[] = []): Plan {
  const contenu: Plan['contenu'] = new Map()
  const prendre = (x: Cible, c: Case) => {
    const k = cleCase(c), g = groupeDe(x.id), y = contenu.get(k)
    if (y) { x.s = y.n; y.n++ } else { x.s = 0; contenu.set(k, { g: g?.g ?? null, n: 1, cap: g?.cap ?? 1 }) }
    x.cap = contenu.get(k)!.cap
    x.c = c
    x.coeur = caseCoeur(c)
  }
  const bat: Cible[] = [], ch: Cible[] = []
  const coeur: Cible[] = [], prod: { x: Cible; res?: string }[] = []
  // 1. cases choisies, si la carte les permet toujours
  const ranger = (x: Cible, p?: Case, res?: string) => {
    if (p && casePermise(x.id, p) && accepte(contenu, x.id, p)) prendre(x, p)
    else if (exterieur(x.id)) prod.push({ x, res })
    else coeur.push(x)
  }
  ordre.forEach((id, k) => {
    if (!BI[id] || dansEnceinte(id)) return
    const x: Cible = { k, id, c: null, s: 0, cap: 1, coeur: false }
    bat.push(x)
    ranger(x, places[cleInstance(ordre, k)])
  })
  chantiers.forEach((c, k) => {
    const x: Cible = { k, id: c.id, c: null, s: 0, cap: 1, coeur: false }
    ch.push(x)
    if (BI[c.id] && !dansEnceinte(c.id)) ranger(x, c.place, gisements.find(g => g.id === c.gisement)?.res)
  })

  // 2. le cœur : d'abord les cases partagées qui ont de la place, puis autour de la place ; s'il est plein, juste dehors
  for (const x of coeur) {
    const g = groupeDe(x.id)
    const c = (g && SPIRALE.find(c => contenu.get(cleCase(c))?.g === g.g && accepte(contenu, x.id, c)))
      || SPIRALE.find(c => !contenu.has(cleCase(c)))
      || DEHORS.filter(c => !caseVignoble(c) && !contenu.has(cleCase(c))).sort((a, b) => Math.hypot(...a) - Math.hypot(...b))[0]
    if (c) prendre(x, c)
  }
  // 3. la production, au plus près de son coin de la carte
  for (const { x, res } of prod) {
    const a = attrait(x.id, res)
    let meilleur: Case | null = null, score = Infinity
    for (const c of DEHORS) {
      if (contenu.has(cleCase(c)) || !casePermise(x.id, c)) continue
      const s = Math.hypot(c[0] - a.p[0], c[1] - a.p[1]) + (caseVignoble(c) ? (a.vigne ? -100 : 30) : 0)
      if (s < score) { score = s; meilleur = c }
    }
    if (meilleur) prendre(x, meilleur)
  }
  return { bat: bat.filter(x => x.c) as Plan['bat'], chantiers: ch, contenu }
}

/** Cases où l'on peut poser le bâtiment id : permises par la carte, et libres (ou partagées avec le même groupe). */
export function casesLibres(p: Plan, id: string): Case[] {
  return (exterieur(id) ? DEHORS : SPIRALE).filter(c => casePermise(id, c) && accepte(p.contenu, id, c))
}

/**
 * Enregistre la case actuelle de chaque bâtiment et chantier : plus rien ne bouge ensuite.
 * Renvoie les bâtiments qui ont changé de case pour respecter la carte.
 */
export function figerPlan(ordre: string[], places: Record<string, Case>, chantiers: ChantierPlan[], gisements: { id: string; res: string }[] = []): string[] {
  const p = calculerPlan(ordre, places, chantiers, gisements)
  const bouges: string[] = []
  for (const x of p.bat) {
    const k = cleInstance(ordre, x.k), avant = places[k]
    if (avant && cleCase(avant) !== cleCase(x.c)) bouges.push(x.id)
    places[k] = x.c
  }
  for (const x of p.chantiers) if (x.c) {
    const avant = chantiers[x.k].place
    if (avant && cleCase(avant) !== cleCase(x.c)) bouges.push(x.id)
    chantiers[x.k].place = x.c
  }
  return bouges
}
