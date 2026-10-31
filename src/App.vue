<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { store, demarrer, moi, deconnexion, changerPseudo, changerSkin, exporter, demo } from './logic/store'
import { SKINS } from './three/perso'
import { prevision, fmt, chantiers, desTxt, nbTxt, jauges } from './logic/regles'
import { MOIS, moisDe, anDe, saisonDe, SAISONS } from './logic/calendrier'
import { RES, JAUGES, type JaugeKey } from './data/catalogue'
import Connexion from './components/Connexion.vue'
import VueVillage from './components/VueVillage.vue'
import VueConstruire from './components/VueConstruire.vue'
import VueJournal from './components/VueJournal.vue'
import VueEconomie from './components/VueEconomie.vue'
import VueRegles from './components/VueRegles.vue'
import DialogueJour from './components/DialogueJour.vue'

type Onglet = 'village' | 'construire' | 'economie' | 'journal' | 'regles'
const ONGLETS: { k: Onglet; l: string }[] = [
  { k: 'village', l: 'Village' }, { k: 'construire', l: 'Construire' }, { k: 'economie', l: 'Économie' }, { k: 'journal', l: 'Journal' }, { k: 'regles', l: 'Règles' },
]
const lu = (() => { try { return localStorage.getItem('morena-onglet') as Onglet | null } catch { return null } })()
const onglet = ref<Onglet>(lu && ONGLETS.some(o => o.k === lu) ? lu : 'village')
function choisir(k: Onglet) { onglet.value = k; try { localStorage.setItem('morena-onglet', k) } catch { /* rien */ } }

const jourOuvert = ref(false)
const menu = ref(false)
const nouveauPseudo = ref('')

onMounted(() => { demarrer() })

const v = computed(() => store.village)
const date = computed(() => v.value ? { mois: MOIS[moisDe(v.value.etat.jour)], an: anDe(v.value.etat.jour), saison: saisonDe(v.value.etat.jour) } : null)
const nbChantiers = computed(() => v.value ? chantiers(v.value.etat).length : 0)
const fc = computed(() => v.value ? prevision(v.value.etat, v.value.regles) : null)
const stocks = computed(() => {
  if (!v.value || !fc.value) return []
  // les ressources de base sont toujours affichées, les autres dès qu'il y en a ou qu'elles bougent
  return RES.map(r => {
    const f = fc.value![r.k]
    const parts: { t: string; c: string }[] = []
    if (f.fixe) parts.push({ t: fmt(f.fixe), c: f.fixe > 0 ? 'p' : 'm' })
    const d = desTxt(f.des)
    if (d) parts.push({ t: '+' + d, c: 'p' })
    if (f.undef) parts.push({ t: '?', c: 'm' })
    const n = v.value!.etat.stocks[r.k] || 0
    return { k: r.k, l: r.l, v: nbTxt(n), parts, voir: r.g === 'base' || n !== 0 || parts.length > 0 }
  }).filter(s => s.voir)
})
const jg = computed(() => v.value ? jauges(v.value.etat) : null)

function ouvrirMenu() { nouveauPseudo.value = moi()?.pseudo ?? ''; menu.value = !menu.value }
async function enregistrerPseudo() { if (nouveauPseudo.value.trim()) await changerPseudo(nouveauPseudo.value); menu.value = false }

