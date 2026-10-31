<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { store, demo, moi, modifier } from '../logic/store'
import { rejoindreBalade, type Balade } from '../logic/balade'
import { normOrdre, prevision, decrireProduction, effetsDe, decrireEffet, cnt, actif, chantiers, toutesRegles, nomRegle, quantiteTxt, nbTxt, jauges, texteRepousses } from '../logic/regles'
import { calculerPlan, casesLibres, cleInstance, cleCase, dansEnceinte, figerPlan, type Case } from '../logic/plan'
import { saisonDe, dateMin, SAISONS, ORDRE_SAISONS, type Saison } from '../logic/calendrier'
import { BI, CATS, RES, JAUGES, type CatKey, type JaugeKey } from '../data/catalogue'
import type { VillageScene, Mode, Selection, Graphismes } from '../three/scene'
import Joystick from './Joystick.vue'

const props = defineProps<{ actif: boolean }>()

const hote = ref<HTMLDivElement | null>(null)
const cadre = ref<HTMLDivElement | null>(null)
// plein écran natif si possible ; sinon (iPhone) la vue occupe toute la fenêtre en CSS
const pleinEcran = ref(false)
const pleinCss = ref(false)
type DocFs = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> }
type ElFs = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }
const elementPlein = () => document.fullscreenElement ?? (document as DocFs).webkitFullscreenElement ?? null
async function basculerPleinEcran() {
  const el = cadre.value as ElFs | null
  if (!el) return
  if (pleinCss.value) { pleinCss.value = false; pleinEcran.value = false; return }
  if (elementPlein()) {
    const d = document as DocFs
    await (document.exitFullscreen?.() ?? d.webkitExitFullscreen?.())
    return
  }
  try {
    if (el.requestFullscreen) await el.requestFullscreen()
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen()
    else throw new Error('indisponible')
  } catch {
    pleinCss.value = true; pleinEcran.value = true
  }
}
const majPlein = () => { pleinEcran.value = pleinCss.value || elementPlein() === cadre.value }
const echap = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && deplacement.value) { finirDeplacement(); return }
  if (e.key === 'Escape' && pleinCss.value) { pleinCss.value = false; pleinEcran.value = false }
}
let scene: VillageScene | null = null
let balade: Balade | null = null
let monId = ''
let presence = 0
// fermeture de l'onglet : on prévient les autres tout de suite
const quitter = () => balade?.partir()
const skin = computed(() => moi()?.skin || 'villageois')
watch(skin, s => { if (monId) scene?.setMoi(monId, s) })
// graphismes : choix du joueur et dernier niveau trouvé par le mode auto, propres à cet appareil
const lire = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const ecrire = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* rien */ } }
const NOMS_NIVEAU = ['basse', 'moyenne', 'haute']
const graphismes = ref<Graphismes>((['auto', 'haute', 'moyenne', 'basse'] as const).find(g => g === lire('morena-graphismes')) ?? 'auto')
const niveau = ref<number | null>(null)
function choisirGraphismes() {
  ecrire('morena-graphismes', graphismes.value)
  scene?.setGraphismes(graphismes.value)
  niveau.value = scene?.niveauActuel ?? null
}
const puce = ref('')
const logiciel = ref(false)
const nbAutres = ref(0)
const troisieme = ref(true)
const erreur3d = ref('')
const mode = ref<Mode>('maquette')
const nuit = ref(false)
const sel = ref<Selection | null>(null)
const survol = ref<{ nom: string; x: number; y: number } | null>(null)
const tactile = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

const v = computed(() => store.village!)
const ordre = computed(() => normOrdre(v.value.etat))
const enChantier = computed(() => chantiers(v.value.etat).map(c => c.id))
const plan = computed(() => calculerPlan(ordre.value, v.value.etat.places, chantiers(v.value.etat)))
const sigPlan = computed(() => JSON.stringify([plan.value.bat, plan.value.chantiers]))

