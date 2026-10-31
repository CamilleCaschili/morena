<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { store, modifier } from '../logic/store'
import { groupesJour, calculJour, enPause, chantiers, terminerChantiers, fmt, nbTxt, facesDe, nomRegle, lancer, naissanceDue, naissances } from '../logic/regles'
import { DE_NAISSANCE } from '../data/economie'
import { dateDe, dateMin, saisonDe, SAISONS } from '../logic/calendrier'
import { BI, RES, RL } from '../data/catalogue'

const emit = defineEmits<{ fermer: [] }>()
const jets = ref<Record<string, number>>({})
const feuille = ref<HTMLDivElement | null>(null)

const v = computed(() => store.village!)
const des = computed(() => groupesJour(v.value.etat, v.value.regles)
  .filter(g => g.regle.mode === 'de' && g.regle.n != null)
  .map(g => ({ ...g, total: g.nb * (g.regle.n as number), faces: facesDe(g.regle) })))
// un mois sur deux, la population grandit de 1d10 %
const naiss = computed(() => naissanceDue(v.value.etat))
const nbNaiss = computed(() => jets.value.naiss == null ? null : naissances(v.value.etat, jets.value.naiss))
const calc = computed(() => calculJour(v.value.etat, v.value.regles, jets.value))
const resume = computed(() => RES.filter(r => calc.value.delta[r.k] || calc.value.lignes.some(l => l.regle.res === r.k)).map(r => {
  const d = calc.value.delta[r.k], o = v.value.etat.stocks[r.k] || 0
  return { k: r.k, l: r.l, o: nbTxt(o), d, n: o + d }
}))
const pauses = computed(() => enPause(v.value.etat, v.value.regles).map(g => `${BI[g.bat]?.nom ?? g.bat} (${RL[g.res].toLowerCase()})`))
const finis = computed(() => chantiers(v.value.etat).filter(c => c.fin <= v.value.etat.jour + 1).map(c => BI[c.id]?.nom ?? c.id))
const manquants = computed(() => calc.value.lignes.filter(l => l.v == null).length + (naiss.value && jets.value.naiss == null ? 1 : 0))

function saisir(cle: string, faces: number, e: Event) {
  const n = parseInt((e.target as HTMLInputElement).value, 10)
  const copie = { ...jets.value }
  if (n >= 1 && n <= faces) copie[cle] = n
  else delete copie[cle]
  jets.value = copie
}
function lancerManquants() {
  const copie = { ...jets.value }
  for (const g of des.value) for (let i = 0; i < g.total; i++) { const k = g.regle.id + '_' + i; if (copie[k] == null) copie[k] = lancer(g.faces) }
  if (naiss.value && copie.naiss == null) copie.naiss = lancer(DE_NAISSANCE)
  jets.value = copie
}

async function valider() {
  const figé = { ...jets.value }
  const ok = await modifier((e, r) => {
    const c = calculJour(e, r, figé)
    if (!c.pret || (naissanceDue(e) && figé.naiss == null)) return false
    const parts: string[] = []
    for (const l of c.lignes) {
      if (!l.v) continue
      parts.push(`${fmt(l.v)} ${RL[l.regle.res].toLowerCase()} (${nomRegle(l.regle)}${l.detail ? ', ' + l.detail : ''})`)
    }
    if (e.villageois) parts.push(`−${e.villageois} nourriture (villageois)`)
    const penurie: string[] = []
    for (const x of RES) {
      const n = (e.stocks[x.k] || 0) + c.delta[x.k]
      if (n < 0) penurie.push(x.l.toLowerCase())
      e.stocks[x.k] = Math.max(0, x.k === 'or' ? Math.round(n * 100) / 100 : n)
    }
    let bebes = ''
    if (naissanceDue(e)) {
      const n = naissances(e, figé.naiss)
      e.villageois = (e.villageois || 0) + n
      bebes = ` Naissances : +${n} villageois (d10 : ${figé.naiss} %).`
    }
    const repos = enPause(e, r).map(g => BI[g.bat]?.nom ?? g.bat)
    const fin = `Bilan (${dateMin(e.jour)}) : ` + (parts.join(', ') || 'aucune production.')
      + (repos.length ? ` À l'arrêt (${SAISONS[saisonDe(e.jour)].toLowerCase()}) : ${[...new Set(repos)].join(', ')}.` : '')
      + bebes + (penurie.length ? ` Pénurie de ${penurie.join(', ')} !` : '')
    e.jour += 1
    const logs: { type: 'jour' | 'constr'; texte: string }[] = [{ type: 'jour', texte: fin }]
    for (const id of terminerChantiers(e)) logs.push({ type: 'constr', texte: `Chantier terminé : ${BI[id]?.nom ?? id} est construit.` })
    return logs
  })
  if (ok) emit('fermer')
}

const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') emit('fermer') }
onMounted(async () => { window.addEventListener('keydown', echap); await nextTick(); feuille.value?.querySelector('input')?.focus() })
onBeforeUnmount(() => window.removeEventListener('keydown', echap))
</script>

