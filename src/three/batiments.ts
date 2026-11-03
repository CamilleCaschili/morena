import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Shape, ShapeOpt } from '../data/catalogue'
import type { Saison } from '../logic/calendrier'

/* Bâtiments low-poly médiévaux générés en code. Chaque bâtiment tient dans ~3,4 × 3,4 unités
   de modèle, centré sur l'origine, façade principale tournée vers +z. La scène applique
   ECHELLE au groupe : 1 unité de modèle ≈ 1,6 mètre. */
export const ECHELLE = 1.6

export const MURS = {
  bois: 0x9a6b40, pierre: 0xa9a397, enduit: 0xe6dcc3, sombre: 0x6f7277,
} as const
export const TOITS = {
  rouge: 0xa94d3a, ardoise: 0x4f5e70, chaume: 0xc7a14f, vert: 0x55805a, bleu: 0x45739a,
} as const
export const POUTRE = 0x4a3222       // colombages, solives
export const SOCLE = 0x8a8478        // soubassements en moellons
export const CHAINE = 0xc2bba9       // pierres d'angle
export const FER = 0x3b3d40
const VOLETS = [0x4f6b45, 0x8a3b2e, 0x3f5f80, 0x6b4a2e]

const cache = new Map<string, THREE.Material>()
export function mat(color: number, opts: { double?: boolean; rough?: number } = {}) {
  const k = `${color}|${opts.double ? 1 : 0}|${opts.rough ?? 0.9}`
  let m = cache.get(k)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.9, metalness: 0, flatShading: true, side: opts.double ? THREE.DoubleSide : THREE.FrontSide })
    m.userData.base = color
    teinter(m as THREE.MeshStandardMaterial)
    cache.set(k, m)
  }
  return m
}
/* ── Saisons ──
   Les matériaux sont partagés : changer de saison recolore toits, feuillages et cultures
   de tout le village sans rien reconstruire. Une teinte est une couleur, ou [couleur, part de mélange]. */
export const NEIGE = 0xeef3f7
type Teinte = number | [number, number]
const SAISONNIER = new Map<number, Partial<Record<Saison, Teinte>>>()
const regle = (cs: number[], t: Partial<Record<Saison, Teinte>>) => { for (const c of cs) SAISONNIER.set(c, t) }
// toits (et leurs faîtages plus sombres) sous la neige
regle([...Object.values(TOITS), ...Object.values(TOITS).map(c => new THREE.Color(c).multiplyScalar(0.72).getHex())], { hiver: [NEIGE, 0.82] })
// arbres à feuilles : vert tendre, roux, puis branches nues givrées
regle([0x4d7d45, 0x3f6e3a], { printemps: 0x6fa04f, automne: 0xc8742c, hiver: 0x8e8b84 })
regle([0x5a8a4b, 0x4a6f43], { printemps: 0x80ad55, automne: 0xd99a2b, hiver: 0x9a958c })
// fleurs de l'horticulteur : rien l'hiver
regle([0xd7769a, 0xe8c25a, 0xb06ad0], { hiver: 0x9a958c })
// conifères : seulement saupoudrés
regle([0x2f5a40, 0x3c7151], { hiver: [NEIGE, 0.38] })
// champs : pousses vertes, blé mûr, chaume, neige
regle([0xd8bf55], { printemps: 0x8fbf55, automne: 0xa88f55, hiver: NEIGE })
regle([0x9cb34a], { printemps: 0x6f9e45, automne: 0x8c7448, hiver: 0xe2e8ee })
regle([0x7d5f37, 0x6f8f4d], { hiver: [NEIGE, 0.85], automne: 0x857a45 })
// vignes : feuilles rousses, ceps nus
regle([0x557a3c], { automne: 0xb5642a, hiver: 0x6b5440 })
regle([0x5e2f55], { printemps: 0x557a3c, hiver: 0x6b5440 })

let saison: Saison = 'ete'
const tmp = new THREE.Color()
/** Couleur d'une teinte saisonnière appliquée à `base` (sortie dans `out`). */
export function teinteSaison(base: number, s: Saison, out: THREE.Color, t?: Partial<Record<Saison, Teinte>>) {
  const x = (t ?? SAISONNIER.get(base))?.[s]
  out.setHex(base)
  if (x == null) return out
  if (typeof x === 'number') return out.setHex(x)
  return out.lerp(tmp.setHex(x[0]), x[1])
}
function teinter(m: THREE.MeshStandardMaterial) {
  if (SAISONNIER.has(m.userData.base)) teinteSaison(m.userData.base, saison, m.color)
}
export function appliquerSaison(s: Saison) {
  saison = s
  for (const m of cache.values()) teinter(m as THREE.MeshStandardMaterial)
}

/** Fenêtres : s'allument la nuit (emissiveIntensity piloté par la scène). */
export const matFenetre = new THREE.MeshStandardMaterial({ color: 0x3a3226, emissive: 0xffb04a, emissiveIntensity: 0, roughness: 0.6, flatShading: true })
export const matEau = new THREE.MeshStandardMaterial({ color: 0x4f88a8, roughness: 0.2, metalness: 0.1 })
/** Braises, foyers, cristaux : lumineux de jour comme de nuit. */
export const matBraise = new THREE.MeshStandardMaterial({ color: 0xff8a3a, emissive: 0xff5a1a, emissiveIntensity: 0.9, roughness: 0.8, flatShading: true })
matBraise.userData.partage = true
matFenetre.userData.partage = true
matEau.userData.partage = true

export const fonce = (c: number, k = 0.72) => new THREE.Color(c).multiplyScalar(k).getHex()

function ombre<T extends THREE.Object3D>(o: T, cast = true): T {
  o.traverse(c => { if ((c as THREE.Mesh).isMesh) { c.castShadow = cast; c.receiveShadow = true } })
  return o
}

/**
 * Fusionne tous les meshes du groupe (sous-groupes compris) par matériau : quelques appels de rendu
 * par bâtiment au lieu de centaines. Les objets marqués userData.anime (ailes, roues) restent à part.
 */
export function fusionner(g: THREE.Group) {
  g.updateMatrixWorld(true)
  const inv = g.matrixWorld.clone().invert()
  const lots = new Map<string, { m: THREE.Material; cast: boolean; recv: boolean; geos: THREE.BufferGeometry[] }>()
  const visiter = (o: THREE.Object3D) => {
    for (const c of [...o.children]) {
      if (c.userData.anime) continue
      const mesh = c as THREE.Mesh
      if (!mesh.isMesh || Array.isArray(mesh.material)) { visiter(c); continue }
      const clone = mesh.geometry.clone().applyMatrix4(inv.clone().multiply(mesh.matrixWorld))
      for (const a of Object.keys(clone.attributes)) if (a !== 'position' && a !== 'normal') clone.deleteAttribute(a)
      const geo = clone.index ? clone.toNonIndexed() : clone
      if (geo !== clone) clone.dispose()
      const k = `${mesh.material.uuid}|${mesh.castShadow}|${mesh.receiveShadow}`
      let l = lots.get(k)
      if (!l) lots.set(k, l = { m: mesh.material, cast: mesh.castShadow, recv: mesh.receiveShadow, geos: [] })
      l.geos.push(geo)
      o.remove(mesh); mesh.geometry.dispose()
    }
  }
  visiter(g)
  // sous-groupes vidés
  const vides: THREE.Object3D[] = []
  g.traverse(o => { if (o !== g && !o.userData.anime && !(o as THREE.Mesh).isMesh && o.children.length === 0) vides.push(o) })
  for (const o of vides) o.parent?.remove(o)
  for (const l of lots.values()) {
    const geo = mergeGeometries(l.geos)
    for (const x of l.geos) x.dispose()
    if (!geo) continue
    const m = new THREE.Mesh(geo, l.m)
    m.castShadow = l.cast; m.receiveShadow = l.recv
    g.add(m)
  }
}

type Face = 'z' | 'x'

export type MatMur = keyof typeof MURS

export class Fab {
  g = new THREE.Group()
  smoke: THREE.Vector3[] = []
  spin: THREE.Object3D[] = []
  constructor(readonly seed: number) {}