/* ── Déplacer un bâtiment ou un chantier : on choisit une case libre sur la carte ── */
const deplacement = ref<{ index: number; id: string; chantier: boolean } | null>(null)
function deplacer(s: { index: number; id: string; chantier?: boolean }) {
  if (mode.value === 'balade') basculer('maquette')
  deplacement.value = { index: s.index, id: s.id, chantier: !!s.chantier }
  sel.value = null; scene?.setSelection(null)
  scene?.setPlacement(casesLibres(plan.value, s.id), poser)
}
function finirDeplacement() { deplacement.value = null; scene?.setPlacement(null) }
async function poser(c: Case) {
  const d = deplacement.value; if (!d) return
  finirDeplacement()
  const nom = BI[d.id]?.nom ?? d.id
  await modifier(e => {
    const o = normOrdre(e), ch = chantiers(e)
    const p = calculerPlan(o, e.places, ch)
    if (!casesLibres(p, d.id).some(x => cleCase(x) === cleCase(c))) return false
    const avant = figerPlan(o, e.places ||= {}, ch)
    if (d.chantier) {
      const x = ch[d.index - 100000]; if (x?.id !== d.id) return false
      x.place = c
    } else {
      if (o[d.index] !== d.id) return false
      ;(e.places ||= {})[cleInstance(o, d.index)] = c
    }
    const rep = [...avant, ...figerPlan(o, e.places, ch)].filter(id => id !== d.id)
    return [{ type: 'constr', texte: `${d.chantier ? 'Chantier déplacé' : 'Bâtiment déplacé'} : ${nom}.` + texteRepousses(rep) }]
  })
}
// un chantier lancé depuis Construire avec « choisir l'emplacement »
watch(() => [store.placerChantier, props.actif] as const, ([k, a]) => {
  if (k == null || !a || !scene) return
  store.placerChantier = null
  const id = chantiers(v.value.etat)[k]?.id
  if (id) deplacer({ index: 100000 + k, id, chantier: true })
})
// la vue suit la saison du mois en cours ; on peut en regarder une autre pour essayer
const apercu = ref<'' | Saison>('')
const saison = computed<Saison>(() => apercu.value || saisonDe(v.value.etat.jour))
watch(saison, s => scene?.setSaison(s))

onMounted(async () => {
  try {
    const { VillageScene } = await import('../three/scene')
    const { puceGraphique, rendeLogiciel } = await import('../three/scene')
    puce.value = puceGraphique(); logiciel.value = rendeLogiciel(puce.value)
    const auto = Number(lire('morena-niveau-auto'))
    scene = new VillageScene(hote.value!, { graphismes: graphismes.value, niveauAuto: lire('morena-niveau-auto') != null && auto >= 0 && auto <= 2 ? auto : null })
    niveau.value = scene.niveauActuel
    scene.onNiveau = n => { niveau.value = n; ecrire('morena-niveau-auto', String(n)) }
    scene.onSelect = s => { sel.value = s; scene?.setSelection(s?.index ?? null) }
    scene.onHover = (nom, x, y) => {
      if (!nom) { survol.value = null; return }
      const r = hote.value!.getBoundingClientRect()
      survol.value = { nom, x: x - r.left, y: y - r.top }
    }
    scene.setSaison(saison.value)
    scene.setVillage(ordre.value, v.value.etat.empl || [], plan.value)
    scene.setActif(props.actif)
    if (store.placerChantier != null) { const k = store.placerChantier; store.placerChantier = null; const id = chantiers(v.value.etat)[k]?.id; if (id) deplacer({ index: 100000 + k, id, chantier: true }) }
    // balade à plusieurs : en démo, chaque onglet est un visiteur différent
    const id = demo ? 'demo-' + Math.random().toString(36).slice(2, 8) : (moi()?.user_id ?? 'inconnu')
    const nom = demo ? `Visiteur ${Math.floor(Math.random() * 90) + 10}` : (moi()?.pseudo || 'Joueur')
    scene.setMoi(id, skin.value)
    scene.onAutres = n => { nbAutres.value = n }
    balade = rejoindreBalade(id, nom, m => scene?.majAutre(m.id, m.pseudo, m, m.skin), i => scene?.retirerAutre(i))
    scene.onBouge = p => balade?.envoyer(p, skin.value)
    monId = id
    // signal de présence indépendant de l'affichage : le navigateur fige les animations d'une fenêtre
    // cachée ou recouverte, mais le joueur est toujours là
    presence = window.setInterval(() => { const p = scene?.positionBalade(); if (p) balade?.envoyer(p, skin.value) }, 2000)
  } catch (e) {
    erreur3d.value = 'La vue 3D ne peut pas s’afficher sur cet appareil (WebGL indisponible).'
    console.error(e)
  }
})
onMounted(() => {
  window.addEventListener('pagehide', quitter)
  document.addEventListener('fullscreenchange', majPlein)
  document.addEventListener('webkitfullscreenchange', majPlein)
  window.addEventListener('keydown', echap)
})
onBeforeUnmount(() => {
  clearInterval(presence)
  window.removeEventListener('pagehide', quitter)
  balade?.fermer()
  scene?.dispose()
  document.removeEventListener('fullscreenchange', majPlein)
  document.removeEventListener('webkitfullscreenchange', majPlein)
  window.removeEventListener('keydown', echap)
})

