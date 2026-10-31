<script setup lang="ts">
import { ref, computed } from 'vue'
import { store, modifier } from '../logic/store'
import { B, CATS, EMPL, RL, JAUGES, type Batiment, type CatKey, type ResKey, type JaugeKey } from '../data/catalogue'
import { METIERS } from '../data/economie'
import { statut, effCost, attente, previsionSaisons, emplOk, cnt, effetsDe, decrireEffet, lancerChantier, chantiers, dureeChantier, reqsDe, mainOeuvre, estDefense, metierDe, artisansLibres, gisementsLibres, tirerQualite, lancer, fmt, texteRepousses, type Statut } from '../logic/regles'
import { dateMin } from '../logic/calendrier'
import { dansEnceinte } from '../logic/plan'

const mode = ref<'ok' | 'bientot' | 'tous'>('ok')
const cat = ref<'' | CatKey>('')
const q = ref('')
const autresEmpl = ref(false)
const confirmer = ref<string | null>(null)
const fait = ref('')

const v = computed(() => store.village!)
const fc = computed(() => previsionSaisons(v.value.etat, v.value.regles))
const st = (b: Batiment) => statut(v.value.etat, v.value.regles, b)
const ORD: Record<Statut, number> = { ok: 0, cost: 1, mo: 2, artisan: 3, req: 4, empl: 5, special: 6 }
// « Manque des ressources » : il manque des matériaux, de la main-d'œuvre ou un artisan
const BIENTOT: Statut[] = ['cost', 'mo', 'artisan']
const mo = computed(() => mainOeuvre(v.value.etat))
const libres = computed(() => gisementsLibres(v.value.etat))
const choixGis = ref('')

const base = computed(() => B.filter(b => b.cost && (autresEmpl.value || emplOk(v.value.etat, b))))
const nbOk = computed(() => base.value.filter(b => st(b) === 'ok').length)
const nbBientot = computed(() => base.value.filter(b => BIENTOT.includes(st(b))).length)

const liste = computed(() => {
  let l = base.value
  if (cat.value) l = l.filter(b => b.cat === cat.value)
  if (q.value.trim()) { const s = q.value.trim().toLowerCase(); l = l.filter(b => b.nom.toLowerCase().includes(s)) }
  if (mode.value === 'ok') l = l.filter(b => st(b) === 'ok')
  else if (mode.value === 'bientot') l = l.filter(b => BIENTOT.includes(st(b)))
  return [...l].sort((a, b) => ORD[st(a)] - ORD[st(b)] || attente(v.value.etat, v.value.regles, a, fc.value) - attente(v.value.etat, v.value.regles, b, fc.value) || a.nom.localeCompare(b.nom))
})

function carte(b: Batiment) {
  const e = v.value.etat, ec = effCost(e, v.value.regles, b)
  const couts = (Object.keys(b.cost!) as ResKey[]).map(k => {
    const base = b.cost![k]!, val = ec[k] ?? 0, a = e.stocks[k] || 0
    return { k, base, val, a, manque: a < val, modifie: val !== base }
  })
  const s = st(b)
  const j = s === 'cost' ? attente(e, v.value.regles, b, fc.value) : 0
  return {
    s, couts, nb: cnt(e, b.id), j, duree: dureeChantier(v.value.regles, b.id), enChantier: chantiers(e).filter(x => x.id === b.id).length,
    reqs: reqsDe(e, b),
    metier: metierDe(v.value.regles, b.id),
    jauges: (Object.keys(JAUGES) as JaugeKey[]).filter(k => b.jauges[k]).map(k => `${fmt(b.jauges[k])} ${JAUGES[k]}`),
    moLibre: mo.value ? (estDefense(b) ? mo.value.libresArmee : mo.value.libres) : null,
    effets: effetsDe(v.value.regles, b.id).map(decrireEffet),
    depense: Object.entries(ec).map(([k, n]) => `${n} ${RL[k as ResKey].toLowerCase()}`).join(', '),
  }
}

