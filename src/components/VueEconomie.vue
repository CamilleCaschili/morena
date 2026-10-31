<script setup lang="ts">
import { ref, computed } from 'vue'
import { store, modifier, estMj } from '../logic/store'
import { RES, RL, GROUPES_RES, nomBat, type ResKey, type GroupeRes } from '../data/catalogue'
import {
  MARCHANDISES, RECETTES, METIERS, MILITAIRES, GRADES, COMMERCE, MINERAIS, PRIX_VILLAGEOIS, DE_ARTISAN, DE_ARTISAN_GUILDE, DE_PROSPECTION,
  desGisement, type Grade, type Recette,
} from '../data/economie'
import {
  mainOeuvre, prixDe, commerceOuvert, echanger, atelierOk, maxFabrication, fabriquer, artisansLibres, batDuMetier,
  gisements, cnt, lancer, nbTxt, arrondi,
} from '../logic/regles'

const v = computed(() => store.village!)
const mj = computed(() => estMj())
const mo = computed(() => mainOeuvre(v.value.etat))
const or = computed(() => v.value.etat.stocks.or || 0)
const message = ref('')
const dire = (t: string) => { message.value = t; setTimeout(() => { if (message.value === t) message.value = '' }, 5000) }
const entier = (s: string | number) => Math.max(0, Math.floor(Number(s) || 0))

/* ── Recrutement ── */
const nbVill = ref(1)
const metier = ref(Object.keys(METIERS)[0])
const jetArtisan = ref<number | ''>('')
const guilde = computed(() => cnt(v.value.etat, 'guilde') > 0)
const deArtisan = computed(() => guilde.value ? DE_ARTISAN_GUILDE : DE_ARTISAN)
const grade = ref<Grade>('milicien')
const nbMil = ref(1)

const recruterVillageois = () => {
  const n = entier(nbVill.value), cout = arrondi(n * PRIX_VILLAGEOIS)
  return modifier(e => {
    if (!n || e.villageois == null || (e.stocks.or || 0) < cout) return false
    e.stocks.or = arrondi((e.stocks.or || 0) - cout)
    e.villageois += n
    return [{ type: 'constr', texte: `Recrutement : ${n} villageois pour ${nbTxt(cout)} PO.` }]
  }).then(ok => ok && dire(`${n} villageois recrutés.`))
}
const recruterArtisan = () => {
  const d = entier(jetArtisan.value) || lancer(deArtisan.value), m = metier.value
  return modifier(e => {
    if (e.villageois == null || (e.stocks.or || 0) < d || d > deArtisan.value) return false
    e.stocks.or = arrondi((e.stocks.or || 0) - d)
    e.villageois += 1
    ;(e.artisans ||= {})[m] = (e.artisans[m] || 0) + 1
    return [{ type: 'constr', texte: `Recrutement : un ${METIERS[m].nom.toLowerCase()} pour ${d} PO (1d${deArtisan.value}).` }]
  }).then(ok => { if (ok) { jetArtisan.value = ''; dire(`${METIERS[m].nom} recruté pour ${d} PO.`) } else if (!store.erreur) dire(`Pas assez d’or : il faut ${d} PO.`) })
}
const equipManquant = (g: Grade, n: number) => (Object.entries(MILITAIRES[g].equipement) as [ResKey, number][])
  .filter(([k, q]) => (v.value.etat.stocks[k] || 0) < q * n).map(([k]) => RL[k].toLowerCase())
const former = () => {
  const n = entier(nbMil.value), g = grade.value
  return modifier(e => {
    const m = mainOeuvre(e)
    if (!n || !m || m.libres < n || equipManquant(g, n).length) return false
    for (const [k, q] of Object.entries(MILITAIRES[g].equipement) as [ResKey, number][]) e.stocks[k] = (e.stocks[k] || 0) - q * n
    e.villageois = (e.villageois || 0) - n
    ;(e.armee ||= {})[g] = (e.armee[g] || 0) + n
    return [{ type: 'constr', texte: `Armée : ${n} ${MILITAIRES[g].nom.toLowerCase()}${n > 1 ? 's' : ''} formé${n > 1 ? 's' : ''}.` }]
  }).then(ok => ok && dire(`${n} ${MILITAIRES[g].nom.toLowerCase()}${n > 1 ? 's' : ''} formé${n > 1 ? 's' : ''}.`))
}

