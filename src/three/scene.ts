import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { BI } from '../data/catalogue'
import { construireEnceinte, demiPorte, ECHELLE, ENCEINTE, matFenetre, rayon, appliquerSaison, teinteSaison, NEIGE } from './batiments'
import { construireBatiment, construireChantier } from './modeles'
import type { Saison } from '../logic/calendrier'
import { construirePerso, animerPerso, libererPerso, couleurDe, type Perso } from './perso'

export type Mode = 'maquette' | 'balade'
/** Position diffusée aux autres joueurs pendant la balade. */
export interface Position { x: number; z: number; yaw: number }
interface Autre { p: Perso; cible: THREE.Vector3; yaw: number; vu: number }
export interface Selection { index: number; id: string; chantier?: boolean }
/** les chantiers sont numérotés après les bâtiments pour ne pas se mélanger avec leurs index */
const INDEX_CHANTIER = 100000

const S = 5.4 * ECHELLE       // écart entre deux emplacements
const HAUTEUR_YEUX = 1.7
/* Niveaux de graphismes. budget : pixels dessinés au plus (au-delà l'image est légèrement agrandie) ;
   ombres : taille de la carte d'ombres (0 = sans ombres) et intervalle entre deux mises à jour. */
export type Graphismes = 'auto' | 'haute' | 'moyenne' | 'basse'
export const NIVEAUX = [
  { nom: 'basse', ombres: 0, tOmbre: 0, budget: 800_000, dpr: 1, min: 0.5, flocons: 400 },
  { nom: 'moyenne', ombres: 1024, tOmbre: 0.3, budget: 2_000_000, dpr: 1.25, min: 0.7, flocons: 1000 },
  { nom: 'haute', ombres: 2048, tOmbre: 0.12, budget: 4_000_000, dpr: 2, min: 0.75, flocons: 1800 },
] as const
/* Éclairage simplifié du niveau bas : chaque matériau réaliste a un double « Lambert », bien moins
   coûteux par pixel. Le double partage les couleurs de l'original, donc saisons, nuit et fumée suivent. */
const versLambert = new WeakMap<THREE.Material, THREE.Material>()
const versStandard = new WeakMap<THREE.Material, THREE.Material>()
function lambert(m: THREE.Material): THREE.Material {
  const s = m as THREE.MeshStandardMaterial
  if (!s.isMeshStandardMaterial) return m
  let l = versLambert.get(m)
  if (l) return l
  const x = new THREE.MeshLambertMaterial({ flatShading: s.flatShading, side: s.side, vertexColors: s.vertexColors, transparent: s.transparent, depthWrite: s.depthWrite, fog: s.fog })
  x.color = s.color; x.emissive = s.emissive
  for (const k of ['emissiveIntensity', 'opacity', 'visible'] as const) Object.defineProperty(x, k, { get: () => s[k], set: v => { (s as unknown as Record<string, unknown>)[k] = v }, configurable: true })
  x.userData = s.userData
  versLambert.set(m, x); versStandard.set(x, m)
  return x
}
const n0 = (p: THREE.Points | null) => p ? p.geometry.drawRange.count : 0
/** Nom de la puce qui dessine la 3D, tel que le navigateur le donne. */
export function puceGraphique() {
  try {
    const gl = document.createElement('canvas').getContext('webgl')
    if (!gl) return ''
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const nom = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return nom
  } catch { return '' }
}
/** 3D calculée par le processeur : l'accélération graphique du navigateur est coupée. */
export const rendeLogiciel = (nom: string) => /swiftshader|llvmpipe|softpipe|software|basic render/i.test(nom)
/** Puce graphique intégrée ou logicielle : on démarre plus bas. */
function niveauDepart() {
  const nom = puceGraphique()
  if (rendeLogiciel(nom)) return 0
  return /intel|mali|adreno|powervr|apple gpu/i.test(nom) ? 1 : 2
}
const CALQUE_CLIC = 1            // copies invisibles des bâtiments, servent seulement au clic
const matPave = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true })
matPave.userData.partage = true
/** ciel de jour : plus pâle et voilé l'hiver */
const CIEL: Record<Saison, number> = { printemps: 0x9ccbea, ete: 0x9cc6e6, automne: 0xaac2d6, hiver: 0xbcc9d4 }
const reduit = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

interface Bouffee { m: THREE.Mesh; vie: number; actif: boolean; dx: number }
interface Collision { x: number; z: number; r: number }

/** Fusionne par matériau les meshes simples enfants directs de `g` (hors exclus et instanciés). */
function fusionnerStatiques(g: THREE.Group, exclus: THREE.Object3D[] = []) {
  const lots = new Map<string, { m: THREE.Material; cast: boolean; recv: boolean; geos: THREE.BufferGeometry[] }>()
  for (const o of [...g.children]) {
    const m = o as THREE.Mesh
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || exclus.includes(m) || Array.isArray(m.material)) continue
    if (m.geometry.morphAttributes.position) continue
    m.updateMatrix()
    let geo = m.geometry.clone().applyMatrix4(m.matrix)
    for (const a of Object.keys(geo.attributes)) if (!['position', 'normal', 'color'].includes(a)) geo.deleteAttribute(a)
    if (geo.index) { const n = geo.toNonIndexed(); geo.dispose(); geo = n }
    const k = `${m.material.uuid}|${m.castShadow}|${m.receiveShadow}|${Object.keys(geo.attributes).sort().join()}`
    let l = lots.get(k)
    if (!l) lots.set(k, l = { m: m.material, cast: m.castShadow, recv: m.receiveShadow, geos: [] })
    l.geos.push(geo)
    g.remove(m); m.geometry.dispose()
  }
  for (const l of lots.values()) {
    if (l.geos.length === 1) { const m = new THREE.Mesh(l.geos[0], l.m); m.castShadow = l.cast; m.receiveShadow = l.recv; g.add(m); continue }
    const geo = mergeGeometries(l.geos)
    for (const x of l.geos) x.dispose()
    if (!geo) continue
    const m = new THREE.Mesh(geo, l.m)
    m.castShadow = l.cast; m.receiveShadow = l.recv
    g.add(m)
  }
}

export class VillageScene {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  private soleil: THREE.DirectionalLight
  private hemi: THREE.HemisphereLight
  private horloge = new THREE.Clock()
  private raf = 0
  private obs: ResizeObserver

  private groupeBat = new THREE.Group()
  private groupeDecor = new THREE.Group()
  private cliquables: THREE.Object3D[] = []
  private emetteurs: { p: THREE.Vector3; t: number }[] = []
  private bouffees: Bouffee[] = []
  private rotatifs: THREE.Object3D[] = []
  private collisions: Collision[] = []
  private anneau: THREE.Mesh
  private signature = ''
  private signatureDecor = ''
  private saison: Saison = 'ete'
  /** couleurs d'origine du sol et matériaux du décor à reteinter selon la saison */
  private sol: { geo: THREE.BufferGeometry; base: Float32Array; loin: Float32Array } | null = null
  private saisonniers: { m: THREE.MeshStandardMaterial; base: number; t: Partial<Record<Saison, number | [number, number]>> }[] = []
  private neige: THREE.Points | null = null
  private R = 12
  private entree = 0           // x de la porte sud, d'où part la balade