async function construire(b: Batiment, choisirPlace = false) {
  confirmer.value = null
  let fin = 0
  const ok = await modifier((e, r) => {
    if (statut(e, r, b) !== 'ok') return false
    const repousses: string[] = []
    const c = lancerChantier(e, r, b, choixGis.value && gisementsLibres(e).some(g => g.id === choixGis.value) ? choixGis.value : undefined, undefined, repousses)
    fin = c.fin
    const ec = Object.entries(c.cout) as [ResKey, number][]
    const g = e.gisements?.find(x => x.id === c.gisement)
    return [{ type: 'constr', texte: `Chantier lancé : ${b.nom}${g ? ` sur le gisement de ${RL[g.res].toLowerCase()} (qualité ${g.qualite})` : ''}${ec.length ? ` (−${ec.map(([k, n]) => `${n} ${RL[k].toLowerCase()}`).join(', −')})` : ', gratuit'}. Terminé en ${dateMin(c.fin)}.` + tirerQualite(e, b, lancer(20)) + texteRepousses(repousses) }]
  })
  const d = dureeChantier(v.value.regles, b.id)
  if (ok && choisirPlace) { store.placerChantier = chantiers(v.value.etat).length - 1; return }
  if (ok) { fait.value = `Chantier lancé : ${b.nom} sera terminé en ${dateMin(fin)}, ${d > 1 ? `dans ${d} passages de mois` : 'au prochain passage de mois'}. Le chantier est visible dans l’onglet Village.`; setTimeout(() => { fait.value = '' }, 5000) }
  else if (!store.erreur) store.erreur = `${b.nom} n’est plus constructible : les stocks ont changé entre-temps.`
}
</script>

<template>
  <section>
    <div class="filtres">
      <div class="seg" role="group" aria-label="Filtrer">
        <button type="button" :aria-pressed="mode === 'ok'" @click="mode = 'ok'">Constructible ({{ nbOk }})</button>
        <button type="button" :aria-pressed="mode === 'bientot'" @click="mode = 'bientot'">Manque des ressources ({{ nbBientot }})</button>
        <button type="button" :aria-pressed="mode === 'tous'" @click="mode = 'tous'">Tous</button>
      </div>
      <select id="f-cat" v-model="cat" aria-label="Catégorie">
        <option value="">Toutes catégories</option>
        <option v-for="(l, k) in CATS" :key="k" :value="k">{{ l }}</option>
      </select>
      <input id="f-q" v-model="q" type="search" placeholder="Chercher un bâtiment" aria-label="Chercher">
      <label class="muted chk"><input id="f-empl" v-model="autresEmpl" type="checkbox"> Autres emplacements</label>
    </div>

    <p v-if="fait" class="banner info" role="status">{{ fait }}</p>

    <div v-if="liste.length" class="cartes">
      <article v-for="b in liste" :key="b.id" class="carte" :class="[carte(b).s === 'ok' ? 'ok' : 'ko', (carte(b).s === 'req' || carte(b).s === 'empl') && 'verrou']">
        <template v-for="c in [carte(b)]" :key="b.id + '-c'">
          <div class="hd">
            <div class="nm">{{ b.nom }}</div>
            <span v-if="c.enChantier" class="compte chantier" title="En construction">{{ c.enChantier > 1 ? c.enChantier + ' chantiers' : 'chantier' }}</span>
            <span v-if="c.nb" class="compte" title="Déjà construit">×{{ c.nb }}</span>
          </div>
          <div class="meta">{{ CATS[b.cat] }}<template v-if="b.empl !== 'T'"> · {{ EMPL[b.empl] }}</template></div>
          <div class="couts">
            <span v-for="x in c.couts" :key="x.k" class="cout" :class="{ non: x.manque, mod: x.modifie }" :title="`Vous avez ${x.a}`">
              <s v-if="x.modifie">{{ x.base }}</s> {{ x.val }} {{ RL[x.k].toLowerCase() }}<template v-if="x.manque"> ({{ x.a }})</template>
            </span>
            <span v-if="b.mo" class="cout mo" :class="{ non: c.moLibre != null && c.moLibre < b.mo }" :title="c.moLibre == null ? 'Le MJ n’a pas encore indiqué le nombre de villageois' : `${c.moLibre} disponibles`">
              {{ b.mo }} {{ estDefense(b) ? 'militaires' : 'main-d’œuvre' }}<template v-if="c.moLibre != null && c.moLibre < b.mo"> ({{ Math.max(0, c.moLibre) }})</template>
            </span>
            <span v-if="c.metier" class="cout mo" :class="{ non: artisansLibres(v.etat, v.regles, c.metier) < 1 }">1 {{ METIERS[c.metier].nom.toLowerCase() }}</span>
            <span v-if="!c.couts.length && !b.mo" class="cout">Gratuit</span>
          </div>
          <div v-if="c.reqs.length" class="reqs">Prérequis :
            <span v-for="(r, i) in c.reqs" :key="i" :class="r.ok ? 'y' : 'n'">{{ r.ok ? '✓' : '✗' }} {{ r.txt }}{{ i < c.reqs.length - 1 ? ', ' : '' }}</span>
          </div>
          <div v-if="c.s === 'cost'" class="eta">
            <template v-if="c.j === Infinity">Une ressource manquante n'est pas produite actuellement.</template>
            <template v-else>Constructible dans ≈ {{ c.j }} mois (en moyenne, saisons comprises, sans autre dépense).</template>
          </div>
          <div v-if="c.duree > 1" class="eta">Chantier de {{ c.duree }} mois.</div>
          <div v-if="c.s === 'empl'" class="eta">Emplacement requis : {{ EMPL[b.empl] }}.</div>
          <div v-if="c.s === 'mo'" class="eta">Pas assez de {{ estDefense(b) ? 'militaires (miliciens, soldats, chevaliers)' : 'villageois disponibles' }} : recrute dans l’onglet Économie.</div>
          <div v-if="c.s === 'artisan' && c.metier" class="eta">Il faut d’abord recruter un {{ METIERS[c.metier].nom.toLowerCase() }} (onglet Économie).</div>
          <div v-if="b.effet || c.jauges.length" class="effet">{{ b.effet }}<template v-if="c.jauges.length && !b.effet">{{ c.jauges.join(', ') }}</template></div>
          <div v-for="e in c.effets" :key="e" class="effet">Effet automatique : {{ e }}</div>
          <div class="act">
            <template v-if="c.s === 'ok'">
              <div v-if="confirmer === b.id" class="confirm">
                <label v-if="b.req.some(g => g.includes('@gisement')) && libres.length > 1" class="field">Gisement
                  <select id="c-gisement" v-model="choixGis"><option value="">Le premier libre</option><option v-for="g in libres" :key="g.id" :value="g.id">{{ RL[g.res] }}, qualité {{ g.qualite }}</option></select>
                </label>
                <span>{{ c.depense ? `Dépenser ${c.depense} ?` : 'Construire gratuitement ?' }} {{ c.duree > 1 ? `Le chantier durera ${c.duree} mois.` : 'Le bâtiment sera terminé au prochain mois.' }}</span>
                <div class="row">
                  <button class="btn primary small" type="button" :disabled="store.enCours" @click="construire(b)">Lancer le chantier</button>
                  <button v-if="!dansEnceinte(b.id)" class="btn small" type="button" :disabled="store.enCours" @click="construire(b, true)">Lancer et choisir l’emplacement</button>
                  <button class="btn small ghost" type="button" @click="confirmer = null">Annuler</button>
                </div>
              </div>
              <button v-else class="btn primary small" type="button" @click="confirmer = b.id">Construire</button>
            </template>
          </div>
        </template>
      </article>
    </div>
    <div v-else class="empty">
      <p class="muted">{{ mode === 'ok' ? 'Rien de constructible avec les stocks actuels. Regarde « Manque des ressources » pour savoir combien de mois attendre.' : 'Aucun bâtiment ne correspond.' }}</p>
    </div>
  </section>