/* ── Marché ── */
const ouvert = computed(() => commerceOuvert(v.value.etat))
const qte = ref<Partial<Record<ResKey, number>>>({})
const groupesMarche = computed(() => (Object.keys(GROUPES_RES) as GroupeRes[]).map(g => ({
  g, l: GROUPES_RES[g],
  items: RES.filter(r => r.g === g && r.k !== 'or').map(r => ({ ...r, prix: prixDe(v.value.etat, v.value.regles, r.k), stock: v.value.etat.stocks[r.k] || 0 })),
})))
const autres = MARCHANDISES.filter(m => !m.res)
const echange = (k: ResKey, sens: 1 | -1) => {
  const n = entier(qte.value[k] ?? 1)
  if (!n) return
  let err = ''
  return modifier((e, r) => {
    const x = echanger(e, r, k, sens * n)
    if (!x.ok) { err = x.erreur; return false }
    return [{ type: 'constr', texte: x.texte }]
  }).then(ok => dire(ok ? `${sens > 0 ? 'Acheté' : 'Vendu'} : ${n} ${RL[k].toLowerCase()}.` : err))
}

/* ── Fabrication ── */
const nbFab = ref<Record<string, number>>({})
const liste = (o: Partial<Record<ResKey, number>>) => (Object.entries(o) as [ResKey, number][]).map(([k, q]) => `${q} ${RL[k].toLowerCase()}`).join(' + ')
const fab = (x: Recette) => {
  const n = entier(nbFab.value[x.id] ?? 1)
  let t = ''
  return modifier(e => {
    const r = fabriquer(e, x, n)
    if (!r) return false
    t = r
    return [{ type: 'constr', texte: r }]
  }).then(ok => dire(ok ? t : 'Pas assez de matières premières.'))
}

/* ── Gisements ── */
const jetProsp = ref<number | ''>('')
const prospecter = () => {
  const d = entier(jetProsp.value) || lancer(DE_PROSPECTION)
  return modifier(e => {
    if ((e.stocks.or || 0) < d || d > DE_PROSPECTION) return false
    e.stocks.or = arrondi((e.stocks.or || 0) - d)
    return [{ type: 'constr', texte: `Prospection lancée pour ${d} PO (1d6). Le MJ annoncera ce qui a été trouvé.` }]
  }).then(ok => { if (ok) { jetProsp.value = ''; dire(`Prospection payée ${d} PO : le MJ annoncera le résultat.`) } else if (!store.erreur) dire(`Pas assez d’or : il faut ${d} PO.`) })
}
const nouvRes = ref<ResKey>('fer')
const nouvQual = ref(1)
const ajouterGisement = () => modifier(e => {
  const q = Math.min(5, Math.max(1, entier(nouvQual.value)))
  ;(e.gisements ||= []).push({ id: 'g' + Date.now().toString(36), res: nouvRes.value, qualite: q, mine: false })
  return [{ type: 'mj', texte: `Gisement découvert : ${RL[nouvRes.value].toLowerCase()}, qualité ${q} (1d${desGisement(nouvRes.value, q)} par mois avec une mine).` }]
})
const retirerGisement = (id: string) => modifier(e => {
  const g = gisements(e).find(x => x.id === id); if (!g) return false
  e.gisements = gisements(e).filter(x => x !== g)
  return [{ type: 'mj', texte: `Gisement retiré : ${RL[g.res].toLowerCase()}, qualité ${g.qualite}.` }]
})
const basculerMine = (id: string) => modifier(e => {
  const g = gisements(e).find(x => x.id === id); if (!g) return false
  g.mine = !g.mine
  return [{ type: 'mj', texte: `Gisement de ${RL[g.res].toLowerCase()} : ${g.mine ? 'mine en service' : 'mine retirée'}.` }]
})
const etatGisement = (id: string) => {
  const g = gisements(v.value.etat).find(x => x.id === id)!
  if (g.mine) return 'Exploité'
  return (v.value.etat.chantiers || []).some(c => c.gisement === id) ? 'Mine en chantier' : 'Libre : construis une Mine'
}
</script>

