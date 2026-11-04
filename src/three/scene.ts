import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { BI } from '../data/catalogue'
import { construireLigne, demiPorte, ECHELLE, ENCEINTE, matFenetre, matEau, rayon, appliquerSaison, teinteSaison, NEIGE } from './batiments'
import { construireBatiment, construireChantier } from './modeles'
import type { Saison } from '../logic/calendrier'
import { cleCase, sousCase, dansLaRoche, type Case, type Plan } from '../logic/plan'
import { PALISSADES, ROUTE_PLAINES, ROUTE_NORD, LARGEUR_RIVIERE, CHAMPS, MONTAGNES, ESPACEMENT, horsVallee, casePiedMont, montagneContre, distLigne, dansPolygone, type P } from '../logic/carte'
import { ajouterLigne, fusionLignes, ruban, construirePont, croiserRiviere, passagesRiviere, distRiviereLisse, hauteurSol, versVallee, adoucir, COURS, S, TAILLE_SOL, CARREAUX_SOL } from './terrain'
import { construirePerso, animerPerso, libererPerso, couleurDe, type Perso } from './perso'

export type Mode = 'maquette' | 'balade'
/** Position diffusée aux autres joueurs pendant la balade. */
export interface Position { x: number; z: number; yaw: number }
interface Autre { p: Perso; cible: THREE.Vector3; yaw: number; vu: number }
export interface Selection { index: number; id: string; chantier?: boolean }
/** les chantiers sont numérotés après les bâtiments pour ne pas se mélanger avec leurs index */
const INDEX_CHANTIER = 100000
/** déblais tassés devant une mine ou une carrière */
const matDeblais = new THREE.MeshStandardMaterial({ color: 0x8b7f68, roughness: 1, flatShading: true })
matDeblais.userData.partage = true
/** tas en tronc de pyramide : dessus de demi-côtés ax, az au niveau 0, flancs qui descendent de h en s'évasant */
function tasDeblais(ax: number, az: number, h: number) {
  const e = h * 0.9, haut = [[-ax, -az], [ax, -az], [ax, az], [-ax, az]], bas = [[-ax - e, -az - e], [ax + e, -az - e], [ax + e, az + e], [-ax - e, az + e]]
  const p: number[] = []
  const tri = (a: number[], b: number[], c: number[]) => p.push(...a, ...b, ...c)
  const H = haut.map(([x, z]) => [x, 0, z]), B = bas.map(([x, z]) => [x, -h, z])
  tri(H[0], H[2], H[1]); tri(H[0], H[3], H[2])
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; tri(H[i], H[j], B[j]); tri(H[i], B[j], B[i]) }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
  g.computeVertexNormals()
  return g
}
/** pierre fraîchement taillée des gradins de carrière, plus claire que la roche */
// (visible des deux côtés : l'entaille est une surface qui épouse la paroi)
const matsTaille = [0xbab5aa, 0xa9a397, 0x8f897d].map(color => { const m = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true, side: THREE.DoubleSide }); m.userData.partage = true; return m })

/**
 * Rues du cœur qui ne touchent pas le reste du réseau (une case isolée a son carré de rues à elle) :
 * on les relie par le plus court chemin le long des bords des cases, en évitant les virages et la rivière.
 * rues : arêtes du quadrillage (voir setVillage), modifié sur place.
 */
function relierIlots(rues: Set<string>, PN: { z: number; porte: number }, PS: { z: number; porte: number }) {
  const cle = (a: number, b: number) => a + ',' + b
  const voisins = (k: string): [string, string][] => {
    const [a, b] = k.split(',').map(Number)
    return [[cle(a + 1, b), `h${a},${b}`], [cle(a - 1, b), `h${a - 1},${b}`], [cle(a, b + 1), `v${a},${b}`], [cle(a, b - 1), `v${a},${b - 1}`]]
  }
  const noeuds = () => {
    const n = new Set<string>()
    for (const e of rues) { const [a, b] = e.slice(1).split(',').map(Number); n.add(cle(a, b)); n.add(e[0] === 'h' ? cle(a + 1, b) : cle(a, b + 1)) }
    return n
  }
  // composantes connexes du réseau
  const composantes = () => {
    const tous = noeuds(), vu = new Map<string, number>()
    let c = 0
    for (const n of tous) {
      if (vu.has(n)) continue
      const pile = [n]; vu.set(n, c)
      while (pile.length) { const m = pile.pop()!; for (const [v, e] of voisins(m)) if (rues.has(e) && !vu.has(v)) { vu.set(v, c); pile.push(v) } }
      c++
    }
    return vu
  }
  // le réseau principal : celui de la grande rue, devant la porte nord
  const principal = cle(Math.round(PN.porte + 0.5), 1)
  // bornes : entre les palissades, sans dépasser de plus de quelques cases le village
  const bMin = Math.round(PN.z + 0.5), bMax = Math.round(PS.z + 0.5)
  for (let tour = 0; tour < 30; tour++) {
    const comp = composantes(), cp = comp.get(principal)
    const isole = [...comp.entries()].find(([, c]) => c !== cp)
    if (!isole) return
    const cible = isole[1]
    // Dijkstra depuis tous les nœuds de l'îlot ; état : nœud et direction d'arrivée ; un virage coûte un peu
    type Etat = { n: string; d: number; cout: number; prec: Etat | null; e: string | null }
    const meilleur = new Map<string, number>(), file: Etat[] = []
    for (const [n, c] of comp) if (c === cible) file.push({ n, d: -1, cout: 0, prec: null, e: null })
    let fin: Etat | null = null
    while (file.length) {
      let i = 0
      for (let k = 1; k < file.length; k++) if (file[k].cout < file[i].cout) i = k
      const x = file.splice(i, 1)[0]
      if (comp.get(x.n) === cp) { fin = x; break }
      const k = x.n + '|' + x.d
      if ((meilleur.get(k) ?? Infinity) <= x.cout && x.prec) continue
      meilleur.set(k, x.cout)
      voisins(x.n).forEach(([v, e], d) => {
        const [a, b] = v.split(',').map(Number)
        if (b < bMin || b > bMax || Math.abs(a) > 30) return
        // arête déjà pavée : gratuite ; sinon une case, plus un virage, plus la rivière à franchir
        const [ea, eb] = e.slice(1).split(',').map(Number)
        const mx = (ea - 0.5 + (e[0] === 'h' ? 0.5 : 0)) * S, mz = (eb - 0.5 + (e[0] === 'v' ? 0.5 : 0)) * S
        const cout = x.cout + (rues.has(e) ? 0.05 : 1 + (x.d >= 0 && x.d !== d ? 0.7 : 0) + (distRiviereLisse(mx, mz) < S * 0.3 ? 3 : 0))
        if ((meilleur.get(v + '|' + d) ?? Infinity) > cout) file.push({ n: v, d, cout, prec: x, e })
      })
    }
    if (!fin) return
    for (let x: Etat | null = fin; x; x = x.prec) if (x.e) rues.add(x.e)
  }
}