</template>

<style scoped>
.filtres { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 14px }
.seg { display: inline-flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; flex-wrap: wrap }
.seg button { border: 0; background: var(--raised); padding: 6px 12px; font-weight: 600; color: var(--muted) }
.seg button[aria-pressed="true"] { background: var(--fg); color: var(--bg) }
.filtres select, .filtres input[type=search] { border: 1px solid var(--line); background: var(--raised); border-radius: 8px; padding: 6px 10px; min-width: 0 }
.chk { display: flex; gap: 6px; align-items: center; font-size: .9rem }
.cartes { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px }
.carte { background: var(--raised); border: 1px solid var(--line); border-radius: var(--r); padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; min-width: 0 }
.carte.ok { border-left: 4px solid var(--good) }
.carte.ko { border-left: 4px solid var(--line) }
.carte.verrou { opacity: .75 }
.hd { display: flex; gap: 8px; align-items: flex-start }
.nm { font-weight: 800; font-size: 1.05rem; line-height: 1.2; flex: 1 }
.meta { font-size: .82rem; color: var(--muted) }
.compte.chantier { background: transparent; color: var(--fg); border: 1px dashed var(--muted) }
.compte { background: var(--fg); color: var(--bg); border-radius: 999px; padding: 1px 8px; font-size: .8rem; font-weight: 800 }
.couts { display: flex; flex-wrap: wrap; gap: 5px }
.cout { font-size: .85rem; padding: 2px 8px; border-radius: 6px; background: var(--good-soft); font-variant-numeric: tabular-nums }
.cout.non { background: var(--bad-soft); color: var(--bad); font-weight: 700 }
.cout.mo { background: var(--surface); border: 1px dashed var(--line) }
.cout.mod { outline: 1px solid var(--accent) }
.cout s { opacity: .6 }
.reqs { font-size: .85rem }
.reqs .y { color: var(--good) } .reqs .n { color: var(--bad); font-weight: 700 }
.eta { font-size: .85rem; color: var(--muted) }
.act { display: flex; gap: 6px; flex-wrap: wrap; margin-top: auto }
.confirm { font-size: .88rem; background: var(--accent-soft); border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; width: 100% }
.row { display: flex; gap: 6px; flex-wrap: wrap }
</style>