<template>
  <section class="eco">
    <p v-if="message" class="banner info" role="status">{{ message }}</p>

    <div class="cols">
      <section class="bloc">
        <h2>Population</h2>
        <template v-if="mo">
          <div class="chiffres">
            <div><span class="l">Villageois</span><b class="num">{{ mo.villageois }}</b></div>
            <div><span class="l">Main-d’œuvre libre</span><b class="num" :class="{ m: mo.libres < 0 }">{{ mo.libres }}</b></div>
            <div><span class="l">Au travail</span><b class="num">{{ mo.occupes }}</b></div>
            <div><span class="l">Artisans</span><b class="num">{{ mo.artisans }}</b></div>
            <div><span class="l">Militaires</span><b class="num">{{ mo.armee }}</b></div>
            <div><span class="l">Militaires libres</span><b class="num" :class="{ m: mo.libresArmee < 0 }">{{ mo.libresArmee }}</b></div>
          </div>
          <p v-if="mo.libres < 0 || mo.libresArmee < 0" class="flag petit">Il y a plus de postes que de bras : le MJ peut corriger les chiffres dans Règles.</p>
          <p class="muted petit">Chaque bâtiment occupe sa main-d’œuvre tant qu’il existe. Les défenses sont tenues par les militaires. Chaque villageois mange 1 nourriture par mois ; tous les 2 mois, la population grandit de 1d10 %.</p>
        </template>
        <p v-else class="banner info">Le MJ n’a pas encore indiqué le nombre de villageois (onglet Règles). En attendant, la main-d’œuvre n’est pas vérifiée et le recrutement est fermé.</p>
        <div v-if="Object.values(v.etat.artisans || {}).some(n => n)" class="tags">
          <span v-for="(n, m) in v.etat.artisans" v-show="n" :key="m" class="tag">{{ METIERS[m]?.nom ?? m }} ×{{ n }} <span class="muted">({{ artisansLibres(v.etat, v.regles, String(m)) }} libre{{ artisansLibres(v.etat, v.regles, String(m)) > 1 ? 's' : '' }})</span></span>
        </div>
        <div v-if="mo?.armee" class="tags">
          <span v-for="g in GRADES" v-show="v.etat.armee?.[g]" :key="g" class="tag">{{ MILITAIRES[g].nom }} ×{{ v.etat.armee?.[g] }}</span>
        </div>
      </section>

      <section class="bloc">
        <h2>Recruter</h2>
        <fieldset :disabled="!mo || store.enCours">
          <div class="ligne">
            <label class="field">Villageois<input id="e-vill" v-model.number="nbVill" type="number" min="1"></label>
            <button class="btn" type="button" :disabled="or < entier(nbVill) * PRIX_VILLAGEOIS || !entier(nbVill)" @click="recruterVillageois">Recruter ({{ nbTxt(entier(nbVill) * PRIX_VILLAGEOIS) }} PO)</button>
          </div>
          <div class="ligne">
            <label class="field">Artisan
              <select id="e-metier" v-model="metier"><option v-for="(m, k) in METIERS" :key="k" :value="k">{{ m.nom }} ({{ nomBat(batDuMetier(v.regles, String(k))) || 'aucun bâtiment' }})</option></select>
            </label>
            <label class="field court">1d{{ deArtisan }} PO<input id="e-jet-artisan" v-model.number="jetArtisan" type="number" min="1" :max="deArtisan" placeholder="dé"></label>
            <button class="btn" type="button" @click="recruterArtisan">{{ jetArtisan ? `Recruter (${jetArtisan} PO)` : 'Lancer le dé et recruter' }}</button>
          </div>
          <p class="muted petit">{{ guilde ? 'La guilde des artisans fait baisser le prix : 1d4 PO.' : 'Un artisan coûte 1d10 PO (1d4 avec la guilde des artisans). Il est demandé par son bâtiment.' }}</p>
          <div class="ligne">
            <label class="field">Former
              <select id="e-grade" v-model="grade"><option v-for="g in GRADES" :key="g" :value="g">{{ MILITAIRES[g].nom }}</option></select>
            </label>
            <label class="field court">Nombre<input id="e-mil" v-model.number="nbMil" type="number" min="1"></label>
            <button class="btn" type="button" :disabled="!entier(nbMil) || !mo || mo.libres < entier(nbMil) || equipManquant(grade, entier(nbMil)).length > 0" @click="former">Former</button>
          </div>
          <p class="muted petit">
            {{ MILITAIRES[grade].nom }} : {{ liste(MILITAIRES[grade].equipement) }}, puis {{ MILITAIRES[grade].nourriture }} nourriture{{ MILITAIRES[grade].boisson ? ` + ${MILITAIRES[grade].boisson} bière ou vin` : '' }}{{ MILITAIRES[grade].or ? ` + ${MILITAIRES[grade].or} PO` : '' }} par mois. Pris parmi les villageois libres.
            <span v-if="equipManquant(grade, entier(nbMil) || 1).length" class="m">Manque : {{ equipManquant(grade, entier(nbMil) || 1).join(', ') }}.</span>
          </p>
        </fieldset>
      </section>
    </div>

    <section class="bloc">
      <h2>Marché <span class="muted petit">· {{ nbTxt(or) }} PO</span></h2>
      <p v-if="!ouvert" class="banner info">Le commerce avec l’extérieur s’ouvre avec un {{ COMMERCE.map(nomBat).join(', un ').replace(/, un ([^,]*)$/, ' ou un $1') }}.{{ mj ? ' En tant que MJ, tu peux quand même noter des échanges.' : '' }}</p>
      <fieldset :disabled="(!ouvert && !mj) || store.enCours">
        <div class="tablewrap">
          <table class="marche">
            <thead><tr><th>Marchandise</th><th class="r">Stock</th><th class="r">Prix</th><th>Quantité</th><th></th></tr></thead>
            <template v-for="gr in groupesMarche" :key="gr.g">
              <tbody>
                <tr class="sous"><th colspan="5">{{ gr.l }}</th></tr>
                <tr v-for="r in gr.items" :key="r.k" :class="{ off: r.prix == null }">
                  <td>{{ r.l }}<span v-if="(r.k === 'biere' || r.k === 'vin') && v.etat.qualites?.[r.k]" class="muted"> (qualité {{ v.etat.qualites[r.k] }})</span></td>
                  <td class="r num">{{ r.stock }}</td>
                  <td class="r num">{{ r.prix == null ? '—' : nbTxt(r.prix) + ' PO' }}</td>
                  <td><input :id="'m-' + r.k" type="number" min="1" class="q" :value="qte[r.k] ?? 1" :disabled="r.prix == null" @input="qte[r.k] = entier(($event.target as HTMLInputElement).value)"></td>
                  <td class="r nowrap">
                    <template v-if="r.prix != null">
                      <button class="btn small" type="button" :disabled="or < r.prix * (qte[r.k] ?? 1)" @click="echange(r.k, 1)">Acheter</button>
                      <button class="btn small ghost" type="button" :disabled="r.stock < (qte[r.k] ?? 1)" @click="echange(r.k, -1)">Vendre</button>
                    </template>
                    <span v-else class="muted petit">Pas de prix</span>
                  </td>
                </tr>
              </tbody>
            </template>
          </table>
        </div>
      </fieldset>
      <p class="muted petit">Achat et vente au même prix. Le prix de la bière et du vin dépend de leur qualité (1 PA à 1 PO). Le MJ peut changer les prix dans Règles.</p>
      <details>
        <summary>Autres marchandises du tableur (prix de référence)</summary>
        <div class="tablewrap">
          <table><tbody>
            <tr v-for="m in autres" :key="m.nom"><td>{{ m.nom }}</td><td class="muted">{{ m.unite }}</td><td class="r num">{{ m.prix == null ? '—' : nbTxt(m.prix) + ' PO' }}<span v-if="m.ancien" class="muted"> (ancien prix)</span></td></tr>
          </tbody></table>
        </div>
      </details>
    </section>

    <section class="bloc">
      <h2>Fabrication</h2>
      <p class="muted petit">Immédiate, dans un bâtiment du village. Les quantités de la forge et du charbon viennent du tableur ; celles marquées « supposé » sont à confirmer par le MJ.</p>
      <div class="cartes">
        <article v-for="x in RECETTES" :key="x.id" class="carte" :class="{ ko: !atelierOk(v.etat, x) }">
          <div class="nm">{{ x.nom }}</div>
          <div class="petit">{{ liste(x.entrees) }} → {{ liste(x.sorties) }}</div>
          <div class="petit" :class="atelierOk(v.etat, x) ? 'muted' : 'm'">{{ atelierOk(v.etat, x) ? '' : 'Il faut : ' }}{{ x.bat.map(nomBat).join(' ou ') }}</div>
          <div v-if="x.note" class="muted petit">{{ x.note }}</div>
          <div v-if="atelierOk(v.etat, x)" class="ligne">
            <input :id="'f-' + x.id" type="number" min="1" class="q" :value="nbFab[x.id] ?? 1" @input="nbFab[x.id] = entier(($event.target as HTMLInputElement).value)">
            <button class="btn small" type="button" :disabled="store.enCours || maxFabrication(v.etat, x) < (nbFab[x.id] ?? 1) || !(nbFab[x.id] ?? 1)" @click="fab(x)">Fabriquer</button>
            <span class="muted petit">max {{ maxFabrication(v.etat, x) }}</span>
          </div>
        </article>
      </div>
    </section>

    <section class="bloc">
      <h2>Gisements</h2>
      <p class="muted petit">Une prospection (minerai, pierre ou surface) coûte 1d6 PO ; le MJ annonce ensuite ce qui a été trouvé et sa qualité (1 à 5). Une Mine construite sur un gisement le fait produire chaque mois.</p>
      <div class="ligne">
        <label class="field court">1d6 PO<input id="e-jet-prosp" v-model.number="jetProsp" type="number" min="1" max="6" placeholder="dé"></label>
        <button class="btn" type="button" :disabled="store.enCours" @click="prospecter">{{ jetProsp ? `Prospecter (${jetProsp} PO)` : 'Lancer le dé et prospecter' }}</button>
      </div>
      <div v-if="gisements(v.etat).length" class="tablewrap">
        <table>
          <thead><tr><th>Gisement</th><th>Qualité</th><th>Production</th><th>État</th><th v-if="mj"></th></tr></thead>
          <tbody>
            <tr v-for="g in gisements(v.etat)" :key="g.id">
              <td>{{ RL[g.res] }}</td>
              <td class="num">{{ g.qualite }} / 5</td>
              <td class="num">{{ desGisement(g.res, g.qualite) > 1 ? '1d' + desGisement(g.res, g.qualite) : 1 }} / mois</td>
              <td>{{ etatGisement(g.id) }}</td>
              <td v-if="mj" class="r nowrap">
                <button class="btn small ghost" type="button" :disabled="store.enCours" @click="basculerMine(g.id)">{{ g.mine ? 'Retirer la mine' : 'Mine déjà là' }}</button>
                <button class="btn small ghost" type="button" :disabled="store.enCours" @click="retirerGisement(g.id)">Retirer</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="muted petit">Aucun gisement connu pour l’instant.</p>
      <div v-if="mj" class="ligne mj-ajout">
        <label class="field">Nouveau gisement (MJ)
          <select id="e-gis-res" v-model="nouvRes"><option v-for="k in MINERAIS" :key="k" :value="k">{{ RL[k] }}</option><option disabled>──</option><option v-for="r in RES.filter(x => !MINERAIS.includes(x.k))" :key="r.k" :value="r.k">{{ r.l }}</option></select>
        </label>
        <label class="field court">Qualité<input id="e-gis-q" v-model.number="nouvQual" type="number" min="1" max="5"></label>
        <button class="btn" type="button" :disabled="store.enCours" @click="ajouterGisement">Ajouter (1d{{ desGisement(nouvRes, nouvQual || 1) }} / mois)</button>
      </div>
    </section>
  </section>