  /** sous-ensemble construit face à +z puis posé en (x, y, z) et tourné de rot autour de y */
  sous(x: number, y: number, z: number, rot: number, fn: (f: Fab) => void, echelle = 1) {
    const c = new Fab(this.seed)
    fn(c)
    c.g.position.set(x, y, z); c.g.rotation.y = rot; c.g.scale.setScalar(echelle); c.g.updateMatrix()
    this.smoke.push(...c.smoke.map(p => p.applyMatrix4(c.g.matrix)))
    this.spin.push(...c.spin)
    this.add(c.g)
    return c.g
  }
  /** objet animé (rotation autour de son z local), exclu de la fusion */
  anime(o: THREE.Object3D) { o.userData.anime = true; ombre(o); this.add(o); this.spin.push(o); return o }
  /** toit à quatre pans (croupes), faîtage le long de x */
  croupe(w: number, d: number, h: number, color: number, x = 0, y = 0, z = 0) {
    const W = w / 2, D = d / 2, r = Math.max(0, W - D)
    const a = [-W, 0, D], b = [W, 0, D], c = [W, 0, -D], e = [-W, 0, -D], p = [-r, h, 0], q = [r, h, 0]
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute([a, b, q, a, q, p, c, e, p, c, p, q, b, c, q, e, a, p].flat(), 3))
    geo.computeVertexNormals()
    const m = new THREE.Mesh(geo, mat(color, { double: true }))
    m.position.set(x, y, z)
    this.add(ombre(m))
    if (r > 0) this.piece(2 * r + 0.1, 0.1, 0.14, fonce(color), x, y + h, z)
  }
  /** demi-sphère posée en y */
  dome(r: number, color: number | THREE.Material, x = 0, y = 0, z = 0, seg = 10) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(3, seg / 2), 0, Math.PI * 2, 0, Math.PI / 2), typeof color === 'number' ? mat(color) : color)
    m.position.set(x, y, z)
    return this.add(ombre(m)) as THREE.Mesh
  }
  /** anneau (tore), axe selon z sauf rotation */
  tore(r: number, t: number, color: number, x = 0, y = 0, z = 0, arc = Math.PI * 2) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, t, 4, 14, arc), mat(color))
    m.position.set(x, y, z)
    return this.add(ombre(m)) as THREE.Mesh
  }
  /** petit objet facetté (feuillage, fleurs, pains, cristaux) */
  boule(r: number, color: number | THREE.Material, x = 0, y = 0, z = 0, detail = 0) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, detail), typeof color === 'number' ? mat(color) : color)
    m.position.set(x, y, z)
    return this.add(ombre(m)) as THREE.Mesh
  }
  /** poterie tournée (profil de vase), posée en y */
  vase(x: number, z: number, s = 1, color = 0xa8603a, y = 0) {
    const pts = [[0, 0], [0.08, 0], [0.11, 0.08], [0.1, 0.18], [0.06, 0.24], [0.075, 0.29]].map(([a, b]) => new THREE.Vector2(a * s, b * s))
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 8), mat(color, { double: true }))
    m.position.set(x, y, z)
    return this.add(ombre(m)) as THREE.Mesh
  }

  add(o: THREE.Object3D) { this.g.add(o); return o }
  /** boîte posée au sol : (x, z) = centre, y = bas */
  box(w: number, h: number, d: number, color: number | THREE.Material, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'number' ? mat(color) : color)
    m.position.set(x, y + h / 2, z)
    return this.add(ombre(m)) as THREE.Mesh
  }
  /** boîte centrée en (x, y, z) */
  piece(w: number, h: number, d: number, color: number | THREE.Material, x = 0, y = 0, z = 0) {
    return this.box(w, h, d, color, x, y - h / 2, z)
  }
  cyl(rt: number, rb: number, h: number, color: number | THREE.Material, x = 0, y = 0, z = 0, seg = 8) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof color === 'number' ? mat(color) : color)
    m.position.set(x, y + h / 2, z)
    return this.add(ombre(m)) as THREE.Mesh
  }
  cone(r: number, h: number, color: number, x = 0, y = 0, z = 0, seg = 4, rot = Math.PI / 4) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat(color))
    m.position.set(x, y + h / 2, z)
    m.rotation.y = rot
    return this.add(ombre(m)) as THREE.Mesh
  }
  /** toit à deux pans, faîtage le long de x (ou de z si rotY = π/2) ; wp = largeur entre pignons si en retrait du débord */
  gable(w: number, d: number, h: number, color: number, x = 0, y = 0, z = 0, pignon?: number, rotY = 0, wp = w) {
    const W = w / 2, D = d / 2, P = wp / 2
    const A = [-W, 0, -D], Bv = [-W, 0, D], C = [-W, h, 0], Dv = [W, 0, -D], E = [W, 0, D], F = [W, h, 0]
    const tri = (...p: number[][]) => p.flat()
    const pans = new THREE.BufferGeometry()
    pans.setAttribute('position', new THREE.Float32BufferAttribute(tri(Bv, E, F, Bv, F, C, Dv, A, C, Dv, C, F), 3))
    pans.computeVertexNormals()
    const toit = new THREE.Mesh(pans, mat(color, { double: true }))
    toit.position.set(x, y, z); toit.rotation.y = rotY
    this.add(ombre(toit))
    const bouts = new THREE.BufferGeometry()
    const Pe = [P, 0, D], Pd = [P, 0, -D], Pf = [P, h, 0], Pa = [-P, 0, -D], Pb = [-P, 0, D], Pc = [-P, h, 0]
    bouts.setAttribute('position', new THREE.Float32BufferAttribute(tri(Pe, Pd, Pf, Pa, Pb, Pc), 3))
    bouts.computeVertexNormals()
    const p = new THREE.Mesh(bouts, mat(pignon ?? color, { double: true }))
    p.position.set(x, y, z); p.rotation.y = rotY
    this.add(ombre(p))
  }
  /** toit à deux pans avec débord et faîtière */
  toit(w: number, d: number, h: number, color: number, x = 0, y = 0, z = 0, pignon?: number, wp = w) {
    this.gable(w, d, h, color, x, y, z, pignon, 0, wp)
    this.piece(w + 0.04, 0.1, 0.14, fonce(color), x, y + h, z)
    // rives : planches le long des pignons
    const L = Math.hypot(d / 2, h), a = Math.atan2(h, d / 2)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const r = this.piece(0.06, 0.1, L, fonce(color, 0.6), x + sx * w / 2, y + h / 2, z + sz * d / 4)
      r.rotation.x = sz * a
    }
  }
  /** toit pyramidal sur une base carrée de côté s */
  pyr(s: number, h: number, color: number, x = 0, y = 0, z = 0) { return this.cone(s / Math.SQRT2, h, color, x, y, z, 4) }

  /** soubassement en moellons */
  socle(w: number, d: number, h = 0.3, x = 0, z = 0) { return this.box(w, h, d, SOCLE, x, 0, z) }
  /** pans de bois : poteaux, sablières et décharges dans les travées d'angle, sur les quatre faces */
  colombage(w: number, h: number, d: number, y: number, x0 = 0, z0 = 0) {
    const e = 0.09, k = 0.035
    for (const axe of ['z', 'x'] as const) {
      const L = axe === 'z' ? w : d, P = axe === 'z' ? d : w
      const n = Math.max(2, Math.round(L / 0.6)), pw = L / n
      for (const s of [-1, 1]) {
        const off = s * (P / 2 + k / 2)
        const at = (u: number, v: number, a: number, b: number) =>
          axe === 'z' ? this.piece(a, b, k, POUTRE, x0 + u, v, z0 + off) : this.piece(k, b, a, POUTRE, x0 + off, v, z0 + u)
        for (let i = 0; i <= n; i++) at(-L / 2 + i * pw, y + h / 2, e, h)
        at(0, y + e / 2, L + 0.04, e); at(0, y + h - e / 2, L + 0.04, e)
        const len = Math.hypot(pw, h), ang = Math.atan2(pw, h)
        for (const [i, dir] of [[0, 1], [n - 1, -1]]) {
          const m = at(-L / 2 + (i + 0.5) * pw, y + h / 2, e * 0.9, len)
          if (axe === 'z') m.rotation.z = -dir * ang
          else m.rotation.x = dir * ang
        }
      }
    }
  }
  /** pierres d'angle harpées */
  chainage(w: number, h: number, d: number, y: number, x0 = 0, z0 = 0) {
    const hb = 0.22, pas = 0.26
    for (let k = 0; (k + 1) * pas <= h + 0.02; k++) {
      const lx = k % 2 ? 0.34 : 0.18, lz = k % 2 ? 0.18 : 0.34
      for (const sx of [-1, 1]) for (const sz of [-1, 1])
        this.piece(lx, hb, lz, CHAINE, x0 + sx * (w / 2 - lx / 2 + 0.025), y + k * pas + hb / 2 + 0.02, z0 + sz * (d / 2 - lz / 2 + 0.025))
    }
  }
  /** bardage : couvre-joints verticaux */
  planches(w: number, h: number, d: number, y: number, x0 = 0, z0 = 0) {
    for (const axe of ['z', 'x'] as const) {
      const L = axe === 'z' ? w : d, P = axe === 'z' ? d : w
      const n = Math.round(L / 0.32)
      for (const s of [-1, 1]) for (let i = 1; i < n; i++) {
        const u = -L / 2 + i * L / n
        if (axe === 'z') this.piece(0.04, h, 0.02, fonce(MURS.bois, 0.7), x0 + u, y + h / 2, z0 + s * (P / 2 + 0.01))
        else this.piece(0.02, h, 0.04, fonce(MURS.bois, 0.7), x0 + s * (P / 2 + 0.01), y + h / 2, z0 + u)
      }
      for (const s of [-1, 1]) {
        if (axe === 'z') this.piece(L + 0.04, 0.1, 0.04, POUTRE, x0, y + h - 0.05, z0 + s * (P / 2 + 0.02))
        else this.piece(0.04, 0.1, L + 0.04, POUTRE, x0 + s * (P / 2 + 0.02), y + h - 0.05, z0)
      }
    }
  }
  /** profil en plein cintre (rectangle + demi-disque), plaqué sur une face */
  arche(x: number, y: number, z: number, w: number, hRect: number, t: number, color: number | THREE.Material, face: Face = 'z') {
    const m = typeof color === 'number' ? mat(color) : color
    if (face === 'z') this.box(w, hRect, t, m, x, y, z); else this.box(t, hRect, w, m, x, y, z)
    const geo = new THREE.CylinderGeometry(w / 2, w / 2, t, 10, 1, false, Math.PI / 2, Math.PI)
    geo.rotateX(Math.PI / 2)
    if (face === 'x') geo.rotateY(Math.PI / 2)
    const c = new THREE.Mesh(geo, m)
    c.position.set(x, y + hRect, z)
    this.add(ombre(c))
  }
  fenetre(x: number, y: number, z: number, w = 0.45, h = 0.55, face: Face = 'z') {
    const m = new THREE.Mesh(new THREE.BoxGeometry(face === 'z' ? w : 0.06, h, face === 'z' ? 0.06 : w), matFenetre)
    m.position.set(x, y + h / 2, z)
    this.add(m)
  }
  /** fenêtre à volets ouverts et appui en pierre (murs pleins) */
  baie(x: number, y: number, z: number, w = 0.42, h = 0.5, face: Face = 'z') {
    this.fenetre(x, y, z, w, h, face)
    const c = VOLETS[this.seed % VOLETS.length]
    const vw = w * 0.5, k = 0.05
    for (const s of [-1, 1]) {
      if (face === 'z') this.box(vw, h, 0.04, c, x + s * (w / 2 + vw / 2 + 0.02), y, z + k)
      else this.box(0.04, h, vw, c, x + k, y, z + s * (w / 2 + vw / 2 + 0.02))
    }
    if (face === 'z') this.box(w + 0.14, 0.07, 0.14, CHAINE, x, y - 0.07, z + 0.03)
    else this.box(0.14, 0.07, w + 0.14, CHAINE, x + 0.03, y - 0.07, z)
  }
  /** fenêtre à meneau en croix (pans de bois, chapelles) */
  croisee(x: number, y: number, z: number, w = 0.36, h = 0.5, face: Face = 'z') {
    this.fenetre(x, y, z, w, h, face)
    const o = 0.04
    if (face === 'z') { this.box(0.04, h, 0.03, POUTRE, x, y, z + o); this.piece(w, 0.04, 0.03, POUTRE, x, y + h * 0.62, z + o) }
    else { this.box(0.03, h, 0.04, POUTRE, x + o, y, z); this.piece(0.03, 0.04, w, POUTRE, x + o, y + h * 0.62, z) }
  }
  meurtriere(x: number, y: number, z: number, face: Face = 'z') { this.fenetre(x, y, z, 0.1, 0.45, face) }
  /** porte cloutée en plein cintre avec encadrement de pierre */
  porte(x: number, z: number, w = 0.6, h = 1.1, face: Face = 'z', y = 0) {
    const r = h - w / 2
    if (face === 'z') { this.arche(x, y, z, w + 0.16, r, 0.05, CHAINE, face); this.arche(x, y, z + 0.03, w, r, 0.08, 0x4f3520, face) }
    else { this.arche(x, y, z, w + 0.16, r, 0.05, CHAINE, face); this.arche(x + 0.03, y, z, w, r, 0.08, 0x4f3520, face) }
    // pentures
    for (const v of [0.3, 0.7]) {
      if (face === 'z') this.piece(w * 0.8, 0.04, 0.03, FER, x, y + r * v, z + 0.08)
      else this.piece(0.03, 0.04, w * 0.8, FER, x + 0.08, y + r * v, z)
    }
  }
  /** merlons sur le pourtour d'un rectangle w × d posé à la hauteur y */
  creneaux(w: number, d: number, y: number, color: number, x0 = 0, z0 = 0, t = 0.24, hm = 0.38) {
    const impair = (v: number) => { const n = Math.max(3, Math.round(v)); return n % 2 ? n : n + 1 }
    const nw = impair(w / 0.3), nd = impair(d / 0.3)
    for (let i = 0; i < nw; i += 2) for (const s of [-1, 1])
      this.box(w / nw, hm, t, color, x0 - w / 2 + (i + 0.5) * w / nw, y, z0 + s * (d / 2 - t / 2))
    for (let i = 2; i < nd - 2; i += 2) for (const s of [-1, 1])
      this.box(t, hm, d / nd, color, x0 + s * (w / 2 - t / 2), y, z0 - d / 2 + (i + 0.5) * d / nd)
  }
  /** merlons sur un cercle */
  creneauxRond(r: number, y: number, n: number, color: number, t = 0.24, hm = 0.4) {
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2
      const b = this.box(2 * Math.PI * r / n * 0.55, hm, t, color, Math.cos(a) * (r - t / 2), y, Math.sin(a) * (r - t / 2))
      b.rotation.y = -a + Math.PI / 2
    }
  }
  /** corbeaux sous un parapet en surplomb */
  corbeaux(s: number, y: number, color: number) {
    const n = Math.round(s / 0.32)
    for (let i = 0; i < n; i++) {
      const u = -s / 2 + (i + 0.5) * s / n
      for (const sg of [-1, 1]) { this.piece(0.12, 0.26, 0.2, color, u, y, sg * s / 2); this.piece(0.2, 0.26, 0.12, color, sg * s / 2, y, u) }
    }
  }
  /** tonneau cerclé, debout ou couché le long de x */
  tonneau(x: number, z: number, y = 0, couche = false) {
    const h = 0.5, r = 0.21, b = 0.17
    const rc = (ly: number) => r - (r - b) * Math.abs(ly) / (h / 2) + 0.012
    const parts: [THREE.BufferGeometry, number, number][] = [
      [new THREE.CylinderGeometry(r, b, h / 2, 10), 0x8a5a32, -h / 4],
      [new THREE.CylinderGeometry(b, r, h / 2, 10), 0x8a5a32, h / 4],
      [new THREE.CylinderGeometry(b - 0.02, b - 0.02, 0.01, 10), 0x5c3b20, h / 2],
      ...[-0.17, -0.06, 0.06, 0.17].map(ly => [new THREE.CylinderGeometry(rc(ly), rc(ly), 0.035, 10), FER, ly] as [THREE.BufferGeometry, number, number]),
    ]
    for (const [geo, c, ly] of parts) {
      const m = new THREE.Mesh(geo, mat(c))
      if (couche) { m.rotation.z = Math.PI / 2; m.position.set(x - ly, y + r, z) }
      else m.position.set(x, y + h / 2 + ly, z)
      this.add(ombre(m))
    }
  }
  caisse(x: number, z: number, y = 0, s = 0.36) {
    this.box(s, s, s, 0x9a7448, x, y, z)
    for (const k of [-1, 1]) this.box(s + 0.02, 0.05, s + 0.02, 0x6b4a2e, x, y + (k < 0 ? 0.03 : s - 0.08), z)
  }
  drapeau(x: number, y: number, z: number, color: number, h = 1.1) {
    this.cyl(0.025, 0.03, h, 0x3a2a1a, x, y, z, 5)
    const d = this.box(0.03, 0.38, 0.6, color, x, y + h - 0.45, z + 0.31)
    d.castShadow = false
  }
  enseigne(x: number, y: number, z: number) {
    this.piece(0.05, 0.05, 0.55, FER, x, y, z)
    this.piece(0.04, 0.42, 0.36, 0x7c5533, x, y - 0.26, z + 0.08)
  }
  sol(w: number, d: number, color: number, y = 0.02) { const m = this.box(w, 0.04, d, color, 0, y - 0.02, 0); m.castShadow = false; return m }
  arbre(x: number, z: number, s = 1, color = 0x4d7d45) {
    this.cyl(0.08 * s, 0.11 * s, 0.9 * s, 0x6b4a2e, x, 0, z, 5)
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 * s, 0), mat(color))
    c.position.set(x, 1.15 * s, z)
    this.add(ombre(c))
  }
  sapin(x: number, z: number, s = 1) {
    this.cyl(0.08 * s, 0.1 * s, 0.5 * s, 0x5a3d26, x, 0, z, 5)
    this.cone(0.75 * s, 1.5 * s, 0x2f5a40, x, 0.4 * s, z, 6, 0)
    this.cone(0.55 * s, 1.1 * s, 0x3c7151, x, 1.2 * s, z, 6, 0)
  }
  cheminee(x: number, y: number, z: number, h = 1.3) {
    this.box(0.34, h, 0.34, SOCLE, x, y, z)
    this.box(0.44, 0.1, 0.44, CHAINE, x, y + h - 0.1, z)
    this.smoke.push(new THREE.Vector3(x, y + h + 0.1, z))
  }
  /** étage en encorbellement : solives saillantes sous un étage plus profond de 2·j */
  encorbellement(w: number, d: number, y: number, j: number, x0 = 0, z0 = 0) {
    const n = Math.round(w / 0.3)
    for (let i = 0; i <= n; i++) for (const s of [-1, 1])
      this.piece(0.08, 0.1, j + 0.06, POUTRE, x0 - w / 2 + 0.05 + i * (w - 0.1) / n, y - 0.05, z0 + s * (d / 2 + j / 2))
  }
}