/* ── Montagnes du décor (logic/carte.ts) en 3D : base au plus bas du sol sous elles, sommet au-dessus ── */
interface Cone { x: number; z: number; r: number; y: number; h: number; seg: number; rot: number; k: number }
let CONES: Cone[] | null = null
function cones(): Cone[] {
  if (CONES) return CONES
  const alea = (k: number) => { const x = Math.sin(k * 91.17 + 3.3) * 43758.5453; return x - Math.floor(x) }
  CONES = MONTAGNES.map(m => {
    const x = m.x * S, z = m.z * S, r = m.r * S, k = m.k
    // la base descend au point le plus bas du sol sous la montagne (côté vallée) : rien ne flotte
    let y = hauteurSol(x, z, m.d) - 4
    const sommet = y + (42 + alea(k + 13) * 46 + Math.min(m.d, 10) * 3) * ESPACEMENT
    for (let a = 0; a < 12; a++) for (const f of [0.55, 1]) y = Math.min(y, hauteurSol(x + Math.cos(a * Math.PI / 6) * r * f, z + Math.sin(a * Math.PI / 6) * r * f) - 1.5)
    return { x, z, r, y, h: sommet - y, seg: m.seg, rot: m.rot, k }
  })
  return CONES
}
/**
 * Flanc du cône c vu depuis (x, z), au niveau du sol : point Q de la face, angle psi de la normale
 * à cette facette, et pente q de la face (recul horizontal par unité de hauteur).
 */