  mode: Mode = 'maquette'
  private yaw = 0
  private pitch = -0.05
  private touches = new Set<string>()
  private joy = { x: 0, y: 0 }
  private pas = 0
  private cible: THREE.Vector3 | null = null
  /** position au sol du joueur en balade, et son personnage (vue à la 3e personne) */
  private pos = new THREE.Vector3()
  private moi: Perso | null = null
  troisieme = true
  private vitesse = 0
  private boites: THREE.Box3[] = []
  private autres = new Map<string, Autre>()
  private tEnvoi = 0
  private envoiForce = false
  onBouge?: (p: Position) => void
  onAutres?: (n: number) => void

  private heure = 0.42          // 0 = minuit, 0,5 = midi
  private anim: { de: number; a: number; t: number; duree: number } | null = null

  onSelect?: (s: Selection | null) => void
  onHover?: (nom: string | null, x: number, y: number) => void

  private ptr: { id: number; x: number; y: number; bouge: number } | null = null
  private dernierSurvol = 0

  /** réglage choisi, et niveau réellement appliqué (0 basse … 2 haute) */
  private reglage: Graphismes = 'auto'
  private niveau = 2
  /** prévient quand le mode auto change de niveau (pour l'afficher et s'en souvenir) */
  onNiveau?: (niveau: number) => void

