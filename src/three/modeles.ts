import * as THREE from 'three'
import { BI, type ShapeOpt } from '../data/catalogue'
import {
  Fab, construireModele, fusionner, mat, matBraise, matEau, matFenetre, fonce,
  MURS, TOITS, POUTRE, SOCLE, CHAINE, FER, type MatMur,
} from './batiments'

/* Un modèle propre à chaque bâtiment du catalogue. Les bâtiments sans entrée ici
   retombent sur le modèle générique de leur forme (batiments.ts).
   Mêmes conventions : unités de modèle, emprise ~±2, façade vers +z. */

const BOIS = 0x7c5533, BOIS_F = 0x5c4128, PAILLE = 0xd8bf6a, TOILE = 0xe9dfc7, OR = 0xd4a83a, CUIR = 0x8a5a3a
const NOIR = 0x2a241d

/** Cristaux de la mine précieuse : légèrement lumineux, partagés entre reconstructions. */
const CRISTAUX = [0x9a5ad0, 0x5ad0d0, 0xd05a8a].map(c => {
  const m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.35, roughness: 0.3, flatShading: true })
  m.userData.partage = true
  return m
})

type Rnd = (i: number) => number
type Modele = (f: Fab, o: ShapeOpt, rnd: Rnd) => void

function habiller(f: Fab, m: MatMur, w: number, h: number, d: number, y: number, x0 = 0, z0 = 0) {
  if (m === 'enduit') f.colombage(w, h, d, y, x0, z0)
  else if (m === 'bois') f.planches(w, h, d, y, x0, z0)
  else f.chainage(w, h, d, y, x0, z0)
}

interface Corps {
  w: number; d: number; h1: number; h2?: number; j?: number
  mat?: MatMur; haut?: MatMur; toit: number; hr?: number
  forme?: 'deux' | 'croupe' | 'redents' | 'plat'
  x?: number; z?: number; socle?: number
  porte?: number | null; pw?: number; ph?: number
  fen?: number[]; fen2?: number[]; cote?: boolean
  chem?: [number, number]
  /** 'x' : porte et fenêtres sur le pignon +x (à poser dans un sous-ensemble tourné de −π/2) */
  entree?: 'z' | 'x'
}
interface Info { y0: number; y1: number; yt: number; dd: number; hr: number; zf: number; zf2: number; xf: number }

/** Corps de bâtiment : soubassement, rez-de-chaussée, étage éventuel en encorbellement, toit, ouvertures. */
function corps(f: Fab, c: Corps): Info {
  const x0 = c.x ?? 0, z0 = c.z ?? 0, y0 = c.socle ?? 0.3
  const m = c.mat ?? 'enduit', haut = c.haut ?? 'enduit'
  if (y0 > 0) f.socle(c.w + 0.1, c.d + 0.1, y0, x0, z0)
  f.box(c.w, c.h1, c.d, MURS[m], x0, y0, z0); habiller(f, m, c.w, c.h1, c.d, y0, x0, z0)
  const y1 = y0 + c.h1
  let yt = y1, dd = c.d
  if (c.h2) {
    const j = c.j ?? 0.15
    if (j) f.encorbellement(c.w, c.d, y1, j, x0, z0)
    dd = c.d + 2 * j
    f.box(c.w, c.h2, dd, MURS[haut], x0, y1, z0); habiller(f, haut, c.w, c.h2, dd, y1, x0, z0)
    yt = y1 + c.h2
  }
  const hr = c.hr ?? dd * 0.8
  const mp = c.h2 ? haut : m
  const forme = c.forme ?? 'deux'
  if (forme === 'croupe') f.croupe(c.w + 0.4, dd + 0.5, hr, c.toit, x0, yt, z0)
  else if (forme === 'plat') {
    f.box(c.w + 0.12, 0.16, dd + 0.12, SOCLE, x0, yt, z0)
    f.creneaux(c.w + 0.12, dd + 0.12, yt + 0.16, MURS[mp], x0, z0)
  } else {
    f.toit(c.w + 0.4, dd + 0.5, hr, c.toit, x0, yt, z0, MURS[mp], forme === 'redents' ? c.w - 0.3 : c.w)
    if (forme === 'redents') {
      const n = 4
      for (const s of [-1, 1]) for (let i = 0; i < n; i++)
        f.box(0.24, hr / n + 0.16, (dd + 0.5) * (1 - i / n), MURS[mp], x0 + s * (c.w / 2 - 0.1), yt + i * hr / n, z0)
    } else if (mp === 'enduit') {
      for (const s of [-1, 1]) f.piece(0.035, hr - 0.15, 0.09, POUTRE, x0 + s * (c.w / 2 + 0.02), yt + (hr - 0.15) / 2, z0)
    }
  }
  const ent = c.entree ?? 'z'
  const ouvrir = (u: number, y: number, w: number, h: number, mm: MatMur, prof: number) => {
    const [x, z, face] = ent === 'z' ? [x0 + u, z0 + prof / 2 + 0.01, 'z' as const] : [x0 + c.w / 2 + 0.01, z0 + u, 'x' as const]
    if (mm === 'enduit') f.croisee(x, y, z, w * 0.85, h, face); else f.baie(x, y, z, w, h, face)
  }
  if (c.porte !== null) {
    const u = c.porte ?? 0, pw = c.pw ?? 0.55, ph = c.ph ?? 1.25
    if (ent === 'z') f.porte(x0 + u, z0 + c.d / 2 + 0.01, pw, ph, 'z', y0)
    else f.porte(x0 + c.w / 2 + 0.01, z0 + u, pw, ph, 'x', y0)
  }
  for (const u of c.fen ?? []) ouvrir(u, y0 + 0.6, 0.42, 0.5, m, c.d)
  for (const u of c.fen2 ?? []) ouvrir(u, y1 + 0.4, 0.4, 0.52, haut, dd)
  if (c.cote) {
    if (ent === 'z') f.croisee(x0 + c.w / 2 + 0.01, y0 + 0.6, z0, 0.32, 0.45, 'x')
    else f.croisee(x0, y0 + 0.6, z0 + c.d / 2 + 0.01, 0.32, 0.45)
  }
  if (c.chem) {
    const [cx, cz] = c.chem
    const sous = hr * (1 - Math.abs(cz) / (dd / 2 + 0.25))
    f.cheminee(x0 + cx, yt + 0.05, z0 + cz, Math.max(0.7, sous + 0.55))
  }
  return { y0, y1, yt, dd, hr, zf: z0 + c.d / 2, zf2: z0 + dd / 2, xf: x0 + c.w / 2 }
}

/* ───────── Accessoires ───────── */

/** potence et enseigne perpendiculaires à une façade située en z = zMur ; motif dessiné sur les deux faces */
function panneau(f: Fab, x: number, y: number, zMur: number, couleur = BOIS, motif?: (cx: number, cy: number, cz: number) => void) {
  f.piece(0.05, 0.05, 0.6, FER, x, y, zMur + 0.3)
  f.piece(0.04, 0.44, 0.4, couleur, x, y - 0.27, zMur + 0.36)
  motif?.(x, y - 0.27, zMur + 0.36)
}
function animal(f: Fab, x: number, z: number, rot: number, k: 'cheval' | 'vache' | 'mouton' | 'cochon' | 'chevre', couleur?: number) {
  const P = {
    cheval: [1.0, 0.36, 0.3, 0.55, 0x6b4423], vache: [0.95, 0.42, 0.42, 0.42, 0xe8e2d6], mouton: [0.55, 0.32, 0.34, 0.24, 0xeeeadf],
    cochon: [0.62, 0.3, 0.32, 0.18, 0xe0a49a], chevre: [0.55, 0.28, 0.24, 0.3, 0x8a7055],
  }[k]
  const [L, H, W, jb, c0] = P
  const c = couleur ?? c0
  const pattes = k === 'mouton' ? 0x3a3330 : fonce(c, 0.8)
  f.sous(x, 0, z, rot, a => {
    a.box(L, H, W, c, 0, jb, 0)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) a.box(0.08, jb, 0.08, pattes, sx * (L / 2 - 0.09), 0, sz * (W / 2 - 0.07))
    if (k === 'cheval') {
      a.piece(0.2, 0.55, 0.16, c, L / 2 + 0.02, jb + H + 0.1, 0).rotation.z = -0.55
      a.piece(0.42, 0.17, 0.15, c, L / 2 + 0.28, jb + H + 0.32, 0).rotation.z = -0.35
      a.piece(0.06, 0.45, 0.06, NOIR, L / 2 - 0.05, jb + H + 0.18, 0).rotation.z = -0.55
      a.piece(0.06, 0.45, 0.06, NOIR, -L / 2 - 0.05, jb + H - 0.2, 0).rotation.z = 0.35
    } else {
      a.box(0.26, 0.24, 0.22, k === 'mouton' ? 0x3a3330 : c, L / 2 + 0.1, jb + H * 0.45, 0)
      if (k === 'vache') {
        a.box(0.3, 0.2, 0.02, NOIR, -0.1, jb + 0.12, W / 2 + 0.005); a.box(0.25, 0.16, 0.02, NOIR, 0.2, jb + 0.18, -W / 2 - 0.005)
        for (const s of [-1, 1]) a.piece(0.04, 0.12, 0.04, TOILE, L / 2 + 0.15, jb + H * 0.45 + 0.28, s * 0.09)
      }
      if (k === 'chevre') for (const s of [-1, 1]) a.piece(0.04, 0.16, 0.04, 0x4a4038, L / 2 + 0.06, jb + H * 0.45 + 0.3, s * 0.07).rotation.z = 0.5
    }
  })
}
function charrette(f: Fab, x: number, z: number, rot: number, charge?: number, bache = false) {
  f.sous(x, 0, z, rot, a => {
    a.box(1.0, 0.08, 0.6, BOIS, 0, 0.36, 0)
    for (const s of [-1, 1]) { a.box(1.0, 0.18, 0.05, BOIS_F, 0, 0.44, s * 0.28); a.box(0.05, 0.18, 0.6, BOIS_F, s * 0.48, 0.44, 0) }
    for (const s of [-1, 1]) { const r = a.cyl(0.28, 0.28, 0.06, BOIS_F, 0, 0, s * 0.36, 10); r.rotation.x = Math.PI / 2; r.position.y = 0.28 }
    for (const s of [-1, 1]) a.box(0.9, 0.05, 0.05, BOIS, 0.9, 0.3, s * 0.2)
    if (charge != null) a.box(0.8, 0.25, 0.45, charge, 0, 0.44, 0)
    if (bache) { const b = a.cyl(0.32, 0.32, 1.0, TOILE, 0, 0, 0, 8); b.rotation.z = Math.PI / 2; b.position.y = 0.5; b.scale.set(1, 1, 0.95) }
  })
}
function tablee(f: Fab, x: number, z: number, rot = 0) {
  f.sous(x, 0, z, rot, a => {
    a.box(1.0, 0.06, 0.45, BOIS, 0, 0.45, 0)
    for (const s of [-1, 1]) { a.box(0.06, 0.45, 0.35, BOIS_F, s * 0.4, 0, 0); a.box(1.0, 0.05, 0.18, BOIS, 0, 0.26, s * 0.38); a.box(0.05, 0.26, 0.15, BOIS_F, s * 0.4, 0, s * 0.38) }
    for (const u of [-0.25, 0.2]) a.cyl(0.04, 0.035, 0.1, 0x9a7a52, u, 0.51, 0.08, 6)
  })
}
function sac(f: Fab, x: number, z: number, y = 0, c = 0xc9b48a) { f.boule(0.17, c, x, y + 0.14, z).scale.set(1, 1.2, 0.85) }
function botte(f: Fab, x: number, z: number, y = 0, rot = 0) { f.box(0.5, 0.3, 0.34, PAILLE, x, y, z).rotation.y = rot }
function cloture(f: Fab, x0: number, z0: number, x1: number, z1: number, porte = false) {
  const pts: [number, number, number, number][] = [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]]
  pts.forEach(([a, b, c, d], k) => {
    const L = Math.hypot(c - a, d - b), n = Math.max(1, Math.round(L / 0.6))
    for (let i = 0; i < n; i++) f.box(0.07, 0.6, 0.07, BOIS, a + (c - a) * i / n, 0, b + (d - b) * i / n)
    for (const y of [0.22, 0.48]) {
      if (porte && k === 2) {
        const mx = (a + c) / 2
        for (const [p, q] of [[a, mx + 0.45], [mx - 0.45, c]]) { const l = Math.abs(q - p); f.box(l, 0.05, 0.05, BOIS, (p + q) / 2, y, d) }
      } else {
        const r = f.box(L, 0.05, 0.05, BOIS, (a + c) / 2, y, (b + d) / 2); r.rotation.y = -Math.atan2(d - b, c - a)
      }
    }
  })
}
function auvent(f: Fab, x: number, y: number, zMur: number, w: number, prof: number, c1: number, c2 = TOILE) {
  const n = Math.max(3, Math.round(w / 0.3)), a = 0.45
  for (let i = 0; i < n; i++) {
    const b = f.piece(w / n, 0.04, prof / Math.cos(a), i % 2 ? c2 : c1, x - w / 2 + (i + 0.5) * w / n, y - Math.sin(a) * prof / 2, zMur + prof / 2)
    b.rotation.x = a
  }
  for (const s of [-1, 1]) f.box(0.05, y - Math.sin(a) * prof, 0.05, BOIS_F, x + s * (w / 2 - 0.03), 0, zMur + prof)
}
function drapeauMat(f: Fab, x: number, z: number, h: number, c: number) {
  f.cyl(0.04, 0.05, h, BOIS_F, x, 0, z, 6)
  f.box(0.03, 0.45, 0.75, c, x, h - 0.55, z + 0.39)
  f.boule(0.06, OR, x, h + 0.04, z)
}
/** roue à aubes animée (axe selon z local) */
function roue(f: Fab, x: number, y: number, z: number, r: number, larg = 0.35) {
  const g = new THREE.Group()
  const m = (geo: THREE.BufferGeometry, c: number) => { const o = new THREE.Mesh(geo, mat(c)); g.add(o); return o }
  for (const s of [-1, 1]) m(new THREE.TorusGeometry(r, 0.04, 4, 16), BOIS_F).position.z = s * larg / 2
  for (let i = 0; i < 4; i++) m(new THREE.BoxGeometry(0.06, 2 * r, 0.06), BOIS).rotation.z = i * Math.PI / 4
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2
    const p = m(new THREE.BoxGeometry(0.22, 0.04, larg), BOIS)
    p.position.set(Math.cos(a) * r, Math.sin(a) * r, 0); p.rotation.z = a
  }
  const moyeu = m(new THREE.CylinderGeometry(0.1, 0.1, larg + 0.2, 8), 0x3a2a1a); moyeu.rotation.x = Math.PI / 2
  g.position.set(x, y, z)
  f.anime(g)
}
/** ailes de moulin animées (axe selon z local) */
function ailes(f: Fab, x: number, y: number, z: number, L = 2.2) {
  const g = new THREE.Group()
  for (let i = 0; i < 4; i++) {
    const bras = new THREE.Group(); bras.rotation.z = i * Math.PI / 2
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, L, 0.06), mat(BOIS_F)); b.position.y = L / 2
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.46, L * 0.75, 0.03), mat(0xefe6d2, { double: true })); v.position.set(0.27, L * 0.58, 0)
    bras.add(b, v); g.add(bras)
  }
  const moyeu = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.3, 8), mat(0x3a2a1a)); moyeu.rotation.x = Math.PI / 2
  g.add(moyeu)
  g.position.set(x, y, z)
  f.anime(g)
}
/** grue à roue de carrier */
function grue(f: Fab, x: number, z: number, rot = 0) {
  f.sous(x, 0, z, rot, a => {
    for (const s of [-1, 1]) { a.box(0.12, 1.7, 0.12, BOIS, 0, 0, s * 0.35); a.piece(0.1, 1.0, 0.1, BOIS, s * 0.35, 0.45, s * 0.35).rotation.x = s * 0.4 }
    for (const s of [-1, 1]) a.tore(0.7, 0.04, BOIS_F, 0, 0.95, s * 0.22)
    for (let i = 0; i < 8; i++) { const p = a.piece(0.06, 0.06, 0.48, BOIS, Math.cos(i / 8 * 6.283) * 0.7, 0.95 + Math.sin(i / 8 * 6.283) * 0.7, 0) ; p.castShadow = true }
    const fl = a.piece(0.12, 2.6, 0.12, BOIS, 0.55, 2.2, 0); fl.rotation.z = -0.5
    a.box(0.01, 1.4, 0.01, 0x3a2a1a, 1.18, 1.25, 0)
    a.box(0.3, 0.25, 0.3, MURS.pierre, 1.18, 1.0, 0)
  })
}
function barque(f: Fab, x: number, z: number, rot: number, L = 1.6, y = 0) {
  f.sous(x, y, z, rot, a => {
    a.box(L, 0.08, 0.42, BOIS_F, 0, 0, 0)
    for (const s of [-1, 1]) a.piece(L, 0.28, 0.06, BOIS, 0, 0.16, s * 0.27).rotation.x = s * 0.35
    const p = a.cone(0.33, 0.6, BOIS, L / 2 + 0.25, 0.04, 0, 4); p.rotation.z = -Math.PI / 2; p.position.set(L / 2 + 0.25, 0.18, 0); p.scale.set(1, 1, 0.9)
    for (const u of [-0.3, 0.3]) a.box(0.08, 0.04, 0.5, BOIS, u, 0.22, 0)
  })
}
function mannequin(f: Fab, x: number, z: number) {
  f.box(0.08, 1.2, 0.08, BOIS, x, 0, z)
  f.box(0.6, 0.06, 0.06, BOIS, x, 0.95, z)
  f.box(0.3, 0.45, 0.22, PAILLE, x, 0.6, z)
  f.boule(0.13, PAILLE, x, 1.2, z)
}
function rateliers(f: Fab, x: number, z: number, n = 4) {
  f.box(0.06, 1.1, 0.06, BOIS, x - 0.4, 0, z); f.box(0.06, 1.1, 0.06, BOIS, x + 0.4, 0, z)
  f.box(0.86, 0.05, 0.08, BOIS, x, 0.85, z)
  for (let i = 0; i < n; i++) { const u = x - 0.3 + i * 0.6 / (n - 1); f.box(0.03, 1.3, 0.03, BOIS_F, u, 0, z + 0.05); f.cone(0.04, 0.14, 0xb9bcc0, u, 1.3, z + 0.05, 4) }
}
function bouclier(f: Fab, x: number, y: number, z: number, c: number) {
  const b = f.cyl(0.2, 0.2, 0.04, c, x, y, z, 10); b.rotation.x = Math.PI / 2; b.position.y = y
  const o = f.cyl(0.06, 0.06, 0.05, 0xb9bcc0, x, y, z + 0.02, 6); o.rotation.x = Math.PI / 2; o.position.y = y
}
function tente(f: Fab, x: number, z: number, r: number, h: number, c: number, c2 = TOILE) {
  f.cone(r, h, c, x, 0, z, 6, 0)
  f.cone(r * 0.35, h * 0.35, c2, x, h * 0.65, z, 6, 0)
  f.box(0.02, 0.6, 0.02, BOIS_F, x, h - 0.05, z)
  f.box(0.02, 0.2, 0.3, c, x, h + 0.35, z + 0.15)
}
function bancPierre(f: Fab, x: number, z: number, rot = 0) { f.box(0.9, 0.08, 0.3, MURS.pierre, x, 0.32, z).rotation.y = rot; for (const s of [-1, 1]) f.box(0.12, 0.32, 0.26, SOCLE, x + Math.cos(rot) * s * 0.33, 0, z - Math.sin(rot) * s * 0.33) }
function rondins(f: Fab, x: number, z: number, n = 3, L = 1.2) {
  for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) {
    const l = f.cyl(0.12, 0.12, L, 0x7c5533, x, 0, z - (n - 1) * 0.13 + j * 0.26 + i * 0.13, 7); l.rotation.z = Math.PI / 2; l.position.y = 0.12 + i * 0.22
  }
}
function planches(f: Fab, x: number, z: number, n = 6) { for (let i = 0; i < n; i++) f.box(1.4, 0.05, 0.3, i % 2 ? 0xb08a5a : 0xa07a4a, x, 0.05 + i * 0.055, z) ; f.box(0.1, 0.05, 0.3, BOIS_F, x - 0.6, 0, z); f.box(0.1, 0.05, 0.3, BOIS_F, x + 0.6, 0, z) }
function lanterne(f: Fab, x: number, y: number, z: number) {
  f.box(0.04, 0.04, 0.3, FER, x, y, z + 0.15)
  f.box(0.12, 0.18, 0.12, matFenetre, x, y - 0.2, z + 0.28)
  f.cone(0.1, 0.08, FER, x, y - 0.02, z + 0.28, 4)
}
function rocher(f: Fab, x: number, y: number, z: number, r: number, c = 0x8a8477) {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat(c)); m.position.set(x, y, z); m.rotation.set(x * 3, z * 2, 0)
  m.castShadow = true; m.receiveShadow = true; f.add(m); return m
}

