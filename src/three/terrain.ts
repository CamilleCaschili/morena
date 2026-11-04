/*
 * Terrain de la carte du MJ (logic/carte.ts) en 3D : relief de la vallée, rivière, ponts, routes,
 * et les outils pour tracer rues et chemins le long des bords des cases.
 */
import * as THREE from 'three'
import { RIVIERE, AFFLUENT, LARGEUR_RIVIERE, TAILLE_CASE, ESPACEMENT, horsVallee, type P } from '../logic/carte'

/** écart entre deux cases du plan */
export const S = TAILLE_CASE

/* ── Rivière lissée (unités 3D) ── */
function lisser(pts: P[]): [number, number][] {
  const c = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x * S, 0, z * S)), false, 'centripetal')
  return c.getSpacedPoints(Math.ceil(c.getLength() / 1.2)).map(v => [v.x, v.z])
}
export const COURS: [number, number][][] = [lisser(RIVIERE), lisser(AFFLUENT)]

function distSeg(x: number, z: number, [ax, az]: [number, number], [bx, bz]: [number, number]) {
  const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz
  const t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l)) : 0
  return Math.hypot(x - ax - t * dx, z - az - t * dz)
}
export function distRiviereLisse(x: number, z: number) {
  let d = Infinity
  for (const c of COURS) for (let i = 1; i < c.length; i++) d = Math.min(d, distSeg(x, z, c[i - 1], c[i]))
  return d
}
function intersection([ax, az]: [number, number], [bx, bz]: [number, number], [cx, cz]: [number, number], [dx, dz]: [number, number]) {
  const r = [bx - ax, bz - az], s = [dx - cx, dz - cz], den = r[0] * s[1] - r[1] * s[0]
  if (Math.abs(den) < 1e-9) return null
  const t = ((cx - ax) * s[1] - (cz - az) * s[0]) / den, u = ((cx - ax) * r[1] - (cz - az) * r[0]) / den
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { x: ax + t * r[0], z: az + t * r[1] } : null
}
/** endroits où le segment a → b franchit la rivière */
export function croiserRiviere(a: [number, number], b: [number, number]) {
  const out: { x: number; z: number }[] = []
  for (const c of COURS) for (let i = 1; i < c.length; i++) {
    const p = intersection(a, b, c[i - 1], c[i])
    if (p && !out.some(q => Math.hypot(q.x - p.x, q.z - p.z) < 4)) out.push(p)
  }
  return out
}
/** passages à laisser dans une palissade en z : intervalles de x où coule la rivière */
export function passagesRiviere(z: number): [number, number][] {
  const w = LARGEUR_RIVIERE * S / 2 + 0.9
  return croiserRiviere([-300, z], [300, z]).map(p => [p.x - w, p.x + w])
}

/* ── Rues et chemins le long des bords des cases ── */
export type Lignes = Map<string, [number, number][]>
/** ajoute un segment horizontal ou vertical, rangé par ligne pour fusionner ce qui se chevauche */
export function ajouterLigne(lignes: Lignes, x1: number, z1: number, x2: number, z2: number) {
  const horizontal = Math.abs(z1 - z2) < 0.01
  const k = horizontal ? 'z:' + z1.toFixed(2) : 'x:' + x1.toFixed(2)
  const a = horizontal ? x1 : z1, b = horizontal ? x2 : z2
  if (Math.abs(a - b) < 0.01) return
  ;(lignes.get(k) ?? lignes.set(k, []).get(k)!).push([Math.min(a, b), Math.max(a, b)])
}
export function fusionLignes(lignes: Lignes) {
  const out: { horizontal: boolean; pos: number; a: number; b: number }[] = []
  for (const [k, ivs] of lignes) {
    ivs.sort((a, b) => a[0] - b[0])
    const fus: [number, number][] = []
    for (const iv of ivs) { const d = fus[fus.length - 1]; if (d && iv[0] <= d[1] + 0.01) d[1] = Math.max(d[1], iv[1]); else fus.push([...iv]) }
    for (const [a, b] of fus) out.push({ horizontal: k[0] === 'z', pos: Number(k.slice(2)), a, b })
  }
  return out
}
/** bande au sol le long d'une ligne brisée (routes de terre, eau) */
/** relief : la bande suit le sol (chemins au pied des montagnes) au lieu de rester à plat */
export function ruban(pts: [number, number][], largeur: number, mat: THREE.Material, y: number, relief = false) {
  const pos: number[] = [], idx: number[] = []
  if (relief) {
    // morceaux courts pour épouser les pentes
    const fin: [number, number][] = [pts[0]]
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 1.2))
      for (let k = 1; k <= n; k++) fin.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n])
    }
    pts = fin
  }
  const h = (x: number, z: number) => relief ? y + Math.max(0, solMaillage(x, z)) : y
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i]
    const l = Math.hypot(bx - ax, bz - az) || 1, ux = (bx - ax) / l, uz = (bz - az) / l
    // chaque morceau déborde un peu sur les suivants pour ne pas laisser de trou dans les virages
    const e = largeur / 2, nx = -uz * e, nz = ux * e
    const x0 = ax - ux * e * 0.6, z0 = az - uz * e * 0.6, x1 = bx + ux * e * 0.6, z1 = bz + uz * e * 0.6
    const b0 = pos.length / 3
    pos.push(x0 + nx, h(x0 + nx, z0 + nz), z0 + nz, x0 - nx, h(x0 - nx, z0 - nz), z0 - nz,
      x1 + nx, h(x1 + nx, z1 + nz), z1 + nz, x1 - nx, h(x1 - nx, z1 - nz), z1 - nz)
    idx.push(b0, b0 + 2, b0 + 1, b0 + 1, b0 + 2, b0 + 3)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  const m = new THREE.Mesh(geo, mat)
  m.receiveShadow = true
  return m
}