  constructor(private conteneur: HTMLElement, opts: { graphismes?: Graphismes; niveauAuto?: number | null } = {}) {
    this.reglage = opts.graphismes ?? 'auto'
    this.niveau = this.reglage !== 'auto' ? NIVEAUX.findIndex(n => n.nom === this.reglage)
      : opts.niveauAuto ?? niveauDepart()
    // anticrénelage matériel seulement en qualité haute, et pas sur écran haute densité où il coûte cher pour un gain invisible
    this.renderer = new THREE.WebGLRenderer({ antialias: this.niveau === 2 && window.devicePixelRatio < 1.5, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    // la scène bouge peu : les ombres sont recalculées quelques fois par seconde, pas à chaque image
    this.renderer.shadowMap.autoUpdate = false
    this.renderer.shadowMap.needsUpdate = true
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    conteneur.appendChild(this.renderer.domElement)
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.style.touchAction = 'none'

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600)
    this.camera.rotation.order = 'YXZ'
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.maxPolarAngle = 1.38
    this.controls.minDistance = 6
    this.controls.maxDistance = 160
    this.controls.screenSpacePanning = false

    this.hemi = new THREE.HemisphereLight(0xcfe3f5, 0x5d6b45, 1)
    this.scene.add(this.hemi)
    this.soleil = new THREE.DirectionalLight(0xfff1d8, 2.6)
    this.soleil.castShadow = true
    this.soleil.shadow.mapSize.set(2048, 2048)
    this.soleil.shadow.bias = -0.0004
    this.soleil.shadow.normalBias = 0.03
    this.scene.add(this.soleil, this.soleil.target)
    this.scene.fog = new THREE.Fog(0x9cc3e0, 90, 320)

    this.scene.add(this.groupeDecor, this.groupeBat)

    this.anneau = new THREE.Mesh(
      new THREE.RingGeometry(2.0 * ECHELLE, 2.3 * ECHELLE, 40),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    )
    this.anneau.rotation.x = -Math.PI / 2
    this.anneau.visible = false
    this.scene.add(this.anneau)

    const geoB = new THREE.IcosahedronGeometry(0.3, 0)
    for (let i = 0; i < 70; i++) {
      const m = new THREE.Mesh(geoB, new THREE.MeshStandardMaterial({ color: 0xd6d9dc, transparent: true, opacity: 0, roughness: 1, depthWrite: false }))
      m.visible = false
      this.scene.add(m)
      this.bouffees.push({ m, vie: 0, actif: false, dx: 0 })
    }

    this.appliquerHeure(this.heure)
    this.obs = new ResizeObserver(() => this.redim())
    this.obs.observe(conteneur)
    this.redim()

    const c = this.renderer.domElement
    c.addEventListener('pointerdown', this.pDown)
    c.addEventListener('pointermove', this.pMove)
    c.addEventListener('pointerup', this.pUp)
    c.addEventListener('pointercancel', this.pUp)
    c.addEventListener('pointerleave', this.pLeave)
    window.addEventListener('keydown', this.kDown)
    window.addEventListener('keyup', this.kUp)
    window.addEventListener('blur', this.razTouches)

    this.creerNeige()
    this.appliquerNiveau()
    this.boucle()
  }

  /* ───────── Construction du village ───────── */
  setVillage(ordre: string[], empl: string[], chantiers: string[] = []) {
    const sig = ordre.join(',') + '|' + empl.join(',') + '|' + chantiers.join(',')
    if (sig === this.signature) return
    const premier = this.signature === ''
    this.signature = sig

    // vider
    for (const o of [...this.groupeBat.children]) { this.groupeBat.remove(o); this.libérer(o) }
    this.cliquables = []; this.emetteurs = []; this.rotatifs = []; this.collisions = []

    // les défenses (palissade, muraille, fossé, portes) forment l'enceinte ; le reste occupe les parcelles
    const items = ordre.map((id, i) => ({ id, i, b: BI[id] })).filter(x => x.b)
    const parcelles = items.filter(x => !ENCEINTE.includes(x.b.shape))
    const defenses = items.filter(x => ENCEINTE.includes(x.b.shape))
    const matsLot = [0x9a8463, 0x92805f].map(color => new THREE.MeshStandardMaterial({ color, roughness: 1 }))
    // un chantier occupe la parcelle où son bâtiment apparaîtra une fois terminé
    const enChantier = chantiers.map((id, k) => ({ id, k, b: BI[id] })).filter(x => x.b)
    const chantiersParcelle = enChantier.filter(x => !ENCEINTE.includes(x.b.shape))
    const chantiersEnceinte = enChantier.filter(x => ENCEINTE.includes(x.b.shape))
    const cases = this.cases(parcelles.length + chantiersParcelle.length)
    let anneauMax = 1
    parcelles.forEach(({ id, i, b }, k) => {
      const c = cases[k]
      if (!c) return
      anneauMax = Math.max(anneauMax, Math.max(Math.abs(c.i), Math.abs(c.j)))
      const x = c.i * S, z = c.j * S
      // terrain battu sous le bâtiment
      const lot = new THREE.Mesh(new THREE.PlaneGeometry(4.6 * ECHELLE, 4.6 * ECHELLE), matsLot[i % 3 === 0 ? 0 : 1])
      lot.rotation.x = -Math.PI / 2; lot.position.set(x, 0.015, z); lot.receiveShadow = true
      this.groupeBat.add(lot)

      const g = construireBatiment(id, i + 1)
      g.position.set(x, 0, z)
      g.scale.setScalar(ECHELLE)
      const theta = (x === 0 && z === 0) ? 0 : Math.round(Math.atan2(-x, -z) / (Math.PI / 2)) * (Math.PI / 2)
      g.rotation.y = theta
      g.userData.index = i
      g.userData.id = id
      g.updateMatrixWorld(true)
      for (const p of g.userData.smoke as THREE.Vector3[]) this.emetteurs.push({ p: g.localToWorld(p.clone()), t: Math.random() * 2 })
      this.rotatifs.push(...(g.userData.spin as THREE.Object3D[]))
      const r = rayon(b.shape) * ECHELLE
      if (r) this.collisions.push({ x, z, r })
      this.groupeBat.add(g)
      this.cliquables.push(g)
    })
    const placerChantier = (id: string, k: number, x: number, z: number, theta: number) => {
      const g = construireChantier(id, 500 + k)
      g.position.set(x, 0, z)
      g.scale.setScalar(ECHELLE)
      g.rotation.y = theta
      g.userData.index = INDEX_CHANTIER + k
      g.userData.id = id
      g.userData.chantier = true
      this.collisions.push({ x, z, r: 1.4 * ECHELLE })
      this.groupeBat.add(g)
      this.cliquables.push(g)
    }
    chantiersParcelle.forEach(({ id, k }, n) => {
      const c = cases[parcelles.length + n]
      anneauMax = Math.max(anneauMax, Math.max(Math.abs(c.i), Math.abs(c.j)))
      const x = c.i * S, z = c.j * S
      placerChantier(id, k, x, z, (x === 0 && z === 0) ? 0 : Math.round(Math.atan2(-x, -z) / (Math.PI / 2)) * (Math.PI / 2))
    })

    // rues pavées entre les parcelles : lit de terre + pavés instanciés
    const n = anneauMax
    const LARGEUR = 1.8, PAS = 0.42
    const matChemin = new THREE.MeshStandardMaterial({ color: 0x8c7d64, roughness: 1 })
    // terre battue des rues et des parcelles : un peu enneigée l'hiver
    this.saisonniers = this.saisonniers.filter(x => x.m.userData.decor)
    for (const m of [matChemin, ...matsLot]) this.saisonniers.push({ m, base: m.color.getHex(), t: { hiver: [NEIGE, 0.55], automne: [0x7a5a3a, 0.2] } })
    // enceinte : carré de demi-côté L, une porte par côté sur la rue la plus proche du centre
    const L = (n + 0.5) * S + 2.2, gx = 0.5 * S
    const avecEnceinte = defenses.length > 0
    const lg = avecEnceinte ? 2 * L : (2 * n + 1) * S
    const bandes: { x: number; z: number; horizontal: boolean; lg: number }[] = []
    for (let k = -n; k < n; k++) {
      const off = (k + 0.5) * S
      for (const horizontal of [true, false]) bandes.push({ x: horizontal ? 0 : off, z: horizontal ? off : 0, horizontal, lg })
    }
    // routes qui sortent par les portes
    if (avecEnceinte) {
      const m = L + 5
      bandes.push({ x: gx, z: m, horizontal: false, lg: 10 }, { x: m, z: -gx, horizontal: true, lg: 10 },
        { x: -gx, z: -m, horizontal: false, lg: 10 }, { x: -m, z: gx, horizontal: true, lg: 10 })
    }
    for (const b of bandes) {
      const ch = new THREE.Mesh(new THREE.PlaneGeometry(b.horizontal ? b.lg : LARGEUR, b.horizontal ? LARGEUR : b.lg), matChemin)
      ch.rotation.x = -Math.PI / 2
      ch.position.set(b.x, 0.012, b.z)
      ch.receiveShadow = true
      this.groupeBat.add(ch)
    }
    const nt = Math.floor(LARGEUR / PAS)
    const nbMax = bandes.reduce((t, b) => t + Math.floor(b.lg / PAS) * nt, 0)
    const paves = new THREE.InstancedMesh(new THREE.BoxGeometry(PAS * 0.86, 0.07, PAS * 0.86), matPave, nbMax)
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), ech = new THREE.Vector3(), p = new THREE.Vector3(), coul = new THREE.Color()
    const haut = new THREE.Vector3(0, 1, 0)
    let np = 0
    bandes.forEach((b, ib) => {
      const lg = b.lg, nl = Math.floor(lg / PAS)
      for (let i = 0; i < nl; i++) for (let j = 0; j < nt; j++) {
        const h = Math.sin((ib * 977 + i * 131 + j * 17) * 12.9898) * 43758.5453
        const r = h - Math.floor(h), r2 = (r * 7.31) % 1
        // rangées décalées d'un demi-pavé, comme un appareil en quinconce
        const u = -lg / 2 + (i + 0.5 + (j % 2) * 0.5) * PAS, v = -LARGEUR / 2 + (j + 0.5) * PAS + (LARGEUR - nt * PAS) / 2
        if (u > lg / 2 - PAS * 0.4) continue
        p.set(b.x + (b.horizontal ? u : v), 0.01 + r * 0.015, b.z + (b.horizontal ? v : u))
        q.setFromAxisAngle(haut, (r - 0.5) * 0.25)
        ech.set(0.85 + r2 * 0.25, 1, 0.85 + r * 0.25)
        m4.compose(p, q, ech)
        paves.setMatrixAt(np, m4)
        paves.setColorAt(np, coul.setHex(0xa8a294).multiplyScalar(0.8 + r2 * 0.3))
        np++
      }
    })
    paves.count = np
    paves.receiveShadow = true
    this.groupeBat.add(paves)

    this.R = (n + 0.5) * S
    this.entree = avecEnceinte ? gx : 0
    if (avecEnceinte) {
      const formes = new Set(defenses.map(x => x.b.shape))
      const portes = formes.has('porte'), demi = demiPorte(portes) * ECHELLE
      const vus = new Set<string>()
      for (const { id, i, b } of defenses) {
        // une seule fois par type ; la muraille remplace la palissade
        if (vus.has(b.shape) || (b.shape === 'palissade' && formes.has('mur'))) continue
        vus.add(b.shape)
        const g = construireEnceinte(b.shape, L / ECHELLE, gx / ECHELLE, portes)
        g.scale.setScalar(ECHELLE)
        g.userData.index = i
        g.userData.id = id
        g.userData.ancre = new THREE.Vector3(gx, 0, L)
        this.groupeBat.add(g)
        this.cliquables.push(g)
        if (b.shape === 'palissade' || b.shape === 'mur') {
          for (let t = -L; t <= L; t += 1.1) {
            if (Math.abs(t - gx) < demi) continue
            this.collisions.push({ x: t, z: L, r: 0.7 }, { x: L, z: -t, r: 0.7 }, { x: -t, z: -L, r: 0.7 }, { x: -L, z: t, r: 0.7 })
          }
        }
      }
      this.R = L + (formes.has('fosse') ? 5 : 3)
    }
    // chantiers de défense : matériaux entreposés devant la porte sud
    chantiersEnceinte.forEach(({ id, k }, n) => {
      const Lc = avecEnceinte ? L : this.R
      placerChantier(id, k, this.entree + (n % 2 ? -1 : 1) * (7 + Math.floor(n / 2) * 6), Lc + 6, 0)
    })
    const sc = this.soleil.shadow.camera
    sc.left = sc.bottom = -(this.R + 8); sc.right = sc.top = this.R + 8; sc.near = 1; sc.far = 300
    sc.updateProjectionMatrix()

    this.regrouper()
    fusionnerStatiques(this.groupeBat, this.cliquables)
    this.boites = this.cliquables.filter(g => !g.userData.ancre).map(g => new THREE.Box3().setFromObject(g))
    this.decor(empl)
    this.materiaux(this.groupeBat); this.materiaux(this.groupeDecor); this.alleger()
    this.setSaison(this.saison)
    if (premier) this.cadrer()
  }