/* ───────── Modèles ───────── */

const MODELES: Record<string, Modele> = {
  /* — Base — */
  conseil(f) {
    const i = corps(f, { w: 3.3, d: 2.1, h1: 2.0, h2: 1.6, j: 0, mat: 'pierre', haut: 'pierre', toit: TOITS.bleu, hr: 1.7, forme: 'croupe', z: -0.3, porte: 0, pw: 0.8, ph: 1.6, fen2: [-1.15, -0.4, 0.4, 1.15], chem: [-1.1, -0.5] })
    for (const x of [-1.15, -0.55, 0.55, 1.15]) f.arche(x, i.y0, i.zf + 0.01, 0.42, 0.75, 0.03, NOIR)
    for (const x of [-1.6, -0.85, 0.85, 1.6]) f.box(0.16, 3.6, 0.1, MURS.pierre, x, i.y0, i.zf + 0.04)
    // campanile sur le faîtage
    const yb = i.yt + i.hr - 0.15
    f.box(0.6, 0.75, 0.6, MURS.enduit, 0, yb, -0.3)
    f.arche(0, yb + 0.12, -0.3 + 0.31, 0.3, 0.3, 0.03, NOIR); f.arche(0.31, yb + 0.12, -0.3, 0.3, 0.3, 0.03, NOIR, 'x')
    f.cyl(0.06, 0.13, 0.2, OR, 0, yb + 0.25, -0.3, 8)
    f.pyr(0.9, 0.9, TOITS.bleu, 0, yb + 0.75, -0.3)
    for (let k = 0; k < 3; k++) f.box(2.0 - k * 0.3, 0.1, 0.3, CHAINE, 0, k * 0.1, i.zf + 0.2 + (2 - k) * 0.25)
    drapeauMat(f, -1.95, 1.2, 3.0, TOITS.bleu); drapeauMat(f, 1.95, 1.2, 3.0, 0xc9a34a)
  },
  maison_pierre(f, o, rnd) {
    corps(f, { w: 2.2, d: 1.8, h1: 1.6, h2: 1.4, j: 0, mat: 'pierre', haut: 'pierre', toit: TOITS.ardoise, hr: 1.9, forme: 'redents', fen: [-0.55], porte: 0.45, fen2: [-0.5, 0.5], cote: true })
    f.cheminee(1.0, 4.4, 0, 0.9)
    if (rnd(4) > 0.5) f.tonneau(1.45, 0.7)
    bancPierre(f, -0.5, 1.25)
  },
  entrepot(f) {
    const i = corps(f, { w: 3.3, d: 2.2, h1: 2.3, mat: 'bois', toit: TOITS.ardoise, hr: 1.6, porte: null, z: -0.3 })
    f.box(1.3, 1.7, 0.06, BOIS_F, 0, i.y0, i.zf + 0.02)
    f.piece(0.04, 1.7, 0.08, POUTRE, 0, i.y0 + 0.85, i.zf + 0.06)
    for (const s of [-1, 1]) f.piece(0.04, 2.0, 0.08, POUTRE, s * 0.33, i.y0 + 0.85, i.zf + 0.06).rotation.z = s * 0.6
    // gerbière et poulie
    f.box(0.8, 0.9, 0.5, MURS.bois, 0, i.yt - 0.3, i.zf - 0.2)
    f.gable(0.8, 1.0, 0.45, TOITS.ardoise, 0, i.yt + 0.6, i.zf - 0.15, MURS.bois, Math.PI / 2)
    f.box(0.5, 0.6, 0.04, NOIR, 0, i.yt - 0.2, i.zf + 0.06)
    f.piece(0.12, 0.12, 1.0, POUTRE, 0, i.yt + 0.55, i.zf + 0.3)
    f.box(0.01, 1.0, 0.01, 0x3a2a1a, 0, i.yt - 0.45, i.zf + 0.75); f.caisse(0, i.zf + 0.75, i.yt - 0.85, 0.35)
    for (const [x, z] of [[-1.2, 1.3], [-0.85, 1.55], [1.2, 1.35]]) f.caisse(x, z)
    f.caisse(-1.0, 1.4, 0.36, 0.3)
    for (const [x, z] of [[1.6, 0.9], [1.5, 1.6], [1.7, 1.3]]) sac(f, x, z)
  },
  cimetiere(f) {
    f.sol(3.6, 3.6, 0x6f8a4f)
    const m = 1.75
    for (const [a, b, c, d] of [[-m, -m, m, -m], [m, -m, m, m], [-m, -m, -m, m]]) { const L = Math.hypot(c - a, d - b); f.box(c === a ? 0.25 : L, 0.5, c === a ? L : 0.25, MURS.pierre, (a + c) / 2, 0, (b + d) / 2) }
    for (const s of [-1, 1]) { f.box(1.25, 0.5, 0.25, MURS.pierre, s * 1.12, 0, m); f.box(0.3, 1.1, 0.3, MURS.pierre, s * 0.5, 0, m); f.boule(0.12, CHAINE, s * 0.5, 1.2, m) }
    for (const [x, z] of [[-1.1, -1.0], [-0.4, -1.1], [0.9, -1.0], [-1.2, 0.0], [1.1, 0.1], [-0.9, 0.9], [1.0, 1.0]]) f.arche(x, 0, z, 0.32, 0.3, 0.08, 0x9b968a)
    for (const [x, z] of [[0.3, -1.0], [-0.3, 0.6], [0.6, 0.9]]) { f.box(0.07, 0.7, 0.07, 0x9b968a, x, 0, z); f.piece(0.32, 0.07, 0.07, 0x9b968a, x, 0.5, z) }
    // calvaire
    f.box(0.6, 0.2, 0.6, SOCLE); f.box(0.4, 0.2, 0.4, SOCLE, 0, 0.2); f.box(0.12, 1.8, 0.12, MURS.pierre, 0, 0.4); f.piece(0.6, 0.12, 0.12, MURS.pierre, 0, 1.85, 0)
    f.cone(0.5, 2.0, 0x24452f, 1.25, 0.3, -0.35, 7, 0); f.cyl(0.08, 0.1, 0.4, 0x4a3222, 1.25, 0, -0.35, 5)
  },
  ecole(f) {
    const i = corps(f, { w: 2.9, d: 1.9, h1: 1.8, mat: 'enduit', toit: TOITS.bleu, hr: 1.5, porte: 0.29, fen: [-0.87, -0.29, 0.87], cote: true })
    // clocheton-mur sur le pignon
    const x = 1.25, y = i.yt + i.hr - 0.35
    f.box(0.22, 0.9, 0.7, MURS.pierre, x, y, 0)
    f.arche(x + 0.12, y + 0.2, 0, 0.36, 0.25, 0.02, NOIR, 'x')
    f.cyl(0.06, 0.13, 0.18, OR, x + 0.12, y + 0.25, 0, 8)
    f.gable(0.3, 0.8, 0.25, TOITS.bleu, x, y + 0.9, 0)
    for (const z of [1.35, 1.75]) f.box(1.4, 0.06, 0.25, BOIS, -0.5, 0.3, z)
    f.box(0.8, 0.55, 0.06, 0x2f3b33, 1.3, 0.5, 1.4); f.box(0.06, 1.05, 0.06, BOIS_F, 1.3, 0, 1.36)
    f.arbre(-1.6, 1.4, 0.8)
  },
  ecuries(f) {
    const i = corps(f, { w: 3.4, d: 1.7, h1: 1.5, mat: 'bois', toit: TOITS.chaume, hr: 1.3, porte: null, z: -0.6 })
    for (const x of [-1.2, -0.4, 0.4, 1.2]) { f.box(0.55, 0.65, 0.05, BOIS_F, x, i.y0, i.zf + 0.02); f.box(0.55, 0.5, 0.04, NOIR, x, i.y0 + 0.7, i.zf + 0.01) }
    animal(f, -0.8, 1.25, -Math.PI / 2, 'cheval'); animal(f, 0.9, 1.3, -Math.PI / 2 + 0.3, 'cheval', 0x3d2a1b)
    f.box(0.9, 0.3, 0.3, BOIS_F, 0.0, 0, 0.6); f.box(0.8, 0.04, 0.22, matEau, 0.0, 0.27, 0.6)
    botte(f, 1.7, 0.6); botte(f, 1.7, 1.1); botte(f, 1.7, 0.85, 0.3, 0.2)
  },
  /* — Santé — */
  medecin(f) {
    const i = corps(f, { w: 2.3, d: 1.8, h1: 1.7, h2: 1.4, j: 0.15, mat: 'pierre', toit: TOITS.vert, hr: 1.6, porte: 0.35, fen: [-0.6], fen2: [-0.29, 0.29], chem: [-0.7, -0.4] })
    // porche
    for (const s of [-1, 1]) f.box(0.1, 1.5, 0.1, BOIS, 0.35 + s * 0.45, 0, i.zf + 0.75)
    const p = f.piece(1.1, 0.05, 0.9, TOITS.vert, 0.35, i.y0 + 1.5, i.zf + 0.4); p.rotation.x = 0.3
    panneau(f, -1.0, i.y0 + 1.5, i.zf, 0x2f6a4a, (x, y, z) => { f.piece(0.1, 0.26, 0.07, 0xffffff, x, y, z); f.piece(0.1, 0.07, 0.26, 0xffffff, x, y, z) })
    bancPierre(f, -0.55, i.zf + 0.55)
    for (const [x, c] of [[1.4, 0x9a6b40], [1.6, 0x6f8f4d], [1.5, 0xa8603a]] as const) f.vase(x, i.zf + 0.3 + (x - 1.4), 1.3, c)
  },
  barbier(f) {
    const i = corps(f, { w: 1.6, d: 1.6, h1: 1.6, h2: 1.4, j: 0.12, mat: 'enduit', toit: TOITS.bleu, hr: 2.0, porte: 0.3, ph: 1.2, fen2: [0], x: -0.4 })
    // perche rayée
    for (let k = 0; k < 8; k++) f.cyl(0.07, 0.07, 0.2, k % 2 ? 0xffffff : 0xb3352b, 0.55, 0.3 + k * 0.2, i.zf + 0.1, 8)
    f.boule(0.1, OR, 0.55, 1.98, i.zf + 0.1)
    // bassins de barbier suspendus (l'enseigne traditionnelle)
    f.piece(0.05, 0.05, 0.6, FER, -0.95, i.y0 + 1.5, i.zf + 0.3)
    for (const z of [0.2, 0.45]) { const b = f.cyl(0.15, 0.08, 0.06, OR, -0.95, i.y0 + 1.2, i.zf + z, 10); b.rotation.x = Math.PI / 2; b.position.y = i.y0 + 1.2 }
    // fauteuil et bassin dehors
    f.box(0.45, 0.06, 0.45, BOIS, 1.0, 0.4, 0.9); f.box(0.45, 0.5, 0.06, BOIS, 1.0, 0.4, 0.69)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.box(0.05, 0.4, 0.05, BOIS_F, 1.0 + sx * 0.19, 0, 0.9 + sz * 0.19)
    f.cyl(0.06, 0.06, 0.7, BOIS_F, 1.6, 0, 0.5, 6); f.cyl(0.22, 0.12, 0.1, 0xb07a3a, 1.6, 0.7, 0.5, 10)
    f.sous(1.3, 0, -0.7, 0, a => corps(a, { w: 1.0, d: 1.2, h1: 1.2, mat: 'bois', toit: TOITS.chaume, hr: 0.7, porte: null, socle: 0.15 }))
  },
  /* — Commerces — */
  auberge(f, _o, rnd) {
    const i = corps(f, { w: 3.0, d: 1.9, h1: 1.8, h2: 1.6, j: 0.18, mat: 'pierre', toit: TOITS.rouge, hr: 1.9, x: -0.4, z: -0.6, porte: -0.4, pw: 0.7, ph: 1.45, fen: [-1.35, 0.55], fen2: [-1.25, -0.4, 0.45], chem: [-1.1, -0.5] })
    f.sous(1.45, 0, 0.55, -Math.PI / 2, a => corps(a, { w: 2.1, d: 1.3, h1: 1.6, h2: 1.2, j: 0.12, mat: 'bois', haut: 'enduit', toit: TOITS.rouge, hr: 1.4, porte: 0.2, fen: [-0.6], fen2: [-0.5, 0.5] }))
    panneau(f, -1.4, i.y0 + 1.7, i.zf, 0x6b2e1e, (x, y, z) => f.boule(0.1, OR, x, y, z))
    lanterne(f, 0.3, i.y0 + 1.4, i.zf)
    charrette(f, -0.9, 1.45, 0.3, 0x9a7a52)
    f.tonneau(-1.95, 0.6); f.tonneau(-1.95, 1.05); f.tonneau(-1.95, 0.83, 0.5, rnd(1) > 0.5)
    f.box(0.7, 0.3, 0.25, BOIS_F, 0.55, 0, 1.6); f.box(0.6, 0.03, 0.17, matEau, 0.55, 0.27, 1.6)
  },
  comptoir(f) {
    const i = corps(f, { w: 2.7, d: 1.9, h1: 1.9, h2: 1.3, j: 0.15, mat: 'pierre', toit: TOITS.vert, hr: 1.6, porte: -0.95, fen2: [-0.65, 0.65], chem: [0.9, -0.4] })
    for (const x of [-0.1, 0.8]) {
      f.arche(x, i.y0 + 0.3, i.zf + 0.01, 0.7, 0.7, 0.03, NOIR)
      f.box(0.78, 0.07, 0.4, BOIS, x, i.y0 + 0.5, i.zf + 0.2)
      for (const [u, c] of [[-0.2, 0xc04a3a], [0, 0xd3a03a], [0.2, 0x5a7a9a]] as const) f.box(0.14, 0.1, 0.14, c, x + u, i.y0 + 0.57, i.zf + 0.2)
    }
    auvent(f, 0.35, i.y0 + 1.7, i.zf, 2.0, 0.7, TOITS.vert)
    for (const [x, z] of [[-1.5, 1.3], [1.6, 1.3], [1.5, 1.7]]) f.caisse(x, z)
    sac(f, -1.6, 1.8); sac(f, -1.3, 1.75)
    // balance
    f.box(0.06, 0.8, 0.06, FER, -1.4, 0, 0.9 + 0.3); f.piece(0.6, 0.03, 0.03, FER, -1.4, 0.8, 1.2)
    for (const s of [-1, 1]) f.cyl(0.1, 0.08, 0.03, OR, -1.4 + s * 0.28, 0.55, 1.2, 8)
  },
  banque(f) {
    const i = corps(f, { w: 2.8, d: 2.1, h1: 2.0, h2: 1.6, j: 0, mat: 'pierre', haut: 'pierre', toit: TOITS.ardoise, hr: 1.8, forme: 'croupe', porte: 0, pw: 0.7, ph: 1.5, fen: [-0.9, 0.9], fen2: [-0.9, 0, 0.9] })
    for (const x of [-1.35, -0.45, 0.45, 1.35]) { f.box(0.18, 3.6, 0.1, CHAINE, x, i.y0, i.zf + 0.05); f.box(0.26, 0.15, 0.16, CHAINE, x, i.y0 + 3.5, i.zf + 0.06) }
    for (const x of [-0.9, 0.9]) for (let k = 0; k < 4; k++) f.box(0.025, 0.5, 0.025, FER, x - 0.15 + k * 0.1, i.y0 + 0.6, i.zf + 0.08)
    // échauguette d'angle
    f.cone(0.38, 0.6, MURS.pierre, 1.45, i.y1 - 0.3, i.zf + 0.05, 8, 0).rotation.x = Math.PI
    f.cyl(0.38, 0.38, 1.3, MURS.pierre, 1.45, i.y1, i.zf + 0.05, 8)
    f.cone(0.45, 1.1, TOITS.ardoise, 1.45, i.y1 + 1.3, i.zf + 0.05, 8, 0)
    f.meurtriere(1.45, i.y1 + 0.5, i.zf + 0.44)
    const d = f.cyl(0.26, 0.26, 0.05, OR, 0, i.y0 + 1.75, i.zf + 0.05, 14); d.rotation.x = Math.PI / 2; d.position.y = i.y0 + 1.75
    for (let k = 0; k < 3; k++) f.box(1.4 - k * 0.3, 0.1, 0.25, CHAINE, 0, k * 0.1, i.zf + 0.15 + (2 - k) * 0.2)
  },
  guilde(f) {
    // haute maison à pignon sur rue, bannières des métiers
    f.sous(0, 0, -0.1, -Math.PI / 2, a => {
      const i = corps(a, { w: 2.6, d: 2.4, h1: 1.8, h2: 1.6, j: 0.18, mat: 'pierre', haut: 'enduit', toit: TOITS.vert, hr: 2.4, entree: 'x', porte: 0, pw: 0.7, ph: 1.45, fen: [-0.75, 0.75], fen2: [-0.85, -0.3, 0.3, 0.85], chem: [-0.9, 0.6] })
      a.croisee(i.xf + 0.01, i.yt + 0.5, 0, 0.4, 0.6, 'x')
      a.croisee(i.xf + 0.01, i.yt + 1.3, 0, 0.26, 0.4, 'x')
      for (const [u, c] of [[-1.05, 0xb3352b], [1.05, 0x3f5f80]] as const) {
        a.box(0.04, 1.1, 0.34, c, i.xf + 0.06, i.y1 + 0.25, u)
        a.boule(0.08, OR, i.xf + 0.08, i.y1 + 0.85, u)
      }
    })
    panneau(f, 1.0, 1.9, 1.2, 0x2e5a3c, (x, y, z) => { f.piece(0.1, 0.24, 0.05, OR, x, y, z).rotation.x = 0.7; f.piece(0.1, 0.24, 0.05, 0xb9bcc0, x, y, z).rotation.x = -0.7 })
    f.caisse(-1.5, 1.3); f.tonneau(-1.5, 1.75)
  },
  cordonnier(f) {
    const i = corps(f, { w: 2.1, d: 1.7, h1: 1.7, h2: 1.3, j: 0.15, mat: 'enduit', toit: TOITS.rouge, hr: 1.5, porte: 0.55, fen2: [-0.29, 0.29], chem: [-0.6, -0.4] })
    f.box(0.8, 0.65, 0.04, NOIR, -0.4, i.y0 + 0.45, i.zf + 0.02)
    f.box(0.86, 0.06, 0.4, BOIS, -0.4, i.y0 + 0.4, i.zf + 0.2)
    for (let k = 0; k < 3; k++) for (const s of [-1, 1]) { f.box(0.08, 0.1, 0.16, CUIR, -0.65 + k * 0.25 + s * 0.05, i.y0 + 0.46, i.zf + 0.22); f.box(0.08, 0.12, 0.06, CUIR, -0.65 + k * 0.25 + s * 0.05, i.y0 + 0.5, i.zf + 0.16) }
    panneau(f, -1.0, i.y0 + 1.6, i.zf, 0xe0d2b0, (x, y, z) => { f.piece(0.1, 0.24, 0.1, NOIR, x, y + 0.04, z - 0.05); f.piece(0.1, 0.08, 0.2, NOIR, x, y - 0.1, z) })
    f.box(0.3, 0.4, 0.3, BOIS_F, 1.4, 0, 1.2); f.box(0.06, 0.25, 0.06, FER, 1.4, 0.4, 1.2)
  },
  menuisier(f) {
    const i = corps(f, { w: 2.2, d: 1.9, h1: 1.8, mat: 'bois', toit: TOITS.chaume, hr: 1.7, x: -0.6, porte: 0.29, fen: [-0.45], chem: [-0.6, -0.4] })
    // hangar ouvert
    for (const [x, z] of [[1.7, -0.85], [1.7, 0.85]]) f.box(0.12, 1.4, 0.12, POUTRE, x, 0, z)
    const pan = f.piece(1.35, 0.06, 2.1, TOITS.chaume, 1.1, 1.7, 0); pan.rotation.z = -0.4
    f.box(1.0, 0.08, 0.45, BOIS, 1.05, 0.7, 0); for (const s of [-1, 1]) f.box(0.08, 0.7, 0.4, BOIS_F, 1.05 + s * 0.42, 0, 0)
    for (const s of [-1, 1]) { f.box(0.06, 0.5, 0.5, BOIS_F, -0.4 + s * 0.45, 0, 1.35); }
    f.box(1.3, 0.05, 0.25, 0xb08a5a, -0.4, 0.5, 1.35)
    planches(f, 1.2, 1.5)
    // une chaise finie
    f.box(0.35, 0.05, 0.35, BOIS, -1.5, 0.4, 1.3); f.box(0.35, 0.45, 0.05, BOIS, -1.5, 0.4, 1.13)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.box(0.04, 0.4, 0.04, BOIS_F, -1.5 + sx * 0.14, 0, 1.3 + sz * 0.14)
    void i
  },
  teinturier(f) {
    const i = corps(f, { w: 2.2, d: 1.7, h1: 1.8, h2: 1.2, j: 0.12, mat: 'enduit', toit: TOITS.bleu, hr: 1.5, x: -0.6, z: -0.8, porte: 0.29, fen: [-0.29], fen2: [-0.29, 0.29], chem: [0.6, -0.3] })
    for (const [x, c] of [[-1.3, 0xa8322b], [-0.5, 0x2f4f8f], [0.3, 0xd4a02a]] as const) {
      f.cyl(0.33, 0.3, 0.55, BOIS_F, x, 0, 0.75, 10); f.cyl(0.36, 0.36, 0.04, FER, x, 0.4, 0.75, 10)
      f.cyl(0.29, 0.29, 0.02, c, x, 0.53, 0.75, 10)
    }
    // séchoir à étoffes
    for (const x of [0.8, 1.95]) f.box(0.1, 1.9, 0.1, BOIS, x, 0, 1.45)
    f.box(1.3, 0.07, 0.07, BOIS, 1.37, 1.85, 1.45)
    for (const [k, c] of [[0, 0xa8322b], [1, 0x2f4f8f], [2, 0xd4a02a], [3, 0x5f8a3a]] as const) f.box(0.25, 1.0, 0.03, c, 0.98 + k * 0.28, 0.85, 1.45)
    f.box(1.3, 0.07, 0.07, BOIS, 1.37, 1.85, 0.5); for (const x of [0.8, 1.95]) f.box(0.1, 1.9, 0.1, BOIS, x, 0, 0.5)
    for (const [k, c] of [[0, 0x7a3a8a], [1, 0xd06a2a], [2, 0x2f6f6f]] as const) f.box(0.3, 0.9, 0.03, c, 1.05 + k * 0.33, 0.95, 0.5)
    void i
  },
  ceinturier(f) {
    const i = corps(f, { w: 1.9, d: 1.7, h1: 1.6, h2: 1.3, j: 0.15, mat: 'bois', haut: 'bois', toit: TOITS.chaume, hr: 1.7, x: -0.4, porte: 0.3, fen: [-0.4], fen2: [-0.35, 0.35] })
    for (const x of [0.9, 1.8]) f.box(0.08, 1.5, 0.08, BOIS, x, 0, 0.9)
    f.box(1.0, 0.06, 0.06, BOIS, 1.35, 1.45, 0.9)
    for (let k = 0; k < 6; k++) { f.box(0.07, 0.8 + (k % 3) * 0.12, 0.02, k % 2 ? CUIR : 0x5a3a24, 0.98 + k * 0.15, 1.45 - 0.8 - (k % 3) * 0.12, 0.92); f.box(0.1, 0.06, 0.03, OR, 0.98 + k * 0.15, 0.6 - (k % 3) * 0.12, 0.93) }
    panneau(f, -1.2, i.y0 + 1.5, i.zf, 0x5a3a24, (x, y, z) => { const t = f.tore(0.1, 0.025, OR, x, y, z); t.rotation.y = Math.PI / 2 })
    f.box(0.6, 0.4, 0.4, BOIS_F, 1.3, 0, -0.5); f.box(0.5, 0.05, 0.35, CUIR, 1.3, 0.4, -0.5)
  },
  boulangerie(f) {
    const i = corps(f, { w: 2.2, d: 1.8, h1: 1.7, h2: 1.3, j: 0.12, mat: 'enduit', toit: TOITS.rouge, hr: 1.5, x: -0.55, porte: 0.29, fen: [-0.29], fen2: [-0.29, 0.29] })
    // four à pain en dôme
    f.box(1.4, 0.45, 1.5, SOCLE, 1.25, 0, -0.25)
    f.dome(0.68, 0xb7a58a, 1.25, 0.45, -0.25)
    f.arche(1.25, 0.5, 0.45, 0.3, 0.12, 0.05, matBraise)
    f.cheminee(1.25, 0.9, -0.65, 0.9)
    rondins(f, 1.3, 1.0, 2, 0.8)
    // étal de pains
    f.box(0.9, 0.06, 0.4, BOIS, -0.55, i.y0 + 0.45, i.zf + 0.3); f.box(0.06, 0.75, 0.06, BOIS_F, -0.95, 0, i.zf + 0.45); f.box(0.06, 0.75, 0.06, BOIS_F, -0.15, 0, i.zf + 0.45)
    for (let k = 0; k < 4; k++) f.boule(0.1, 0xc08a4a, -0.85 + k * 0.2, i.y0 + 0.55, i.zf + 0.3).scale.set(1.4, 0.7, 1)
    panneau(f, -1.5, i.y0 + 1.5, i.zf, 0x7a4a2a, (x, y, z) => { const t = f.tore(0.09, 0.03, 0xc08a4a, x, y, z); t.rotation.y = Math.PI / 2 })
  },
  parfumerie(f) {
    const i = corps(f, { w: 2.1, d: 1.7, h1: 1.7, h2: 1.4, j: 0.12, mat: 'enduit', haut: 'enduit', toit: TOITS.bleu, hr: 1.5, x: 0.3, porte: 0.6, fen: [0], fen2: [-0.29, 0.29] })
    // tourelle d'angle
    f.cyl(0.5, 0.5, 3.7, MURS.enduit, -0.95, 0, 0.55, 10)
    f.cone(0.62, 1.7, TOITS.bleu, -0.95, 3.7, 0.55, 10, 0); f.boule(0.08, OR, -0.95, 5.45, 0.55)
    for (const y of [1.0, 2.4]) f.fenetre(-0.95, y, 1.05, 0.2, 0.45)
    // jardinières fleuries
    for (const u of [-0.29, 0.29]) {
      f.box(0.45, 0.12, 0.16, BOIS, 0.3 + u, i.y1 + 0.27, i.zf2 + 0.08)
      for (let k = 0; k < 3; k++) f.boule(0.07, [0xd7769a, 0xb06ad0, 0xe8c25a][k], 0.3 + u - 0.14 + k * 0.14, i.y1 + 0.43, i.zf2 + 0.08)
    }
    for (const x of [1.3, 1.55]) for (const c of [0x8a6ad0]) f.vase(x, 1.3, 1.1, c)
  },
  herboristerie(f) {
    const i = corps(f, { w: 2.2, d: 1.6, h1: 1.8, mat: 'bois', toit: TOITS.vert, hr: 1.8, z: -0.9, porte: 0.5, fen: [-0.5], chem: [-0.7, -0.3] })
    // bouquets d'herbes qui sèchent sous l'avant-toit
    for (let k = 0; k < 6; k++) { f.box(0.01, 0.15, 0.01, 0x3a2a1a, -1.0 + k * 0.4, i.yt - 0.2, i.zf + 0.3); f.cone(0.07, 0.22, k % 2 ? 0x6b8a3a : 0x8a9a4a, -1.0 + k * 0.4, i.yt - 0.42, i.zf + 0.3, 5, 0).rotation.x = Math.PI }
    // jardin de simples
    cloture(f, -1.9, 0.15, 1.9, 1.95, true)
    for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) {
      const x = -1.5 + k * 0.6, z = 0.5 + r * 0.45
      if (Math.abs(x) < 0.4 && r === 2) continue
      f.boule(0.13, [0x4d7d45, 0x6b9a4a, 0x5a8a6a][(k + r) % 3], x, 0.1, z).scale.y = 0.8
      if ((k + r) % 3 === 0) f.boule(0.05, [0xb06ad0, 0xe8c25a][r % 2], x, 0.22, z)
    }
  },
  alchimiste(f) {
    // tour ronde de travers, fumées colorées
    f.cyl(1.0, 1.1, 0.4, SOCLE, -0.3, 0, -0.3, 10)
    f.cyl(0.92, 1.0, 3.6, MURS.enduit, -0.3, 0.4, -0.3, 10)
    for (const y of [1.4, 2.6]) f.cyl(0.98 - y * 0.02, 0.98 - y * 0.02, 0.08, POUTRE, -0.3, y, -0.3, 10)
    const t = f.cone(1.2, 2.2, TOITS.vert, -0.3, 4.0, -0.3, 10, 0); t.rotation.z = 0.12
    f.boule(0.1, OR, -0.15, 6.2, -0.3)
    f.porte(-0.3, 0.68, 0.55, 1.2, 'z', 0.4)
    for (const [y, a] of [[1.8, 0.5], [3.0, -0.4]]) f.fenetre(-0.3 + Math.sin(a) * 0.98, y, -0.3 + Math.cos(a) * 0.98, 0.3, 0.5)
    f.cheminee(0.0, 3.6, -0.9, 1.8)
    // chaudron
    f.cyl(0.35, 0.25, 0.4, NOIR, 1.2, 0.12, 0.9, 10); f.cyl(0.3, 0.3, 0.02, 0x5ad06a, 1.2, 0.5, 0.9, 10)
    for (const a of [0, 2.1, 4.2]) f.box(0.05, 0.15, 0.05, NOIR, 1.2 + Math.cos(a) * 0.25, 0, 0.9 + Math.sin(a) * 0.25)
    f.box(0.5, 0.1, 0.4, matBraise, 1.2, 0, 0.9)
    f.smoke.push(new THREE.Vector3(1.2, 0.6, 0.9))
    for (const [x, c] of [[1.4, 0x5ad06a], [1.6, 0x8a5ad0], [1.5, 0xd05a8a]] as const) f.vase(x, -0.6 - (x - 1.4), 0.9, c)
  },
  /* — Industries & artisanat — */
  forge(f) {
    const i = corps(f, { w: 2.2, d: 2.0, h1: 1.9, mat: 'pierre', toit: TOITS.ardoise, hr: 1.6, x: -0.65, porte: 0.29, fen: [-0.45] })
    for (const z of [-0.85, 0.85]) f.box(0.14, 1.6, 0.14, POUTRE, 1.75, 0, z)
    const pan = f.piece(1.4, 0.06, 2.2, TOITS.ardoise, 1.1, 1.85, 0); pan.rotation.z = -0.35
    // foyer et hotte
    f.box(0.8, 0.7, 0.8, SOCLE, 0.85, 0, -0.5); f.box(0.6, 0.06, 0.6, matBraise, 0.85, 0.7, -0.5)
    f.box(0.7, 0.5, 0.7, SOCLE, 0.85, 1.6, -0.5); f.cheminee(0.85, 2.1, -0.5, 1.8)
    f.box(0.5, 0.2, 0.3, CUIR, 0.25, 0.6, -0.5)
    f.box(0.3, 0.45, 0.3, BOIS_F, 1.1, 0, 0.5); f.box(0.45, 0.14, 0.2, FER, 1.1, 0.45, 0.5); f.cone(0.08, 0.2, FER, 1.4, 0.48, 0.5, 4).rotation.z = -Math.PI / 2
    f.tonneau(1.6, 0.3)
    f.smoke.push(new THREE.Vector3(0.85, 0.8, -0.5))
    void i
  },
  charbonniere(f) {
    f.sol(3.6, 3.6, 0x4a4036)
    f.dome(1.15, 0x3a342e, -0.2, 0, -0.2, 9)
    for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283; f.box(0.25, 0.08, 0.25, 0x5a4a3a, -0.2 + Math.cos(a) * 1.0, 0.2, -0.2 + Math.sin(a) * 1.0).rotation.y = a }
    for (const [x, z] of [[-0.2, -0.2], [0.4, 0.3], [-0.7, 0.2]]) f.smoke.push(new THREE.Vector3(x, 1.0, z))
    f.box(0.15, 0.06, 0.15, matBraise, -0.2, 1.12, -0.2)
    rondins(f, 1.3, -1.0, 3, 1.1); rondins(f, -1.3, 1.3, 2, 0.9)
    tente(f, 1.3, 1.2, 0.7, 1.3, 0x7a6448, 0x5a4a3a)
    f.box(0.04, 1.3, 0.04, BOIS, 0.6, 0, 1.4).rotation.z = 0.2
  },
  moulin_eau(f) {
    const i = corps(f, { w: 2.2, d: 1.9, h1: 1.9, h2: 1.2, j: 0, mat: 'pierre', haut: 'enduit', toit: TOITS.rouge, hr: 1.6, x: -0.65, porte: 0.29, fen: [-0.5], fen2: [-0.29, 0.29], chem: [-0.6, -0.4] })
    // bief
    f.box(0.95, 0.06, 3.6, 0x4a3d2c, 1.4, 0, 0); f.box(0.85, 0.04, 3.6, matEau, 1.4, 0.04, 0)
    for (const s of [-1, 1]) f.box(0.12, 0.3, 3.6, SOCLE, 1.4 + s * 0.48, 0, 0)
    f.sous(1.4, 0, 0, Math.PI / 2, a => roue(a, 0, 0.95, 0, 0.9, 0.5))
    f.box(0.2, 0.2, 0.4, BOIS_F, 0.65, 0.85, 0)
    sac(f, -1.2, 1.4); sac(f, -0.9, 1.5); sac(f, -1.05, 1.45, 0.25)
    void i
  },
  moulin_vent(f) {
    // moulin sur pivot : cabine de bois sur un chevalet
    f.box(2.0, 0.14, 0.14, BOIS); f.box(0.14, 0.14, 2.0, BOIS)
    for (const s of [-1, 1]) {
      f.piece(0.1, 1.2, 0.1, BOIS, s * 0.4, 0.55, 0).rotation.z = s * 0.6
      f.piece(0.1, 1.2, 0.1, BOIS, 0, 0.55, s * 0.4).rotation.x = -s * 0.6
    }
    f.cyl(0.18, 0.2, 1.5, BOIS_F, 0, 0, 0, 8)
    f.box(1.3, 1.6, 1.1, MURS.bois, 0, 1.4, 0); f.planches(1.3, 1.6, 1.1, 1.4)
    f.toit(1.6, 1.4, 0.8, TOITS.chaume, 0, 3.0, 0, MURS.bois, 1.3)
    f.fenetre(0.66, 2.3, 0, 0.3, 0.35, 'x')
    ailes(f, 0, 2.5, 0.65, 2.0)
    f.piece(0.1, 0.1, 1.9, BOIS, 0, 1.0, -1.1).rotation.x = 0.6
    for (let k = 0; k < 5; k++) f.piece(0.5, 0.04, 0.08, BOIS, 0, 0.3 + k * 0.25, -0.75 - k * 0.15)
    sac(f, 1.0, 1.0); sac(f, 1.3, 0.8)
  },
  tannerie(f) {
    const i = corps(f, { w: 2.4, d: 1.6, h1: 1.8, mat: 'bois', toit: TOITS.chaume, hr: 1.6, x: -0.3, z: -0.95, porte: 0.6, fen: [-0.6] })
    // fosses de tannage
    for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) {
      const x = -1.45 + k * 0.62, z = 0.45 + r * 0.62, c = [0x6a4a2a, 0x8a7a3a, 0x5a5048][(k + r) % 3]
      f.box(0.56, 0.14, 0.56, SOCLE, x, 0, z); f.box(0.42, 0.02, 0.42, c, x, 0.14, z)
    }
    // peaux tendues
    for (const [x, z] of [[1.3, 0.3], [1.5, 1.2]]) {
      for (const s of [-1, 1]) f.box(0.07, 1.2, 0.07, BOIS, x + s * 0.4, 0, z)
      f.box(0.85, 0.05, 0.05, BOIS, x, 1.15, z); f.box(0.85, 0.05, 0.05, BOIS, x, 0.2, z)
      f.box(0.65, 0.8, 0.02, 0xc8a070, x, 0.3, z)
    }
    void i
  },
  tissage(f) {
    const i = corps(f, { w: 3.3, d: 1.9, h1: 1.8, h2: 1.5, j: 0.15, mat: 'bois', haut: 'enduit', toit: TOITS.chaume, hr: 1.8, z: -0.4, porte: -0.3, fen: [-1.2, 0.5, 1.2], fen2: [-1.35, -0.8, -0.27, 0.27, 0.8, 1.35] })
    // métier à tisser sous auvent
    f.box(0.9, 0.06, 0.6, BOIS, 0.8, 0.7, 1.3)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.box(0.06, 1.2, 0.06, BOIS_F, 0.8 + sx * 0.42, 0, 1.3 + sz * 0.27)
    f.box(0.84, 0.5, 0.02, 0xc04a3a, 0.8, 0.75, 1.3)
    for (const [x, z] of [[-1.4, 1.3], [-1.05, 1.5], [-1.25, 1.6]]) f.box(0.45, 0.35, 0.4, 0xf0ece0, x, z === 1.6 ? 0.35 : 0, z)
    for (let k = 0; k < 4; k++) f.tore(0.08, 0.04, [0xc04a3a, 0x3f5f80, 0xd4a02a, 0x5f8a3a][k], -0.3 + k * 0.2, i.y0 + 1.2, i.zf + 0.06)
  },
  boucher(f) {
    const i = corps(f, { w: 2.3, d: 1.7, h1: 1.7, h2: 1.3, j: 0.15, mat: 'enduit', toit: TOITS.rouge, hr: 1.5, z: -0.4, porte: 0.6, fen2: [-0.29, 0.29], chem: [-0.7, -0.4] })
    f.box(1.0, 0.6, 0.04, NOIR, -0.35, i.y0 + 0.5, i.zf + 0.02)
    f.box(1.1, 0.07, 0.45, 0xd8d2c4, -0.35, i.y0 + 0.45, i.zf + 0.22)
    auvent(f, -0.2, i.y0 + 1.55, i.zf, 1.8, 0.75, 0xb3352b)
    f.box(1.5, 0.04, 0.04, FER, -0.2, i.y0 + 1.25, i.zf + 0.5)
    for (let k = 0; k < 5; k++) f.cone(0.1, 0.32, k % 2 ? 0x9a4a3a : 0xb0604a, -0.8 + k * 0.3, i.y0 + 0.9, i.zf + 0.5, 6, 0).rotation.x = Math.PI
    f.cyl(0.25, 0.28, 0.6, BOIS_F, 1.2, 0, 1.3, 8); f.box(0.2, 0.12, 0.03, 0xb9bcc0, 1.2, 0.62, 1.3)
    cloture(f, 0.9, -1.4, 1.9, -0.3); animal(f, 1.4, -0.85, 0.4, 'cochon')
  },
  maconnerie(f) {
    corps(f, { w: 1.9, d: 1.6, h1: 1.6, mat: 'pierre', toit: TOITS.rouge, hr: 1.3, x: -0.95, z: -0.9, porte: 0.3, fen: [-0.4] })
    grue(f, 1.0, -0.6, -0.3)
    for (const [x, z, y] of [[-1.3, 0.8, 0], [-0.75, 0.8, 0], [-1.05, 0.8, 0.4], [-1.3, 1.35, 0], [0.2, 1.4, 0]]) f.box(0.5, 0.4, 0.4, 0xc4bfb4, x, y, z)
    f.box(0.8, 0.25, 0.45, BOIS_F, 0.9, 0, 1.4); f.box(0.7, 0.03, 0.35, 0xd8d4c8, 0.9, 0.24, 1.4)
    // échafaudage
    for (const x of [-1.9, -0.1]) f.box(0.07, 2.2, 0.07, BOIS, x, 0, -0.0)
    for (const y of [0.9, 1.8]) f.box(1.85, 0.06, 0.35, BOIS, -1.0, y, -0.1)
  },
  armurerie(f) {
    const i = corps(f, { w: 2.4, d: 1.9, h1: 1.9, h2: 1.2, j: 0, mat: 'pierre', haut: 'pierre', toit: TOITS.ardoise, hr: 1.3, forme: 'plat', x: -0.4, z: -0.5, porte: 0.3, fen: [-0.6], fen2: [-0.6, 0.6], chem: [0.6, -0.3] })
    for (const [x, c] of [[-0.9, 0xb3352b], [0.1, 0x3f5f80], [0.9, 0xd4a02a]] as const) bouclier(f, x, i.y1 + 0.2, i.zf + 0.04, c)
    // armures sur mannequins
    for (const x of [1.3, 1.75]) {
      f.box(0.06, 1.0, 0.06, BOIS, x, 0, 1.0); f.box(0.36, 0.5, 0.24, 0xa0a4a8, x, 0.85, 1.0)
      f.dome(0.13, 0xa0a4a8, x, 1.38, 1.0); f.box(0.5, 0.07, 0.07, 0xa0a4a8, x, 1.25, 1.0)
    }
    rateliers(f, -1.1, 1.2, 5)
    panneau(f, 0.85, i.y0 + 1.6, i.zf, NOIR, (x, y, z) => { f.piece(0.1, 0.34, 0.03, 0xb9bcc0, x, y, z).rotation.x = 0.7; f.piece(0.1, 0.34, 0.03, 0xb9bcc0, x, y, z).rotation.x = -0.7 })
  },
  marechal(f) {
    // forge ouverte et travail à ferrer
    for (const [x, z] of [[-1.6, -1.2], [0.2, -1.2], [-1.6, 0.4], [0.2, 0.4]]) f.box(0.14, 1.8, 0.14, POUTRE, x, 0, z)
    f.toit(2.3, 2.2, 1.0, TOITS.ardoise, -0.7, 1.8, -0.4, POUTRE)
    f.box(0.8, 0.7, 0.7, SOCLE, -1.2, 0, -0.8); f.box(0.6, 0.06, 0.5, matBraise, -1.2, 0.7, -0.8); f.cheminee(-1.2, 0.76, -0.95, 2.6)
    f.box(0.3, 0.45, 0.3, BOIS_F, -0.4, 0, -0.3); f.box(0.45, 0.14, 0.2, FER, -0.4, 0.45, -0.3)
    for (const [x, z] of [[0.75, -0.2], [1.95, -0.2], [0.75, 0.6], [1.95, 0.6]]) f.box(0.12, 1.4, 0.12, BOIS, x, 0, z)
    for (const z of [-0.2, 0.6]) f.box(1.3, 0.1, 0.1, BOIS, 1.35, 1.3, z)
    for (const z of [-0.2, 0.6]) f.box(1.3, 0.08, 0.08, BOIS, 1.35, 0.7, z)
    animal(f, 1.35, 0.2, 0, 'cheval', 0xa8a098)
    panneau(f, -1.6, 1.6, 0.47, 0x6b4a2e, (x, y, z) => { const t = f.tore(0.1, 0.03, FER, x, y, z, Math.PI * 1.4); t.rotation.set(0, Math.PI / 2, 2.4) })
    f.smoke.push(new THREE.Vector3(-1.2, 0.8, -0.8))
    for (let k = 0; k < 3; k++) { const t = f.tore(0.08, 0.025, FER, -1.6 + k * 0.05, 1.0 + k * 0.12, 0.48, Math.PI * 1.4); t.rotation.z = 2.4 }
  },
  tonnelier(f) {
    corps(f, { w: 2.0, d: 1.7, h1: 1.7, mat: 'bois', toit: TOITS.chaume, hr: 1.6, x: -0.85, z: -0.7, porte: 0.29, fen: [-0.4], chem: [-0.5, -0.3] })
    // pyramide de tonneaux
    for (const [z, y] of [[0.35, 0], [0.8, 0], [1.25, 0], [0.58, 0.38], [1.03, 0.38], [0.8, 0.76]]) f.tonneau(1.2, z, y, true)
    for (const [x, z] of [[0.3, 1.4], [0.65, 1.6], [-1.6, 1.0]]) f.tonneau(x, z)
    // tonneau en cours : douelles ouvertes et cercles au sol
    for (let k = 0; k < 10; k++) { const a = k / 10 * 6.283; const d = f.piece(0.06, 0.55, 0.03, 0xb08a5a, -0.7 + Math.cos(a) * 0.2, 0.28, 1.0 + Math.sin(a) * 0.2); d.rotation.set(Math.sin(a) * 0.15, -a, -Math.cos(a) * 0.15) }
    f.tore(0.22, 0.02, FER, -0.7, 0.1, 1.0).rotation.x = Math.PI / 2
    for (const z of [1.55, 1.75]) f.tore(0.2, 0.02, FER, -0.1, 0.02, z).rotation.x = Math.PI / 2
  },
  brasseur(f) {
    const i = corps(f, { w: 2.4, d: 1.9, h1: 1.9, h2: 1.2, j: 0.12, mat: 'enduit', toit: TOITS.chaume, hr: 1.7, x: -0.5, z: -0.6, porte: 0.29, fen: [-0.29], fen2: [-0.85, -0.29, 0.29, 0.85] })
    // lanterneau d'aération sur le faîtage
    f.box(0.6, 0.35, 0.4, MURS.enduit, -0.5, i.yt + i.hr - 0.15, -0.6)
    f.gable(0.8, 0.7, 0.3, TOITS.chaume, -0.5, i.yt + i.hr + 0.2, -0.6)
    f.smoke.push(new THREE.Vector3(-0.5, i.yt + i.hr + 0.3, -0.6))
    for (const z of [-0.6, 0.4]) { f.cyl(0.45, 0.45, 1.2, BOIS_F, 1.35, 0, z, 10); for (const y of [0.25, 0.95]) f.cyl(0.47, 0.47, 0.06, FER, 1.35, y, z, 10) }
    f.box(0.06, 1.3, 0.06, BOIS, 1.35, 0, 1.0); f.box(0.5, 0.06, 0.06, BOIS, 1.35, 1.25, 1.0)
    panneau(f, -1.3, i.y0 + 1.6, i.zf, 0x3a5a2a, (x, y, z) => { const t = f.tore(0.11, 0.04, 0x6b9a3a, x, y, z); t.rotation.y = Math.PI / 2 })
    f.tonneau(-0.1, 1.3); f.tonneau(0.3, 1.45); sac(f, -1.5, 1.2); sac(f, -1.2, 1.35)
  },
  scierie(f) {
    // hangar ouvert, cadre de scie, troncs et planches
    for (const x of [-1.5, -0.25, 1.0]) for (const z of [-0.85, 0.85]) f.box(0.14, 1.9, 0.14, POUTRE, x, 0, z - 0.3)
    f.toit(3.3, 2.3, 1.1, TOITS.chaume, -0.25, 1.9, -0.3, POUTRE)
    f.box(2.4, 0.4, 0.4, BOIS_F, -0.25, 0, -0.3)
    const t = f.cyl(0.18, 0.18, 2.2, 0x7c5533, -0.25, 0, -0.3, 8); t.rotation.z = Math.PI / 2; t.position.y = 0.58
    for (const x of [-0.45, -0.05]) f.box(0.08, 1.7, 0.08, BOIS, x, 0, -0.3)
    f.box(0.5, 0.08, 0.08, BOIS, -0.25, 1.65, -0.3); f.box(0.02, 1.1, 0.06, 0xb9bcc0, -0.25, 0.5, -0.3)
    rondins(f, 1.7, -0.2, 3, 1.3)
    planches(f, -0.6, 1.35); planches(f, 0.95, 1.4, 4)
  },
  scierie_ind(f) {
    corps(f, { w: 2.6, d: 1.9, h1: 2.1, h2: 1.0, j: 0, mat: 'bois', haut: 'bois', toit: TOITS.ardoise, hr: 1.5, x: -0.5, z: -0.8, porte: -0.3, pw: 0.9, ph: 1.5, fen: [0.6], fen2: [-0.6, 0.6] })
    f.box(0.9, 0.06, 3.6, 0x4a3d2c, 1.55, 0, 0); f.box(0.8, 0.04, 3.6, matEau, 1.55, 0.04, 0)
    for (const s of [-1, 1]) f.box(0.1, 0.3, 3.6, SOCLE, 1.55 + s * 0.45, 0, 0)
    f.sous(1.55, 0, -0.8, Math.PI / 2, a => roue(a, 0, 1.0, 0, 0.95, 0.5))
    rondins(f, -0.8, 1.0, 3, 1.4); rondins(f, 0.6, 1.25, 2, 1.0)
    planches(f, -0.8, 1.75, 4)
  },
  tailleur(f) {
    for (const [x, z] of [[-1.7, -1.3], [-0.1, -1.3], [-1.7, -0.1], [-0.1, -0.1]]) f.box(0.12, 1.7, 0.12, POUTRE, x, 0, z)
    f.toit(2.0, 1.6, 0.9, TOITS.rouge, -0.9, 1.7, -0.7, POUTRE)
    f.box(1.4, 0.6, 0.5, BOIS_F, -0.9, 0, -0.9)
    for (const [x, c] of [[-1.3, 0x9a9a9a], [-0.9, BOIS], [-0.5, 0x9a9a9a]] as const) f.box(0.05, 0.05, 0.3, c, x, 0.62, -0.9)
    // colonne en cours et chapiteau
    for (let k = 0; k < 3; k++) f.cyl(0.25, 0.25, 0.45, 0xd0cabd, 0.9, k * 0.45, -0.6, 10)
    f.box(0.7, 0.25, 0.7, 0xd0cabd, 0.9, 1.35, -0.6)
    f.box(0.7, 0.6, 0.6, 0xc4bfb4, 1.4, 0, 0.7); f.boule(0.3, 0xd0cabd, 1.4, 0.85, 0.7, 0)
    for (const [x, z] of [[-1.2, 0.9], [-0.6, 1.1], [0.2, 1.4]]) f.box(0.5, 0.35, 0.4, 0xc4bfb4, x, 0, z)
    charrette(f, -1.0, 1.65, 0.1, 0xc4bfb4)
  },
  verrerie(f) {
    corps(f, { w: 2.0, d: 1.7, h1: 1.7, mat: 'enduit', toit: TOITS.bleu, hr: 1.5, x: -0.95, z: -0.8, porte: 0.29, fen: [-0.29] })
    // four de verrier en ruche
    f.cyl(0.95, 1.0, 0.5, 0x8a4a32, 1.0, 0, -0.3, 10)
    f.dome(0.95, 0x9a5a3a, 1.0, 0.5, -0.3)
    for (const a of [0.4, 1.4, 2.5]) f.arche(1.0 + Math.sin(a) * 0.98, 0.25, -0.3 + Math.cos(a) * 0.98, 0.22, 0.12, 0.05, matBraise)
    f.cheminee(1.0, 1.3, -0.3, 0.9)
    // étagère de verreries
    f.box(1.6, 0.05, 0.35, BOIS, -0.6, 0.55, 1.1); f.box(1.6, 0.05, 0.35, BOIS, -0.6, 1.0, 1.1)
    for (const s of [-1, 1]) f.box(0.05, 1.05, 0.35, BOIS_F, -0.6 + s * 0.78, 0, 1.1)
    for (let k = 0; k < 6; k++) for (const y of [0.6, 1.05]) f.vase(-1.25 + k * 0.26, 1.1, 0.7, [0x5aa07a, 0x5a8ac0, 0x9ad0c0, 0x7a5ac0][(k + (y > 1 ? 1 : 0)) % 4], y)
  },
  poterie(f) {
    corps(f, { w: 2.0, d: 1.7, h1: 1.6, mat: 'enduit', toit: TOITS.rouge, hr: 1.5, x: -0.9, z: -0.8, porte: 0.29, fen: [-0.29] })
    // four bouteille
    f.cyl(0.45, 0.85, 1.6, 0x9a5a3a, 1.1, 0, -0.5, 10); f.cyl(0.3, 0.45, 0.8, 0x9a5a3a, 1.1, 1.6, -0.5, 10)
    f.arche(1.1, 0, 0.3, 0.3, 0.25, 0.05, matBraise)
    f.smoke.push(new THREE.Vector3(1.1, 2.5, -0.5))
    for (let k = 0; k < 5; k++) for (let r = 0; r < 2; r++) f.vase(-1.5 + k * 0.32, 0.9 + r * 0.4, 1.1 + (k % 2) * 0.3, [0xa8603a, 0xc07a4a, 0x8a4a2a][(k + r) % 3])
    f.box(1.8, 0.05, 0.25, BOIS, -0.85, 0.0, 1.1)
    f.cyl(0.25, 0.2, 0.5, BOIS_F, 0.7, 0, 1.3, 8); f.cyl(0.2, 0.2, 0.04, 0xa8603a, 0.7, 0.5, 1.3, 10); f.vase(0.7, 1.3, 0.8, 0xa8603a, 0.54)
  },
  chandelle(f) {
    const i = corps(f, { w: 2.0, d: 1.6, h1: 1.6, h2: 1.2, j: 0.12, mat: 'enduit', toit: TOITS.chaume, hr: 1.7, x: -0.3, z: -0.6, porte: 0.29, fen: [-0.29], fen2: [-0.29, 0.29] })
    // séchoir à chandelles
    for (const x of [0.6, 1.9]) f.box(0.08, 1.4, 0.08, BOIS, x, 0, 1.0)
    for (const y of [1.35, 0.95]) {
      f.box(1.35, 0.05, 0.05, BOIS, 1.25, y, 1.0)
      for (let k = 0; k < 9; k++) f.cyl(0.025, 0.03, 0.32, 0xf2ead4, 0.72 + k * 0.13, y - 0.33, 1.0, 5)
    }
    f.cyl(0.3, 0.3, 0.5, FER, -1.3, 0, 1.0, 10); f.cyl(0.27, 0.27, 0.02, 0xefe6c8, -1.3, 0.5, 1.0, 10)
    // grosse chandelle-enseigne
    f.cyl(0.1, 0.1, 0.5, 0xf2ead4, -1.25, i.y0 + 1.5, i.zf + 0.15, 8); f.boule(0.06, matBraise, -1.25, i.y0 + 2.06, i.zf + 0.15).scale.y = 1.6
    f.box(0.3, 0.04, 0.3, FER, -1.25, i.y0 + 1.46, i.zf + 0.15)
  },
  /* — Agriculture — */
  fromagerie(f) {
    const i = corps(f, { w: 2.3, d: 1.8, h1: 1.6, mat: 'pierre', toit: TOITS.chaume, hr: 1.9, z: -0.7, porte: -0.3, fen: [0.6], chem: [0.7, -0.3] })
    // porte de cave en pente
    f.piece(0.7, 0.06, 0.9, BOIS_F, -1.45, 0.25, 0.35).rotation.x = -0.45
    f.box(0.8, 0.45, 0.06, SOCLE, -1.45, 0, 0.8)
    // claies de fromages
    for (const y of [0.4, 0.8]) {
      f.box(1.4, 0.05, 0.45, BOIS, 0.5, y, 1.2)
      for (let k = 0; k < 5; k++) f.cyl(0.11, 0.11, 0.09, k % 2 ? 0xe8c25a : 0xd8b04a, -0.05 + k * 0.27, y + 0.05, 1.2, 10)
    }
    for (const s of [-1, 1]) f.box(0.05, 0.85, 0.45, BOIS_F, 0.5 + s * 0.7, 0, 1.2)
    for (const x of [1.5, 1.75]) { f.cyl(0.13, 0.15, 0.45, 0xb9bcc0, x, 0, 0.4, 8); f.cyl(0.07, 0.07, 0.08, 0xb9bcc0, x, 0.45, 0.4, 8) }
    animal(f, -0.9, 1.4, 0.4, 'chevre'); animal(f, 1.5, -1.1, -0.5, 'chevre', 0xe8e2d6)
    void i
  },
  elevage(f) {
    const i = corps(f, { w: 2.8, d: 1.6, h1: 1.8, mat: 'bois', toit: TOITS.rouge, hr: 1.7, z: -1.1, porte: null })
    f.box(1.1, 1.5, 0.06, BOIS_F, 0, i.y0, i.zf + 0.02)
    for (const s of [-1, 1]) f.piece(0.04, 1.8, 0.08, POUTRE, s * 0.27, i.y0 + 0.75, i.zf + 0.06).rotation.z = s * 0.63
    cloture(f, -1.95, -0.2, 1.95, 1.95, true)
    animal(f, -1.0, 0.6, 0.3, 'vache'); animal(f, 0.9, 1.2, 2.7, 'vache'); animal(f, 0.3, 0.4, -0.6, 'vache', 0x8a5a3a)
    f.box(1.0, 0.3, 0.3, BOIS_F, -1.0, 0, 1.55); botte(f, 1.4, 0.1)
  },
  elevage_ext(f) {
    f.sol(3.6, 3.6, 0x7d9a52)
    cloture(f, -1.95, -1.95, 1.95, 1.95, true)
    for (const [x, z] of [[-1.6, -1.6], [-0.2, -1.6], [-1.6, -0.6], [-0.2, -0.6]]) f.box(0.1, 1.4, 0.1, BOIS, x, 0, z)
    f.gable(1.8, 1.4, 0.6, TOITS.chaume, -0.9, 1.4, -1.1, BOIS)
    botte(f, -1.2, -1.2); botte(f, -0.6, -1.2); botte(f, -0.9, -1.2, 0.3)
    for (const [x, z, r] of [[0.8, -1.0, 0.2], [1.3, -0.3, 1.2], [0.5, 0.2, 2.6], [1.2, 0.8, -0.4], [-0.6, 0.9, 0.9], [-1.3, 0.4, 2.0]]) animal(f, x, z, r, 'mouton')
    animal(f, 0.2, 1.4, 0.2, 'vache'); animal(f, -1.1, 1.5, 3.0, 'vache', 0x8a5a3a)
  },
  horticulteur(f) {
    f.sol(3.6, 3.6, 0x6f8f4d)
    for (const [x, z] of [[-1.0, -0.4], [1.0, -0.4], [-1.0, 1.0], [1.0, 1.0]]) {
      f.box(1.3, 0.18, 0.9, BOIS_F, x, 0, z); f.box(1.2, 0.04, 0.8, 0x5a4030, x, 0.15, z)
      const cs = [0xd7769a, 0xe8c25a, 0xb06ad0, 0xe86a4a, 0xffffff]
      for (let r = 0; r < 3; r++) for (let k = 0; k < 5; k++) {
        f.box(0.03, 0.12, 0.03, 0x4d7d45, x - 0.48 + k * 0.24, 0.18, z - 0.25 + r * 0.25)
        f.boule(0.07, cs[(k + r + Math.round(x + z)) % 5], x - 0.48 + k * 0.24, 0.33, z - 0.25 + r * 0.25)
      }
    }
    // pergola fleurie
    for (const s of [-1, 1]) f.box(0.08, 1.6, 0.08, BOIS, s * 0.4, 0, 1.75)
    f.box(0.95, 0.08, 0.15, BOIS, 0, 1.6, 1.75)
    for (let k = 0; k < 7; k++) f.boule(0.1, k % 2 ? 0xd7769a : 0x4d7d45, -0.42 + (k % 2) * 0.84, 0.3 + k * 0.2, 1.75)
    for (let k = 0; k < 5; k++) f.boule(0.1, k % 2 ? 0xd7769a : 0x4d7d45, -0.4 + k * 0.2, 1.72, 1.75)
    // cabane de jardin
    f.box(0.9, 1.1, 0.8, MURS.bois, 0, 0, -1.55); f.planches(0.9, 1.1, 0.8, 0, 0, -1.55)
    f.gable(1.1, 1.0, 0.5, TOITS.vert, 0, 1.1, -1.55, MURS.bois)
    // brouette
    f.box(0.5, 0.2, 0.35, BOIS, 1.6, 0.22, -1.4); const r = f.cyl(0.12, 0.12, 0.05, BOIS_F, 1.9, 0, -1.4, 8); r.rotation.x = Math.PI / 2; r.position.y = 0.12
  },
  /* — Défenses — */
  caserne(f) {
    const i = corps(f, { w: 3.3, d: 1.9, h1: 2.3, mat: 'pierre', toit: TOITS.rouge, hr: 1.2, forme: 'plat', z: -0.75, porte: 0, pw: 0.7, ph: 1.45, fen: [-1.15, -0.6, 0.6, 1.15], chem: [0.9, -0.4] })
    for (const x of [-1.15, -0.6, 0.6, 1.15]) f.meurtriere(x, i.y0 + 1.5, i.zf + 0.01)
    // tourelle d'angle
    f.cyl(0.5, 0.55, 3.3, MURS.pierre, 1.6, 0, 0.15, 10)
    f.sous(1.6, 0, 0.15, 0, a => { a.creneauxRond(0.55, 3.3, 7, MURS.pierre) })
    f.cone(0.45, 1.1, TOITS.rouge, 1.6, 3.3, 0.15, 10, 0)
    // cour d'exercice
    mannequin(f, -1.2, 1.1); mannequin(f, -0.3, 1.5)
    rateliers(f, 0.8, 1.4)
    drapeauMat(f, -1.85, 0.3, 3.6, TOITS.rouge)
  },
  /* — Loisirs — */
  taverne(f, o) {
    const m: MatMur = o.mat === 'bois' ? 'bois' : 'enduit'
    const i = corps(f, { w: 2.9, d: 1.8, h1: 1.8, h2: 1.5, j: 0.15, mat: 'pierre', haut: m, toit: TOITS.rouge, hr: 1.8, z: -0.7, porte: 0.29, pw: 0.65, ph: 1.4, fen: [-0.85, 0.87], fen2: [-0.87, -0.29, 0.29, 0.87], chem: [-1.0, -0.4] })
    // balcon de bois
    f.box(2.6, 0.08, 0.45, BOIS, 0, i.y1 + 0.02, i.zf2 + 0.22)
    for (let k = 0; k <= 12; k++) f.box(0.04, 0.45, 0.04, BOIS_F, -1.28 + k * 0.213, i.y1 + 0.1, i.zf2 + 0.42)
    f.box(2.62, 0.05, 0.06, BOIS_F, 0, i.y1 + 0.55, i.zf2 + 0.42)
    for (const s of [-1, 1]) f.piece(0.07, 0.6, 0.07, POUTRE, s * 1.2, i.y1 - 0.2, i.zf2 + 0.18).rotation.x = -0.6
    // grande enseigne : chope
    panneau(f, 1.55, i.y0 + 1.6, i.zf - 0.0, 0x6b2e1e, (x, y, z) => { f.cyl(0.08, 0.07, 0.18, OR, x, y - 0.1, z, 8); f.tore(0.05, 0.015, OR, x, y, z + 0.1).rotation.y = Math.PI / 2 })
    tablee(f, -0.9, 1.25, 0.1); tablee(f, 0.9, 1.4, -0.15)
    lanterne(f, -0.4, i.y0 + 1.4, i.zf)
    f.tonneau(1.85, 0.35); f.tonneau(1.85, 0.8, 0, true)
  },
  theatre(f) {
    f.box(2.6, 0.6, 1.4, BOIS, 0, 0, -0.9)
    for (let k = 0; k < 9; k++) f.box(0.02, 0.6, 0.02, BOIS_F, -1.28 + k * 0.32, 0, -0.19)
    for (const s of [-1, 1]) f.box(0.12, 2.4, 0.12, BOIS_F, s * 1.25, 0.6, -1.55)
    f.box(2.6, 0.12, 0.14, BOIS_F, 0, 2.95, -1.55)
    f.box(2.4, 2.2, 0.04, 0x8a2a2a, 0, 0.75, -1.58)
    for (const s of [-1, 1]) f.box(0.5, 2.3, 0.05, 0xb3352b, s * 0.95, 0.65, -1.45)
    for (let k = 0; k < 8; k++) f.cone(0.12, 0.2, k % 2 ? 0xd4a02a : 0x3f5f80, -1.1 + k * 0.32, 2.75, -1.45, 3, 0).rotation.x = Math.PI
    // bancs en arc
    for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) {
      const a = -0.6 + k * 0.4, R = 1.5 + r * 0.45
      const b = f.box(0.55, 0.3, 0.2, BOIS, Math.sin(a) * R, 0, -0.9 + Math.cos(a) * R); b.rotation.y = a
    }
    charrette(f, 1.65, -0.2, Math.PI / 2, undefined, true)
  },
  bains(f) {
    const i = corps(f, { w: 3.0, d: 1.9, h1: 1.9, mat: 'pierre', toit: TOITS.bleu, hr: 1.4, forme: 'croupe', z: -0.75, porte: 0, pw: 0.7, ph: 1.4, fen: [-1.0, 1.0] })
    for (const x of [-0.8, 0.8]) { f.box(0.3, 0.6, 0.3, SOCLE, x, i.yt + 0.6, -0.75); f.smoke.push(new THREE.Vector3(x, i.yt + 1.3, -0.75)) }
    for (const [x, z] of [[-1.1, 1.0], [0.0, 1.35], [1.1, 1.0]]) {
      f.cyl(0.42, 0.38, 0.45, BOIS_F, x, 0, z, 10); f.cyl(0.44, 0.44, 0.05, FER, x, 0.3, z, 10)
      f.cyl(0.38, 0.38, 0.02, matEau, x, 0.42, z, 10)
    }
    f.box(0.06, 1.1, 0.06, BOIS, 1.75, 0, 0.3); f.box(0.06, 1.1, 0.06, BOIS, 1.75, 0, 1.4); f.box(0.06, 0.06, 1.1, BOIS, 1.75, 1.05, 0.85)
    for (const z of [0.55, 0.85, 1.15]) f.box(0.02, 0.5, 0.25, TOILE, 1.75, 0.55, z)
  },
  bibliotheque(f) {
    f.sous(0, 0, -0.2, -Math.PI / 2, a => {
      const i = corps(a, { w: 2.6, d: 2.3, h1: 2.4, h2: 1.4, j: 0, mat: 'pierre', haut: 'pierre', toit: TOITS.ardoise, hr: 2.3, entree: 'x', porte: 0, pw: 0.7, ph: 1.5 })
      const r = a.cyl(0.36, 0.36, 0.06, matFenetre, i.xf + 0.03, i.yt + 0.7, 0, 12); r.rotation.z = Math.PI / 2; r.position.y = i.yt + 0.7
      for (const s of [-1, 1]) for (const x of [-0.75, 0.0, 0.75]) {
        a.fenetre(x, i.y0 + 0.7, s * (1.15 + 0.01), 0.3, 1.5)
        a.cone(0.15, 0.3, 0x3a3226, x, i.y0 + 2.2, s * 1.16, 3, Math.PI / 2)
      }
      for (const x of [-0.38, 0.38]) for (const s of [-1, 1]) a.box(0.2, 1.8, 0.25, MURS.pierre, x, 0, s * 1.25)
    })
    // tourelle d'escalier
    f.cyl(0.45, 0.45, 4.6, MURS.pierre, -1.35, 0, 1.0, 10)
    f.cone(0.55, 1.6, TOITS.ardoise, -1.35, 4.6, 1.0, 10, 0)
    for (const y of [1.0, 2.0, 3.0, 4.0]) f.meurtriere(-1.35 + Math.sin(0.5) * 0.46, y, 1.0 + Math.cos(0.5) * 0.46)
    panneau(f, 1.0, 1.9, 1.15, 0x3f3a5a, (x, y, z) => { f.piece(0.1, 0.2, 0.14, 0xf0ece0, x, y, z - 0.07).rotation.x = 0.3; f.piece(0.1, 0.2, 0.14, 0xf0ece0, x, y, z + 0.07).rotation.x = -0.3 })
  },
  /* — Spécifique emplacement — */
  chasseurs(f) {
    f.add(construireModele('camp', { cabin: true }, f.seed))
    // bois de cerf au-dessus de la porte, peaux qui sèchent
    for (const s of [-1, 1]) { f.piece(0.04, 0.35, 0.04, 0xe0d2b0, -0.4 + s * 0.12, 1.55, 0.98).rotation.z = s * 0.5; f.piece(0.03, 0.18, 0.03, 0xe0d2b0, -0.4 + s * 0.22, 1.72, 0.98).rotation.z = -s * 0.2 }
    f.box(0.18, 0.15, 0.08, 0x8a6a48, -0.4, 1.38, 0.98)
    for (const x of [0.9, 1.9]) f.box(0.07, 1.3, 0.07, BOIS, x, 0, 0.25)
    f.box(1.1, 0.05, 0.05, BOIS, 1.4, 1.25, 0.25)
    for (let k = 0; k < 3; k++) f.box(0.25, 0.5, 0.02, [0x8a6a48, 0x6b4a2e, 0xa08060][k], 1.05 + k * 0.32, 0.7, 0.25)
    f.box(0.04, 1.4, 0.04, BOIS_F, -1.5, 0, 1.2).rotation.z = 0.15
  },
  trappeurs(f) {
    // cabane en rondins au toit de mottes
    const W = 2.0, D = 1.5, x0 = -0.4, z0 = -0.6
    for (let k = 0; k < 7; k++) {
      const y = 0.11 + k * 0.2
      for (const s of [-1, 1]) {
        const a = f.cyl(0.11, 0.11, W + 0.3, 0x7c5533, x0, 0, z0 + s * D / 2, 7); a.rotation.z = Math.PI / 2; a.position.y = y
        const b = f.cyl(0.11, 0.11, D + 0.3, 0x6b4a2e, x0 + s * W / 2, 0, z0, 7); b.rotation.x = Math.PI / 2; b.position.y = y + 0.1
      }
    }
    f.box(W, 1.4, D, BOIS_F, x0, 0, z0)
    f.gable(W + 0.6, D + 0.6, 0.8, 0x5f7d48, x0, 1.45, z0, 0x6b4a2e)
    f.box(0.5, 0.95, 0.06, NOIR, x0 + 0.3, 0, z0 + D / 2 + 0.12)
    f.cheminee(x0 - 0.7, 1.4, z0 - 0.2, 1.0)
    // canoë et cadres à fourrures
    f.sous(1.1, 0.0, 1.3, 0.4, a => { const c = a.cyl(0.18, 0.18, 2.0, 0xb0703a, 0, 0, 0, 8); c.rotation.z = Math.PI / 2; c.position.y = 0.15; c.scale.set(1, 1, 0.5) })
    for (const [x, z] of [[1.3, -0.3], [1.7, 0.3]]) { const t = f.tore(0.35, 0.03, BOIS, x, 0.45, z); t.rotation.y = 1.2; const p = f.cyl(0.3, 0.3, 0.02, 0x8a6a48, x, 0.45, z, 10); p.rotation.set(Math.PI / 2, 0, -1.2 + Math.PI / 2); p.position.y = 0.45 }
    for (const [x, z] of [[-1.4, 1.2], [0.0, 1.5]]) { f.box(0.3, 0.05, 0.2, FER, x, 0, z); f.tore(0.12, 0.015, FER, x, 0.05, z).rotation.x = Math.PI / 2 }
    f.sapin(-1.6, 0.6, 0.9)
  },
  mine_precieuse(f) {
    f.add(construireModele('mine', {}, f.seed))
    const cris = CRISTAUX
    for (let k = 0; k < 6; k++) { const o = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), cris[k % 3]); o.position.set(0.15 + (k % 3) * 0.2, 0.78, 2.15 + Math.floor(k / 3) * 0.25); o.scale.y = 1.6; f.add(o) }
    for (const [x, z, s] of [[-0.6, 0.9, 1.4], [-0.9, 1.1, 1.0], [1.3, 0.7, 1.2], [1.5, 1.0, 0.8]]) { const o = new THREE.Mesh(new THREE.OctahedronGeometry(0.15 * s), cris[Math.round(x * 3 + 9) % 3]); o.position.set(x, 0.15 * s, z); o.scale.y = 1.8; f.add(o) }
    // portail ouvragé
    f.box(1.5, 0.3, 0.3, MURS.pierre, 0.35, 1.3, 1.3)
    for (const s of [-1, 1]) { f.box(0.3, 1.3, 0.3, MURS.pierre, 0.35 + s * 0.6, 0, 1.3); lanterne(f, 0.35 + s * 0.6, 1.2, 1.45) }
  },
  orfevrerie(f) {
    const i = corps(f, { w: 1.9, d: 1.7, h1: 1.8, h2: 1.5, j: 0, mat: 'pierre', haut: 'pierre', toit: TOITS.bleu, hr: 2.2, porte: 0.45, fen2: [-0.4, 0.4] })
    f.box(0.6, 0.6, 0.04, NOIR, -0.4, i.y0 + 0.5, i.zf + 0.02)
    for (let k = 0; k < 5; k++) f.box(0.025, 0.6, 0.025, FER, -0.65 + k * 0.125, i.y0 + 0.5, i.zf + 0.06)
    for (let k = 0; k < 3; k++) f.boule(0.06, OR, -0.55 + k * 0.15, i.y0 + 0.62, i.zf + 0.0)
    f.box(0.1, 0.4, 0.1, OR, 0, i.yt + i.hr, 0); f.boule(0.1, OR, 0, i.yt + i.hr + 0.45, 0)
    panneau(f, -0.95, i.y0 + 1.7, i.zf, NOIR, (x, y, z) => { const t = f.tore(0.1, 0.03, OR, x, y, z); t.rotation.y = Math.PI / 2; f.boule(0.05, 0x5ad0d0, x, y + 0.12, z) })
    f.box(0.6, 0.4, 0.4, BOIS_F, 1.3, 0, 1.1); for (const s of [-1, 1]) f.box(0.62, 0.05, 0.05, FER, 1.3, 0.12 + (s + 1) * 0.12, 1.31)
    f.box(0.5, 0.5, 0.5, SOCLE, -1.4, 0, -0.3); f.box(0.3, 0.05, 0.3, matBraise, -1.4, 0.5, -0.3)
  },
  bastion_roc(f) {
    rocher(f, 0, 0.5, 0, 1.6, 0x6e6a60).scale.set(1.15, 0.7, 1.15)
    rocher(f, 1.1, 0.3, 0.9, 0.8, 0x7a756a)
    rocher(f, -1.2, 0.25, 0.7, 0.7, 0x7a756a)
    const t = construireModele('tour', { mat: 'sombre', roof: 'ardoise', big: true }, f.seed)
    t.position.y = 0.95; t.scale.setScalar(0.85)
    f.add(t)
    for (let k = 0; k < 6; k++) f.box(0.6, 0.12, 0.35, MURS.sombre, 0.25 + k * 0.12, k * 0.16, 1.3 - k * 0.05)
  },
  carriere_ind(f) {
    f.add(construireModele('carriere', {}, f.seed))
    grue(f, 1.4, 0.6, Math.PI / 2)
    charrette(f, -1.2, 1.6, 0.2, 0xc4bfb4)
    for (const [x, z] of [[-1.5, 0.7], [-1.5, 1.1]]) f.box(0.5, 0.4, 0.35, 0xd0cabd, x, 0, z)
  },
  forge_maitre(f) {
    const i = corps(f, { w: 2.6, d: 2.0, h1: 2.2, mat: 'sombre', toit: TOITS.rouge, hr: 1.8, x: -0.55, z: -0.6, porte: 0.6, pw: 0.8, ph: 1.6, fen: [-0.6] })
    for (const x of [-1.3, 0.2]) f.cheminee(x, i.yt + 0.05, -1.0, 2.3)
    // martinet hydraulique
    f.box(0.5, 0.06, 3.6, matEau, 1.6, 0.02, 0)
    for (const s of [-1, 1]) f.box(0.08, 0.25, 3.6, SOCLE, 1.6 + s * 0.3, 0, 0)
    f.sous(1.6, 0, -0.9, Math.PI / 2, a => roue(a, 0, 0.8, 0, 0.7, 0.35))
    for (const z of [0.3, 0.9]) f.box(0.15, 1.3, 0.15, POUTRE, 1.05, 0, z)
    f.box(0.15, 0.15, 0.8, POUTRE, 1.05, 1.2, 0.6)
    const m = f.piece(1.3, 0.12, 0.12, BOIS, 0.75, 1.0, 0.6); m.rotation.z = -0.2
    f.box(0.3, 0.3, 0.3, FER, 0.2, 0.55, 0.6); f.box(0.4, 0.55, 0.4, FER, 0.2, 0, 0.6)
    f.box(0.8, 0.12, 0.6, matBraise, -1.2, i.y0, i.zf + 0.35); f.box(0.9, 0.3, 0.7, SOCLE, -1.2, 0, i.zf + 0.35)
    rateliers(f, -0.5, 1.6, 4)
  },
  silos(f) {
    for (const [x, z, h] of [[-0.9, -0.6, 2.8], [0.6, -0.8, 3.2], [-0.1, 0.8, 2.5]]) {
      f.cyl(0.62, 0.66, 0.3, SOCLE, x, 0, z, 10)
      f.cyl(0.58, 0.58, h, MURS.bois, x, 0.3, z, 10)
      for (let y = 0.8; y < h; y += 0.7) f.cyl(0.6, 0.6, 0.06, POUTRE, x, y, z, 10)
      f.cone(0.8, 1.0, TOITS.chaume, x, h + 0.3, z, 10, 0)
      f.box(0.3, 0.4, 0.04, NOIR, x, h - 0.4, z + 0.58)
    }
    for (let k = 0; k < 9; k++) f.piece(0.4, 0.04, 0.06, BOIS, 0.6, 0.3 + k * 0.32, -0.15)
    for (const s of [-1, 1]) f.box(0.05, 3.0, 0.05, BOIS, 0.6 + s * 0.2, 0, -0.15)
    for (const [x, z] of [[1.3, 0.6], [1.5, 0.9], [1.2, 1.1]]) sac(f, x, z)
    charrette(f, 1.4, 1.6, 0.2, PAILLE)
  },
  relais(f) {
    const i = corps(f, { w: 2.5, d: 1.8, h1: 1.8, h2: 1.3, j: 0.15, mat: 'enduit', toit: TOITS.ardoise, hr: 1.6, x: -0.55, z: -0.75, porte: 0.29, fen: [-0.29, 0.87], fen2: [-0.87, -0.29, 0.29, 0.87], chem: [-0.8, -0.4] })
    // écurie en appentis
    for (const z of [-1.5, 0.1]) f.box(0.12, 1.4, 0.12, POUTRE, 1.9, 0, z)
    const p = f.piece(1.3, 0.06, 1.9, TOITS.ardoise, 1.3, 1.7, -0.7); p.rotation.z = -0.35
    animal(f, 1.3, -0.7, Math.PI / 2, 'cheval')
    // diligence
    charrette(f, -0.5, 1.4, 0, undefined, true)
    // poteau indicateur
    f.box(0.08, 1.8, 0.08, BOIS, 1.5, 0, 1.3)
    for (const [y, a] of [[1.55, 0.3], [1.3, -0.5]]) f.piece(0.6, 0.14, 0.04, 0xd8c8a0, 1.5 + Math.cos(a) * 0.25, y, 1.3 - Math.sin(a) * 0.25).rotation.y = a
    panneau(f, 0.9, i.y0 + 1.6, i.zf, 0x2f4f6f, (x, y, z) => { const c = f.cone(0.07, 0.3, OR, x, y - 0.15, z, 8, 0); c.rotation.x = Math.PI / 2; c.position.set(x, y, z) })
  },
  peage(f) {
    f.box(3.6, 0.04, 1.4, 0xbdb3a2, 0, 0, 0.9).castShadow = false
    const s = 1.3, h = 3.2, x = -1.3, z = -0.6
    f.box(s + 0.2, 0.4, s + 0.2, SOCLE, x, 0, z)
    f.box(s, h, s, MURS.pierre, x, 0, z); f.chainage(s, h - 0.4, s, 0.4, x, z)
    f.box(s + 0.2, 0.3, s + 0.2, MURS.pierre, x, h, z); f.creneaux(s + 0.2, s + 0.2, h + 0.3, MURS.pierre, x, z)
    f.pyr(s - 0.3, 1.6, TOITS.rouge, x, h + 0.35, z)
    f.porte(x, z + s / 2 + 0.01, 0.5, 1.1); f.croisee(x + s / 2 + 0.01, 1.6, z, 0.3, 0.45, 'x')
    // barrière
    f.box(0.2, 1.0, 0.2, BOIS_F, -0.45, 0, 0.9)
    for (let k = 0; k < 6; k++) f.piece(0.4, 0.08, 0.08, k % 2 ? 0xffffff : 0xb3352b, -0.2 + k * 0.4, 0.95, 0.9)
    f.box(0.12, 0.85, 0.12, BOIS_F, 1.95, 0, 0.9)
    // guérite et coffre
    f.box(0.7, 1.3, 0.6, MURS.bois, 1.3, 0, -0.6); f.gable(0.9, 0.8, 0.4, TOITS.rouge, 1.3, 1.3, -0.6, MURS.bois); f.fenetre(1.3, 0.7, -0.29, 0.35, 0.35)
    f.box(0.4, 0.3, 0.3, BOIS_F, 0.4, 0, -0.3); f.box(0.42, 0.05, 0.05, FER, 0.4, 0.2, -0.14)
    drapeauMat(f, -0.45, 0.4, 2.2, TOITS.rouge)
  },
  port(f) {
    f.box(3.6, 0.04, 2.4, 0x3a4a52, 0, -0.03, -0.6); const e = f.box(3.6, 0.04, 2.4, matEau, 0, 0.0, -0.6); e.castShadow = false
    f.box(3.6, 0.3, 1.2, SOCLE, 0, 0, 1.2)
    // ponton
    f.box(1.0, 0.08, 2.4, BOIS, 0.6, 0.3, -0.6)
    for (let k = 0; k < 4; k++) for (const s of [-1, 1]) f.cyl(0.07, 0.07, 0.6, BOIS_F, 0.6 + s * 0.45, -0.2, 0.4 - k * 0.65, 6)
    for (const z of [-1.0, -0.2]) f.cyl(0.08, 0.1, 0.25, NOIR, 1.05, 0.38, z, 6)
    barque(f, 1.65, -0.8, Math.PI / 2, 1.5, 0.02); barque(f, -0.6, -1.1, Math.PI / 2 + 0.2, 1.3, 0.02)
    // mât
    f.box(0.06, 1.8, 0.06, BOIS_F, 1.65, 0.2, -0.8); f.box(0.02, 1.0, 0.7, TOILE, 1.65, 0.8, -0.45)
    for (const [x, z] of [[-1.2, 1.2], [-0.8, 1.3], [1.4, 1.2]]) f.caisse(x, z, 0.3)
    f.tonneau(-1.5, 1.5, 0.3); sac(f, 0.1, 1.3, 0.3)
  },
  chantier_naval(f) {
    f.box(3.6, 0.04, 1.6, matEau, 0, 0.0, -1.0).castShadow = false
    // cale inclinée
    const c = f.piece(1.2, 0.08, 3.4, BOIS_F, -0.3, 0.15, 0); c.rotation.x = 0.08
    // coque en construction : quille et membrures
    f.box(0.12, 0.15, 3.0, BOIS, -0.3, 0.25, 0)
    for (let k = 0; k < 8; k++) {
      const z = -1.2 + k * 0.35, l = 0.75 - Math.abs(k - 3.5) * 0.08
      for (const s of [-1, 1]) f.piece(0.07, l, 0.07, 0xb08a5a, -0.3 + s * 0.32, 0.3 + l / 2, z).rotation.z = -s * 0.5
      f.box(0.6, 0.06, 0.07, 0xb08a5a, -0.3, 0.3, z)
    }
    f.piece(0.12, 0.9, 0.12, BOIS, -0.3, 0.75, 1.55).rotation.x = -0.4
    // échafaudage et grue
    for (const z of [-0.8, 0.4]) for (const s of [-1, 1]) f.box(0.07, 1.6, 0.07, BOIS, -0.3 + s * 0.85, 0, z)
    for (const s of [-1, 1]) f.box(0.3, 0.05, 1.5, BOIS, -0.3 + s * 0.85, 1.0, -0.2)
    planches(f, 1.4, 0.8); rondins(f, 1.4, -0.4, 2, 1.0)
    f.box(0.9, 1.0, 0.8, MURS.bois, 1.4, 0, 1.4); f.gable(1.1, 1.0, 0.45, TOITS.ardoise, 1.4, 1.0, 1.4, MURS.bois)
  },
  phare(f) {
    rocher(f, 0, 0.2, 0, 1.4, 0x6e6a60).scale.set(1.3, 0.4, 1.3)
    const h = 4.6, seg = 6
    for (let k = 0; k < seg; k++) {
      const r0 = 0.85 - k * 0.04, r1 = 0.85 - (k + 1) * 0.04
      f.cyl(r1, r0, h / seg, k % 2 ? 0xb3352b : 0xf0ece0, 0, 0.5 + k * h / seg, 0, 12)
    }
    const yt = 0.5 + h
    f.cyl(0.85, 0.85, 0.12, MURS.pierre, 0, yt, 0, 12)
    for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; f.box(0.04, 0.35, 0.04, FER, Math.cos(a) * 0.8, yt + 0.12, Math.sin(a) * 0.8) }
    f.tore(0.8, 0.025, FER, 0, yt + 0.47, 0).rotation.x = Math.PI / 2
    f.cyl(0.45, 0.45, 0.7, matFenetre, 0, yt + 0.12, 0, 10)
    f.box(0.3, 0.3, 0.3, matBraise, 0, yt + 0.3, 0)
    f.dome(0.5, 0xb3352b, 0, yt + 0.82, 0)
    f.porte(0, 0.82, 0.5, 1.1, 'z', 0.5)
    for (const y of [2.0, 3.4]) f.fenetre(0, y, 0.78, 0.2, 0.35)
    f.box(1.0, 1.0, 0.8, MURS.enduit, 1.3, 0, 1.2); f.gable(1.2, 1.0, 0.45, TOITS.rouge, 1.3, 1.0, 1.2, MURS.enduit)
  },
  route_com(f) {
    f.add(construireModele('route', {}, f.seed))
    // borne milliaire, poteau indicateur, oratoire, chariot
    f.box(0.3, 0.6, 0.2, CHAINE, -1.4, 0, -1.2); f.dome(0.15, CHAINE, -1.4, 0.6, -1.2)
    f.box(0.08, 1.8, 0.08, BOIS, 1.4, 0, -1.2)
    for (const [y, a] of [[1.6, 0.4], [1.35, -0.6], [1.1, 2.6]]) f.piece(0.65, 0.14, 0.04, 0xd8c8a0, 1.4 + Math.cos(a) * 0.28, y, -1.2 - Math.sin(a) * 0.28).rotation.y = a
    f.box(0.12, 1.3, 0.12, MURS.pierre, -1.4, 0, 1.3); f.box(0.4, 0.45, 0.3, MURS.pierre, -1.4, 1.3, 1.3); f.gable(0.55, 0.45, 0.25, TOITS.ardoise, -1.4, 1.75, 1.3)
    f.box(0.2, 0.25, 0.02, matFenetre, -1.4, 1.4, 1.46)
    charrette(f, 0.4, 0.3, 0.05, 0xc04a3a, false)
  },
  garnison(f) {
    // cour fortifiée : enceinte basse, tentes, mât
    const m = 1.85
    for (const [a, b, c, d] of [[-m, -m, m, -m], [m, -m, m, m], [-m, -m, -m, m]]) { const L = Math.hypot(c - a, d - b); f.box(c === a ? 0.3 : L, 1.1, c === a ? L : 0.3, MURS.pierre, (a + c) / 2, 0, (b + d) / 2) }
    for (const s of [-1, 1]) f.box(1.2, 1.1, 0.3, MURS.pierre, s * 1.25, 0, m)
    f.sous(0, 0, 0, 0, a => { for (let k = 0; k < 5; k++) for (const s of [-1, 1]) a.box(0.22, 0.25, 0.3, MURS.pierre, s * (m), 1.1, -m + 0.3 + k * 0.75) })
    for (const s of [-1, 1]) { f.box(0.5, 1.8, 0.5, MURS.pierre, s * 0.6, 0, m); f.creneaux(0.5, 0.5, 1.8, MURS.pierre, s * 0.6, m, 0.15, 0.25) }
    f.cyl(0.55, 0.6, 2.6, MURS.pierre, -m + 0.2, 0, -m + 0.2, 10); f.cone(0.7, 1.2, TOITS.rouge, -m + 0.2, 2.6, -m + 0.2, 10, 0)
    tente(f, 0.8, -0.9, 0.65, 1.2, 0xe9dfc7, 0xb3352b); tente(f, -0.6, 0.0, 0.6, 1.1, 0xe9dfc7, 0x3f5f80)
    drapeauMat(f, 0.3, 0.6, 3.4, TOITS.rouge)
    rateliers(f, 1.1, 0.6, 4)
  },
  antenne(f) {
    const i = corps(f, { w: 2.5, d: 1.8, h1: 1.8, h2: 1.4, j: 0, mat: 'pierre', haut: 'pierre', toit: TOITS.bleu, hr: 1.5, forme: 'croupe', z: -0.6, porte: 0, pw: 0.65, ph: 1.4, fen: [-0.85, 0.85], fen2: [-0.85, 0, 0.85] })
    // blason
    f.box(0.5, 0.6, 0.05, 0x3f5f80, 0, i.y1 - 0.1, i.zf + 0.03)
    f.piece(0.5, 0.08, 0.06, OR, 0, i.y1 + 0.25, i.zf + 0.05)
    f.cone(0.25, 0.25, 0x3f5f80, 0, i.y1 - 0.35, i.zf + 0.03, 4, Math.PI / 4).rotation.x = Math.PI
    for (const [s, c] of [[-1, 0x7a3a8a], [1, 0x2f6f4f]] as const) { f.piece(0.04, 0.04, 0.9, BOIS_F, s * 0.55, i.y0 + 1.6, i.zf + 0.45).rotation.x = -0.5; f.box(0.6, 0.45, 0.02, c, s * 0.55 + 0.3 * s * 0, i.y0 + 1.25, i.zf + 0.8) }
    // jardin d'apparat
    for (const s of [-1, 1]) { f.box(1.2, 0.35, 0.3, 0x3f6e3a, s * 1.15, 0, 1.45); for (const x of [0.75, 1.55]) { f.cyl(0.04, 0.04, 0.5, BOIS_F, s * x, 0, 0.85, 5); f.boule(0.22, 0x3f6e3a, s * x, 0.65, 0.85, 1) } }
  },
}