<template>
  <div class="voile" @click.self="emit('fermer')">
    <div ref="feuille" class="feuille" role="dialog" aria-modal="true" aria-labelledby="titre-jour">
      <h2 id="titre-jour">{{ dateDe(v.etat.jour) }} → {{ dateDe(v.etat.jour + 1) }}</h2>
      <p v-if="des.length || naiss" class="muted intro">Lancez vos dés et entrez les résultats.</p>

      <div v-for="g in des" :key="g.regle.id" class="groupe">
        <div class="gt"><span>{{ nomRegle(g.regle) }}{{ g.nb > 1 ? ' ×' + g.nb : '' }}</span><span class="muted">{{ RL[g.regle.res] }}</span></div>
        <div class="jets">
          <label v-for="i in g.total" :key="i" class="jet">
            d{{ g.faces }}{{ g.total > 1 ? ' n°' + i : '' }}
            <input :id="`jet-${g.regle.id}-${i - 1}`" type="number" inputmode="numeric" min="1" :max="g.faces"
                   :value="jets[g.regle.id + '_' + (i - 1)] ?? ''" @input="saisir(g.regle.id + '_' + (i - 1), g.faces, $event)">
          </label>
        </div>
      </div>
      <div v-if="naiss" class="groupe">
        <div class="gt"><span>Naissances (un mois sur deux)</span><span class="muted">{{ v.etat.villageois }} villageois</span></div>
        <div class="jets">
          <label class="jet">d10 (%)
            <input id="jet-naiss" type="number" inputmode="numeric" min="1" max="10" :value="jets.naiss ?? ''" @input="saisir('naiss', 10, $event)">
          </label>
          <span v-if="nbNaiss != null" class="muted">+{{ nbNaiss }} villageois</span>
        </div>
      </div>
      <button v-if="des.length || naiss" class="btn small ghost" type="button" @click="lancerManquants">Lancer les dés manquants pour nous</button>

      <div class="resume">
        <div v-for="r in resume" :key="r.k" class="ligne num">
          <span>{{ r.l }}</span>
          <span>{{ r.o }} <span :class="r.d >= 0 ? 'p' : 'm'">{{ fmt(r.d) }}</span> → <b>{{ nbTxt(Math.max(0, r.n)) }}</b><span v-if="r.n < 0" class="m"> (manque {{ -r.n }})</span></span>
        </div>
        <span v-if="!resume.length" class="muted">Aucune variation.</span>
        <div v-if="v.etat.villageois" class="ligne muted"><span>Dont villageois</span><span>−{{ v.etat.villageois }} nourriture</span></div>
        <p v-if="pauses.length" class="muted" style="margin:8px 0 0">À l'arrêt en {{ SAISONS[saisonDe(v.etat.jour)].toLowerCase() }} : {{ pauses.join(', ') }}.</p>
        <p v-if="finis.length" class="chantiers">Chantier{{ finis.length > 1 ? 's terminés' : ' terminé' }} à la fin du mois : {{ finis.join(', ') }}.</p>
        <p v-if="calc.ignorees.length" class="flag">Ignoré (quantité à préciser dans Règles) : {{ calc.ignorees.map(r => `${nomRegle(r)} (${RL[r.res].toLowerCase()})`).join(', ') }}.</p>
        <p v-if="manquants" class="muted" style="margin:8px 0 0">Il reste des dés à entrer.</p>
      </div>

      <div class="act">
        <button class="btn ghost" type="button" @click="emit('fermer')">Annuler</button>
        <button class="btn primary" type="button" :disabled="!calc.pret || manquants > 0 || store.enCours" @click="valider">Passer en {{ dateMin(v.etat.jour + 1) }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.voile { position: fixed; inset: 0; z-index: 40; background: rgba(10,14,18,.55); display: flex; align-items: flex-start; justify-content: center; overflow-y: auto;
  padding: calc(24px + env(safe-area-inset-top, 0px)) max(12px, env(safe-area-inset-right, 0px)) calc(24px + env(safe-area-inset-bottom, 0px)) max(12px, env(safe-area-inset-left, 0px)) }
.feuille { background: var(--raised); border-radius: 14px; max-width: 640px; width: 100%; padding: 20px; box-shadow: 0 20px 60px rgba(0,0,0,.35) }
.intro { margin-top: 0 }
.groupe { border-top: 1px solid var(--line); padding-block: 12px; display: flex; flex-direction: column; gap: 8px }
.gt { display: flex; justify-content: space-between; gap: 8px; font-weight: 700 }
.jets { display: flex; flex-wrap: wrap; gap: 8px }
.jet { display: flex; align-items: center; gap: 4px; font-size: .85rem; color: var(--muted) }
.jet input { width: 72px; border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; font-size: 1.05rem; font-weight: 700; background: var(--surface); color: var(--fg); text-align: center }
.resume { background: var(--surface); border-radius: 10px; padding: 12px; margin-top: 10px }
.ligne { display: flex; justify-content: space-between; gap: 8px }
.flag { margin: 8px 0 0 }
.chantiers { margin: 8px 0 0; color: var(--good); font-weight: 700 }
.act { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; flex-wrap: wrap }
</style>