/** Construit le modèle d'un bâtiment. userData.smoke / userData.spin servent aux animations. */
export function construireModele(shape: Shape, o: ShapeOpt, seed = 0): THREE.Group {
  const f = new Fab(seed)
  const matK = o.mat ?? 'enduit'
  const mur = MURS[matK]
  const toit = TOITS[o.roof ?? 'rouge']
  const rnd = (i: number) => { const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453; return x - Math.floor(x) }
  /** habillage d'un corps de bâtiment selon son matériau */
  const habiller = (w: number, h: number, d: number, y: number, x0 = 0, z0 = 0, m = matK) => {
    if (m === 'enduit') f.colombage(w, h, d, y, x0, z0)
    else if (m === 'bois') f.planches(w, h, d, y, x0, z0)
    else f.chainage(w, h, d, y, x0, z0)
  }
  /** fenêtre adaptée au mur : croisée entre les pans de bois, baie à volets sinon */
  const ouvrir = (x: number, y: number, z: number, w: number, h: number, m: string, face: Face = 'z') =>
    m === 'enduit' ? f.croisee(x, y, z, w * 0.85, h, face) : f.baie(x, y, z, w, h, face)

  switch (shape) {
    case 'maison': {
      const W = 2.3, D = 1.9, y0 = 0.3
      f.socle(W + 0.1, D + 0.1, y0)
      if (matK === 'bois') {
        // chaumière de plain-pied sous un grand toit
        const h = 1.8
        f.box(W, h, D, mur, 0, y0, 0); habiller(W, h, D, y0)
        f.toit(W + 0.5, D + 0.8, 2.0, toit, 0, y0 + h, 0, mur, W)
        ouvrir(-0.6, y0 + 0.75, D / 2 + 0.01, 0.42, 0.48, 'bois'); f.porte(0.35, D / 2 + 0.01, 0.55, 1.3, 'z', y0)
        ouvrir(W / 2 + 0.01, y0 + 0.75, 0, 0.4, 0.45, 'bois', 'x')
        if (rnd(1) > 0.4) f.cheminee(-0.7, y0 + h, -0.35, 1.9)
        f.tonneau(1.45, 0.7); if (rnd(2) > 0.5) f.caisse(1.5, 0.2)
      } else {
        // rez-de-chaussée (pierre ou pans de bois) + étage à pans de bois en encorbellement
        const h1 = 1.7, h2 = 1.45, j = 0.16, y1 = y0 + h1, D2 = D + 2 * j
        f.box(W, h1, D, mur, 0, y0, 0); habiller(W, h1, D, y0)
        f.encorbellement(W, D, y1, j)
        f.box(W, h2, D2, MURS.enduit, 0, y1, 0); f.colombage(W, h2, D2, y1)
        f.toit(W + 0.4, D2 + 0.5, 1.8, toit, 0, y1 + h2, 0, MURS.enduit, W)
        for (const s of [-1, 1]) f.piece(0.035, 1.6, 0.09, POUTRE, s * (W / 2 + 0.02), y1 + h2 + 0.75, 0)
        ouvrir(-0.29, y0 + 0.65, D / 2 + 0.01, 0.42, 0.5, matK); f.porte(0.29, D / 2 + 0.01, 0.48, 1.25, 'z', y0)
        for (const x of [-0.29, 0.29]) f.croisee(x, y1 + 0.4, D2 / 2 + 0.01, 0.34, 0.55)
        f.croisee(W / 2 + 0.01, y1 + 0.4, 0, 0.32, 0.5, 'x')
        if (rnd(1) > 0.35) f.cheminee(-0.6, y1 + h2 + 0.4, -0.45, 1.8)
        if (rnd(2) > 0.4) { f.tonneau(1.45, 0.75); if (rnd(3) > 0.5) f.tonneau(1.45, 0.28) }
      }
      break
    }
    case 'atelier': {
      // corps principal + appentis ouvert sur le côté (forge, établi, bois empilé)
      const W = o.big ? 2.5 : 2.2, D = 2.0, y0 = 0.3, h = 1.9, bx = -0.5
      f.socle(W + 0.1, D + 0.1, y0, bx)
      f.box(W, h, D, mur, bx, y0, 0); habiller(W, h, D, y0, bx)
      f.toit(W + 0.4, D + 0.6, 1.7, toit, bx, y0 + h, 0, mur, W)
      ouvrir(bx - 0.5, y0 + 0.75, D / 2 + 0.01, 0.42, 0.5, matK); f.porte(bx + 0.4, D / 2 + 0.01, 0.65, 1.4, 'z', y0)
      f.cheminee(bx + 0.6, y0 + h + 0.3, -0.5, 1.9)
      if (o.big) f.cheminee(bx - 0.7, y0 + h + 0.3, -0.5, 2.2)
      const x0 = bx + W / 2, x1 = 1.7, hi = y0 + h - 0.15, lo = 1.2
      for (const z of [-0.85, 0.85]) f.box(0.12, lo, 0.12, POUTRE, x1 - 0.08, 0, z)
      const pan = f.piece(Math.hypot(x1 - x0 + 0.15, hi - lo), 0.06, D + 0.2, toit, (x0 + x1 + 0.15) / 2, (hi + lo) / 2 + 0.03, 0)
      pan.rotation.z = -Math.atan2(hi - lo, x1 - x0 + 0.15)
      f.box(0.4, 0.45, 0.3, FER, x0 + 0.4, 0, 0.3); f.box(0.55, 0.12, 0.25, FER, x0 + 0.4, 0.45, 0.3)
      for (let i = 0; i < 3; i++) { const l = f.cyl(0.1, 0.1, 1.4, 0x7c5533, x0 + 0.25 + (i % 2) * 0.1, 0, -0.5, 6); l.rotation.x = Math.PI / 2; l.position.y = 0.1 + i * 0.18 }
      f.box(0.8, 0.4, 0.4, 0x5c4128, bx - 0.5, 0, 1.4)
      f.tonneau(x0 + 0.75, 0.7); f.caisse(x0 + 0.85, 0.2)
      break
    }
    case 'grand': {
      // halle : rez-de-chaussée en pierre, étage en encorbellement, lucarne
      const W = 3.2, D = 2.3, y0 = 0.3, h1 = 1.9, h2 = 1.6, j = 0.18, y1 = y0 + h1, D2 = D + 2 * j
      const haut = matK === 'pierre' || matK === 'sombre' ? MURS.enduit : mur
      f.socle(W + 0.1, D + 0.1, y0)
      f.box(W, h1, D, MURS.pierre, 0, y0, 0); f.chainage(W, h1, D, y0)
      f.encorbellement(W, D, y1, j)
      f.box(W, h2, D2, haut, 0, y1, 0); haut === MURS.bois ? f.planches(W, h2, D2, y1) : f.colombage(W, h2, D2, y1)
      const hr = 2.1
      f.toit(W + 0.4, D2 + 0.5, hr, toit, 0, y1 + h2, 0, haut, W)
      for (const s of [-1, 1]) f.piece(0.035, hr - 0.15, 0.09, POUTRE, s * (W / 2 + 0.02), y1 + h2 + (hr - 0.15) / 2, 0)
      f.porte(0, D / 2 + 0.01, 0.8, 1.55, 'z', y0)
      for (const x of [-1.05, 1.05]) f.baie(x, y0 + 0.7, D / 2 + 0.01, 0.42, 0.55)
      for (const x of [-0.8, 0.8]) f.croisee(x, y1 + 0.45, D2 / 2 + 0.01, 0.38, 0.6)
      f.croisee(W / 2 + 0.01, y1 + 0.45, 0, 0.36, 0.55, 'x'); f.croisee(-W / 2 - 0.01, y1 + 0.45, 0, 0.36, 0.55, 'x')
      // lucarne sur le pan avant
      const yl = y1 + h2, zl = 0.75
      f.box(0.7, 0.85, 0.9, haut, 0, yl, zl)
      f.gable(0.95, 0.95, 0.5, toit, 0, yl + 0.85, zl + 0.05, haut, Math.PI / 2)
      f.croisee(0, yl + 0.35, zl + 0.46, 0.3, 0.42)
      f.cheminee(1.0, yl + 0.5, -0.65, 2.0)
      if (matK === 'pierre' || matK === 'sombre') f.drapeau(-1.0, yl + hr * 0.45, -0.1, toit, 1.6)
      else {
        f.enseigne(1.3, y0 + 1.75, D / 2 + 0.28)
        // tonneaux empilés devant la taverne
        f.tonneau(1.95, 1.05, 0, true); f.tonneau(1.95, 0.6, 0, true); f.tonneau(1.95, 0.83, 0.38, true)
        f.tonneau(-1.85, 1.0)
      }
      break
    }
    case 'grange': {
      const W = 3.0, D = 2.3, y0 = 0.35, h = 2.0
      const m = matK === 'enduit' ? 'enduit' : 'bois'
      f.socle(W + 0.1, D + 0.1, y0)
      f.box(W, h, D, MURS[m], 0, y0, 0); habiller(W, h, D, y0, 0, 0, m)
      f.toit(W + 0.5, D + 0.8, 2.2, toit, 0, y0 + h, 0, MURS[m], W)
      // grande porte charretière sur le pignon, croix de Saint-André
      const xp = W / 2 + 0.03, hp = 1.75, wp = 1.3
      f.box(0.06, hp, wp, 0x5c4128, xp, y0, 0)
      for (const s of [-1, 1]) f.piece(0.04, Math.hypot(wp, hp) * 0.95, 0.09, POUTRE, xp + 0.04, y0 + hp / 2, 0).rotation.x = s * Math.atan2(wp, hp)
      f.piece(0.04, hp, 0.06, POUTRE, xp + 0.05, y0 + hp / 2, 0)
      f.box(0.06, 0.5, 0.5, 0x5c4128, xp, y0 + h + 0.3, 0)
      f.croisee(-0.8, y0 + 0.9, D / 2 + 0.01, 0.36, 0.45)
      // enclos
      for (let i = 0; i < 6; i++) f.box(0.08, 0.75, 0.08, 0x7c5533, -1.6 + i * 0.64, 0, 1.65)
      for (const y of [0.3, 0.6]) f.box(3.3, 0.06, 0.06, 0x7c5533, 0, y, 1.65)
      f.tonneau(-1.85, -0.5); f.tonneau(-1.85, -0.05); f.caisse(-1.85, 0.45)
      break
    }
    case 'tour': {
      if (o.big) {
        // tour ronde : fruit à la base, mâchicoulis, crénelage, toit en poivrière
        const m = MURS[matK === 'enduit' ? 'pierre' : matK], r = 1.3, h = 5.2
        f.cyl(r, r + 0.25, 0.9, fonce(m, 0.9), 0, 0, 0, 14)
        f.cyl(r, r, h - 0.9, m, 0, 0.9, 0, 14)
        for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; f.piece(0.25, 0.3, 0.14, m, Math.cos(a) * (r + 0.05), h - 0.1, Math.sin(a) * (r + 0.05)).rotation.y = -a }
        f.cyl(r + 0.18, r + 0.18, 0.5, m, 0, h, 0, 14)
        f.creneauxRond(r + 0.18, h + 0.5, 12, m)
        f.cone(r - 0.15, 2.6, toit, 0, h + 0.5, 0, 14, 0)
        f.drapeau(0, h + 3.0, 0, toit, 0.9)
        f.porte(0, r + 0.02, 0.6, 1.25)
        for (const [y, a] of [[2.2, 0], [3.4, 1.2], [4.2, -1.1]]) f.meurtriere(Math.sin(a) * (r + 0.01), y, Math.cos(a) * (r + 0.01))
        break
      }
      if (matK === 'bois' && o.roof === 'chaume') {
        // grenier rond sur pilotis
        for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) { f.cyl(0.12, 0.14, 0.6, SOCLE, x, 0, z, 6); f.cyl(0.2, 0.2, 0.08, CHAINE, x, 0.6, z, 6) }
        f.cyl(1.1, 1.1, 2.6, MURS.bois, 0, 0.68, 0, 12)
        for (const y of [1.2, 2.2, 3.0]) f.cyl(1.13, 1.13, 0.08, POUTRE, 0, y, 0, 12)
        f.cone(1.45, 2.0, toit, 0, 3.28, 0, 12, 0)
        f.box(0.5, 0.9, 0.06, 0x5c4128, 0, 1.4, 1.1)
        break
      }
      if (matK === 'bois') {
        // tour de guet en charpente, cabane de veille au sommet
        const c = 0.72, hp = 3.6
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.box(0.15, hp + 1.1, 0.15, POUTRE, sx * c, 0, sz * c)
        for (const y of [0.9, 2.5]) {
          const len = Math.hypot(2 * c, 1.5), a = Math.atan2(2 * c, 1.5)
          for (const s of [-1, 1]) for (const sg of [-1, 1]) {
            f.piece(0.07, len, 0.07, 0x7c5533, 0, y, sg * c).rotation.z = s * a
            f.piece(0.07, len, 0.07, 0x7c5533, sg * c, y, 0).rotation.x = s * a
          }
        }
        f.box(2.0, 0.12, 2.0, 0x7c5533, 0, hp, 0)
        f.box(1.6, 0.7, 1.6, MURS.bois, 0, hp + 0.12, 0); f.planches(1.6, 0.7, 1.6, hp + 0.12)
        f.fenetre(0, hp + 0.85, 0.81, 0.9, 0.3); f.fenetre(0.81, hp + 0.85, 0, 0.9, 0.3, 'x')
        f.pyr(2.1, 1.6, toit, 0, hp + 1.15, 0)
        // échelle
        f.box(0.05, hp, 0.05, 0x7c5533, -0.2, 0, c + 0.12); f.box(0.05, hp, 0.05, 0x7c5533, 0.2, 0, c + 0.12)
        for (let i = 1; i < 12; i++) f.piece(0.4, 0.04, 0.04, 0x7c5533, 0, i * 0.3, c + 0.12)
        break
      }
      // donjon carré : fruit, chaînage, parapet crénelé sur corbeaux, toit en flèche
      const m = mur, s = 1.6, h = 4.6
      f.box(s + 0.3, 0.6, s + 0.3, fonce(m, 0.9))
      f.box(s, h, s, m); if (matK !== 'enduit') f.chainage(s, h - 0.6, s, 0.6)
      f.corbeaux(s + 0.08, h - 0.05, m)
      f.box(s + 0.3, 0.45, s + 0.3, m, 0, h + 0.08, 0)
      f.creneaux(s + 0.3, s + 0.3, h + 0.53, m)
      f.pyr(s - 0.4, 2.4, toit, 0, h + 0.6, 0)
      f.porte(0, s / 2 + 0.01, 0.55, 1.15)
      f.croisee(0, h - 1.2, s / 2 + 0.01, 0.34, 0.55); f.meurtriere(s / 2 + 0.01, h - 2.6, 0, 'x'); f.meurtriere(-s / 2 - 0.01, h - 1.8, 0, 'x')
      if (o.roof === 'rouge') f.drapeau(0, h + 2.7, 0, TOITS.rouge, 0.8)
      break
    }
    case 'chapelle': {
      // nef en pierre à contreforts, clocher carré à flèche octogonale
      const W = 2.5, D = 1.6, nx = -0.5, h = 2.1, y0 = 0.25
      f.socle(W + 0.1, D + 0.1, y0, nx)
      f.box(W, h, D, MURS.pierre, nx, y0, 0); f.chainage(W, h, D, y0, nx)
      for (const x of [nx - 0.45, nx + 0.45]) for (const s of [-1, 1]) {
        f.box(0.24, 1.2, 0.3, MURS.pierre, x, 0, s * (D / 2 + 0.15))
        f.box(0.24, 0.6, 0.18, MURS.pierre, x, 1.2, s * (D / 2 + 0.09))
      }
      f.toit(W + 0.3, D + 0.5, 1.6, TOITS.ardoise, nx, y0 + h, 0, MURS.pierre, W)
      for (const x of [nx - 0.9, nx, nx + 0.9]) for (const s of [-1, 1]) {
        f.fenetre(x, y0 + 0.75, s * (D / 2 + 0.01), 0.22, 0.85)
        f.cone(0.11, 0.2, 0x3a3226, x, y0 + 1.6, s * (D / 2 + 0.01), 3, Math.PI / 2)
      }
      const rose = f.cyl(0.28, 0.28, 0.06, matFenetre, nx - W / 2 - 0.02, y0 + h + 0.35, 0, 12)
      rose.rotation.z = Math.PI / 2; rose.castShadow = false
      const tx = 1.25, ts = 1.15, th = 4.2
      f.box(ts + 0.15, 0.4, ts + 0.15, SOCLE, tx, 0, 0)
      f.box(ts, th, ts, MURS.pierre, tx, 0, 0); f.chainage(ts, th - 0.4, ts, 0.4, tx)
      for (const s of [-1, 1]) {
        f.arche(tx, th - 1.1, s * (ts / 2 + 0.01), 0.42, 0.55, 0.04, 0x221d18)
        f.arche(tx + s * (ts / 2 + 0.01), th - 1.1, 0, 0.42, 0.55, 0.04, 0x221d18, 'x')
      }
      f.box(ts + 0.22, 0.16, ts + 0.22, CHAINE, tx, th, 0)
      f.cone(0.82, 3.0, TOITS.ardoise, tx, th + 0.16, 0, 8, Math.PI / 8)
      f.piece(0.05, 0.55, 0.05, 0xc9a34a, tx, th + 3.4, 0); f.piece(0.3, 0.05, 0.05, 0xc9a34a, tx, th + 3.48, 0)
      f.porte(tx, ts / 2 + 0.01, 0.55, 1.3)
      break
    }
    case 'puits': {
      f.cyl(0.6, 0.66, 0.55, MURS.pierre, 0, 0, 0, 10)
      f.cyl(0.66, 0.66, 0.08, CHAINE, 0, 0.55, 0, 10)
      const eau = new THREE.Mesh(new THREE.CircleGeometry(0.5, 10), matEau); eau.rotation.x = -Math.PI / 2; eau.position.y = 0.45; f.add(eau)
      f.box(0.12, 1.55, 0.12, 0x7c5533, -0.58, 0, 0); f.box(0.12, 1.55, 0.12, 0x7c5533, 0.58, 0, 0)
      f.cyl(0.06, 0.06, 1.3, 0x5c4128, 0, 1.2, 0).rotation.z = Math.PI / 2
      f.box(0.01, 0.4, 0.01, 0x3a2a1a, 0, 0.84, 0); f.cyl(0.11, 0.09, 0.18, 0x6b4a2e, 0, 0.7, 0, 7)
      f.gable(1.6, 1.15, 0.6, TOITS.chaume, 0, 1.55, 0, 0x7c5533)
      break
    }
    case 'champ': {
      f.sol(3.4, 3.4, 0x7d5f37)
      for (let i = 0; i < 6; i++) f.box(3.1, 0.18 + (i % 2) * 0.08, 0.32, i % 2 ? 0xd8bf55 : 0x9cb34a, 0, 0, -1.35 + i * 0.54)
      f.box(0.1, 1.1, 0.1, 0x7c5533, 1.55, 0, 1.55)
      break
    }
    case 'verger': {
      f.sol(3.4, 3.4, 0x6f8f4d)
      const cols = o.flowers ? [0xd7769a, 0xe8c25a, 0xb06ad0] : [0x4d7d45, 0x5a8a4b]
      let i = 0
      for (const x of [-1.1, 0, 1.1]) for (const z of [-1.1, 0, 1.1]) f.arbre(x + (rnd(i) - 0.5) * 0.3, z + (rnd(i + 9) - 0.5) * 0.3, o.flowers ? 0.6 : 0.85, cols[i++ % cols.length])
      break
    }
    case 'vigne': {
      f.sol(3.4, 3.4, 0x8e6f43)
      for (let r = 0; r < 5; r++) {
        const z = -1.3 + r * 0.65
        f.box(3.0, 0.75, 0.22, 0x557a3c, 0, 0.1, z)
        for (const x of [-1.5, 0, 1.5]) f.box(0.07, 1.0, 0.07, 0x6b4a2e, x, 0, z)
        for (let k = 0; k < 6; k++) { const g = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), mat(0x5e2f55)); g.position.set(-1.25 + k * 0.5, 0.45, z + 0.14); f.add(g) }
      }
      break
    }
    case 'ruches': {
      f.sol(3.4, 3.4, 0x7f9a52)
      for (const [x, z] of [[-1, -0.8], [0, -0.8], [1, -0.8], [-0.5, 0.6], [0.6, 0.6]]) {
        // ruches en paille tressée (bournacs)
        f.cyl(0.08, 0.08, 0.2, 0x5c4128, x, 0, z, 6)
        f.cyl(0.22, 0.32, 0.35, TOITS.chaume, x, 0.2, z, 8); f.cone(0.24, 0.3, TOITS.chaume, x, 0.55, z, 8, 0)
        f.box(0.1, 0.06, 0.04, 0x3a2a1a, x, 0.24, z + 0.3)
      }
      f.arbre(1.2, 1.2, 0.6, 0xd7769a)
      break
    }
    case 'camp': {
      if (o.cabin) {
        f.box(1.9, 1.6, 1.5, MURS.bois, -0.4, 0, 0.2)
        f.gable(2.2, 1.9, 1.0, TOITS.chaume, -0.4, 1.6, 0.2, MURS.bois)
        f.porte(-0.4, 0.96, 0.5, 1.0); f.fenetre(0.56, 0.7, 0.2, 0.4, 0.4, 'x')
        // trophée / peaux
        f.box(0.05, 0.6, 0.5, 0x8a6a48, 0.6, 0.7, 0.75)
      } else {
        f.cone(1.0, 1.7, 0xcdb88d, -0.6, 0, 0.4, 4)
        f.cone(0.8, 1.4, 0xbba679, 0.5, 0, 0.9, 4)
      }
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++) {
        const l = f.cyl(0.16, 0.16, 1.3, 0x7c5533, 1.0, 0.16 + i * 0.28 - 0.65, -0.9 + j * 0.33 + i * 0.16, 7); l.rotation.x = Math.PI / 2
        l.position.y = 0.16 + i * 0.28
      }
      f.sapin(-1.2, -1.2, 1.1); f.sapin(1.3, 1.3, 0.8)
      f.cyl(0.35, 0.4, 0.15, 0x6e695e, 0.3, 0, -0.2, 7)
      f.smoke.push(new THREE.Vector3(0.3, 0.3, -0.2))
      break
    }
    case 'mine': {
      const roc = new THREE.Mesh(new THREE.DodecahedronGeometry(1.7, 0), mat(0x8a8477))
      roc.scale.set(1.05, 0.95, 0.9); roc.position.set(0, 0.8, -0.5); f.add(ombre(roc))
      const roc2 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.0, 0), mat(0x726d62))
      roc2.position.set(-1.0, 0.5, 0.4); f.add(ombre(roc2))
      f.box(0.95, 1.25, 0.6, 0x1c1915, 0.35, 0, 0.95)
      f.box(0.14, 1.35, 0.14, 0x7c5533, -0.18, 0, 1.25); f.box(0.14, 1.35, 0.14, 0x7c5533, 0.88, 0, 1.25)
      f.box(1.3, 0.16, 0.18, 0x7c5533, 0.35, 1.3, 1.25)
      // rails + wagonnet
      f.box(0.06, 0.04, 1.8, 0x55585d, 0.15, 0, 2.0); f.box(0.06, 0.04, 1.8, 0x55585d, 0.55, 0, 2.0)
      f.box(0.6, 0.45, 0.7, 0x5c4128, 0.35, 0.12, 2.3)
      f.box(0.5, 0.15, 0.6, seed % 2 ? 0x8d6e5a : 0x6b6e73, 0.35, 0.57, 2.3)
      break
    }
    case 'carriere': {
      f.sol(3.4, 3.4, 0xa39e92)
      f.box(3.2, 2.0, 1.4, MURS.pierre, 0, 0, -1.0)
      f.box(3.2, 1.0, 1.0, 0xb9b4a9, 0, 0, 0.2)
      for (const [x, z] of [[-1, 1.2], [-0.3, 1.3], [0.9, 1.1]]) f.box(0.55, 0.45, 0.4, 0xc4bfb4, x, 0, z)
      f.box(0.1, 2.6, 0.1, 0x7c5533, 1.3, 0, 0.9); f.box(1.0, 0.1, 0.1, 0x7c5533, 0.85, 2.5, 0.9)
      break
    }
    case 'place': {
      const p = f.cyl(1.65, 1.65, 0.06, 0xcfc6b6, 0, 0, 0, 16); p.castShadow = false
      f.cyl(0.85, 0.9, 0.45, MURS.pierre, 0, 0, 0, 12)
      const eau = new THREE.Mesh(new THREE.CircleGeometry(0.72, 12), matEau); eau.rotation.x = -Math.PI / 2; eau.position.y = 0.43; f.add(eau)
      f.cyl(0.14, 0.18, 1.3, MURS.pierre, 0, 0.4, 0, 8)
      f.cyl(0.4, 0.2, 0.15, MURS.pierre, 0, 1.7, 0, 8)
      for (const [x, z] of [[-1.4, 0.6], [1.4, -0.6]]) f.box(0.9, 0.35, 0.3, 0x7c5533, x, 0, z)
      break
    }
    case 'route': {
      const r = f.box(3.6, 0.06, 1.6, 0xbdb3a2, 0, 0, 0); r.castShadow = false
      for (let i = 0; i < 10; i++) { const s = f.box(0.3, 0.08, 0.22, 0xa3988a, -1.6 + i * 0.36, 0, (i % 2 ? 0.35 : -0.35)); s.castShadow = false }
      break
    }
    case 'fosse': {
      f.box(3.6, 0.04, 1.4, 0x4a3d2c, 0, -0.02, 0)
      const eau = f.box(3.6, 0.03, 0.8, matEau, 0, 0, 0); eau.castShadow = false
      f.box(3.6, 0.45, 0.4, 0x7b6a4c, 0, 0, -0.95)
      for (let i = 0; i < 7; i++) { const p = f.cone(0.08, 0.7, 0x7c5533, -1.5 + i * 0.5, 0.2, -0.95, 4); p.rotation.x = 0.5 }
      break
    }
    case 'palissade': {
      for (let i = 0; i < 12; i++) {
        const x = -1.65 + i * 0.3
        const h = 2.0 + rnd(i) * 0.3
        f.cyl(0.13, 0.14, h, MURS.bois, x, 0, 0, 6)
        f.cone(0.13, 0.35, 0x7c5533, x, h, 0, 6, 0)
      }
      f.box(3.5, 0.12, 0.1, 0x6b4a2e, 0, 1.2, 0.18)
      // chemin de ronde sur jambes de force, côté intérieur
      f.box(3.5, 0.08, 0.5, 0x7c5533, 0, 1.4, 0.4)
      for (const x of [-1.4, 0, 1.4]) { f.box(0.1, 1.4, 0.1, POUTRE, x, 0, 0.6); f.piece(0.08, 0.6, 0.08, POUTRE, x, 1.15, 0.38).rotation.x = -0.7 }
      break
    }
    case 'mur': {
      // courtine : fruit, assises, chemin de ronde, merlons côté extérieur (-z)
      f.box(3.6, 0.5, 1.05, SOCLE, 0, 0, 0)
      f.box(3.6, 2.4, 0.8, MURS.pierre)
      for (const y of [0.95, 1.6]) f.box(3.6, 0.05, 0.84, CHAINE, 0, y, 0)
      for (let i = 0; i < 6; i++) {
        f.box(0.38, 0.45, 0.28, MURS.pierre, -1.55 + i * 0.62, 2.4, -0.26)
        f.meurtriere(-1.55 + i * 0.62, 2.4, -0.41)
      }
      f.box(3.6, 0.3, 0.2, MURS.pierre, 0, 2.4, 0.3)
      break
    }
    case 'porte': {
      // châtelet : deux tours crénelées à flèche, arc avec herse
      const tw = 1.1, td = 1.4, th = 4.0
      for (const x of [-1.3, 1.3]) {
        f.box(tw + 0.15, 0.5, td + 0.15, SOCLE, x, 0, 0)
        f.box(tw, th, td, MURS.pierre, x, 0, 0); f.chainage(tw, th - 0.5, td, 0.5, x)
        f.corbeaux(tw, th - 0.05, MURS.pierre)
        f.box(tw + 0.2, 0.35, td + 0.2, MURS.pierre, x, th, 0)
        f.creneaux(tw + 0.2, td + 0.2, th + 0.35, MURS.pierre, x)
        f.pyr(0.76, 2.0, TOITS.ardoise, x, th + 0.4, 0)
        f.meurtriere(x, 2.2, -td / 2 - 0.01); f.meurtriere(x, 2.2, td / 2 + 0.01)
      }
      // passage voûté sous le châtelet, herse à demi relevée
      const ho = 1.85
      f.box(1.5, 3.0 - ho, 1.2, MURS.pierre, 0, ho, 0)
      f.creneaux(1.5, 1.2, 3.0, MURS.pierre)
      for (const s of [-1, 1]) f.box(1.62, 0.16, 0.06, CHAINE, 0, ho, s * 0.62)
      for (let i = 0; i < 7; i++) f.box(0.05, 0.75, 0.05, FER, -0.6 + i * 0.2, ho - 0.55, -0.5)
      for (let i = 0; i < 7; i++) f.cone(0.04, 0.12, FER, -0.6 + i * 0.2, ho - 0.67, -0.5, 4).rotation.x = Math.PI
      for (const y of [ho - 0.45, ho - 0.1]) f.piece(1.3, 0.05, 0.05, FER, 0, y, -0.5)
      f.drapeau(1.3, th + 2.3, 0, TOITS.rouge, 0.8)
      break
    }
    case 'etal': {
      const w = o.big ? 3.4 : 2.4
      if (o.big) {
        for (const x of [-1.5, 0, 1.5]) for (const z of [-1.2, 1.2]) f.box(0.18, 2.4, 0.18, 0x7c5533, x, 0, z)
        f.gable(3.7, 3.0, 1.0, TOITS.ardoise, 0, 2.4, 0, 0x7c5533)
        for (const z of [-0.6, 0.6]) f.box(2.8, 0.8, 0.6, 0x9a6b40, 0, 0, z)
      } else {
        f.box(w, 0.85, 0.8, 0x9a6b40, 0, 0, 0)
        for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) { f.box(0.1, 2.0, 0.1, 0x7c5533, x, 0, 0.45); f.box(0.1, 2.3, 0.1, 0x7c5533, x, 0, -0.45) }
        const n = 5
        for (let i = 0; i < n; i++) {
          const b = f.box(w / n, 0.05, 1.2, i % 2 ? 0xf0e4cd : (o.roof === 'bleu' ? 0x3f6c96 : 0xc0503b), -w / 2 + w / n * (i + 0.5), 2.05, 0)
          b.rotation.x = -0.25
        }
      }
      f.tonneau(o.big ? 1.85 : 1.5, -0.2); if (!o.big) f.caisse(1.5, -0.7)
      for (const [x, z, c] of [[-0.6, 0.9, 0xd3833a], [0.1, 0.95, 0x8fb04a], [0.7, 0.9, 0xc04a3a]] as const) f.box(0.45, 0.35, 0.4, c, x, 0, z + (o.big ? 0.8 : 0.3))
      break
    }
    case 'arene': {
      const s = f.cyl(1.6, 1.6, 0.05, 0xd8c08a, 0, 0, 0, 16); s.castShadow = false
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2
        const b = f.box(0.62, 0.8, 0.18, 0x9a6b40, Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6)
        b.rotation.y = -a + Math.PI / 2
      }
      f.box(0.15, 1.6, 0.15, 0x7c5533, 0.3, 0, 0); f.box(0.6, 0.12, 0.12, 0x7c5533, 0.3, 1.2, 0)
      break
    }
    case 'stele': {
      f.sol(3.4, 3.4, 0x71894f)
      for (const [x, z] of [[-1.1, -0.9], [-1.1, 0.4], [1.0, -0.9], [1.0, 0.6], [-0.2, 1.2]]) f.box(0.45, 0.7, 0.14, MURS.pierre, x, 0, z)
      f.box(0.5, 2.2, 0.5, MURS.pierre, 0, 0, -0.2); f.pyr(0.5, 0.45, 0xc4bfb4, 0, 2.2, -0.2)
      f.arbre(1.3, 1.3, 0.7, 0x4a6f43)
      break
    }
    case 'sanctuaire': {
      f.sol(3.4, 3.4, 0x5f7d48)
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2
        const p = f.box(0.35, 1.3 + rnd(i) * 0.5, 0.3, MURS.sombre, Math.cos(a) * 1.3, 0, Math.sin(a) * 1.3)
        p.rotation.y = -a
      }
      f.arbre(0, 0, 1.4, 0x3f6e3a)
      break
    }
    case 'moulin': {
      f.cyl(1.0, 1.1, 0.4, SOCLE, 0, 0, 0, 8)
      f.cyl(0.75, 1.0, 3.4, MURS[o.mat ?? 'enduit'], 0, 0.3, 0, 8)
      for (const y of [1.4, 2.6]) f.cyl(0.92 - (y - 0.3) * 0.07, 0.94 - (y - 0.3) * 0.07, 0.07, POUTRE, 0, y, 0, 8)
      f.cone(1.05, 1.6, TOITS.chaume, 0, 3.7, 0, 8, 0)
      f.porte(0, 0.97, 0.55, 1.2, 'z', 0.3); f.croisee(0, 2.2, 0.86, 0.32, 0.45)
      const ailes = new THREE.Group()
      ailes.position.set(0, 3.3, 1.05)
      for (let i = 0; i < 4; i++) {
        const bras = new THREE.Group(); bras.rotation.z = i * Math.PI / 2
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 0.06), mat(0x5c4128)); b.position.y = 1.2
        const voile = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.8, 0.03), mat(0xefe6d2, { double: true })); voile.position.set(0.29, 1.4, 0)
        bras.add(b, voile); ailes.add(bras)
      }
      const moyeu = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.3, 8), mat(0x3a2a1a)); moyeu.rotation.x = Math.PI / 2
      ailes.add(moyeu)
      f.anime(ailes)
      break
    }
  }
  fusionner(f.g)
  f.g.userData.smoke = f.smoke
  f.g.userData.spin = f.spin
  return f.g
}

