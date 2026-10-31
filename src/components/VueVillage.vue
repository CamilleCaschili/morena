<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { store, demo, moi } from '../logic/store'
import { rejoindreBalade, type Balade } from '../logic/balade'
import { normOrdre, prevision, decrireProduction, effetsDe, decrireEffet, cnt, actif, chantiers, D100_MOYENNE } from '../logic/regles'
import { saisonDe, dateMin, SAISONS, ORDRE_SAISONS, type Saison } from '../logic/calendrier'
import { BI, CATS, RES, type CatKey } from '../data/catalogue'
import type { VillageScene, Mode, Selection } from '../three/scene'
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
const echap = (e: KeyboardEvent) => { if (e.key === 'Escape' && pleinCss.value) { pleinCss.value = false; pleinEcran.value = false } }
let scene: VillageScene | null = null
let balade: Balade | null = null
let monId = ''
let presence = 0
// fermeture de l'onglet : on prévient les autres tout de suite
const quitter = () => balade?.partir()
const skin = computed(() => moi()?.skin || 'villageois')
watch(skin, s => { if (monId) scene?.setMoi(monId, s) })
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
// la vue suit la saison du mois en cours ; on peut en regarder une autre pour essayer
const apercu = ref<'' | Saison>('')
const saison = computed<Saison>(() => apercu.value || saisonDe(v.value.etat.jour))
watch(saison, s => scene?.setSaison(s))

onMounted(async () => {
  try {
    const { VillageScene } = await import('../three/scene')
    scene = new VillageScene(hote.value!)
    scene.onSelect = s => { sel.value = s; scene?.setSelection(s?.index ?? null) }
    scene.onHover = (nom, x, y) => {
      if (!nom) { survol.value = null; return }
      const r = hote.value!.getBoundingClientRect()
      survol.value = { nom, x: x - r.left, y: y - r.top }
    }
    scene.setSaison(saison.value)
    scene.setVillage(ordre.value, v.value.etat.empl || [], enChantier.value)
    scene.setActif(props.actif)
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

watch(() => [ordre.value.join(','), (v.value.etat.empl || []).join(','), enChantier.value.join(',')], () => {
  scene?.setVillage(ordre.value, v.value.etat.empl || [], enChantier.value)
  if (sel.value && (sel.value.chantier ? enChantier.value[sel.value.index - 100000] : ordre.value[sel.value.index]) !== sel.value.id) { sel.value = null; scene?.setSelection(null) }
})
// une nuit passe à chaque nouveau mois
watch(() => v.value.etat.jour, (n, a) => { if (a != null && n > a) scene?.jouerNuit() })
watch(() => props.actif, a => {
  if (!a && mode.value === 'balade') basculer('maquette')
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
    nb: cnt(v.value.etat, bat.value.id),
  }
})

const fc = computed(() => prevision(v.value.etat, v.value.regles))
const lignesProd = computed(() => RES.map(r => {
  const items = (v.value.regles.regles || []).filter(x => x.res === r.k && cnt(v.value.etat, x.bat) > 0)
  const det = items.map(x => {
    const c = cnt(v.value.etat, x.bat)
    const q = x.n == null ? 'à préciser' : x.mode === 'de' ? `${x.sens > 0 ? '+' : '−'}${c * x.n}d100` : `${x.sens > 0 ? '+' : '−'}${c * x.n}`
    const arret = actif(x, v.value.etat.jour) ? '' : ` (à l’arrêt en ${SAISONS[saisonDe(v.value.etat.jour)].toLowerCase()})`
    return `${BI[x.bat]?.nom ?? x.bat}${c > 1 ? ' ×' + c : ''} : ${q}${arret}`
  })
  if (r.k === 'nourriture' && v.value.etat.villageois) det.push(`Villageois : −${v.value.etat.villageois}`)
  return { k: r.k, l: r.l, det, moy: Math.round(fc.value[r.k].attendu) }
}).filter(x => x.det.length))

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
        <div v-for="e in infos.effets" :key="e" class="effet">Effet : {{ e }}</div>
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
                <td class="r num">{{ l.moy > 0 ? '+' : '' }}{{ l.moy }}</td>
              </tr>
            </tbody>
          </table>
          <p class="muted petit">La moyenne compte {{ String(D100_MOYENNE).replace('.', ',') }} par d100.</p>
        </div>
        <p v-else class="muted">Aucune production pour l'instant.</p>
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