// Export : téléchargement d'une sauvegarde JSON
function telecharger() {
  const blob = new Blob([exporter()], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = date.value ? `morena-an${date.value.an}-${date.value.mois.toLowerCase()}.json` : 'morena.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  menu.value = false
}
</script>

<template>
  <div class="wrap">
    <p v-if="!store.pret" class="muted" style="margin-top:40px">Chargement…</p>

    <Connexion v-else-if="!demo && !store.session" />

    <template v-else>
      <header class="top">
        <div class="ligne-titre">
          <h1>Morena</h1>
          <div class="jour">
            <template v-if="date"><b>{{ date.mois }}</b> an {{ date.an }} <span class="saison" :class="date.saison">{{ SAISONS[date.saison] }}</span></template>
            <template v-else>–</template>
            <span v-for="(l, k) in JAUGES" :key="k" class="jauge" :title="jg?.[k as JaugeKey].detail.join('\n') || 'Aucun bâtiment n’y contribue'">{{ l }} <b>{{ jg?.[k as JaugeKey].total ?? 0 }}</b></span>
            <span v-if="nbChantiers" class="nb-chantiers">{{ nbChantiers }} chantier{{ nbChantiers > 1 ? 's' : '' }}</span>
          </div>
          <div class="espace"></div>
          <button class="btn primary" type="button" :disabled="!v || store.enCours" @click="jourOuvert = true">Passer au mois suivant</button>
          <div class="profil">
            <button class="btn ghost avatar" type="button" :aria-expanded="menu" @click="ouvrirMenu">
              {{ moi()?.pseudo || 'Moi' }}<span v-if="moi()?.role === 'mj'" class="mj">MJ</span>
            </button>
            <div v-if="menu" class="menu">
              <label class="field">Pseudo<input id="pseudo" v-model="nouveauPseudo" maxlength="40" @keydown.enter="enregistrerPseudo"></label>
              <button class="btn small" type="button" @click="enregistrerPseudo">Enregistrer</button>
              <label class="field">Personnage en balade
                <select id="skin" :value="moi()?.skin || 'villageois'" @change="changerSkin(($event.target as HTMLSelectElement).value)">
                  <option v-for="(s, k) in SKINS" :key="k" :value="k">{{ s.nom }}</option>
                </select>
              </label>
              <button class="btn small ghost" type="button" @click="telecharger">Télécharger une sauvegarde</button>
              <button v-if="!demo" class="btn small ghost" type="button" @click="deconnexion">Se déconnecter</button>
            </div>
          </div>
        </div>
        <div class="stocks">
          <div v-for="s in stocks" :key="s.k" class="stock">
            <span class="l">{{ s.l }}</span>
            <span class="v num">{{ s.v }}</span>
            <span class="d num"><template v-if="s.parts.length"><span v-for="(p, i) in s.parts" :key="i" :class="p.c">{{ p.t }} </span>/ mois</template>&nbsp;</span>
          </div>
        </div>
        <nav class="onglets" role="tablist">
          <button v-for="o in ONGLETS" :key="o.k" role="tab" type="button" :aria-selected="onglet === o.k" @click="choisir(o.k)">{{ o.l }}</button>
        </nav>
      </header>

      <div v-if="demo" class="banner info">Mode démo : Supabase n'est pas configuré, donc rien n'est partagé ni enregistré. Recharger la page remet le village à zéro.</div>
      <div v-if="store.erreur" class="banner" role="alert">{{ store.erreur }}</div>

      <main>
        <p v-if="store.chargement && !v" class="muted">Chargement du village…</p>
        <div v-else-if="!v" class="empty">
          <h2>Village introuvable</h2>
          <p class="muted">Ton compte n'a pas accès au village, ou la base n'a pas encore été initialisée avec <code>supabase/schema.sql</code>.</p>
        </div>
        <template v-else>
          <VueVillage v-show="onglet === 'village'" :actif="onglet === 'village'" />
          <VueConstruire v-if="onglet === 'construire'" />
          <VueEconomie v-if="onglet === 'economie'" />
          <VueJournal v-if="onglet === 'journal'" />
          <VueRegles v-if="onglet === 'regles'" />
        </template>
      </main>

      <DialogueJour v-if="jourOuvert && v" @fermer="jourOuvert = false" />
    </template>
  </div>
</template>

<style scoped>
header.top { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; background: var(--bg); padding-block: 14px 0; border-bottom: 1px solid var(--line) }
.ligne-titre { display: flex; align-items: center; gap: 14px; flex-wrap: wrap }
h1 { font-family: var(--f-display); font-weight: 400; font-size: 2rem; line-height: 1; margin: 0; letter-spacing: .02em }
.jour { display: flex; align-items: baseline; gap: 6px; color: var(--muted) }
.jour b { font-family: var(--f-display); font-weight: 400; font-size: 1.5rem; color: var(--fg) }
.jour { flex-wrap: wrap }
.saison { align-self: center; font-size: .78rem; font-weight: 800; padding: 1px 8px; border-radius: 999px }
.saison.printemps { background: #dcefd2; color: #2f5d22 }
.saison.ete { background: #f8e7b0; color: #7a5a06 }
.saison.automne { background: #f4d2b5; color: #8a3c0e }
.saison.hiver { background: #dbe7f3; color: #2c4f75 }
.jauge { align-self: center; font-size: .78rem; font-weight: 600; padding: 1px 8px; border-radius: 999px; background: var(--surface); border: 1px solid var(--line); cursor: help }
.jauge b { color: var(--fg) }
.nb-chantiers { align-self: center; font-size: .78rem; font-weight: 700; padding: 1px 8px; border-radius: 999px; border: 1px dashed var(--line) }
.espace { flex: 1 }
.profil { position: relative }
.avatar { display: inline-flex; gap: 6px; align-items: center }
.mj { font-size: .7rem; background: var(--accent); color: var(--accent-fg); border-radius: 4px; padding: 1px 5px; letter-spacing: .05em }
.menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 30; background: var(--raised); border: 1px solid var(--line); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 8px; width: 240px; box-shadow: 0 12px 30px rgba(0,0,0,.2) }
.stocks { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 12px }
.stock { display: flex; flex-direction: column; min-width: 86px; padding: 6px 10px; border-radius: 8px; background: var(--surface); border: 1px solid var(--line) }
.stock .l { font-size: .72rem; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); font-weight: 700 }
.stock .v { font-size: 1.25rem; font-weight: 800; line-height: 1.1 }
.stock .d { font-size: .78rem; color: var(--muted); white-space: nowrap }
.onglets { display: flex; gap: 2px; margin-top: 12px; overflow-x: auto }
.onglets button { border: 0; background: transparent; padding: 8px 14px; border-radius: 8px 8px 0 0; font-weight: 700; color: var(--muted); border-bottom: 3px solid transparent; white-space: nowrap }
.onglets button[aria-selected="true"] { color: var(--fg); border-bottom-color: var(--accent) }
main { padding-top: 18px }
@media (max-width: 560px) {
  h1 { font-size: 1.6rem }
  .stock { min-width: calc(33% - 4px); flex: 1 }
  .ligne-titre .btn.primary { order: 5; width: 100% }
}
</style>
