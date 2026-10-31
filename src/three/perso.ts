import * as THREE from 'three'
import { mat, fonce } from './batiments'

/* Petit personnage médiéval pour la balade (unités : mètres, regard vers +z).
   Son apparence vient d'une « tenue » (Skin) : couleurs, coiffure, armure, accessoires. */

const TUNIQUES = [0xb3352b, 0x3f5f80, 0x4f6b45, 0xd4a02a, 0x7a3a8a, 0xc0703a, 0x2f6f6f, 0x8a6a48]

/** Couleur stable tirée de l'identifiant du joueur (tenue « villageois »). */
export function couleurDe(id: string) {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0
  return TUNIQUES[Math.abs(h) % TUNIQUES.length]
}

export interface Skin {
  nom: string
  peau: number
  cheveux: number
  coiffure: 'capuche' | 'court' | 'queue' | 'long' | 'chapeau' | 'heaume' | 'tricorne'
  /** oreilles pointues */
  elfe?: boolean
  barbe?: { couleur: number; longue?: boolean }
  yeux?: number
  /** absente : couleur propre au joueur */
  tunique?: number
  robe?: boolean
  /** jupe longue d'une autre couleur que le haut (qui reste `tunique`), manches évasées */
  jupe?: number
  ceinture?: number
  jambes: number
  bottes: number
  cape?: number
  armure?: { type: 'ecorce' | 'cuir' | 'maille'; couleur: number; mousse?: number }
  /** griffes : sceptre à bagues et griffes dorées qui tiennent la pierre */
  baton?: { bois: number; cristal?: number; runes?: number; griffes?: number }
  arme?: 'epee' | 'arc'
  pendentif?: number
  aura?: number
  chapeau?: number
  /** tricorne : bord doré */
  galon?: number
  /** petit esprit lumineux qui flotte au-dessus de l'épaule gauche */
  compagnon?: number
}

export const SKINS: Record<string, Skin> = {
  villageois: { nom: 'Villageois', peau: 0xe0b48a, cheveux: 0x5a4030, coiffure: 'capuche', jambes: 0x4a3a2a, bottes: 0x2e241c },
  druide: {
    // d'après l'illustration du druide elfe : armure d'écorce moussue, bâton runique à cristal, pendentif-cage lumineux
    nom: 'Druide elfe', peau: 0xe8b896, cheveux: 0x6b5233, coiffure: 'queue', elfe: true,
    barbe: { couleur: 0x7a5a38 }, yeux: 0x6fae7a, tunique: 0x3f5a3a, jambes: 0x3e3428, bottes: 0x2e241c,
    armure: { type: 'ecorce', couleur: 0x6e5e4c, mousse: 0x6a8a3a },
    baton: { bois: 0xb8ad9a, cristal: 0xdff4ff, runes: 0x7dff9a }, pendentif: 0x5aff8a, aura: 0x6adf8a,
  },
  chevalier: {
    nom: 'Chevalier', peau: 0xe0b48a, cheveux: 0x3a2a1a, coiffure: 'heaume', tunique: 0xb3352b, jambes: 0x8a8d92, bottes: 0x4a4d52,
    cape: 0x2f4f8f, armure: { type: 'maille', couleur: 0x9a9da2 }, arme: 'epee',
  },
  rodeur: {
    nom: 'Rôdeur', peau: 0xd8a87a, cheveux: 0x2a1e14, coiffure: 'capuche', barbe: { couleur: 0x2a1e14 }, tunique: 0x4f5a3a,
    jambes: 0x3e3428, bottes: 0x3a2a1a, cape: 0x2f4a2a, armure: { type: 'cuir', couleur: 0x6b4a2e }, arme: 'arc',
  },
  mage: {
    nom: 'Mage', peau: 0xe8c0a0, cheveux: 0xe8e4dc, coiffure: 'chapeau', chapeau: 0x2f3f7f, barbe: { couleur: 0xe8e4dc, longue: true },
    tunique: 0x3a4a9a, robe: true, jambes: 0x2a2a4a, bottes: 0x2a2420, baton: { bois: 0x6b4a2e, cristal: 0x8ab8ff }, aura: 0x8ab8ff,
  },
  haute_elfe: {
    // d'après la fiche d'Amania : tricorne noir galonné d'or, chemisier blanc, jupe bordeaux, sceptre à pierre orange, blob compagnon
    nom: 'Haute elfe', peau: 0xf0d2b8, cheveux: 0xf2f0ec, coiffure: 'tricorne', elfe: true, yeux: 0x111111,
    tunique: 0xf4f1ea, jupe: 0x7a1424, ceinture: 0x2a1e18, jambes: 0x7a1424, bottes: 0x2a1e18,
    chapeau: 0x1c1a1c, galon: 0xd8a830, baton: { bois: 0x3a2618, cristal: 0xff8a1a, griffes: 0xd8a830 }, compagnon: 0xff8a1a,
  },
}
export const skinDe = (id?: string | null) => SKINS[id ?? ''] ?? SKINS.villageois