function flanc(c: Cone, x: number, z: number) {
  const psi = Math.atan2(x - c.x, z - c.z), pas = 2 * Math.PI / c.seg
  // les sommets du cône sont aux angles rot + i·pas : la facette i a sa normale au milieu
  const i = Math.floor((((psi - c.rot) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / pas)
  const psiF = c.rot + (i + 0.5) * pas
  const rSol = c.r * (1 - (hauteurSol(x, z) - c.y) / c.h)
  const dist = rSol * Math.cos(Math.PI / c.seg) / Math.cos(psi - psiF)
  // larg : largeur de la facette au niveau du sol ; lat : décalage de Q par rapport au milieu de la facette
  return { qx: c.x + Math.sin(psi) * dist, qz: c.z + Math.cos(psi) * dist, psiF, dist, q: c.r * Math.cos(Math.PI / c.seg) / c.h,
    larg: 2 * rSol * Math.sin(Math.PI / c.seg), lat: dist * Math.sin(psi - psiF) }
}
/** hauteur de la surface du cône c (à facettes, comme il est dessiné) en x, z ; −Infinity hors du cône */
function hauteurCone(c: Cone, x: number, z: number) {
  const d = Math.hypot(x - c.x, z - c.z)
  if (d >= c.r) return -Infinity
  const psi = Math.atan2(x - c.x, z - c.z), pas = 2 * Math.PI / c.seg
  const i = Math.floor((((psi - c.rot) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / pas)
  const t = psi - (c.rot + (i + 0.5) * pas)
  return c.y + c.h * (1 - d * Math.cos(t) / (c.r * Math.cos(Math.PI / c.seg)))
}
/** flanc de la montagne contre laquelle le plan a mis la case de (x, z) (carte.ts, montagneContre), ou null */
function flancContre(x: number, z: number) {
  const m = montagneContre([Math.round(x / S), Math.round(z / S)])
  const c = m && cones().find(c => c.k === m.k)
  return c ? { ...flanc(c, x, z), c } : null
}

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
  /** devant la porte sud : d'où part la balade */
  private depart = new THREE.Vector3()

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
    // au-delà, la caméra serait dans les montagnes qui entourent la vallée
    this.controls.maxDistance = 125 * ESPACEMENT
    this.controls.screenSpacePanning = false

    this.hemi = new THREE.HemisphereLight(0xcfe3f5, 0x5d6b45, 1)
    this.scene.add(this.hemi)
    this.soleil = new THREE.DirectionalLight(0xfff1d8, 2.6)
    this.soleil.castShadow = true
    this.soleil.shadow.mapSize.set(2048, 2048)
    this.soleil.shadow.bias = -0.0004
    this.soleil.shadow.normalBias = 0.03
    this.scene.add(this.soleil, this.soleil.target)
    this.scene.fog = new THREE.Fog(0x9cc3e0, 90 * ESPACEMENT, 320 * ESPACEMENT)

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
  /** plan : case de chaque bâtiment et chantier (logic/plan.ts) */
  setVillage(ordre: string[], empl: string[], plan: Plan) {
    const sig = ordre.join(',') + '|' + empl.join(',') + '|' + JSON.stringify(plan.bat) + JSON.stringify(plan.chantiers)
    if (sig === this.signature) return
    const premier = this.signature === ''
    this.signature = sig

    // vider
    for (const o of [...this.groupeBat.children]) { this.groupeBat.remove(o); this.libérer(o) }
    this.cliquables = []; this.emetteurs = []; this.rotatifs = []; this.collisions = []

    // les défenses (palissade, muraille, fossé, portes) forment l'enceinte ; le reste occupe les cases du plan
    const items = ordre.map((id, i) => ({ id, i, b: BI[id] })).filter(x => x.b)
    const parcelles = plan.bat.map(x => ({ id: x.id, i: x.k, b: BI[x.id], c: x.c, coeur: x.coeur, sc: sousCase(x.s, x.cap) })).filter(x => x.b)
    const defenses = items.filter(x => ENCEINTE.includes(x.b.shape))
    // un chantier occupe la parcelle où son bâtiment apparaîtra une fois terminé
    const enChantier = plan.chantiers.map(x => ({ id: x.id, k: x.k, b: BI[x.id], c: x.c, coeur: x.coeur, sc: sousCase(x.s, x.cap) })).filter(x => x.b)
    const chantiersParcelle = enChantier.filter(x => x.c)
    const chantiersEnceinte = enChantier.filter(x => !x.c)
    // mines et carrières font partie de la montagne : l'entrée (ou le front de taille) est tournée vers la vallée,
    // posée au niveau du sol, et une vraie montagne s'élève juste derrière, son pied collé à l'entrée
    // front de taille d'une carrière, à plat sur la facette de la montagne (pente q, face en zFace au sol,
    // unités du modèle) : une plaque de pierre fraîchement taillée et des banquettes qui dépassent à peine
    // front de taille d'une carrière : une entaille de pierre claire qui épouse la roche, quelles que soient les
    // montagnes qui se touchent là ; chaque point part de la vallée et avance jusqu'à rencontrer la paroi.
    // (px, pz, y0) : pied de la carrière, (nx, nz) : vers la vallée ; deux lignes plus sombres marquent les banquettes
    const entaille = (px: number, pz: number, y0: number, nx: number, nz: number, e: number) => {
      const W = 11 * e / ECHELLE, H = 10 * e / ECHELLE, NU = 11, NV = 9
      const surRoche = (u: number, y: number, sortie: number): [number, number, number] | null => {
        let x = px + nz * u + nx * 0.5 * e, z = pz - nx * u + nz * 0.5 * e
        for (let t = 0; t < 14 * e; t += 0.3) {
          if (this.relief(x, z) >= y) {
            // la paroi est entre le pas précédent (dehors) et celui-ci (dedans) : on l'affine par dichotomie
            let a = 0, b = 0.3
            for (let k = 0; k < 7; k++) { const m = (a + b) / 2; if (this.relief(x + nx * m, z + nz * m) >= y) a = m; else b = m }
            return [x + nx * (b + sortie), y, z + nz * (b + sortie)]
          }
          x -= nx * 0.3; z -= nz * 0.3
        }
        return null
      }
      const bande = (haut: (u: number) => [number, number], sortie: number, m: THREE.Material) => {
        const grille: ([number, number, number] | null)[][] = []
        for (let a = 0; a <= NU; a++) {
          const u = -W / 2 + W * a / NU, [b0, b1] = haut(u), col: ([number, number, number] | null)[] = []
          for (let b = 0; b <= NV; b++) col.push(b1 > b0 ? surRoche(u, y0 + b0 + (b1 - b0) * b / NV, sortie) : null)
          grille.push(col)
        }
        const pos: number[] = []
        for (let a = 0; a < NU; a++) for (let b = 0; b < NV; b++) {
          const p00 = grille[a][b], p10 = grille[a + 1][b], p01 = grille[a][b + 1], p11 = grille[a + 1][b + 1]
          if (p00 && p10 && p11) pos.push(...p00, ...p11, ...p10)
          if (p00 && p11 && p01) pos.push(...p00, ...p01, ...p11)
        }
        if (!pos.length) return
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
        geo.computeVertexNormals()
        const mesh = new THREE.Mesh(geo, m); mesh.receiveShadow = true
        this.groupeBat.add(mesh)
      }
      // contour irrégulier : plus haut au milieu, des dents en haut
      const sommet = (u: number) => H * (1 - 0.55 * (2 * u / W) ** 2) * (0.85 + 0.15 * Math.sin(u * 2.7 + 1))
      bande(u => [0.05, sommet(u)], 0.06, matsTaille[0])
      for (const f of [0.32, 0.62]) bande(u => sommet(u) > H * f + 0.4 ? [H * f - 0.16, H * f + 0.16] : [0, 0], 0.11, matsTaille[2])
    }
    // mines et carrières sont creusées dans une montagne existante : la mine ouvre son entrée dans le flanc,
    // la carrière y taille ses gradins ; l'une comme l'autre face à la facette du cône la plus proche
    const dansRoche = (g: THREE.Object3D, id: string, x: number, z: number, e: number, chantier = false) => {
      const mine = BI[id]?.shape === 'mine'
      // recul : distance de l'origine du modèle derrière la face (négatif : devant)
      const recul = (mine ? 1.2 : -1.0) * e
      const f = flancContre(x, z)
      let nx: number, nz: number, px = x, pz = z
      if (f) {
        nx = Math.sin(f.psiF); nz = Math.cos(f.psiF)
        // on glisse vers le milieu de la facette (au plus 0,7 case) : devant une arête du cône,
        // la paroi fuirait des deux côtés et l'entrée ou le front de taille dépasserait
        const g = Math.max(-0.7 * S, Math.min(0.7 * S, -f.lat))
        px = f.qx - nx * recul + nz * g; pz = f.qz - nz * recul - nx * g
      } else [nx, nz] = versVallee(x, z)
      g.rotation.y = Math.atan2(nx, nz)
      // niveau du sol au pied du flanc, là où s'ouvre l'entrée ; devant, une plate-forme de déblais
      // rattrape la pente (sinon l'avant flotterait et l'entrée serait enterrée)
      const faceL = recul / e, y = hauteurSol(px + nx * recul, pz + nz * recul) - 0.05
      g.position.set(px, y, pz)
      let bas = y
      for (const lx of [-2.6, 0, 2.6]) for (const lz of [faceL, (faceL + 3.2) / 2, 3.2])
        bas = Math.min(bas, hauteurSol(px + (nz * lx + nx * lz) * e, pz + (-nx * lx + nz * lz) * e))
      const h = (y - bas) / e + 0.3
      if (h > 0.4) {
        const tas = new THREE.Mesh(tasDeblais(2.6, (3.2 - faceL) / 2, h), matDeblais)
        tas.position.set(0, 0.01, (faceL + 3.2) / 2); tas.castShadow = true; tas.receiveShadow = true
        g.add(tas)
      }
      if (!mine && !chantier) entaille(px, pz, y, nx, nz, e)
    }
    // pied de chaque bâtiment : d'où partent les chemins de terre, et ce qu'ils contournent ;
    // hx, hz : demi-largeurs de son emprise au sol
    const pieds: { x: number; z: number; hx: number; hz: number; coeur: boolean }[] = []
    const emprise = (g: THREE.Object3D, coeur: boolean) => {
      const b = new THREE.Box3().setFromObject(g)
      pieds.push({ x: (b.min.x + b.max.x) / 2, z: (b.min.z + b.max.z) / 2, hx: (b.max.x - b.min.x) / 2, hz: (b.max.z - b.min.z) / 2, coeur })
    }
    parcelles.forEach(({ id, i, b, c, sc, coeur }) => {
      // les petits bâtiments partagent la case (4 maisons, 2 échoppes) : décalés et un peu plus petits
      const x = (c[0] + sc.dx) * S, z = (c[1] + sc.dz) * S, e = ECHELLE * sc.echelle
      const theta = (c[0] === 0 && c[1] === 0) ? 0 : Math.round(Math.atan2(-c[0], -c[1]) / (Math.PI / 2)) * (Math.PI / 2)
      // posé directement sur l'herbe, sans terrain battu
      const g = construireBatiment(id, i + 1)
      g.position.set(x, 0, z)
      g.scale.setScalar(e)
      g.rotation.y = theta
      if (dansLaRoche(id)) dansRoche(g, id, x, z, e)
      g.userData.index = i
      g.userData.id = id
      g.updateMatrixWorld(true)
      for (const p of g.userData.smoke as THREE.Vector3[]) this.emetteurs.push({ p: g.localToWorld(p.clone()), t: Math.random() * 2 })
      this.rotatifs.push(...(g.userData.spin as THREE.Object3D[]))
      // (une mine ou une carrière a pu glisser contre le flanc de sa montagne)
      const r = rayon(b.shape) * e
      if (r) this.collisions.push({ x: g.position.x, z: g.position.z, r })
      emprise(g, coeur)
      this.groupeBat.add(g)
      this.cliquables.push(g)
    })
    const placerChantier = (id: string, k: number, x: number, z: number, theta: number, echelle = 1) => {
      const g = construireChantier(id, 500 + k)
      g.position.set(x, 0, z)
      g.scale.setScalar(ECHELLE * echelle)
      g.rotation.y = theta
      if (dansLaRoche(id)) dansRoche(g, id, x, z, ECHELLE * echelle, true)
      g.userData.index = INDEX_CHANTIER + k
      g.userData.id = id
      g.userData.chantier = true
      this.collisions.push({ x: g.position.x, z: g.position.z, r: 1.4 * ECHELLE * echelle })
      this.groupeBat.add(g)
      this.cliquables.push(g)
    }
    chantiersParcelle.forEach(({ id, k, c, sc, coeur }) => {
      const x = (c![0] + sc.dx) * S, z = (c![1] + sc.dz) * S
      placerChantier(id, k, x, z, (c![0] === 0 && c![1] === 0) ? 0 : Math.round(Math.atan2(-c![0], -c![1]) / (Math.PI / 2)) * (Math.PI / 2), sc.echelle)
      emprise(this.cliquables[this.cliquables.length - 1], coeur)
    })

    // ── rues pavées : autour de chaque case du cœur, et la grande rue qui relie les deux portes ──
    const LARGEUR = 1.8, PAS = 0.42
    const matChemin = new THREE.MeshStandardMaterial({ color: 0x8c7d64, roughness: 1 })
    const matTerre = new THREE.MeshStandardMaterial({ color: 0x9b8763, roughness: 1 })
    // terre battue des rues et des chemins : enneigée l'hiver
    this.saisonniers = this.saisonniers.filter(x => x.m.userData.decor)
    for (const m of [matChemin]) this.saisonniers.push({ m, base: m.color.getHex(), t: { hiver: [NEIGE, 0.55], automne: [0x7a5a3a, 0.2] } })
    this.saisonniers.push({ m: matTerre, base: matTerre.color.getHex(), t: { hiver: [NEIGE, 0.7], automne: [0x7a5a3a, 0.2] } })
    const PN = PALISSADES.nord, PS = PALISSADES.sud
    const avecEnceinte = defenses.length > 0
    const pave = new Map<string, [number, number][]>()
    const occupees = [...parcelles, ...chantiersParcelle] as { c: Case | null; coeur: boolean }[]
    // les rues suivent les bords des cases : un quadrillage dont les nœuds sont les coins des cases,
    // (x, z) = (a − 0,5 ; b − 0,5) en cases ; une rue est une suite d'arêtes d'un coin au suivant
    const rues = new Set<string>()
    const arete = (a: number, b: number, horiz: boolean) => horiz ? `h${a},${b}` : `v${a},${b}`   // de (a, b) vers (a+1, b) ou (a, b+1)
    const ligne = (x1: number, z1: number, x2: number, z2: number) => {
      const a1 = Math.round(x1 + 0.5), b1 = Math.round(z1 + 0.5), a2 = Math.round(x2 + 0.5), b2 = Math.round(z2 + 0.5)
      if (b1 === b2) for (let a = Math.min(a1, a2); a < Math.max(a1, a2); a++) rues.add(arete(a, b1, true))
      else for (let b = Math.min(b1, b2); b < Math.max(b1, b2); b++) rues.add(arete(a1, b, false))
    }
    let xmin = Math.min(PN.porte, PS.porte), xmax = Math.max(PN.porte, PS.porte)
    for (const { c } of occupees.filter(x => x.coeur && x.c)) {
      const [i, j] = c!
      xmin = Math.min(xmin, i - 0.5); xmax = Math.max(xmax, i + 0.5)
      ligne(i - 0.5, j - 0.5, i + 0.5, j - 0.5); ligne(i - 0.5, j + 0.5, i + 0.5, j + 0.5)
      ligne(i - 0.5, j - 0.5, i - 0.5, j + 0.5); ligne(i + 0.5, j - 0.5, i + 0.5, j + 0.5)
    }
    // grande rue est-ouest (elle franchit la rivière sur un pont), et les rues des deux portes
    ligne(xmin, 0.5, xmax, 0.5)
    ligne(PN.porte, PN.z, PN.porte, 0.5)
    ligne(PS.porte, 0.5, PS.porte, PS.z)
    relierIlots(rues, PN, PS)
    for (const k of rues) {
      const [a, b] = k.slice(1).split(',').map(Number), x = (a - 0.5) * S, z = (b - 0.5) * S
      if (k[0] === 'h') ajouterLigne(pave, x, z, x + S, z); else ajouterLigne(pave, x, z, x, z + S)
    }
    const bandes = fusionLignes(pave).map(({ horizontal, pos, a, b }) => ({ x: horizontal ? (a + b) / 2 : pos, z: horizontal ? pos : (a + b) / 2, horizontal, lg: b - a + LARGEUR }))
    for (const b of bandes) {
      const ch = new THREE.Mesh(new THREE.PlaneGeometry(b.horizontal ? b.lg : LARGEUR, b.horizontal ? LARGEUR : b.lg), matChemin)
      ch.rotation.x = -Math.PI / 2
      ch.position.set(b.x, 0.012, b.z)
      ch.receiveShadow = true
      this.groupeBat.add(ch)
    }
    const nt = Math.floor(LARGEUR / PAS)
    const nbMax = bandes.reduce((t, b) => t + Math.floor(b.lg / PAS) * nt, 0)
    const paves = new THREE.InstancedMesh(new THREE.BoxGeometry(PAS * 0.86, 0.07, PAS * 0.86), matPave, Math.max(1, nbMax))
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
        // pas de pavés dans l'eau : le pont passe au-dessus
        const px = b.x + (b.horizontal ? u : v), pz = b.z + (b.horizontal ? v : u)
        if (distRiviereLisse(px, pz) < LARGEUR_RIVIERE * S / 2 + 0.3) continue
        p.set(px, 0.01 + r * 0.015, pz)
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

    // routes de terre : vers les plaines au sud-ouest, vers les mines au nord ; en courbes douces
    const routes = [ROUTE_PLAINES, ROUTE_NORD].map(r => adoucir(r.map(([x, z]) => [x * S, z * S] as [number, number])))
    for (const r of routes) this.groupeBat.add(ruban(r, 2.4, matTerre, 0.009, true))

    // ── chemins de terre : un réseau libre, comme des sentiers de campagne ──
    // Il part des portes (et de la grande rue entre les palissades) ; chaque bâtiment du dehors s'y raccorde,
    // du plus proche au plus lointain, vers le point le plus proche du réseau déjà tracé : les chemins se ramifient.
    // Chaque chemin est fait de segments droits, avec un ou deux coudes placés au hasard (jamais sur la grille) ;
    // s'il passe sur un autre bâtiment, on tire d'autres coudes pour le contourner.
    const LT = 1.3
    const echantillons = (pts: [number, number][], pas = 2) => {
      const out: [number, number][] = []
      for (let k = 1; k < pts.length; k++) {
        const [ax, az] = pts[k - 1], [bx, bz] = pts[k], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / pas))
        for (let i = 0; i <= n; i++) out.push([ax + (bx - ax) * i / n, az + (bz - az) * i / n])
      }
      return out
    }
    const cote = (z: number) => z < PN.z * S ? 0 : z > PS.z * S ? 2 : 1   // nord, entre les palissades, sud
    // réseau de base : rues pavées et routes ; les chemins tracés s'y ajoutent au fur et à mesure
    const base: [number, number][][] = [
      [...echantillons([[PN.porte * S, PN.z * S], [PN.porte * S, (PN.z - 0.6) * S]]), ...echantillons(routes[1])],
      fusionLignes(pave).flatMap(({ horizontal, pos, a, b }) => echantillons(horizontal ? [[a, pos], [b, pos]] : [[pos, a], [pos, b]])),
      [...echantillons([[PS.porte * S, PS.z * S], [PS.porte * S, (PS.z + 0.6) * S]]), ...echantillons(routes[0])],
    ]
    const reseaux = base.map(r => [...r])
    const proche = (pts: [number, number][], x: number, z: number) => {
      let cible = pts[0], d = Infinity
      for (const p of pts) { const e = Math.hypot(p[0] - x, p[1] - z); if (e < d) { d = e; cible = p } }
      return { cible, d }
    }
    const sentiers: [number, number][][] = []
    const hasard = (k: number) => { const v = Math.sin(k * 12.9898 + 4.1) * 43758.5453; return v - Math.floor(v) }
    const depart = (c: number) => c === 0 ? [PN.porte * S, PN.z * S] : c === 2 ? [PS.porte * S, PS.z * S] : [0, 0.5 * S]
    const dehors = pieds.filter(b => !b.coeur).sort((a, b) => {
      const da = depart(cote(a.z)), db = depart(cote(b.z))
      return Math.hypot(a.x - da[0], a.z - da[1]) - Math.hypot(b.x - db[0], b.z - db[1])
    })
    // distance de (x, z) à l'emprise d'un bâtiment (0 dedans)
    const horsEmprise = (o: typeof pieds[number], x: number, z: number) => Math.hypot(Math.max(0, Math.abs(x - o.x) - o.hx), Math.max(0, Math.abs(z - o.z) - o.hz))
    for (const bat of dehors) {
      // déjà au bord d'une rue ou d'une route : rien à tracer
      const surBase = base[cote(bat.z)].some(([x, z]) => horsEmprise(bat, x, z) < 0.8)
      if (surBase) continue
      const reseau = reseaux[cote(bat.z)]
      let cible = reseau[0], dmin = Infinity
      for (const p of reseau) { const e = horsEmprise(bat, p[0], p[1]); if (e < dmin) { dmin = e; cible = p } }
      const d = Math.hypot(cible[0] - bat.x, cible[1] - bat.z) || 1
      const ux = (cible[0] - bat.x) / d, uz = (cible[1] - bat.z) / d
      // part du bord de l'emprise, côté réseau
      const bordE = Math.min(Math.abs(ux) > 1e-3 ? bat.hx / Math.abs(ux) : Infinity, Math.abs(uz) > 1e-3 ? bat.hz / Math.abs(uz) : Infinity)
      const a: [number, number] = [bat.x + ux * (bordE + 0.3), bat.z + uz * (bordE + 0.3)], L = Math.max(0.5, d - bordE - 0.3)
      const graine = Math.round(bat.x * 7 + bat.z * 13)
      let meilleur: [number, number][] = [a, cible], gene = Infinity
      for (let essai = 0; essai < 12; essai++) {
        const nb = L < 10 ? 1 : 2, pts: [number, number][] = [a]
        for (let k = 1; k <= nb; k++) {
          // coude : à une position et un écart latéral tirés au hasard, plus marqués aux essais suivants
          const t = (k - 0.5 + (hasard(graine + essai * 31 + k) - 0.5) * 0.6) / nb
          const ecart = (hasard(graine + essai * 57 + k * 3) - 0.5) * L * (0.25 + essai * 0.06)
          pts.push([a[0] + (cible[0] - a[0]) * t - uz * ecart, a[1] + (cible[1] - a[1]) * t + ux * ecart])
        }
        pts.push(cible)
        const touche = echantillons(pts, 0.8).filter(([x, z]) => pieds.some(o => o !== bat && horsEmprise(o, x, z) < 0.5)).length
        if (touche < gene) { gene = touche; meilleur = pts }
        if (!touche) break
      }
      sentiers.push(meilleur)
      // les autres chemins peuvent s'y brancher, mais pas tout contre le bâtiment qu'il dessert
      reseau.push(...echantillons(meilleur).filter(([x, z]) => horsEmprise(bat, x, z) > 2))
    }
    for (const t of sentiers) this.groupeBat.add(ruban(t, LT, matTerre, 0.008, true))

    // ── ponts là où une rue, un chemin ou une route franchit la rivière ──
    const traversees: { x: number; z: number; angle: number; large: number }[] = []
    for (const { horizontal, pos, a, b } of fusionLignes(pave)) for (const t of croiserRiviere(horizontal ? [a, pos] : [pos, a], horizontal ? [b, pos] : [pos, b]))
      traversees.push({ ...t, angle: horizontal ? 0 : Math.PI / 2, large: LARGEUR + 0.6 })
    for (const t of sentiers) for (let k = 1; k < t.length; k++) for (const c of croiserRiviere(t[k - 1], t[k]))
      traversees.push({ ...c, angle: Math.atan2(t[k][1] - t[k - 1][1], t[k][0] - t[k - 1][0]), large: LT + 0.5 })
    for (const r of routes) for (let k = 1; k < r.length; k++) for (const t of croiserRiviere(r[k - 1], r[k]))
      traversees.push({ ...t, angle: Math.atan2(r[k][1] - r[k - 1][1], r[k][0] - r[k - 1][0]), large: 2.8 })
    for (const t of traversees) {
      const g = construirePont(LARGEUR_RIVIERE * S + 2.6, t.large)
      g.position.set(t.x, 0, t.z); g.rotation.y = -t.angle
      this.groupeBat.add(g)
    }

    // ── enceinte : les deux palissades du MJ, au nord et au sud du village, avec une porte chacune ──
    this.R = 9 * S
    this.depart.set(PS.porte * S, 0, (PS.z + 2.2) * S)
    if (avecEnceinte) {
      const formes = new Set(defenses.map(x => x.b.shape))
      const portes = formes.has('porte'), demi = demiPorte(portes) * ECHELLE
      const vus = new Set<string>()
      for (const { id, i, b } of defenses) {
        // une seule fois par type ; la muraille remplace la palissade
        if (vus.has(b.shape) || (b.shape === 'palissade' && formes.has('mur'))) continue
        vus.add(b.shape)
        const g = new THREE.Group()
        for (const [P, sens] of [[PS, 1], [PN, -1]] as const) {
          // repère du tronçon : l'extérieur vers +z ; le côté nord est tourné d'un demi-tour (x devient −x)
          const trous = passagesRiviere(P.z * S).map(([t0, t1]) => (sens > 0 ? [t0, t1] : [-t1, -t0]).map(t => t / ECHELLE) as [number, number])
          const [a, bb] = sens > 0 ? [P.a, P.b] : [-P.b, -P.a]
          const l = construireLigne(b.shape, sens * P.z * S / ECHELLE, a * S / ECHELLE, bb * S / ECHELLE, sens * P.porte * S / ECHELLE, trous, portes, sens > 0 ? 1 : 3)
          l.rotation.y = sens > 0 ? 0 : Math.PI
          g.add(l)
          if (b.shape === 'palissade' || b.shape === 'mur') {
            const eau = passagesRiviere(P.z * S)
            for (let x = P.a * S; x <= P.b * S; x += 1.1) {
              if (Math.abs(x - P.porte * S) < demi || eau.some(([t0, t1]) => x > t0 && x < t1)) continue
              this.collisions.push({ x, z: P.z * S, r: 0.7 })
            }
          }
        }
        g.scale.setScalar(ECHELLE)
        g.userData.index = i
        g.userData.id = id
        g.userData.ancre = new THREE.Vector3(PS.porte * S, 0, PS.z * S)
        this.groupeBat.add(g)
        this.cliquables.push(g)
      }
    }
    // chantiers de défense : matériaux entreposés devant la porte sud
    chantiersEnceinte.forEach(({ id, k }, n) => {
      placerChantier(id, k, PS.porte * S + (n % 2 ? -1 : 1) * 3.4, (PS.z + 0.9 + Math.floor(n / 2) * 0.7) * S, 0)
    })
    const sc = this.soleil.shadow.camera
    sc.left = sc.bottom = -(this.R + 12); sc.right = sc.top = this.R + 12; sc.near = 1; sc.far = 320
    sc.updateProjectionMatrix()

    this.regrouper()
    fusionnerStatiques(this.groupeBat, this.cliquables)
    this.boites = this.cliquables.filter(g => !g.userData.ancre).map(g => new THREE.Box3().setFromObject(g))
    this.decor(empl)
    this.materiaux(this.groupeBat); this.materiaux(this.groupeDecor); this.alleger()
    this.setSaison(this.saison)
    if (premier) this.cadrer()
  }

  /* ───────── Choix d'une case pour placer un bâtiment ───────── */
  private placement: { cases: Set<string>; groupe: THREE.Group; survol: THREE.Mesh; choisir: (c: Case) => void } | null = null
  /** cases : cases libres à proposer (null pour quitter) ; choisir est appelé au clic sur l'une d'elles */
  setPlacement(cases: Case[] | null, choisir?: (c: Case) => void) {
    if (this.placement) { this.scene.remove(this.placement.groupe); this.libérer(this.placement.groupe); this.placement = null }
    this.renderer.domElement.style.cursor = ''
    if (!cases || !choisir) return
    const groupe = new THREE.Group()
    const geo = new THREE.PlaneGeometry(S * 0.84, S * 0.84).rotateX(-Math.PI / 2)
    const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x7fe08a, transparent: true, opacity: 0.32, depthWrite: false }), cases.length)
    const m4 = new THREE.Matrix4()
    cases.forEach((c, k) => im.setMatrixAt(k, m4.makeTranslation(c[0] * S, 0.06, c[1] * S)))
    const survol = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.6, depthWrite: false }))
    survol.visible = false
    groupe.add(im, survol)
    this.scene.add(groupe)
    this.placement = { cases: new Set(cases.map(cleCase)), groupe, survol, choisir }
  }
  /** case libre sous le pointeur, ou null */
  private caseVisee(x: number, y: number): Case | null {
    if (!this.placement) return null
    const rc = new THREE.Raycaster()
    rc.setFromCamera(this.ndc(x, y), this.camera)
    const p = rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3())
    if (!p) return null
    const c: Case = [Math.round(p.x / S), Math.round(p.z / S)]
    return this.placement.cases.has(cleCase(c)) ? c : null
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

  /** hauteur du terrain (sol et montagnes) en x, z : la caméra reste au-dessus */
  private relief(x: number, z: number) {
    let h = hauteurSol(x, z)
    for (const c of cones()) if (Math.abs(c.x - x) < c.r && Math.abs(c.z - z) < c.r) h = Math.max(h, hauteurCone(c, x, z))
    return h
  }

  /** Décor de la carte du MJ : vallée plate entre deux montagnes, ouverte au sud-ouest sur les plaines, et la rivière. */
  private decor(empl: string[]) {
    const sig = empl.join(',')
    if (sig === this.signatureDecor) return
    this.signatureDecor = sig
    for (const o of [...this.groupeDecor.children]) { this.groupeDecor.remove(o); this.libérer(o) }
    const alea = (k: number) => { const x = Math.sin(k * 91.17 + 3.3) * 43758.5453; return x - Math.floor(x) }
    const versCase = (x: number, z: number): P => [x / S, z / S]
    // le long des routes et devant la porte sud (départ de la balade) : rien dans les pattes
    const routes = [ROUTE_PLAINES, ROUTE_NORD]
    const degage = (x: number, z: number) => routes.some(r => distLigne(versCase(x, z), r) < 1.6) || this.depart.distanceTo(new THREE.Vector3(x, 0, z)) < 10

    // sol : plat au fond de la vallée et dans les plaines, il monte vers les montagnes
    // bien plus grand que ce que la caméra peut voir, pour ne jamais apercevoir le bord ni le dessous
    const sol = new THREE.PlaneGeometry(TAILLE_SOL, TAILLE_SOL, CARREAUX_SOL, CARREAUX_SOL)
    sol.rotateX(-Math.PI / 2)
    const pos = sol.attributes.position as THREE.BufferAttribute
    const couleurs: number[] = [], loins = new Float32Array(pos.count)
    const c = new THREE.Color(), roche = new THREE.Color(0x6f7568)
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), d = horsVallee(versCase(x, z))
      pos.setY(i, hauteurSol(x, z, d) - 0.02)
      const loin = Math.max(0, Math.min(1, d / 4))
      loins[i] = loin
      const v = alea(i) * 0.08
      c.setRGB(0.42 + v, 0.55 + v, 0.33 + v * 0.5).lerp(roche, loin * 0.55)
      couleurs.push(c.r, c.g, c.b)
    }
    sol.setAttribute('color', new THREE.Float32BufferAttribute(couleurs, 3))
    this.sol = { geo: sol, base: new Float32Array(couleurs), loin: loins }
    sol.computeVertexNormals()
    const msol = new THREE.Mesh(sol, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }))
    msol.receiveShadow = true
    this.groupeDecor.add(msol)

    // rivière : berges de terre, puis l'eau
    const matBerge = new THREE.MeshStandardMaterial({ color: 0x6f6447, roughness: 1 })
    matBerge.userData.decor = true
    this.saisonniers = this.saisonniers.filter(x => !x.m.userData.decor)
    this.saisonniers.push({ m: matBerge, base: matBerge.color.getHex(), t: { hiver: [NEIGE, 0.6] } })
    for (const cours of COURS) {
      this.groupeDecor.add(ruban(cours, LARGEUR_RIVIERE * S + 1.4, matBerge, 0.006))
      const eau = ruban(cours, LARGEUR_RIVIERE * S, matEau, 0.03)
      eau.receiveShadow = false
      this.groupeDecor.add(eau)
    }

    // montagnes de part et d'autre de la vallée (plus hautes et plus serrées avec l'emplacement Montagne)
    const matRoche = new THREE.MeshStandardMaterial({ color: 0x6f7c88, roughness: 1, flatShading: true })
    const matRoche2 = new THREE.MeshStandardMaterial({ color: 0x5c6773, roughness: 1, flatShading: true })
    const matNeige = new THREE.MeshStandardMaterial({ color: 0xf2f5f8, roughness: 0.8, flatShading: true })
    // les montagnes de la carte (carte.ts) : serrées et hautes au bord de la vallée, plus espacées au loin
    for (const c of cones()) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(c.r, c.h, c.seg), c.k % 2 ? matRoche : matRoche2)
      m.position.set(c.x, c.y + c.h / 2, c.z); m.rotation.y = c.rot
      const kN = 0.34
      const n = new THREE.Mesh(new THREE.ConeGeometry(c.r * kN * 1.02, c.h * kN, c.seg), matNeige)
      n.position.set(c.x, c.y + c.h - (c.h * kN) / 2 + 0.05, c.z); n.rotation.y = c.rot
      this.groupeDecor.add(m, n)
    }

    // forêt (instanciée) : sur les pentes de la vallée, et quelques bosquets dans les plaines
    const avecForet = empl.includes('F')
    const nbArbres = avecForet ? 1000 : 500
    const tronc = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.24, 1.2, 5), new THREE.MeshStandardMaterial({ color: 0x5a3d26, flatShading: true }), nbArbres)
    const bas = new THREE.InstancedMesh(new THREE.ConeGeometry(1.6, 3.2, 6), new THREE.MeshStandardMaterial({ color: 0x2c573d, flatShading: true }), nbArbres)
    const haut = new THREE.InstancedMesh(new THREE.ConeGeometry(1.15, 2.4, 6), new THREE.MeshStandardMaterial({ color: 0x3a6f4f, flatShading: true }), nbArbres)
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3()
    let placés = 0
    for (let k = 0; placés < nbArbres && k < nbArbres * 8; k++) {
      const x = (alea(k * 3 + 1) - 0.5) * 420 * ESPACEMENT, z = (alea(k * 3 + 2) - 0.5) * 420 * ESPACEMENT
      const cs = versCase(x, z), d = horsVallee(cs)
      // au pied des pentes et sur le bas des versants, là où l'on ne construit pas
      // (pas devant l'entrée des mines et carrières, au pied des pentes)
      const pente = d > -0.5 && d < 3 && !casePiedMont([Math.round(cs[0]), Math.round(cs[1])])
      const bosquet = d < -1.5 && Math.hypot(cs[0], cs[1]) > 17 && !dansPolygone(cs, CHAMPS) && alea(k + 77) < 0.18
      if ((!pente && !bosquet) || degage(x, z) || distRiviereLisse(x, z) < 5) continue
      const s = 0.8 + alea(k * 3 + 3) * 0.8, yh = hauteurSol(x, z, d)
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), alea(k) * 6)
      sc.set(s, s, s)
      p.set(x, yh + 0.6 * s, z); m4.compose(p, q, sc); tronc.setMatrixAt(placés, m4)
      p.set(x, yh + 2.6 * s, z); m4.compose(p, q, sc); bas.setMatrixAt(placés, m4)
      p.set(x, yh + 4.0 * s, z); m4.compose(p, q, sc); haut.setMatrixAt(placés, m4)
      placés++
    }
    for (const im of [tronc, bas, haut]) { im.count = placés; im.castShadow = true; im.receiveShadow = true; this.groupeDecor.add(im) }
    this.foret = { ims: [tronc, bas, haut], n: placés }
    for (const im of [bas, haut]) {
      const m = im.material as THREE.MeshStandardMaterial
      m.userData.decor = true
      this.saisonniers.push({ m, base: m.color.getHex(), t: { hiver: [NEIGE, 0.4] } })
    }

    // rochers épars au pied des montagnes
    const matRoc = new THREE.MeshStandardMaterial({ color: 0x8a8579, flatShading: true, roughness: 1 })
    for (let k = 0, n = 0; n < 50 && k < 400; k++) {
      const x = (alea(k + 300) - 0.5) * 360 * ESPACEMENT, z = (alea(k + 400) - 0.5) * 360 * ESPACEMENT, d = horsVallee(versCase(x, z))
      if (d < 0.3 || d > 5 || degage(x, z)) continue
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + alea(k + 500) * 1.4, 0), matRoc)
      r.position.set(x, hauteurSol(x, z, d) + 0.2, z)
      r.rotation.set(alea(k) * 3, alea(k + 1) * 3, 0)
      r.castShadow = true; r.receiveShadow = true
      this.groupeDecor.add(r)
      n++
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
    const d = this.R * 1.0 + 14
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
      this.pos.copy(this.depart)
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
    if (this.placement && e.pointerType === 'mouse') {
      const c = this.caseVisee(e.clientX, e.clientY), sv = this.placement.survol
      sv.visible = !!c
      if (c) sv.position.set(c[0] * S, 0.07, c[1] * S)
      this.renderer.domElement.style.cursor = c ? 'pointer' : 'not-allowed'
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
    if (clic && e.type === 'pointerup' && this.placement) {
      const c = this.caseVisee(e.clientX, e.clientY)
      if (c) this.placement.choisir(c)
      return
    }
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
      // la caméra reste au-dessus du relief : jamais sous le sol des pentes ni dans une montagne
      const cam = this.camera.position, mini = this.relief(cam.x, cam.z) + 4
      if (cam.y < mini) { cam.y = mini; this.camera.lookAt(this.controls.target) }
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
      // on reste au fond de la vallée et dans les plaines : les montagnes ne se gravissent pas
      if (horsVallee([p.x / S, p.z / S]) > 0.4) { p.x = avant.x; p.z = avant.z }
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