/** Modèle du bâtiment `id` : dédié s'il existe, sinon modèle générique de sa forme. */
export function construireBatiment(id: string, seed = 0): THREE.Group {
  const b = BI[id]
  const m = MODELES[id]
  if (!b) return new THREE.Group()
  if (!m) return construireModele(b.shape, b.opt, seed)
  const f = new Fab(seed)
  const rnd: Rnd = i => { const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453; return x - Math.floor(x) }
  m(f, b.opt, rnd)
  fusionner(f.g)
  f.g.userData.smoke = f.smoke
  f.g.userData.spin = f.spin
  return f.g
}

/* ── Chantiers : bâtiment payé, terminé au prochain cycle ── */

const PLAT = new Set(['route', 'place', 'champ', 'vigne', 'ruches', 'arene', 'fosse', 'verger', 'stele', 'etal', 'camp'])

function echelle(f: Fab, x: number, z: number, h: number, rot = 0) {
  f.sous(x, 0, z, rot, a => {
    for (const s of [-1, 1]) a.piece(0.05, h, 0.05, BOIS, s * 0.16, h / 2, 0)
    for (let y = 0.25; y < h - 0.1; y += 0.28) a.piece(0.32, 0.035, 0.04, BOIS_F, 0, y, 0)
  }).rotation.x = -0.22
}
function brouette(f: Fab, x: number, z: number, rot: number, charge: number = MURS.pierre) {
  f.sous(x, 0, z, rot, a => {
    a.box(0.5, 0.2, 0.36, BOIS, 0, 0.22, 0)
    a.box(0.42, 0.08, 0.3, charge, 0, 0.42, 0)
    const r = a.cyl(0.12, 0.12, 0.05, BOIS_F, 0.34, 0.12, 0, 8); r.rotation.x = Math.PI / 2; r.position.y = 0.12
    for (const s of [-1, 1]) a.piece(0.55, 0.04, 0.04, BOIS_F, -0.42, 0.32, s * 0.15).rotation.z = 0.25
  })
}
/** tas de moellons taillés */
function moellons(f: Fab, x: number, z: number, c: number = MURS.pierre) {
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++) f.box(0.3, 0.18, 0.22, j % 2 ? c : fonce(c, 0.88), x - 0.3 + j * 0.32 + i * 0.16, i * 0.18, z)
}
/** échafaudage le long d'un mur : perches, boulins et un plancher par niveau */
function echafaudage(f: Fab, L: number, h: number, x0: number, z0: number, rot: number) {
  f.sous(x0, 0, z0, rot, a => {
    const n = Math.max(2, Math.round(L / 0.9))
    for (let i = 0; i <= n; i++) a.cyl(0.035, 0.045, h, 0x9a7a52, -L / 2 + i * L / n, 0, 0.45, 5)
    for (let y = 0.8; y < h - 0.2; y += 0.8) {
      a.piece(L, 0.05, 0.05, BOIS, 0, y, 0.45)
      for (let i = 0; i <= n; i++) a.piece(0.04, 0.04, 0.5, BOIS_F, -L / 2 + i * L / n, y, 0.22)
      a.box(L * 0.9, 0.04, 0.34, 0xb08a5a, 0, y + 0.02, 0.26)
    }
    // croix de Saint-André pour le contreventement
    const d = a.piece(0.04, Math.hypot(L, h * 0.8), 0.04, BOIS_F, 0, h * 0.42, 0.47); d.rotation.z = Math.atan2(L, h * 0.8)
  })
}