/** Matériaux lumineux partagés (cristaux, runes, pendentifs). */
const lueurs = new Map<string, THREE.Material>()
function lueur(c: number, opacite = 1) {
  const k = `${c}|${opacite}`
  let m = lueurs.get(k)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.8, roughness: 0.3, flatShading: true, transparent: opacite < 1, opacity: opacite, depthWrite: opacite === 1 })
    m.userData.partage = true
    lueurs.set(k, m)
  }
  return m
}

export interface Perso {
  g: THREE.Group
  jambes: THREE.Object3D[]
  bras: THREE.Object3D[]
  corps: THREE.Object3D
  aura: THREE.Object3D[]
  tient: boolean
  compagnon: { g: THREE.Group; yeux: THREE.Object3D[]; etincelles: THREE.Object3D[] } | null
  phase: number
  t: number
  skin: string
}

function etiquette(texte: string) {
  const c = document.createElement('canvas')
  c.width = 256; c.height = 64
  const x = c.getContext('2d')!
  x.font = '600 30px "Alegreya Sans", system-ui, sans-serif'
  const w = Math.min(248, x.measureText(texte).width + 28)
  x.fillStyle = 'rgba(20,24,28,0.72)'
  x.beginPath(); x.roundRect((256 - w) / 2, 8, w, 48, 14); x.fill()
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'
  x.fillText(texte, 128, 33, 230)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false }))
  s.scale.set(1.4, 0.35, 1)
  s.position.y = 2.35
  return s
}