  /* ───────── Saisons ───────── */
  setSaison(s: Saison) {
    this.saison = s
    appliquerSaison(s)
    const c = new THREE.Color()
    for (const x of this.saisonniers) teinteSaison(x.base, s, x.m.color, x.t)
    if (this.sol) {
      const { geo, base, loin } = this.sol
      const col = geo.attributes.color as THREE.BufferAttribute
      const neige = new THREE.Color(NEIGE), roux = new THREE.Color(0.58, 0.5, 0.28), tendre = new THREE.Color(0.42, 0.64, 0.32)
      for (let i = 0; i < col.count; i++) {
        c.setRGB(base[i * 3], base[i * 3 + 1], base[i * 3 + 2])
        const v = (base[i * 3 + 1] - 0.5) * 0.6
        if (s === 'hiver') c.lerp(neige, 0.82 + loin[i] * 0.1).offsetHSL(0, 0, v * 0.5)
        else if (s === 'automne') c.lerp(roux, 0.45 + v)
        else if (s === 'printemps') c.lerp(tendre, 0.35)
        col.setXYZ(i, c.r, c.g, c.b)
      }
      col.needsUpdate = true
    }
    if (this.neige) this.neige.visible = s === 'hiver' && !reduit
    this.appliquerHeure(this.heure)
    this.renderer.shadowMap.needsUpdate = true
  }
  /** flocons qui tombent autour de la caméra */
  private creerNeige() {
    const n = 1800, pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 80; pos[i * 3 + 1] = Math.random() * 40; pos[i * 3 + 2] = (Math.random() - 0.5) * 80 }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const m = new THREE.PointsMaterial({ color: 0xffffff, size: 0.22, transparent: true, opacity: 0.85, depthWrite: false })
    this.neige = new THREE.Points(geo, m)
    this.neige.frustumCulled = false
    this.neige.visible = false
    this.scene.add(this.neige)
  }
  private fairetomberNeige(dt: number, t: number) {
    const n = this.neige
    if (!n?.visible) return
    const centre = this.mode === 'balade' ? this.pos : this.controls.target
    n.position.set(centre.x, 0, centre.z)
    const a = n.geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0, n = Math.min(a.count, n0(this.neige)); i < n; i++) {
      let y = a.getY(i) - dt * (2 + (i % 5) * 0.35)
      if (y < 0) y += 40
      a.setY(i, y)
      a.setX(i, a.getX(i) + Math.sin(t * 0.8 + i) * dt * 0.4)
    }
    a.needsUpdate = true
  }

  /**
   * Regroupe les meshes immobiles de tous les bâtiments par matériau : quelques dizaines d'appels de rendu
   * pour tout le village au lieu de plusieurs centaines. Les meshes d'origine passent sur un calque
   * que la caméra ne dessine pas et restent utilisés pour le clic ; les parties animées ne bougent pas.
   */
  private regrouper() {
    this.groupeBat.updateMatrixWorld(true)
    const lots = new Map<string, { m: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }>()
    for (const g of this.cliquables) g.traverse(o => {
      const m = o as THREE.Mesh
      if (!m.isMesh || Array.isArray(m.material)) return
      for (let p: THREE.Object3D | null = m; p && p !== g; p = p.parent) if (p.userData.anime) return
      const geo = m.geometry.clone().applyMatrix4(m.matrixWorld)
      const k = m.material.uuid + '|' + m.castShadow
      let l = lots.get(k)
      if (!l) lots.set(k, l = { m: m.material, cast: m.castShadow, geos: [] })
      l.geos.push(geo)
      m.layers.set(CALQUE_CLIC)
    })
    for (const l of lots.values()) {
      const geo = mergeGeometries(l.geos)
      for (const x of l.geos) x.dispose()
      if (!geo) continue
      const m = new THREE.Mesh(geo, l.m)
      m.castShadow = l.cast; m.receiveShadow = true
      this.groupeBat.add(m)
    }
  }

  private cases(n: number) {
    const out: { i: number; j: number }[] = []
    let r = 0
    while (out.length < n) {
      const ring: { i: number; j: number; a: number }[] = []
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) if (Math.max(Math.abs(i), Math.abs(j)) === r) ring.push({ i, j, a: Math.atan2(j, i) })
      ring.sort((p, q) => p.a - q.a)
      out.push(...ring)
      r++
    }
    return out
  }

  private decor(empl: string[]) {
    const sig = empl.join(',') + '|' + this.R + '|' + this.entree
    if (sig === this.signatureDecor) return
    this.signatureDecor = sig
    for (const o of [...this.groupeDecor.children]) { this.groupeDecor.remove(o); this.libérer(o) }

    const R = this.R
    // point d'arrivée de la balade et route d'accès : pas d'arbre ni de rocher dans les pattes
    const ex = this.entree
    const degage = (x: number, z: number) => Math.hypot(x - ex, z - (R + 4)) < 8 || (Math.abs(x - ex) < 4 && z > R - 4 && z < R + 14)
    const alea = (k: number) => { const x = Math.sin(k * 91.17 + 3.3) * 43758.5453; return x - Math.floor(x) }

    // sol vallonné, plat dans le village
    const sol = new THREE.PlaneGeometry(420, 420, 90, 90)
    sol.rotateX(-Math.PI / 2)
    const pos = sol.attributes.position as THREE.BufferAttribute
    const couleurs: number[] = []
    const c = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i)
      const d = Math.hypot(x, z)
      const loin = THREE.MathUtils.smoothstep(d, R + 6, R + 40)
      const h = loin * (Math.sin(x * 0.07) * Math.cos(z * 0.06) * 2.2 + Math.sin(x * 0.021 + z * 0.03) * 3.5 + 1.5)
      pos.setY(i, h - 0.02)
      const v = alea(i) * 0.08
      c.setRGB(0.42 + v - loin * 0.06, 0.55 + v - loin * 0.04, 0.33 + v * 0.5)
      couleurs.push(c.r, c.g, c.b)
    }
    sol.setAttribute('color', new THREE.Float32BufferAttribute(couleurs, 3))
    const loins = new Float32Array(pos.count)
    for (let i = 0; i < pos.count; i++) loins[i] = THREE.MathUtils.smoothstep(Math.hypot(pos.getX(i), pos.getZ(i)), R + 6, R + 40)
    this.sol = { geo: sol, base: new Float32Array(couleurs), loin: loins }
    sol.computeVertexNormals()
    const msol = new THREE.Mesh(sol, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }))
    msol.receiveShadow = true
    this.groupeDecor.add(msol)

    // montagnes
    const nbM = empl.includes('M') ? 26 : 10
    const matRoche = new THREE.MeshStandardMaterial({ color: 0x6f7c88, roughness: 1, flatShading: true })
    const matRoche2 = new THREE.MeshStandardMaterial({ color: 0x5c6773, roughness: 1, flatShading: true })
    const matNeige = new THREE.MeshStandardMaterial({ color: 0xf2f5f8, roughness: 0.8, flatShading: true })
    for (let k = 0; k < nbM; k++) {
      const a = (k / nbM) * Math.PI * 2 + alea(k) * 0.2
      const d = 120 + alea(k + 50) * 70
      const r = 22 + alea(k + 7) * 26
      const h = 32 + alea(k + 13) * 46
      const seg = 6 + Math.floor(alea(k + 3) * 3)
      const rot = alea(k + 21) * Math.PI
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), k % 2 ? matRoche : matRoche2)
      m.position.set(Math.cos(a) * d, h / 2 - 1, Math.sin(a) * d)
      m.rotation.y = rot
      const kNeige = 0.34
      const n = new THREE.Mesh(new THREE.ConeGeometry(r * kNeige * 1.02, h * kNeige, seg), matNeige)
      n.position.set(m.position.x, h - 1 - (h * kNeige) / 2 + 0.05, m.position.z)
      n.rotation.y = rot
      this.groupeDecor.add(m, n)
    }

    // forêt (instanciée)
    const avecForet = empl.includes('F')
    const nbArbres = avecForet ? 520 : 140
    const tronc = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.24, 1.2, 5), new THREE.MeshStandardMaterial({ color: 0x5a3d26, flatShading: true }), nbArbres)
    const bas = new THREE.InstancedMesh(new THREE.ConeGeometry(1.6, 3.2, 6), new THREE.MeshStandardMaterial({ color: 0x2c573d, flatShading: true }), nbArbres)
    const haut = new THREE.InstancedMesh(new THREE.ConeGeometry(1.15, 2.4, 6), new THREE.MeshStandardMaterial({ color: 0x3a6f4f, flatShading: true }), nbArbres)
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3()
    let placés = 0
    for (let k = 0; placés < nbArbres && k < nbArbres * 4; k++) {
      // la forêt occupe surtout un côté (lisière), plus quelques arbres épars ailleurs
      let a = alea(k * 3 + 1) * Math.PI * 2
      if (avecForet && k % 4 !== 0) a = Math.PI * 0.55 + (alea(k * 3 + 1) - 0.5) * Math.PI * 1.1
      const d = R + 5 + Math.pow(alea(k * 3 + 2), 0.7) * 70
      const x = Math.cos(a) * d, z = Math.sin(a) * d
      if (degage(x, z)) continue
      const s = 0.8 + alea(k * 3 + 3) * 0.8
      const yh = THREE.MathUtils.smoothstep(d, R + 6, R + 40) * (Math.sin(x * 0.07) * Math.cos(z * 0.06) * 2.2 + Math.sin(x * 0.021 + z * 0.03) * 3.5 + 1.5)
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), alea(k) * 6)
      sc.set(s, s, s)
      p.set(x, yh + 0.6 * s, z); m4.compose(p, q, sc); tronc.setMatrixAt(placés, m4)
      p.set(x, yh + 2.6 * s, z); m4.compose(p, q, sc); bas.setMatrixAt(placés, m4)
      p.set(x, yh + 4.0 * s, z); m4.compose(p, q, sc); haut.setMatrixAt(placés, m4)
      placés++
    }
    for (const im of [tronc, bas, haut]) { im.count = placés; im.castShadow = true; im.receiveShadow = true; this.groupeDecor.add(im) }
    this.foret = { ims: [tronc, bas, haut], n: placés }
    this.saisonniers = this.saisonniers.filter(x => !x.m.userData.decor)
    for (const im of [bas, haut]) {
      const m = im.material as THREE.MeshStandardMaterial
      m.userData.decor = true
      this.saisonniers.push({ m, base: m.color.getHex(), t: { hiver: [NEIGE, 0.4] } })
    }

    // rochers épars
    const matRoc = new THREE.MeshStandardMaterial({ color: 0x8a8579, flatShading: true, roughness: 1 })
    for (let k = 0; k < 40; k++) {
      const a = alea(k + 300) * Math.PI * 2, d = R + 4 + alea(k + 400) * 50
      if (degage(Math.cos(a) * d, Math.sin(a) * d)) continue
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + alea(k + 500) * 1.4, 0), matRoc)
      r.position.set(Math.cos(a) * d, 0.2, Math.sin(a) * d)
      r.rotation.set(alea(k) * 3, alea(k + 1) * 3, 0)
      r.castShadow = true; r.receiveShadow = true
      this.groupeDecor.add(r)
    }
    // le sol reste à part : ses couleurs changent avec les saisons
    fusionnerStatiques(this.groupeDecor, [msol])
  }

  private libérer(o: THREE.Object3D) {
    o.traverse(c => {
      const m = c as THREE.Mesh
      if (m.isMesh) {
        m.geometry?.dispose()
        // les matériaux partagés (cache) sont conservés ; on libère seulement ceux des parcelles et du décor
        const mats = Array.isArray(m.material) ? m.material : [m.material]
        for (const mt of mats) if (mt && (mt as THREE.Material).userData?.partage !== true && !(mt as THREE.MeshStandardMaterial).flatShading) mt.dispose()
      }
    })
  }

  /* ───────── Caméra ───────── */
  cadrer() {
    const d = this.R * 1.25 + 14
    this.controls.target.set(0, 0, 0)
    this.camera.position.set(d * 0.8, d * 0.75, d)
    this.controls.update()
  }

  setMode(m: Mode) {
    if (m === this.mode) return
    this.mode = m
    this.razTouches()
    if (m === 'balade') {
      this.controls.enabled = false
      this.pos.set(this.entree, 0, this.R + 4)
      this.yaw = 0; this.pitch = -0.15
      this.envoiForce = true
      this.placerCamera()
    } else {
      this.controls.enabled = true
      this.cadrer()
    }
    if (this.moi) this.moi.g.visible = m === 'balade' && this.troisieme
  }

  /** Le personnage du joueur, sans étiquette (les autres le voient avec la même tenue). */
  setMoi(id: string, skin: string) {
    if (this.moi) libererPerso(this.moi)
    this.moi = construirePerso(skin, couleurDe(id))
    this.moi.g.visible = this.mode === 'balade' && this.troisieme
    this.materiaux(this.moi.g)
    this.scene.add(this.moi.g)
  }
  setVue(troisieme: boolean) {
    this.troisieme = troisieme
    if (this.moi) this.moi.g.visible = this.mode === 'balade' && troisieme
    if (this.mode === 'balade') this.placerCamera()
  }

  /** Un autre joueur en balade : créé à la première position reçue, puis suivi en douceur. */
  majAutre(id: string, pseudo: string, p: Position, skin: string) {
    if (![p.x, p.z, p.yaw].every(Number.isFinite)) return
    let a = this.autres.get(id)
    // changement de tenue : on reconstruit le personnage à sa place
    if (a && a.p.skin !== skin) { const { x, z } = a.p.g.position; this.retirerAutre(id); this.majAutre(id, pseudo, { x, z, yaw: p.yaw }, skin); a = this.autres.get(id) }
    if (!a) {
      const perso = construirePerso(skin, couleurDe(id), pseudo.slice(0, 24) || '?')
      perso.g.position.set(p.x, 0, p.z)
      this.materiaux(perso.g)
      this.scene.add(perso.g)
      a = { p: perso, cible: new THREE.Vector3(), yaw: p.yaw, vu: 0 }
      this.autres.set(id, a)
      this.onAutres?.(this.autres.size)
    }
    a.cible.set(p.x, 0, p.z); a.yaw = p.yaw; a.vu = performance.now()
  }
  /** Position du joueur s'il se promène : sert au signal de présence, envoyé même quand l'image est figée. */
  positionBalade(): Position | null {
    if (this.mode !== 'balade') return null
    return { x: +this.pos.x.toFixed(2), z: +this.pos.z.toFixed(2), yaw: +this.yaw.toFixed(3) }
  }
  retirerAutre(id: string) {
    const a = this.autres.get(id)
    if (!a) return
    libererPerso(a.p)
    this.autres.delete(id)
    this.onAutres?.(this.autres.size)
  }
  private suivreAutres(dt: number) {
    const now = performance.now()
    for (const [id, a] of this.autres) {
      // sans nouvelles depuis 20 s : connexion perdue (un départ normal est annoncé par un message « part »)
      if (now - a.vu > 20000) { this.retirerAutre(id); continue }
      const g = a.p.g, avant = g.position.clone()
      g.position.lerp(a.cible, Math.min(1, dt * 8))
      let d = a.yaw + Math.PI - g.rotation.y
      d = Math.atan2(Math.sin(d), Math.cos(d))
      g.rotation.y += d * Math.min(1, dt * 10)
      animerPerso(a.p, dt, avant.distanceTo(g.position) / Math.max(dt, 1e-3))
    }
  }

  /** Caméra : derrière le personnage (3e personne) ou à hauteur des yeux. */
  private placerCamera() {
    const c = this.camera, p = this.pos
    if (!this.troisieme) {
      c.position.set(p.x, HAUTEUR_YEUX + Math.sin(this.pas) * 0.035, p.z)
      c.rotation.set(this.pitch, this.yaw, 0)
      return
    }
    const tete = new THREE.Vector3(p.x, 1.6, p.z)
    const elev = THREE.MathUtils.clamp(0.3 - this.pitch, 0.05, 1.3)
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(elev), Math.sin(elev), Math.cos(this.yaw) * Math.cos(elev))
    // la caméra se rapproche si un bâtiment se trouve entre elle et le personnage
    let dist = 4.2
    const ray = new THREE.Ray(tete, dir), pt = new THREE.Vector3()
    for (const b of this.boites) if (ray.intersectBox(b, pt)) dist = Math.min(dist, Math.max(0.9, pt.distanceTo(tete) - 0.3))
    c.position.copy(tete).addScaledVector(dir, dist)
    c.lookAt(tete.x, tete.y + 0.15, tete.z)
  }

  setJoystick(x: number, y: number) { this.joy.x = x; this.joy.y = y }

  setSelection(index: number | null) {
    const g = index == null ? undefined : this.cliquables.find(o => o.userData.index === index)
    if (!g) { this.anneau.visible = false; return }
    this.anneau.visible = true
    const p = (g.userData.ancre as THREE.Vector3 | undefined) ?? g.position
    this.anneau.position.set(p.x, 0.05, p.z)
    if (this.mode === 'maquette') this.cible = p.clone()
  }

  /** Anime une nuit complète (coucher, nuit, lever) au passage d'un jour. */
  jouerNuit() {
    if (reduit) return
    this.anim = { de: this.heure, a: this.heure + 1, t: 0, duree: 6 }
  }
  setNuit(nuit: boolean) {
    this.anim = { de: this.heure, a: nuit ? (this.heure < 0.92 ? 0.92 : this.heure) : (this.heure > 0.5 ? 1.42 : 0.42), t: 0, duree: reduit ? 0.01 : 2 }
  }
  get estNuit() { const e = Math.sin((this.heure - 0.25) * Math.PI * 2); return e < 0 }

  private appliquerHeure(t: number) {
    this.heure = ((t % 1) + 1) % 1
    const az = (this.heure - 0.25) * Math.PI * 2
    const elev = Math.sin(az)
    const jour = THREE.MathUtils.smoothstep(elev, -0.12, 0.28)
    const crep = Math.max(0, 1 - Math.abs(elev) / 0.3) * (1 - Math.abs(jour - 0.5) * 0.6)

    const dir = new THREE.Vector3(Math.cos(az) * 0.8, Math.max(Math.abs(elev), 0.18), 0.55).normalize()
    if (elev < 0) dir.x *= -1
    this.soleil.position.copy(dir.multiplyScalar(90))
    this.soleil.target.position.set(0, 0, 0)

    const cJour = new THREE.Color(CIEL[this.saison]), cNuit = new THREE.Color(0x0a1424), cCrep = new THREE.Color(0xe39a6a)
    const ciel = cNuit.clone().lerp(cJour, jour).lerp(cCrep, crep * 0.55)
    this.scene.background = ciel
    ;(this.scene.fog as THREE.Fog).color.copy(ciel)

    const soleilC = new THREE.Color(0xffb27a).lerp(new THREE.Color(0xfff1da), THREE.MathUtils.clamp(elev * 2, 0, 1))
    const luneC = new THREE.Color(0x8ea6d6)
    this.soleil.color.copy(luneC.clone().lerp(soleilC, jour))
    this.soleil.intensity = 0.35 + jour * (this.saison === 'hiver' ? 1.9 : 2.3)
    this.hemi.intensity = 0.28 + jour * 0.8
    this.hemi.color.copy(new THREE.Color(0x40557a).lerp(new THREE.Color(0xcfe3f5), jour))
    matFenetre.emissiveIntensity = (1 - jour) * 1.8
  }

  /* ───────── Entrées ───────── */
  private ndc(x: number, y: number) {
    const r = this.renderer.domElement.getBoundingClientRect()
    return new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1)
  }
  private viser(x: number, y: number): THREE.Object3D | null {
    const rc = new THREE.Raycaster()
    rc.layers.enableAll()
    rc.setFromCamera(this.ndc(x, y), this.camera)
    const hit = rc.intersectObjects(this.cliquables, true)[0]
    if (!hit) return null
    let o: THREE.Object3D | null = hit.object
    while (o && o.userData.index === undefined) o = o.parent
    return o
  }
  private pDown = (e: PointerEvent) => {
    this.ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, bouge: 0 }
    if (this.mode === 'balade') this.renderer.domElement.setPointerCapture(e.pointerId)
  }
  private pMove = (e: PointerEvent) => {
    if (this.ptr && this.ptr.id === e.pointerId) {
      const dx = e.clientX - this.ptr.x, dy = e.clientY - this.ptr.y
      this.ptr.bouge += Math.abs(dx) + Math.abs(dy)
      this.ptr.x = e.clientX; this.ptr.y = e.clientY
      if (this.mode === 'balade') {
        const k = e.pointerType === 'touch' ? 0.006 : 0.0045
        this.yaw -= dx * k
        this.pitch = THREE.MathUtils.clamp(this.pitch - dy * k, -1.2, 1.0)
      }
      return
    }
    if (e.pointerType === 'mouse' && this.onHover) {
      const now = performance.now()
      if (now - this.dernierSurvol < 70) return
      this.dernierSurvol = now
      const o = this.viser(e.clientX, e.clientY)
      this.renderer.domElement.style.cursor = o ? 'pointer' : (this.mode === 'balade' ? 'grab' : 'default')
      const nom = o ? BI[o.userData.id]?.nom ?? null : null
      this.onHover(nom && o?.userData.chantier ? `Chantier : ${nom}` : nom, e.clientX, e.clientY)
    }
  }
  private pUp = (e: PointerEvent) => {
    if (!this.ptr || this.ptr.id !== e.pointerId) return
    const clic = this.ptr.bouge < 8
    this.ptr = null
    if (clic && e.type === 'pointerup') {
      const o = this.viser(e.clientX, e.clientY)
      this.onSelect?.(o ? { index: o.userData.index, id: o.userData.id, chantier: !!o.userData.chantier } : null)
    }
  }
  private pLeave = () => { this.onHover?.(null, 0, 0) }
  private kDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
    const k = e.key.toLowerCase()
    // A / E tournent la caméra dans les deux modes ; le reste ne sert qu'en balade
    if (k === 'a' || k === 'e') { if (this.actif && this.conteneur.isConnected) this.touches.add(k); return }
    if (this.mode !== 'balade') return
    if (['z', 'w', 's', 'q', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) {
      this.touches.add(k)
      if (k.startsWith('arrow')) e.preventDefault()
    }
  }
  private kUp = (e: KeyboardEvent) => { this.touches.delete(e.key.toLowerCase()) }
  private razTouches = () => { this.touches.clear(); this.joy = { x: 0, y: 0 } }

  /* ───────── Boucle ───────── */
  private redim() {
    const w = this.conteneur.clientWidth || 1, h = this.conteneur.clientHeight || 1
    // plafond de pixels dessinés (plein écran sur écran haute densité), puis réglage selon la fluidité
    const n = NIVEAUX[this.niveau]
    const ratio = Math.min(window.devicePixelRatio, n.dpr, Math.sqrt(n.budget / (w * h))) * this.qualite
    this.renderer.setPixelRatio(Math.max(0.5, ratio))
    this.renderer.setSize(w, h)
    this.renderer.shadowMap.needsUpdate = true
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private actif = true
  /** Met la scène en pause quand l'onglet Village n'est pas affiché. */
  setActif(a: boolean) { this.actif = a; if (a) { this.horloge.getDelta(); this.mesure = { t: 0, n: 0, bons: 0 }; this.debut = performance.now(); this.redim() } }

  /* Résolution adaptative : baisse si les images mettent trop de temps, remonte quand c'est fluide. */
  private qualite = 1
  private mesure = { t: 0, n: 0, bons: 0 }
  private tOmbre = 0
  private lents = 0
  private debut = performance.now()
  private ajusterQualite(brut: number) {
    // les premières secondes (construction du village, compilation) ne reflètent pas la fluidité
    if (performance.now() - this.debut < 4000) return
    const m = this.mesure
    m.t += brut; m.n++
    if (m.t < 1) return
    const ms = m.t / m.n * 1000
    m.t = 0; m.n = 0
    const min = NIVEAUX[this.niveau].min
    // au niveau bas, si l'on ne tient pas 60 images/s, on se cale sur 30 bien régulières
    if (this.niveau === 0 && !this.cap30 && ms > 20 && this.qualite <= min) { this.cap30 = true; m.bons = 0; return }
    const lent = this.cap30 ? 42 : 28, rapide = this.cap30 ? 36 : 18
    if (ms > lent && this.qualite > min) { this.qualite = Math.max(min, this.qualite * 0.88); m.bons = 0; this.lents = 0; this.redim() }
    else if (ms < rapide && this.qualite < 1 && ++m.bons >= 3) { this.qualite = Math.min(1, this.qualite * 1.15); m.bons = 0; this.redim() }
    // en auto : si c'est encore lent à la résolution minimale pendant 3 s, on passe au niveau inférieur
    else if (ms > lent + 2 && this.reglage === 'auto' && this.niveau > 0 && ++this.lents >= 3) {
      this.lents = 0
      this.niveau--
      this.qualite = 1
      this.appliquerNiveau()
      this.onNiveau?.(this.niveau)
    }
  }

  /** Matériaux simplifiés au niveau bas, réalistes sinon, pour tout ce qui est sous `racine`. */
  private materiaux(racine: THREE.Object3D) {
    const simple = this.niveau === 0
    racine.traverse(o => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const conv = (x: THREE.Material) => simple ? lambert(x) : versStandard.get(x) ?? x
      m.material = Array.isArray(m.material) ? m.material.map(conv) : conv(m.material)
    })
  }
  /** au niveau bas : moitié moins d'arbres dans la forêt lointaine */
  private foret: { ims: THREE.InstancedMesh[]; n: number } | null = null
  private alleger() {
    if (this.foret) for (const im of this.foret.ims) im.count = this.niveau === 0 ? Math.floor(this.foret.n * 0.5) : this.foret.n
  }
  /** au niveau bas, une image sur deux si la machine ne tient pas 60 images/s : plus régulier que des à-coups */
  private cap30 = false
  private dernierRendu = 0

  get niveauActuel() { return this.niveau }
  setGraphismes(g: Graphismes) {
    this.reglage = g
    this.niveau = g === 'auto' ? this.niveau : NIVEAUX.findIndex(n => n.nom === g)
    this.qualite = 1; this.lents = 0; this.cap30 = false
    this.appliquerNiveau()
  }
  private appliquerNiveau() {
    const n = NIVEAUX[this.niveau]
    const ombres = n.ombres > 0
    this.materiaux(this.scene)
    if (this.renderer.shadowMap.enabled !== ombres) {
      this.renderer.shadowMap.enabled = ombres
      // les matériaux doivent être recompilés avec ou sans ombres
      this.scene.traverse(o => { const m = (o as THREE.Mesh).material; if (m) for (const x of Array.isArray(m) ? m : [m]) x.needsUpdate = true })
    }
    this.soleil.castShadow = ombres
    this.renderer.shadowMap.type = this.niveau === 2 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap
    if (ombres && this.soleil.shadow.mapSize.x !== n.ombres) {
      this.soleil.shadow.map?.dispose()
      this.soleil.shadow.map = null as unknown as THREE.WebGLRenderTarget
      this.soleil.shadow.mapSize.set(n.ombres, n.ombres)
    }
    if (this.neige) this.neige.geometry.setDrawRange(0, n.flocons)
    if (this.niveau !== 0) this.cap30 = false
    this.alleger()
    this.mesure = { t: 0, n: 0, bons: 0 }
    this.redim()
  }

  private boucle = () => {
    this.raf = requestAnimationFrame(this.boucle)
    if (!this.actif) return
    if (this.cap30) {
      const now = performance.now()
      if (now - this.dernierRendu < 30) return
      this.dernierRendu = now
    }
    const brut = this.horloge.getDelta()
    const dt = Math.min(brut, 0.05)
    this.ajusterQualite(brut)
    const t = this.horloge.elapsedTime

    if (this.anim) {
      this.anim.t += dt
      const k = Math.min(1, this.anim.t / this.anim.duree)
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
      this.appliquerHeure(this.anim.de + (this.anim.a - this.anim.de) * e)
      if (k >= 1) this.anim = null
    }

    const tour = (this.touches.has('a') ? 1 : 0) - (this.touches.has('e') ? 1 : 0)
    if (this.mode === 'balade') {
      this.yaw += tour * dt * 1.8
      this.deplacer(dt)
    } else {
      if (tour) {
        // orbite autour du point visé
        const c = this.controls.target, p = this.camera.position, a = tour * dt * 1.2
        const dx = p.x - c.x, dz = p.z - c.z
        p.x = c.x + dx * Math.cos(a) - dz * Math.sin(a)
        p.z = c.z + dx * Math.sin(a) + dz * Math.cos(a)
      }
      if (this.cible) {
        this.controls.target.lerp(this.cible, Math.min(1, dt * 4))
        if (this.controls.target.distanceTo(this.cible) < 0.05) this.cible = null
      }
      this.controls.update()
    }

    this.suivreAutres(dt)
    if (!reduit) {
      for (const r of this.rotatifs) r.rotation.z += dt * 0.7
      this.fumees(dt)
      this.fairetomberNeige(dt, t)
    }
    if (this.anneau.visible) {
      const s = 1 + Math.sin(t * 3) * 0.05
      this.anneau.scale.set(s, s, s)
    }
    this.tOmbre += dt
    if (this.renderer.shadowMap.enabled && this.tOmbre > NIVEAUX[this.niveau].tOmbre) { this.tOmbre = 0; this.renderer.shadowMap.needsUpdate = true }
    this.renderer.render(this.scene, this.camera)
  }

  private deplacer(dt: number) {
    const has = (...k: string[]) => k.some(x => this.touches.has(x))
    let av = (has('z', 'w', 'arrowup') ? 1 : 0) - (has('s', 'arrowdown') ? 1 : 0) + this.joy.y
    let dr = (has('d', 'arrowright') ? 1 : 0) - (has('q', 'arrowleft') ? 1 : 0) + this.joy.x
    const len = Math.hypot(av, dr)
    if (len > 1) { av /= len; dr /= len }
    const vit = (has('shift') ? 8 : 4.2) * dt
    const p = this.pos, avant = p.clone()
    if (len > 0.01) {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw)
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw)
      p.x += (fx * av + rx * dr) * vit
      p.z += (fz * av + rz * dr) * vit
      this.pas += vit * 2.2
      for (const c of this.collisions) {
        const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), min = c.r + 0.35
        if (d < min && d > 0.0001) { p.x = c.x + dx / d * min; p.z = c.z + dz / d * min }
      }
      const lim = this.R + 30, d = Math.hypot(p.x, p.z)
      if (d > lim) { p.x *= lim / d; p.z *= lim / d }
    }
    this.vitesse = avant.distanceTo(p) / Math.max(dt, 1e-3)
    this.placerCamera()
    if (this.moi) {
      this.moi.g.position.copy(p)
      this.moi.g.rotation.y = this.yaw + Math.PI
      animerPerso(this.moi, dt, this.vitesse)
    }
    // diffusion : 10 fois par seconde en mouvement, une fois par seconde à l'arrêt
    this.tEnvoi += dt
    const bouge = this.vitesse > 0.05 || this.touches.has('a') || this.touches.has('e')
    if (this.envoiForce || this.tEnvoi > (bouge ? 0.1 : 1)) {
      this.tEnvoi = 0; this.envoiForce = false
      this.onBouge?.({ x: +p.x.toFixed(2), z: +p.z.toFixed(2), yaw: +this.yaw.toFixed(3) })
    }
  }

  private fumees(dt: number) {
    for (const e of this.niveau === 0 ? [] : this.emetteurs) {
      e.t -= dt
      if (e.t <= 0) {
        e.t = 0.8 + Math.random() * 0.6
        const b = this.bouffees.find(x => !x.actif)
        if (b) { b.actif = true; b.vie = 0; b.dx = (Math.random() - 0.3) * 0.5; b.m.position.copy(e.p); b.m.visible = true }
      }
    }
    for (const b of this.bouffees) {
      if (!b.actif) continue
      b.vie += dt / 3.2
      if (b.vie >= 1) { b.actif = false; b.m.visible = false; continue }
      b.m.position.y += dt * 0.55
      b.m.position.x += dt * b.dx
      const s = 0.6 + b.vie * 1.6
      b.m.scale.set(s, s, s)
      ;(b.m.material as THREE.MeshStandardMaterial).opacity = 0.5 * (1 - b.vie)
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    for (const id of [...this.autres.keys()]) this.retirerAutre(id)
    if (this.moi) libererPerso(this.moi)
    if (this.neige) { this.neige.geometry.dispose(); (this.neige.material as THREE.Material).dispose() }
    this.obs.disconnect()
    const c = this.renderer.domElement
    c.removeEventListener('pointerdown', this.pDown)
    c.removeEventListener('pointermove', this.pMove)
    c.removeEventListener('pointerup', this.pUp)
    c.removeEventListener('pointercancel', this.pUp)
    c.removeEventListener('pointerleave', this.pLeave)
    window.removeEventListener('keydown', this.kDown)
    window.removeEventListener('keyup', this.kUp)
    window.removeEventListener('blur', this.razTouches)
    this.controls.dispose()
    this.renderer.dispose()
    c.remove()
  }
}