watch(() => [ordre.value.join(','), (v.value.etat.empl || []).join(','), sigPlan.value], () => {
  scene?.setVillage(ordre.value, v.value.etat.empl || [], plan.value)
  // le plan a changé (un autre joueur a construit) : on repropose les cases encore libres
  if (deplacement.value) scene?.setPlacement(casesLibres(plan.value, deplacement.value.id), poser)
  if (sel.value && (sel.value.chantier ? enChantier.value[sel.value.index - 100000] : ordre.value[sel.value.index]) !== sel.value.id) { sel.value = null; scene?.setSelection(null) }
})
// une nuit passe à chaque nouveau mois
watch(() => v.value.etat.jour, (n, a) => { if (a != null && n > a) scene?.jouerNuit() })
watch(() => props.actif, a => {
  if (!a && mode.value === 'balade') basculer('maquette')
  if (!a && deplacement.value) finirDeplacement()
  if (!a && pleinEcran.value) basculerPleinEcran()
  scene?.setActif(a)
})

function basculer(m: Mode) {
  if (mode.value === 'balade' && m !== 'balade') balade?.partir()
  mode.value = m; scene?.setMode(m)
}
function basculerVue() { troisieme.value = !troisieme.value; scene?.setVue(troisieme.value) }
function basculerNuit() { nuit.value = !nuit.value; scene?.setNuit(nuit.value) }

const bat = computed(() => sel.value ? BI[sel.value.id] : null)
const infos = computed(() => {
  if (!bat.value) return null
  const c = sel.value?.chantier ? chantiers(v.value.etat)[sel.value.index - 100000] : null
  return {
    chantier: c ? `En construction : terminé en ${dateMin(c.fin)}, au prochain passage de mois.` : '',
    prod: decrireProduction(v.value.regles, bat.value.id),
    effets: effetsDe(v.value.regles, bat.value.id).map(decrireEffet),
    texte: bat.value.effet,
    nb: cnt(v.value.etat, bat.value.id),
  }
})

const fc = computed(() => prevision(v.value.etat, v.value.regles))
const lignesProd = computed(() => {
  const toutes = toutesRegles(v.value.etat, v.value.regles)
  return RES.map(r => {
    const det = toutes.filter(x => x.regle.res === r.k).map(({ regle: x, nb: c }) => {
      const arret = actif(x, v.value.etat.jour) ? '' : ` (à l’arrêt en ${SAISONS[saisonDe(v.value.etat.jour)].toLowerCase()})`
      return `${nomRegle(x)}${c > 1 ? ' ×' + c : ''} : ${quantiteTxt(x, c)}${arret}`
    })
    if (r.k === 'nourriture' && v.value.etat.villageois) det.push(`Villageois : −${v.value.etat.villageois}`)
    return { k: r.k, l: r.l, det, moy: nbTxt(Math.round(fc.value[r.k].attendu * 10) / 10), pos: fc.value[r.k].attendu > 0 }
  }).filter(x => x.det.length)
})
const jg = computed(() => jauges(v.value.etat))