export function construirePerso(skinId: string, couleurJoueur: number, pseudo?: string): Perso {
  const sk = skinDe(skinId)
  const tunique = sk.tunique ?? couleurJoueur
  const g = new THREE.Group()
  const corps = new THREE.Group()
  g.add(corps)
  const m = (geo: THREE.BufferGeometry, c: number | THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = corps) => {
    const o = new THREE.Mesh(geo, typeof c === 'number' ? mat(c) : c)
    o.position.set(x, y, z)
    o.castShadow = true
    parent.add(o)
    return o
  }
  const membre = (x: number, y: number) => { const p = new THREE.Group(); p.position.set(x, y, 0); corps.add(p); return p }

  // jambes et corps
  const jambes = [-1, 1].map(s => {
    const p = membre(s * 0.1, 0.85)
    m(new THREE.BoxGeometry(0.14, 0.78, 0.16), sk.jambes, 0, -0.4, 0, p)
    m(new THREE.BoxGeometry(0.16, 0.12, 0.26), sk.bottes, 0, -0.79, 0.04, p)
    return p
  })
  if (sk.jupe) {
    // jupe longue jusqu'aux pieds, haut ajusté aux épaules dégagées
    m(new THREE.CylinderGeometry(0.21, 0.42, 1.0, 8), sk.jupe, 0, 0.5, 0)
    m(new THREE.CylinderGeometry(0.2, 0.21, 0.5, 8), tunique, 0, 1.25, 0)
    m(new THREE.CylinderGeometry(0.235, 0.2, 0.08, 8), tunique, 0, 1.5, 0)
    m(new THREE.BoxGeometry(0.16, 0.06, 0.02), sk.peau, 0, 1.47, 0.2)
  } else if (sk.robe) m(new THREE.CylinderGeometry(0.2, 0.38, 1.35, 8), tunique, 0, 0.83, 0)
  else m(new THREE.CylinderGeometry(0.2, 0.3, 0.76, 8), tunique, 0, 1.15, 0)
  if (sk.ceinture) {
    m(new THREE.CylinderGeometry(0.225, 0.23, 0.11, 8), sk.ceinture, 0, 0.97, 0)
    m(new THREE.BoxGeometry(0.08, 0.1, 0.03), 0xd4a83a, 0, 0.98, 0.23)
  } else {
    m(new THREE.CylinderGeometry(0.265, 0.27, 0.07, 8), 0x6b4a2e, 0, 1.0, 0)
    m(new THREE.BoxGeometry(0.08, 0.1, 0.03), 0xd4a83a, 0, 1.0, 0.27)
  }
  if (sk.cape) m(new THREE.BoxGeometry(0.46, 1.0, 0.04), sk.cape, 0, 0.98, -0.25).rotation.x = 0.1
  else if (!sk.armure && !sk.robe && !sk.jupe) m(new THREE.BoxGeometry(0.44, 0.72, 0.04), fonce(tunique, 0.6), 0, 1.12, -0.24).rotation.x = 0.12

  // armure
  const a = sk.armure
  if (a?.type === 'maille') {
    m(new THREE.CylinderGeometry(0.23, 0.29, 0.62, 8), a.couleur, 0, 1.2, 0)
    m(new THREE.BoxGeometry(0.34, 0.75, 0.04), tunique, 0, 0.93, 0.27)
    m(new THREE.BoxGeometry(0.34, 0.75, 0.04), tunique, 0, 0.93, -0.27)
    m(new THREE.BoxGeometry(0.12, 0.14, 0.02), 0xd4a83a, 0, 1.18, 0.3)
  } else if (a?.type === 'cuir') {
    m(new THREE.BoxGeometry(0.42, 0.4, 0.42), a.couleur, 0, 1.25, 0)
    for (const s of [-1, 1]) m(new THREE.BoxGeometry(0.16, 0.08, 0.2), fonce(a.couleur, 0.8), s * 0.26, 1.5, 0).rotation.z = -s * 0.4
  } else if (a?.type === 'ecorce') {
    // plaques d'écorce irrégulières sur le torse et les épaules, touffes de mousse
    for (const [x, y, w, h, r] of [[-0.09, 1.3, 0.2, 0.3, 0.1], [0.1, 1.22, 0.18, 0.34, -0.12], [0, 1.08, 0.3, 0.14, 0.05]]) {
      const p = m(new THREE.BoxGeometry(w, h, 0.05), a.couleur, x, y, 0.26); p.rotation.set(0.08, 0, r)
    }
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const p = m(new THREE.BoxGeometry(0.2, 0.05, 0.3), k % 2 ? fonce(a.couleur, 0.85) : a.couleur, s * (0.24 + k * 0.03), 1.52 - k * 0.07, 0)
        p.rotation.set(0, 0, -s * (0.5 + k * 0.15))
      }
      if (a.mousse) for (let k = 0; k < 4; k++) m(new THREE.IcosahedronGeometry(0.045, 0), a.mousse, s * (0.18 + k * 0.04), 1.57 - k * 0.03, -0.08 + k * 0.06)
    }
    // baudrier
    m(new THREE.BoxGeometry(0.06, 0.75, 0.03), 0x6b4a2e, 0.02, 1.2, 0.29).rotation.z = 0.6
  }

  // bras
  const tient = !!sk.baton
  const bras = [-1, 1].map(s => {
    const p = membre(s * 0.27, 1.47)
    m(new THREE.BoxGeometry(0.11, 0.56, 0.12), a?.type === 'maille' ? a.couleur : tunique, 0, -0.28, 0, p)
    // manches de chemisier évasées au poignet
    if (sk.jupe) m(new THREE.CylinderGeometry(0.085, 0.06, 0.16, 6), tunique, 0, -0.55, 0, p)
    m(new THREE.IcosahedronGeometry(0.06, 0), sk.peau, 0, -0.6, 0, p)
    return p
  })
  if (sk.baton) {
    // bâton tenu dans la main droite
    // bâton tenu droit : il compense l'inclinaison du bras
    const b = sk.baton, main = new THREE.Group()
    main.position.set(0, -0.6, 0.02); main.rotation.x = 0.35
    bras[1].add(main)
    m(new THREE.CylinderGeometry(0.03, 0.04, 1.75, 6), b.bois, 0, 0.12, 0, main)
    const crosse = m(new THREE.TorusGeometry(0.09, 0.025, 4, 8, Math.PI * 1.3), b.bois, 0, 1.06, 0.03, main)
    crosse.rotation.set(0, Math.PI / 2, 0.6)
    if (b.griffes) {
      // sceptre : bagues dorées et quatre griffes qui enserrent la pierre
      crosse.visible = false
      for (const y of [-0.55, 0.2, 0.82]) m(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 6), b.griffes, 0, y, 0, main)
      m(new THREE.CylinderGeometry(0.07, 0.04, 0.08, 6), b.griffes, 0, 0.98, 0, main)
      for (let k = 0; k < 4; k++) {
        const an = k * Math.PI / 2, gr = m(new THREE.BoxGeometry(0.025, 0.2, 0.025), b.griffes, Math.cos(an) * 0.07, 1.1, Math.sin(an) * 0.07, main)
        gr.rotation.set(Math.sin(an) * 0.45, 0, -Math.cos(an) * 0.45)
      }
    }
    if (b.cristal) { const c = m(new THREE.OctahedronGeometry(b.griffes ? 0.085 : 0.07), lueur(b.cristal), 0, b.griffes ? 1.14 : 1.08, b.griffes ? 0 : 0.03, main); c.scale.y = 1.6 }
    if (b.runes) for (let k = 0; k < 4; k++) m(new THREE.BoxGeometry(0.05, 0.035, 0.012), lueur(b.runes), 0, 0.55 - k * 0.1, 0.035, main)
  }
  if (sk.arme === 'epee') {
    const e = m(new THREE.BoxGeometry(0.04, 0.75, 0.02), 0xc8ccd2, -0.3, 0.75, 0.05); e.rotation.z = 0.15
    m(new THREE.BoxGeometry(0.18, 0.03, 0.04), 0xd4a83a, -0.25, 1.1, 0.05)
  } else if (sk.arme === 'arc') {
    const arc = m(new THREE.TorusGeometry(0.5, 0.02, 4, 12, Math.PI * 0.9), 0x6b4a2e, 0, 1.2, -0.3)
    arc.rotation.set(0, 0, 0.85)
    m(new THREE.BoxGeometry(0.01, 0.95, 0.01), 0xe8e0d0, 0.03, 1.2, -0.3).rotation.z = 0.8
  }

  // tête
  m(new THREE.IcosahedronGeometry(0.16, 1), sk.peau, 0, 1.72, 0)
  // avec le visage plat (tricorne), de grands yeux noirs posés dessus
  const plat = sk.coiffure === 'tricorne'
  for (const s of [-1, 1]) m(new THREE.BoxGeometry(0.04, plat ? 0.07 : 0.035, 0.02), sk.yeux ?? 0x2a241d, s * 0.06, plat ? 1.72 : 1.74, plat ? 0.165 : 0.15)
  if (sk.elfe) for (const s of [-1, 1]) { const o = m(new THREE.ConeGeometry(0.035, 0.17, 4), sk.peau, s * 0.17, 1.76, -0.02); o.rotation.set(0, 0, -s * 1.15) }
  if (sk.barbe) {
    if (sk.barbe.longue) { const b = m(new THREE.ConeGeometry(0.12, 0.38, 6), sk.barbe.couleur, 0, 1.5, 0.1); b.rotation.x = Math.PI }
    else m(new THREE.BoxGeometry(0.2, 0.1, 0.08), sk.barbe.couleur, 0, 1.62, 0.11)
  }
  const capuche = sk.cape ?? fonce(tunique, 0.75)
  switch (sk.coiffure) {
    case 'capuche':
      m(new THREE.ConeGeometry(0.2, 0.34, 8), capuche, 0, 1.9, -0.02).rotation.x = -0.15
      // bord de capuche à l'arrière seulement, le visage reste visible
      m(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 8, 1, true, Math.PI / 2, Math.PI), capuche, 0, 1.72, -0.02).material = mat(capuche, { double: true })
      break
    case 'court': case 'queue': case 'long': {
      const h = m(new THREE.SphereGeometry(0.172, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), sk.cheveux, 0, 1.73, -0.015)
      h.scale.set(1, 1.05, 1.05)
      m(new THREE.BoxGeometry(0.3, 0.14, 0.08), sk.cheveux, 0, 1.68, -0.12)
      if (sk.coiffure === 'queue') { const q = m(new THREE.BoxGeometry(0.06, 0.24, 0.06), sk.cheveux, 0, 1.6, -0.19); q.rotation.x = 0.25 }
      if (sk.coiffure === 'long') m(new THREE.BoxGeometry(0.3, 0.35, 0.06), sk.cheveux, 0, 1.52, -0.15)
      break
    }
    case 'chapeau': {
      const c = sk.chapeau ?? tunique
      m(new THREE.CylinderGeometry(0.32, 0.32, 0.03, 10), c, 0, 1.83, 0)
      const p = m(new THREE.ConeGeometry(0.17, 0.5, 8), c, 0, 2.08, -0.02); p.rotation.x = -0.18
      m(new THREE.BoxGeometry(0.3, 0.12, 0.1), sk.cheveux, 0, 1.7, -0.12)
      break
    }
    case 'tricorne': {
      // longs cheveux : calotte, mèches qui encadrent le visage, chevelure dans le dos
      const h = m(new THREE.SphereGeometry(0.175, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), sk.cheveux, 0, 1.72, -0.01)
      h.scale.set(1.05, 1.1, 1.08)
      m(new THREE.BoxGeometry(0.3, 0.05, 0.05), sk.cheveux, 0, 1.83, 0.13)
      for (const sx of [-1, 1]) m(new THREE.BoxGeometry(0.07, 0.42, 0.09), sk.cheveux, sx * 0.15, 1.5, 0.08)
      m(new THREE.BoxGeometry(0.36, 0.8, 0.08), sk.cheveux, 0, 1.36, -0.17).rotation.x = 0.06
      // tricorne : bord relevé en trois pans, galon doré
      const c = sk.chapeau ?? 0x1c1a1c, gal = sk.galon ?? 0xd8a830
      m(new THREE.CylinderGeometry(0.15, 0.18, 0.17, 8), c, 0, 1.87, -0.01)
      // visage plat et clair, comme sur la fiche : bien lisible sous le bord du chapeau
      m(new THREE.BoxGeometry(0.22, 0.19, 0.02), sk.peau, 0, 1.61, 0.15)
      // bord triangulaire, une pointe vers l'avant ; chaque pan se relève le long d'un côté
      m(new THREE.CylinderGeometry(0.34, 0.34, 0.02, 3), c, 0, 1.87, -0.01)
      for (let k = 0; k < 3; k++) {
        const pan = new THREE.Group(); pan.position.set(0, 1.87, -0.01); pan.rotation.y = Math.PI / 3 + k * Math.PI * 2 / 3; corps.add(pan)
        // pan évasé vers l'extérieur ; ses extrémités se rejoignent en pointes
        const pp = m(new THREE.BoxGeometry(0.5, 0.13, 0.025), c, 0, 0.06, 0.17, pan); pp.rotation.x = 0.6
        const l = m(new THREE.BoxGeometry(0.52, 0.025, 0.035), gal, 0, 0.115, 0.215, pan); l.rotation.x = 0.6
      }
      break
    }
    case 'heaume':
      m(new THREE.CylinderGeometry(0.185, 0.18, 0.3, 8), 0x9a9da2, 0, 1.73, 0)
      m(new THREE.SphereGeometry(0.185, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), 0x9a9da2, 0, 1.88, 0)
      m(new THREE.BoxGeometry(0.22, 0.03, 0.03), 0x1a1a1a, 0, 1.76, 0.18)
      m(new THREE.BoxGeometry(0.03, 0.18, 0.12), tunique, 0, 2.06, -0.02)
      break
  }

  if (sk.pendentif) {
    m(new THREE.TorusGeometry(0.13, 0.008, 3, 10, Math.PI), 0x6b4a2e, 0, 1.5, 0.1).rotation.set(Math.PI / 2 + 0.6, 0, Math.PI)
    m(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 6), 0xb9bcc0, 0, 1.33, 0.28)
    m(new THREE.IcosahedronGeometry(0.028, 0), lueur(sk.pendentif), 0, 1.37, 0.285)
  }

  // volutes lumineuses qui montent autour du personnage
  const aura: THREE.Object3D[] = []
  if (sk.aura) for (let k = 0; k < 7; k++) {
    const o = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05 + (k % 3) * 0.02, 0), lueur(sk.aura, 0.45))
    o.userData.k = k
    g.add(o); aura.push(o)
  }

  // compagnon : petit blob lumineux avec deux yeux, et quelques étincelles
  let compagnon: Perso['compagnon'] = null
  if (sk.compagnon) {
    const cg = new THREE.Group()
    const blob = m(new THREE.IcosahedronGeometry(0.15, 1), lueur(sk.compagnon), 0, 0, 0, cg)
    blob.scale.set(1.1, 0.95, 0.95)
    for (const [x, y, r] of [[-0.13, -0.06, 0.06], [0.13, -0.05, 0.055], [0, 0.11, 0.06]]) m(new THREE.IcosahedronGeometry(r, 0), lueur(sk.compagnon), x, y, -0.02, cg)
    const yeux = [-1, 1].map(sx => m(new THREE.BoxGeometry(0.035, 0.07, 0.02), 0x111111, sx * 0.05, 0.02, 0.145, cg))
    const etincelles: THREE.Object3D[] = []
    for (let k = 0; k < 5; k++) {
      const e = m(new THREE.BoxGeometry(0.03, 0.03, 0.03), lueur(sk.compagnon, 0.8), 0, 0, 0, cg)
      e.userData.k = k
      e.castShadow = false
      etincelles.push(e)
    }
    g.add(cg)
    compagnon = { g: cg, yeux, etincelles }
  }

  if (pseudo) g.add(etiquette(pseudo))
  return { g, jambes, bras, corps, aura, tient, compagnon, phase: 0, t: Math.random() * 10, skin: skinId }
}