</template>

<style scoped>
.eco { display: flex; flex-direction: column; gap: 22px }
.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 22px }
.cols > * { min-width: 0 }
.bloc h2 { margin-top: 0 }
fieldset { border: 0; padding: 0; margin: 0; min-width: 0; display: flex; flex-direction: column; gap: 10px }
.chiffres { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px }
.chiffres > div { display: flex; flex-direction: column; padding: 6px 10px; border-radius: 8px; background: var(--surface); border: 1px solid var(--line) }
.chiffres .l { font-size: .72rem; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); font-weight: 700 }
.chiffres b { font-size: 1.25rem }
.ligne { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap }
.ligne .field { min-width: 0 }
.court input { width: 80px }
.q { width: 72px; border: 1px solid var(--line); border-radius: 6px; padding: 4px 6px; background: var(--surface); color: var(--fg) }
.petit { font-size: .88rem; margin: 0; max-width: 70ch }
.m { color: var(--bad); font-weight: 700 }
.tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px }
.marche .sous th { background: var(--surface); font-size: .78rem; text-transform: uppercase; letter-spacing: .07em; color: var(--muted) }
.marche tr.off td { color: var(--muted) }
.nowrap { white-space: nowrap }
.cartes { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px }
.carte { background: var(--raised); border: 1px solid var(--line); border-left: 4px solid var(--good); border-radius: var(--r); padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; min-width: 0 }
.carte.ko { border-left-color: var(--line); opacity: .75 }
.nm { font-weight: 800 }
details { margin-top: 8px }
summary { cursor: pointer; font-weight: 600 }
.mj-ajout { margin-top: 10px }
.flag { color: var(--bad) }
</style>
