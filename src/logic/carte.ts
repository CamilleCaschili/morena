/*
 * Carte de Morena, d'après le croquis du MJ. Unités : cases du plan (une case = S en 3D),
 * x vers l'est, z vers le sud, la place du village en (0, 0). Le croquis est tourné d'environ 26°
 * pour que les deux palissades soient alignées sur la grille.
 *
 * Le village est dans une vallée entre deux chaînes de montagnes, ouverte au sud-ouest sur les plaines.
 * Une rivière descend du nord (deux bras qui se rejoignent) et traverse le village.
 * Deux palissades barrent la vallée au nord et au sud ; le vignoble est à l'abri entre les deux,
 * à l'ouest du village ; les champs sont au sud-ouest, vers les plaines.
 */
export type P = [number, number]

export interface Palissade { z: number; a: number; b: number; porte: number }
export const PALISSADES: { nord: Palissade; sud: Palissade } = {
  nord: { z: -5.5, a: -8.5, b: 5.5, porte: 1.5 },
  sud: { z: 5.5, a: -8, b: 8.5, porte: -2.5 },
}
/** rangées de cases entre les palissades : le cœur du village */
export const BANDE = { jMin: -5, jMax: 5, iMin: -8, iMax: 8 }

export const RIVIERE: P[] = [[-16, -16], [-14.1, -15], [-12.1, -14.5], [-9.7, -13.3], [-7.1, -12.6], [-4.9, -11.2], [-3.6, -8.8], [-1.2, -6.2],
  [-0.35, -3.85], [-0.4, -1.8], [-1.6, 0.5], [-1.2, 2.4], [0.5, 5.3], [1.4, 8], [1.2, 11.2], [1.8, 16], [3.5, 24], [4, 40]]
export const AFFLUENT: P[] = [[9, -21], [7.5, -19.8], [5.2, -18.4], [3.8, -14.9], [2.6, -12.4], [2.7, -10.9], [0.8, -8.4], [-0.95, -7], [-1.2, -6.2]]
/** largeur de l'eau, en cases */
export const LARGEUR_RIVIERE = 0.38

/** fond plat de la vallée et plaines du sud-ouest ; au-delà, le terrain monte vers les montagnes */
export const VALLEE: P[] = [[-10.4, 7.8], [-10, 1.8], [-9.7, -4.5], [-9, -13.2], [-6.5, -18.3], [-3.1, -17.7], [1.2, -15.8], [4.3, -13.9],
  [8, -7], [12.2, 1.4], [13.5, 12], [9, 26], [-6, 40], [-32, 40], [-40, 22], [-22, 12]]
export const VIGNOBLE: P[] = [[-10, -2], [-6.5, -3.7], [-4.5, 3.2], [-7.9, 5]]
export const CHAMPS: P[] = [[-6.6, 6], [0.5, 6.6], [0.6, 9.9], [-0.7, 11.8], [-7.8, 13.1]]
/** emplacements des gisements dessinés par le MJ */
export const SITES: Record<string, P> = { fer: [-11, -11], charbon: [6.8, -13.3], minerai_or: [10, -28.5] }
/** route qui part de la porte sud vers les plaines */
export const ROUTE_PLAINES: P[] = [[-2.5, 5.5], [-2.5, 8.5], [-4.5, 11.5], [-9.3, 16.4], [-17, 24], [-26, 34]]
/** route qui part de la porte nord vers les mines */
export const ROUTE_NORD: P[] = [[1.5, -5.5], [1.5, -9.5], [0.5, -13], [-1, -16.5]]

/* ── Géométrie ── */
export function dansPolygone([x, z]: P, poly: P[]) {
  let dedans = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j]
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) dedans = !dedans
  }
  return dedans
}
function distSegment([x, z]: P, [ax, az]: P, [bx, bz]: P) {
  const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz
  const t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l)) : 0
  return Math.hypot(x - ax - t * dx, z - az - t * dz)
}
export function distLigne(p: P, ligne: P[]) {
  let d = Infinity
  for (let i = 1; i < ligne.length; i++) d = Math.min(d, distSegment(p, ligne[i - 1], ligne[i]))
  return d
}
/** distance au bord de la vallée : négative dedans, positive dehors */
export function horsVallee(p: P) {
  let d = Infinity
  for (let i = 0; i < VALLEE.length; i++) d = Math.min(d, distSegment(p, VALLEE[i], VALLEE[(i + 1) % VALLEE.length]))
  return dansPolygone(p, VALLEE) ? -d : d
}
export const distRiviere = (p: P) => Math.min(distLigne(p, RIVIERE), distLigne(p, AFFLUENT))

/* ── Cases ── */
/** l'eau passe dans la case : on n'y construit pas */
export const caseRiviere = (c: P) => distRiviere(c) < 0.62
/** case sur une route (la route de la porte nord suit le bord des cases x = 1,5) */
export function caseRoute([i, j]: P) {
  if (j < PALISSADES.nord.z && (i === 1 || i === 2) && j > -10) return true
  return distLigne([i, j], ROUTE_PLAINES) < 0.75 || (j <= -9 && distLigne([i, j], ROUTE_NORD) < 0.75)
}
export const caseVignoble = (c: P) => dansPolygone(c, VIGNOBLE)
/** case du cœur : entre les palissades, dans la vallée, au sec et hors du vignoble */
export function caseCoeur(c: P) {
  const [i, j] = c
  return j >= BANDE.jMin && j <= BANDE.jMax && i >= BANDE.iMin && i <= BANDE.iMax
    && horsVallee(c) < -0.6 && !caseRiviere(c) && !caseVignoble(c)
}
/** case hors du cœur où peut aller la production (le vignoble compte, il est à part) */
export function caseDehors(c: P) {
  const [i, j] = c
  const bande = j >= BANDE.jMin && j <= BANDE.jMax && i >= BANDE.iMin - 1 && i <= BANDE.iMax + 1
  if (bande && !caseVignoble(c)) return false
  // une rangée libre devant chaque palissade
  if (j === BANDE.jMin - 1 || j === BANDE.jMax + 1) return false
  return horsVallee(c) < -0.6 && !caseRiviere(c) && !caseRoute(c) && Math.hypot(i, j) < 26
}