const parCat = computed(() => {
  const m: Partial<Record<CatKey, { id: string; nom: string; n: number }[]>> = {}
  for (const [id, n] of Object.entries(v.value.etat.bat)) {
    const b = BI[id]; if (!b || !n) continue
    ;(m[b.cat] ??= []).push({ id, nom: b.nom, n })
  }
  return (Object.keys(CATS) as CatKey[]).filter(c => m[c]).map(c => ({ c, l: CATS[c], items: m[c]! }))
})
function montrerChantier(k: number) {
  if (mode.value === 'balade') basculer('maquette')
  sel.value = { index: 100000 + k, id: enChantier.value[k], chantier: true }
  scene?.setSelection(sel.value.index)
  hote.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
function montrer(id: string) {
  const i = ordre.value.indexOf(id)
  if (i < 0) return
  if (mode.value === 'balade') basculer('maquette')
  sel.value = { index: i, id }
  scene?.setSelection(i)
  hote.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
</script>

<template>
  <section>
    <p v-if="logiciel" class="banner" role="status">
      <template v-if="/basic render/i.test(puce)">
        Ton navigateur n'utilise pas la carte graphique : la 3D est calculée par le processeur et sera lente quels que soient les réglages.
        Vérifie d'abord dans les paramètres du navigateur (Système) que « Utiliser l'accélération graphique » est activé, puis relance-le.
        Si ça ne change rien, installe le pilote de ta carte graphique (site d'Intel, AMD ou NVIDIA) et redémarre.
      </template>
      <template v-else>
        Ton navigateur dessine la 3D sans la carte graphique ({{ puce }}) : ce sera lent quels que soient les réglages.
        Active l'accélération matérielle dans les paramètres du navigateur, ou essaie avec un autre navigateur.
      </template>
    </p>
    <div ref="cadre" class="scene" :class="{ balade: mode === 'balade', plein: pleinEcran, 'plein-css': pleinCss }">
      <div ref="hote" class="hote">
        <div v-if="erreur3d" class="erreur3d">{{ erreur3d }}</div>
      </div>

      <div class="barre">
        <div class="seg" role="group" aria-label="Mode de vue">
          <button type="button" :aria-pressed="mode === 'maquette'" @click="basculer('maquette')">Maquette</button>
          <button type="button" :aria-pressed="mode === 'balade'" @click="basculer('balade')">Se promener</button>
        </div>
        <select id="v-saison" v-model="apercu" class="saison" aria-label="Saison affichée">
          <option value="">Saison du mois ({{ SAISONS[saisonDe(v.etat.jour)] }})</option>
          <option v-for="sa in ORDRE_SAISONS" :key="sa" :value="sa">Aperçu : {{ SAISONS[sa] }}</option>
        </select>
        <select id="v-graphismes" v-model="graphismes" class="saison" aria-label="Qualité des graphismes" @change="choisirGraphismes">
          <option value="auto">Graphismes auto{{ niveau != null ? ` (${NOMS_NIVEAU[niveau]})` : '' }}</option>
          <option value="haute">Graphismes : haute</option>
          <option value="moyenne">Graphismes : moyenne</option>
          <option value="basse">Graphismes : basse</option>
        </select>
        <button class="btn small" type="button" @click="basculerNuit">{{ nuit ? 'Voir de jour' : 'Voir de nuit' }}</button>
        <button class="btn small" type="button" :aria-pressed="pleinEcran" @click="basculerPleinEcran">{{ pleinEcran ? 'Quitter le plein écran' : 'Plein écran' }}</button>
        <button v-if="mode === 'balade'" class="btn small" type="button" @click="basculerVue">{{ troisieme ? 'Vue à la 1re personne' : 'Voir mon personnage' }}</button>
        <span v-if="nbAutres" class="presents">{{ nbAutres }} {{ nbAutres > 1 ? 'autres joueurs' : 'autre joueur' }} en balade</span>
      </div>

      <p v-if="mode === 'balade'" class="aide">
        <template v-if="tactile">Joystick pour marcher, glisse pour regarder autour.</template>
        <template v-else>ZQSD ou flèches pour marcher, A / E pour tourner, Maj pour courir, glisse la souris pour regarder.</template>
      </p>
      <p v-else class="aide">Glisse ou A / E pour tourner, pince ou molette pour zoomer, touche un bâtiment pour sa fiche.</p>

      <div v-if="deplacement" class="placer">
        <span>Clique une case verte pour placer <b>{{ BI[deplacement.id]?.nom }}</b>. Les champs, mines et autres bâtiments de production ont leur place hors des murs.</span>
        <button class="btn small" type="button" @click="finirDeplacement">Annuler</button>
      </div>
      <div v-if="survol && !sel" class="bulle" :style="{ left: survol.x + 'px', top: survol.y + 'px' }">{{ survol.nom }}</div>

      <Joystick v-if="mode === 'balade' && tactile" @move="(x: number, y: number) => scene?.setJoystick(x, y)" />

      <aside v-if="bat && infos" class="fiche">
        <div class="fiche-hd">
          <div>
            <div class="nom">{{ bat.nom }}</div>
            <div v-if="infos.chantier" class="chantier">Chantier</div>
            <div class="muted cat">{{ CATS[bat.cat] }}<template v-if="infos.nb > 1"> · {{ infos.nb }} exemplaires</template></div>
          </div>
          <button class="btn small ghost" type="button" aria-label="Fermer la fiche" @click="sel = null; scene?.setSelection(null)">✕</button>
        </div>
        <p v-if="infos.chantier" style="margin:0">{{ infos.chantier }}</p>
        <ul v-if="infos.prod.length" class="prod"><li v-for="p in infos.prod" :key="p">{{ p }}</li></ul>
        <p v-else class="muted" style="margin:0">Ne produit rien.</p>
        <div v-if="infos.texte" class="effet">{{ infos.texte }}</div>
        <button v-if="sel && !dansEnceinte(sel.id)" class="btn small" type="button" :disabled="store.enCours" @click="deplacer(sel)">Déplacer</button>
        <div v-for="e in infos.effets" :key="e" class="effet">Effet automatique : {{ e }}</div>
      </aside>
    </div>

    <div class="grille">
      <section>
        <h2>Production du mois</h2>
        <div v-if="lignesProd.length" class="tablewrap">
          <table>
            <thead><tr><th>Ressource</th><th>Origine</th><th class="r">Moyenne / mois</th></tr></thead>
            <tbody>
              <tr v-for="l in lignesProd" :key="l.k">
                <td><b>{{ l.l }}</b></td>
                <td class="muted"><div v-for="d in l.det" :key="d">{{ d }}</div></td>
                <td class="r num">{{ l.pos ? '+' : '' }}{{ l.moy }}</td>
              </tr>
            </tbody>
          </table>
          <p class="muted petit">La moyenne d’un dé est la moitié de ses faces plus ½ : 50,5 pour un d100, 10,5 pour un d20.</p>
        </div>
        <p v-else class="muted">Aucune production pour l'instant.</p>
        <h2>Jauges du village</h2>
        <div class="tablewrap">
          <table><tbody>
            <tr v-for="(l, k) in JAUGES" :key="k">
              <td><b>{{ l }}</b></td>
              <td class="muted"><div v-for="d in jg[k as JaugeKey].detail" :key="d">{{ d }}</div><div v-if="!jg[k as JaugeKey].detail.length">Aucun bâtiment n’y contribue.</div></td>
              <td class="r num"><b>{{ jg[k as JaugeKey].total }}</b></td>
            </tr>
          </tbody></table>
        </div>
      </section>
      <section>
        <h2>Bâtiments construits</h2>
        <div v-if="parCat.length" class="cats">
          <div v-for="g in parCat" :key="g.c">
            <h3 style="margin-top:0">{{ g.l }}</h3>
            <div class="tags">
              <button v-for="b in g.items" :key="b.id" class="tag" type="button" @click="montrer(b.id)">
                {{ b.nom }}<b v-if="b.n > 1">×{{ b.n }}</b>
              </button>
            </div>
          </div>
        </div>
        <p v-else class="muted">Aucun bâtiment.</p>
        <template v-if="enChantier.length">
          <h3>Chantiers en cours</h3>
          <div class="tags">
            <button v-for="(c, k) in chantiers(v.etat)" :key="k" class="tag chantier" type="button" @click="montrerChantier(k)">
              {{ BI[c.id]?.nom ?? c.id }} · fin en {{ dateMin(c.fin) }}
            </button>
          </div>
        </template>
      </section>
    </div>
  </section>
</template>

<style scoped>
.scene { position: relative; border-radius: var(--r); overflow: hidden; border: 1px solid var(--line); background: #9cc6e6 }
.hote { height: min(68vh, 620px); min-height: 340px; position: relative }
.scene.plein { border-radius: 0; border: 0 }
.scene.plein .hote { height: 100%; min-height: 0 }
.scene:fullscreen { width: 100%; height: 100% }
.scene.plein-css { position: fixed; inset: 0; z-index: 1000; height: 100dvh }
.erreur3d { position: absolute; inset: 0; display: grid; place-items: center; padding: 20px; text-align: center; color: #1b2127; font-weight: 600 }
.barre { position: absolute; top: 10px; left: 10px; display: flex; gap: 8px; flex-wrap: wrap }
.presents { align-self: center; background: rgba(20,24,28,.72); color: #fff; padding: 4px 10px; border-radius: 999px; font-size: .85rem; font-weight: 700 }
.seg { display: inline-flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: var(--raised) }
.seg button { border: 0; background: transparent; padding: 6px 12px; font-weight: 700; color: var(--muted) }
.seg button[aria-pressed="true"] { background: var(--fg); color: var(--bg) }
.aide { position: absolute; bottom: 10px; left: 10px; right: 10px; margin: 0; font-size: .85rem; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,.7); pointer-events: none }
.bulle { position: absolute; transform: translate(12px, -28px); background: rgba(20,24,28,.85); color: #fff; padding: 3px 8px; border-radius: 6px; font-size: .85rem; pointer-events: none; white-space: nowrap }
.fiche { position: absolute; top: 10px; right: 10px; width: min(320px, calc(100% - 20px)); background: var(--raised); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 10px 30px rgba(0,0,0,.25) }
.placer { position: absolute; left: 50%; bottom: 40px; transform: translateX(-50%); width: min(560px, calc(100% - 20px)); background: var(--raised); border: 2px solid #e0b100; border-radius: 10px; padding: 10px 12px; display: flex; gap: 10px; align-items: center; box-shadow: 0 10px 30px rgba(0,0,0,.25); font-size: .9rem }
.fiche-hd { display: flex; gap: 8px; justify-content: space-between; align-items: flex-start }
.nom { font-weight: 800; font-size: 1.05rem; line-height: 1.2 }
.cat { font-size: .85rem }
.prod { margin: 0; padding-left: 18px }
.grille { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 18px; margin-top: 18px }
.grille > * { min-width: 0 }
.cats { display: flex; flex-direction: column; gap: 12px }
.tags { display: flex; flex-wrap: wrap; gap: 6px }
.tags .tag { cursor: pointer }
.tags .tag:hover { border-color: var(--muted) }
.tags .tag.chantier { border-style: dashed }
.petit { font-size: .85rem }
.barre .saison { border: 1px solid var(--line); background: var(--raised); color: var(--fg); border-radius: 8px; padding: 5px 8px; font-weight: 600; font-size: .85rem; max-width: 100% }
.fiche .chantier { display: inline-block; font-size: .72rem; text-transform: uppercase; letter-spacing: .07em; font-weight: 800; color: var(--accent) }
@media (max-width: 560px) {
  .fiche { top: auto; bottom: 34px }
  .scene.balade .fiche { bottom: 150px }
}
</style>