/** Défenses dessinées en enceinte autour du village plutôt que sur une parcelle. */
export const ENCEINTE: Shape[] = ['palissade', 'mur', 'fosse', 'porte']
/** Demi-largeur de l'ouverture d'une porte de l'enceinte, en unités de modèle. */
export const demiPorte = (portes: boolean) => portes ? 1.85 : 1.1

/**
 * Un élément de l'enceinte sur les quatre côtés d'un carré de demi-côté L (unités de modèle),
 * extérieur vers +z avant rotation, une porte par côté centrée en x = gx.
 */
/**
 * Un tronçon droit de l'enceinte, le long de x en z = L, l'extérieur vers +z (unités de modèle).
 * a, b : extrémités ; porte : x de la porte ; trous : passages laissés à la rivière.
 */
export function construireLigne(shape: Shape, L: number, a: number, b: number, porte: number, trous: [number, number][], portes: boolean, graine = 1): THREE.Group {
  const f = new Fab(graine)
  const rnd = (i: number) => { const x = Math.sin((graine * 1000 + i) * 12.9898) * 43758.5453; return x - Math.floor(x) }
  const demi = demiPorte(portes)
  // morceaux pleins : la ligne moins la porte et les passages de la rivière
  let troncons: [number, number][] = [[a, b]]
  for (const [t0, t1] of [[porte - demi, porte + demi] as [number, number], ...trous]) {
    troncons = troncons.flatMap(([x0, x1]): [number, number][] => t1 <= x0 || t0 >= x1 ? [[x0, x1]] : [[x0, t0], [t1, x1]].filter(([u, v]) => v - u > 0.3) as [number, number][])
  }
  switch (shape) {
    case 'palissade': {
      let i = 0
      for (const [x0, x1] of troncons) {
        const n = Math.max(1, Math.round((x1 - x0) / 0.3))
        for (let j = 0; j <= n; j++) {
          const x = x0 + (x1 - x0) * j / n, h = 2.0 + rnd(i++) * 0.3
          f.cyl(0.13, 0.14, h, MURS.bois, x, 0, L, 6)
          f.cone(0.13, 0.35, 0x7c5533, x, h, L, 6, 0)
        }
        f.box(x1 - x0, 0.12, 0.1, 0x6b4a2e, (x0 + x1) / 2, 1.2, L - 0.18)
      }
      if (!portes) {
        for (const sg of [-1, 1]) f.box(0.26, 2.9, 0.26, POUTRE, porte + sg * demi, 0, L)
        f.box(2 * demi + 0.3, 0.22, 0.3, POUTRE, porte, 2.6, L)
      }
      break
    }
    case 'mur': {
      for (const [x0, x1] of troncons) {
        const len = x1 - x0, c = (x0 + x1) / 2
        f.box(len, 0.5, 1.05, SOCLE, c, 0, L)
        f.box(len, 2.4, 0.8, MURS.pierre, c, 0, L)
        for (const y of [0.95, 1.6]) f.box(len, 0.05, 0.84, CHAINE, c, y, L)
        for (let x = x0 + 0.4; x < x1 - 0.3; x += 0.62) {
          f.box(0.38, 0.45, 0.28, MURS.pierre, x, 2.4, L + 0.26)
          f.meurtriere(x, 2.4, L + 0.41)
        }
        f.box(len, 0.3, 0.2, MURS.pierre, c, 2.4, L - 0.3)
      }
      // tours au bout de la muraille, contre la montagne
      for (const x of [a, b]) {
        f.cyl(1.0, 1.15, 3.4, MURS.pierre, x, 0, L, 12)
        f.cyl(1.15, 1.15, 0.4, MURS.pierre, x, 3.4, L, 12)
        for (let i = 0; i < 10; i++) {
          const an = i / 10 * Math.PI * 2
          f.box(0.34, 0.4, 0.24, MURS.pierre, x + Math.cos(an) * 1.03, 3.8, L + Math.sin(an) * 1.03).rotation.y = -an + Math.PI / 2
        }
        f.cone(0.85, 1.8, TOITS.ardoise, x, 3.85, L, 12, 0)
      }
      if (!portes) for (const sg of [-1, 1]) {
        f.box(0.6, 3.0, 1.1, MURS.pierre, porte + sg * demi, 0, L)
        f.creneaux(0.6, 1.1, 3.0, MURS.pierre, porte + sg * demi, L, 0.2, 0.35)
      }
      break
    }
    case 'fosse': {
      const z = L + 1.7, len = b - a + 1.5, c = (a + b) / 2
      f.box(len, 0.04, 1.4, 0x4a3d2c, c, -0.02, z)
      const eau = f.box(len, 0.03, 0.8, matEau, c, 0, z); eau.castShadow = false
      f.box(len, 0.35, 0.3, 0x7b6a4c, c, 0, z - 0.85)
      for (let x = a - 0.6; x < b + 0.6; x += 0.5) {
        if (Math.abs(x - porte) < 1.4 || trous.some(([t0, t1]) => x > t0 && x < t1)) continue
        f.cone(0.07, 0.6, 0x7c5533, x, 0.15, z + 0.75, 4).rotation.x = -0.5
      }
      // pont de bois
      f.box(1.8, 0.1, 2.0, 0x7c5533, porte, 0.04, z)
      for (const sg of [-1, 1]) { f.box(0.08, 0.5, 2.0, 0x6b4a2e, porte + sg * 0.86, 0.14, z) }
      break
    }
    case 'porte': {
      const m = construireModele('porte', {}, graine)
      m.position.set(porte, 0, L); m.rotation.y = Math.PI
      f.add(m)
      break
    }
  }
  fusionner(f.g)
  return f.g
}