export function construireChantier(id: string, seed = 0): THREE.Group {
  const b = BI[id]
  const f = new Fab(seed)
  const rnd: Rnd = i => { const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453; return x - Math.floor(x) }
  f.sol(3.5, 3.5, 0x7a6448)
  // piquets et cordeau qui délimitent l'emprise
  for (const [x, z] of [[-1.6, -1.6], [1.6, -1.6], [1.6, 1.6], [-1.6, 1.6]]) f.box(0.06, 0.45, 0.06, BOIS, x, 0, z)
  for (const s of [-1, 1]) { f.box(3.2, 0.015, 0.015, TOILE, 0, 0.4, s * 1.6); f.box(0.015, 0.015, 3.2, TOILE, s * 1.6, 0.4, 0) }

  if (!b || PLAT.has(b.shape)) {
    // ouvrage au sol : terre retournée, matériaux, outils
    for (let i = 0; i < 4; i++) f.boule(0.35 + rnd(i) * 0.2, 0x6a5338, -1 + rnd(i + 3) * 2, -0.1, -1 + rnd(i + 7) * 2).scale.y = 0.5
    moellons(f, 0.6, 0.9)
    planches(f, -0.6, -0.9, 4)
    brouette(f, -0.4, 0.6, 0.6, 0x6a5338)
    sac(f, 1.0, -0.4); sac(f, 1.2, -0.2)
    for (const x of [-1.2, -0.4, 0.4, 1.2]) f.box(0.05, 0.3, 0.05, BOIS, x, 0, -1.2)
  } else {
    const haut = b.shape === 'tour' || b.shape === 'chapelle' || b.shape === 'moulin' || b.opt.big || b.shape === 'grand'
    const w = 2.6, d = 2.2, h = haut ? 2.4 : 1.6
    const bois = b.opt.mat === 'bois' || b.shape === 'grange'
    f.socle(w + 0.1, d + 0.1, 0.3)
    if (bois) {
      // charpente montée : poteaux, sablières, fermes du toit sans couverture
      for (const x of [-w / 2, -w / 6, w / 6, w / 2]) for (const z of [-d / 2, d / 2]) f.box(0.12, h, 0.12, BOIS, x, 0.3, z)
      for (const z of [-d / 2, d / 2]) f.box(w + 0.1, 0.12, 0.14, BOIS_F, 0, 0.3 + h, z)
      for (const x of [-w / 2, w / 2]) f.box(0.14, 0.12, d, BOIS_F, x, 0.3 + h, 0)
      for (const x of [-w / 2, 0, w / 2]) for (const s of [-1, 1]) {
        const c = f.piece(0.08, 0.08, d * 0.62, BOIS, x, 0.3 + h + 0.42, s * d * 0.26); c.rotation.x = s * 0.62
      }
      f.box(w + 0.2, 0.1, 0.1, BOIS_F, 0, 0.3 + h + 0.8, 0)
      // un premier pan de planches posé
      f.box(0.9, h * 0.6, 0.06, 0xb08a5a, -w / 3, 0.3, d / 2)
      rondins(f, 0.4, 1.55, 3, 1.4)
    } else {
      // murs qui montent par assises : plus hauts côté nord, une brèche pour la porte au sud
      const c = MURS[b.opt.mat ?? 'pierre']
      const assise = (x: number, z: number, lw: number, ld: number, hh: number) => f.box(lw, hh, ld, c, x, 0.3, z)
      const n = 5
      for (let i = 0; i < n; i++) {
        const t = -w / 2 + (i + 0.5) * w / n
        assise(t, -d / 2 + 0.11, w / n, 0.22, h * (0.75 + rnd(i) * 0.25))
        if (Math.abs(t) > 0.4) assise(t, d / 2 - 0.11, w / n, 0.22, h * (0.25 + rnd(i + 5) * 0.3))
      }
      for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
        const t = -d / 2 + 0.22 + (i + 0.5) * (d - 0.44) / 4
        assise(s * (w / 2 - 0.11), t, 0.22, (d - 0.44) / 4, h * (0.35 + (1 - (i / 3)) * 0.4 + rnd(i + 11 + s) * 0.12))
      }
      f.box(0.9, 0.12, 0.26, CHAINE, 0, 0.3 + h * 0.9, -d / 2 + 0.11)
      echafaudage(f, w, h + 0.4, 0, d / 2, 0)
      echafaudage(f, d, h + 0.2, w / 2, 0, Math.PI / 2)
      moellons(f, -1.0, 1.55, c)
    }
    echelle(f, -w / 2 - 0.2, 0.6, h + 0.6, Math.PI / 2)
    if (haut) grue(f, 1.35, -1.3, Math.PI * 0.75)
    planches(f, 1.0, 1.5, 4)
    brouette(f, -1.5, -1.45, 0.4)
    sac(f, 1.55, 0.6); sac(f, 1.5, 0.85, 0, 0xb8a27a)
  }
  // panneau du chantier
  f.box(0.06, 0.8, 0.06, BOIS_F, 1.45, 0, 1.75)
  f.box(0.5, 0.32, 0.04, 0xc9a86a, 1.45, 0.55, 1.78)
  fusionner(f.g)
  f.g.userData.smoke = f.smoke
  f.g.userData.spin = f.spin
  return f.g
}