/** Ligne brisée adoucie (routes) : courbe lisse qui passe par les points, avec un léger serpentement. */
export function adoucir(pts: [number, number][], amp = 0.9): [number, number][] {
  const c = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal')
  const L = c.getLength(), n = Math.max(2, Math.ceil(L / 1.5))
  return c.getSpacedPoints(n).map((v, k) => {
    const t = L * k / n, tg = c.getTangentAt(k / n), env = Math.min(1, t / 4)
    const o = amp * env * Math.sin(t * 0.21 + 1.3)
    return [v.x - tg.z * o, v.z + tg.x * o]
  })
}

/* ── Pont de bois : tablier, garde-corps, poteaux ; le long de x ── */
const matPlanche = new THREE.MeshStandardMaterial({ color: 0x7c5533, roughness: 0.9 })
const matPoutre = new THREE.MeshStandardMaterial({ color: 0x5a3d26, roughness: 0.9 })
matPlanche.userData.partage = true; matPoutre.userData.partage = true
export function construirePont(longueur: number, largeur: number) {
  const g = new THREE.Group()
  const boite = (sx: number, sy: number, sz: number, m: THREE.Material, x: number, y: number, z: number) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m)
    b.position.set(x, y + sy / 2, z); b.castShadow = true; b.receiveShadow = true
    g.add(b)
  }
  boite(longueur, 0.16, largeur, matPlanche, 0, 0.18, 0)
  for (const s of [-1, 1]) {
    boite(longueur, 0.1, 0.1, matPoutre, 0, 0.85, s * largeur / 2)
    for (let x = -longueur / 2; x <= longueur / 2 + 0.01; x += longueur / 4) boite(0.12, 0.72, 0.12, matPoutre, x, 0.18, s * largeur / 2)
    boite(0.3, 0.3, largeur + 0.3, matPoutre, s * longueur / 2, 0, 0)
  }
  return g
}

/* ── Relief : fond plat dans la vallée et les plaines, montée vers les montagnes ── */
const lisse = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t) }
/** d : distance au bord de la vallée, en cases (positive hors de la vallée) */
export function hauteurSol(x: number, z: number, d = horsVallee([x / S, z / S])) {
  if (d <= 0) return 0
  const bosses = Math.sin(x * 0.07) * Math.cos(z * 0.06) * 2.2 + Math.sin(x * 0.021 + z * 0.03) * 3.5 + 1.5
  // les pentes montent vite dès le bord de la vallée : on se sent enclavé entre les montagnes
  return (lisse(d / 3.5) * 34 + lisse(d / 12) * 26 + lisse(d / 2) * bosses) * ESPACEMENT
}
/** maillage du sol dessiné par la scène : côté et nombre de carreaux */
export const TAILLE_SOL = 1400 * ESPACEMENT, CARREAUX_SOL = 220
/** hauteur du sol tel qu'il est dessiné (interpolé entre les sommets du maillage), un peu au-dessus par sécurité */
export function solMaillage(x: number, z: number) {
  const c = TAILLE_SOL / CARREAUX_SOL, i = Math.floor((x + TAILLE_SOL / 2) / c), j = Math.floor((z + TAILLE_SOL / 2) / c)
  const x0 = -TAILLE_SOL / 2 + i * c, z0 = -TAILLE_SOL / 2 + j * c, u = (x - x0) / c, v = (z - z0) / c
  const h00 = hauteurSol(x0, z0), h10 = hauteurSol(x0 + c, z0), h01 = hauteurSol(x0, z0 + c), h11 = hauteurSol(x0 + c, z0 + c)
  const bilin = h00 * (1 - u) * (1 - v) + h10 * u * (1 - v) + h01 * (1 - u) * v + h11 * u * v
  return Math.max(bilin, hauteurSol(x, z)) + 0.04
}
/** direction (unitaire) qui descend vers le fond de la vallée, en x, z */
export function versVallee(x: number, z: number): [number, number] {
  const e = 0.25, cx = x / S, cz = z / S
  const gx = horsVallee([cx + e, cz]) - horsVallee([cx - e, cz]), gz = horsVallee([cx, cz + e]) - horsVallee([cx, cz - e])
  const l = Math.hypot(gx, gz) || 1
  return [-gx / l, -gz / l]
}