export function construireEnceinte(shape: Shape, L: number, gx: number, portes: boolean): THREE.Group {
  const g = new THREE.Group()
  const demi = demiPorte(portes)
  const troncons: [number, number][] = [[-L, gx - demi], [gx + demi, L]]
  for (let k = 0; k < 4; k++) {
    const f = new Fab(k + 1)
    const rnd = (i: number) => { const x = Math.sin((k * 1000 + i) * 12.9898) * 43758.5453; return x - Math.floor(x) }
    switch (shape) {
      case 'palissade': {
        let i = 0
        for (const [a, b] of troncons) {
          const n = Math.round((b - a) / 0.3)
          for (let j = 0; j <= n; j++) {
            const x = a + (b - a) * j / n, h = 2.0 + rnd(i++) * 0.3
            f.cyl(0.13, 0.14, h, MURS.bois, x, 0, L, 6)
            f.cone(0.13, 0.35, 0x7c5533, x, h, L, 6, 0)
          }
          f.box(b - a, 0.12, 0.1, 0x6b4a2e, (a + b) / 2, 1.2, L - 0.18)
        }
        if (!portes) {
          for (const s of [-1, 1]) f.box(0.26, 2.9, 0.26, POUTRE, gx + s * demi, 0, L)
          f.box(2 * demi + 0.3, 0.22, 0.3, POUTRE, gx, 2.6, L)
        }
        break
      }
      case 'mur': {
        for (const [a, b] of troncons) {
          const len = b - a, c = (a + b) / 2
          f.box(len, 0.5, 1.05, SOCLE, c, 0, L)
          f.box(len, 2.4, 0.8, MURS.pierre, c, 0, L)
          for (const y of [0.95, 1.6]) f.box(len, 0.05, 0.84, CHAINE, c, y, L)
          for (let x = a + 0.4; x < b - 0.3; x += 0.62) {
            f.box(0.38, 0.45, 0.28, MURS.pierre, x, 2.4, L + 0.26)
            f.meurtriere(x, 2.4, L + 0.41)
          }
          f.box(len, 0.3, 0.2, MURS.pierre, c, 2.4, L - 0.3)
        }
        // tour d'angle
        f.cyl(1.0, 1.15, 3.4, MURS.pierre, L, 0, L, 12)
        f.cyl(1.15, 1.15, 0.4, MURS.pierre, L, 3.4, L, 12)
        for (let i = 0; i < 10; i++) {
          const a = i / 10 * Math.PI * 2
          f.box(0.34, 0.4, 0.24, MURS.pierre, L + Math.cos(a) * 1.03, 3.8, L + Math.sin(a) * 1.03).rotation.y = -a + Math.PI / 2
        }
        f.cone(0.85, 1.8, TOITS.ardoise, L, 3.85, L, 12, 0)
        if (!portes) for (const s of [-1, 1]) {
          f.box(0.6, 3.0, 1.1, MURS.pierre, gx + s * demi, 0, L)
          f.creneaux(0.6, 1.1, 3.0, MURS.pierre, gx + s * demi, L, 0.2, 0.35)
        }
        break
      }
      case 'fosse': {
        const z = L + 1.7, len = 2 * (L + 2.45)
        f.box(len, 0.04, 1.4, 0x4a3d2c, 0, -0.02, z)
        const eau = f.box(len, 0.03, 0.8, matEau, 0, 0, z); eau.castShadow = false
        f.box(len, 0.35, 0.3, 0x7b6a4c, 0, 0, z - 0.85)
        for (let x = -L - 2; x < L + 2; x += 0.5) {
          if (Math.abs(x - gx) < 1.4) continue
          f.cone(0.07, 0.6, 0x7c5533, x, 0.15, z + 0.75, 4).rotation.x = -0.5
        }
        // pont de bois
        f.box(1.8, 0.1, 2.0, 0x7c5533, gx, 0.04, z)
        for (const s of [-1, 1]) { f.box(0.08, 0.5, 2.0, 0x6b4a2e, gx + s * 0.86, 0.14, z) }
        break
      }
      case 'porte': {
        const m = construireModele('porte', {}, k + 1)
        m.position.set(gx, 0, L); m.rotation.y = Math.PI
        f.add(m)
        break
      }
    }
    fusionner(f.g)
    f.g.rotation.y = k * Math.PI / 2
    g.add(f.g)
  }
  return g
}

/** Rayon de collision approximatif pour la balade, en unités de modèle (× ECHELLE dans la scène). */
export function rayon(shape: Shape): number {
  if (shape === 'route' || shape === 'place' || shape === 'champ' || shape === 'vigne' || shape === 'ruches' || shape === 'arene' || shape === 'fosse') return 0
  if (shape === 'puits') return 0.9
  return 1.6
}