/** Balancement des membres selon la vitesse (m/s), volutes de l'aura. */
export function animerPerso(p: Perso, dt: number, vitesse: number) {
  const marche = Math.min(1, vitesse / 3)
  if (vitesse > 0.15) p.phase += dt * (5 + vitesse * 1.2)
  else p.phase *= Math.max(0, 1 - dt * 6)
  const a = Math.sin(p.phase) * 0.65 * marche
  p.jambes[0].rotation.x = a; p.jambes[1].rotation.x = -a
  p.bras[0].rotation.x = -a * 0.8
  p.bras[1].rotation.x = p.tient ? -0.35 + a * 0.25 : a * 0.8
  p.corps.position.y = Math.abs(Math.sin(p.phase)) * 0.05 * marche
  p.t += dt
  for (const o of p.aura) {
    const k = o.userData.k as number, u = (p.t * 0.35 + k / p.aura.length) % 1
    const ang = k * 2.4 + p.t * 0.8
    o.position.set(Math.cos(ang) * (0.35 + u * 0.15), 0.7 + u * 1.5, Math.sin(ang) * (0.35 + u * 0.15))
    o.scale.setScalar(1 - u * 0.6)
  }
  const c = p.compagnon
  if (c) {
    // flotte au-dessus de l'épaule gauche, même à l'arrêt : il ondule, se dandine, cligne des yeux,
    // et traîne un peu en arrière quand on marche
    const t = p.t
    c.g.position.set(-0.45 + Math.sin(t * 0.9) * 0.05, 2.0 + Math.sin(t * 2.1) * 0.07, -0.05 - marche * 0.25 + Math.cos(t * 0.7) * 0.04)
    c.g.rotation.set(Math.sin(t * 1.3) * 0.12 + marche * 0.2, Math.sin(t * 0.6) * 0.35, Math.sin(t * 1.7) * 0.15)
    const sq = 1 + Math.sin(t * 4.2) * 0.05
    c.g.scale.set(1 / sq, sq, 1 / sq)
    const cligne = (t % 3.7) < 0.12 ? 0.15 : 1
    for (const y of c.yeux) y.scale.y = cligne
    for (const e of c.etincelles) {
      const k = e.userData.k as number, u = (t * 0.5 + k / c.etincelles.length) % 1
      const ang = k * 1.9 + t * 1.2
      e.position.set(Math.cos(ang) * (0.2 + u * 0.08), -0.05 + u * 0.35, Math.sin(ang) * (0.2 + u * 0.08))
      e.scale.setScalar(1 - u)
    }
  }
}

export function libererPerso(p: Perso) {
  p.g.traverse(o => {
    const m = o as THREE.Mesh
    if (m.isMesh) m.geometry.dispose()
    const s = o as THREE.Sprite
    if (s.isSprite) { (s.material.map as THREE.Texture | null)?.dispose(); s.material.dispose() }
  })
  p.g.removeFromParent()
}
