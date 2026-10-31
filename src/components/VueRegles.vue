<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { store, modifier, estMj } from '../logic/store'
import { B, BI, CATS, EMPL, EMPL_CHOICES, RES, RL, GROUPES_RES, JAUGES, nomBat, type CatKey, type ResKey, type GroupeRes, type JaugeKey } from '../data/catalogue'
import { METIERS, MILITAIRES, GRADES, PRIX, PRIX_QUALITE, REGLES_TABLEUR, EFFETS_TABLEUR, type Grade, type Boisson } from '../data/economie'
import { cnt, normOrdre, decrireEffet, chantiers, dureeChantier, DUREE_CHANTIER, terminerChantiers, libelleChantier, batDuMetier, prixDe, nbTxt, arrondi, type Regle, type Effet } from '../logic/regles'
import { MOIS, SAISONS, ORDRE_SAISONS, moisDe, anDe, cycleDe, dateDe, type Saison } from '../logic/calendrier'

const v = computed(() => store.village!)
const mj = computed(() => estMj())
const ajout = ref('champs')
const groupes = (Object.keys(CATS) as CatKey[]).map(c => ({ c, l: CATS[c], items: B.filter(b => b.cat === c) }))
const construits = computed(() => B.filter(b => cnt(v.value.etat, b.id) > 0))
const nb = (s: string): number | null => s === '' ? null : Math.max(0, Math.round(Number(s)))

function val(e: Event) { return (e.target as HTMLInputElement).value }

const setDate = (mois: number, an: number) => modifier(e => {
  const n = cycleDe(mois, an); if (n === e.jour) return false
  const t = `Date corrigée : ${dateDe(e.jour)} → ${dateDe(n)}.`
  // les chantiers gardent leur durée restante
  for (const c of chantiers(e)) c.fin += n - e.jour
  e.jour = n
  return [{ type: 'mj', texte: t }]
})
const setMois = (s: string) => setDate(Number(s), anDe(v.value.etat.jour))
const setAn = (s: string) => setDate(moisDe(v.value.etat.jour), Math.max(1, nb(s) || 1))

function basculerPause(id: string, sa: Saison) {
  return modifier((_e, r) => {
    const g = r.regles.find(x => x.id === id); if (!g) return false
    const p = new Set(g.pause || [])
    if (p.has(sa)) p.delete(sa); else p.add(sa)
    g.pause = ORDRE_SAISONS.filter(x => p.has(x))
    if (!g.pause.length) delete g.pause
    return [{ type: 'mj', texte: `${BI[g.bat]?.nom ?? g.bat} (${RL[g.res].toLowerCase()}) : ${p.has(sa) ? 'à l’arrêt' : 'actif'} en ${SAISONS[sa].toLowerCase()}.` }]
  })
}

const ajoutDuree = ref('chapelle')
// le menu propose seulement les bâtiments encore à la durée par défaut
watch(() => Object.keys(v.value.regles.durees || {}).join(), () => {
  if (v.value.regles.durees?.[ajoutDuree.value]) ajoutDuree.value = B.find(x => x.cost && !v.value.regles.durees?.[x.id])?.id ?? ''
}, { immediate: true })
const durees = computed(() => Object.entries(v.value.regles.durees || {}).map(([id, n]) => ({ id, n, nom: BI[id]?.nom ?? id })).sort((a, b) => a.nom.localeCompare(b.nom)))
/** n = null ou DUREE_CHANTIER : retour à la durée par défaut */
const setDuree = (id: string, n: number | null) => modifier((_e, r) => {
  const o = dureeChantier(r, id), m = Math.max(1, n ?? DUREE_CHANTIER)
  if (m === DUREE_CHANTIER) { if (!r.durees?.[id]) return false; delete r.durees[id] } else (r.durees ||= {})[id] = m
  if (m === o) return false
  return [{ type: 'mj', texte: `Durée de chantier : ${BI[id]?.nom ?? id}, ${o} → ${m} mois.` }]
})
const finirChantier = (i: number) => modifier(e => {
  const c = chantiers(e)[i]; if (!c) return false
  c.fin = e.jour
  terminerChantiers(e)
  return [{ type: 'mj', texte: `Chantier terminé à la main : ${BI[c.id]?.nom ?? c.id}.` }]
})
const annulerChantier = (i: number) => modifier(e => {
  const c = chantiers(e)[i]; if (!c) return false
  e.chantiers = chantiers(e).filter(x => x !== c)
  for (const [k, n] of Object.entries(c.cout)) e.stocks[k] = (e.stocks[k] || 0) + (n as number)
  return [{ type: 'mj', texte: `Chantier annulé et remboursé : ${BI[c.id]?.nom ?? c.id}.` }]
})
// l'or se compte au centième (0,5 PO pour un villageois)
const setStock = (k: ResKey, s: string) => modifier(e => {
  const n = k === 'or' ? arrondi(Math.max(0, Number(s.replace(',', '.')) || 0)) : nb(s) || 0, o = e.stocks[k] || 0
  if (n === o) return false
  e.stocks[k] = n
  return [{ type: 'mj', texte: `${RL[k]} corrigé : ${nbTxt(o)} → ${nbTxt(n)}.` }]
})
const groupesRes = (Object.keys(GROUPES_RES) as GroupeRes[]).map(g => ({ g, l: GROUPES_RES[g], items: RES.filter(r => r.g === g) }))
const setVill = (s: string) => modifier(e => { e.villageois = nb(s); return [{ type: 'mj', texte: `Villageois : ${e.villageois ?? 'inconnu'}.` }] })
const setArtisan = (m: string, s: string) => modifier(e => {
  const n = nb(s) || 0, o = e.artisans?.[m] || 0; if (n === o) return false
  ;(e.artisans ||= {})[m] = n
  return [{ type: 'mj', texte: `Artisans (${METIERS[m].nom.toLowerCase()}) : ${o} → ${n}.` }]
})
const setArmee = (g: Grade, s: string) => modifier(e => {
  const n = nb(s) || 0, o = e.armee?.[g] || 0; if (n === o) return false
  ;(e.armee ||= {})[g] = n
  return [{ type: 'mj', texte: `${MILITAIRES[g].nom}s : ${o} → ${n}.` }]
})
const setJauge = (k: JaugeKey, s: string) => modifier(e => {
  const n = Math.round(Number(s) || 0), o = e.ajustJauges?.[k] || 0; if (n === o) return false
  ;(e.ajustJauges ||= {})[k] = n
  return [{ type: 'mj', texte: `${JAUGES[k]} : ajustement ${o} → ${n}.` }]
})
const setQualite = (k: Boisson, s: string) => modifier(e => {
  const q = nb(s); (e.qualites ||= {})
  if (q) e.qualites[k] = Math.min(4, Math.max(1, q)); else delete e.qualites[k]
  return [{ type: 'mj', texte: `Qualité ${k === 'biere' ? 'de la bière' : 'du vin'} : ${q ? 'niveau ' + e.qualites[k] : 'pas encore tirée'}.` }]
})
/** '' : retour au prix du tableur, '-' : pas d'échange */
const setPrix = (k: ResKey, s: string) => modifier((e, r) => {
  const o = prixDe(e, r, k)
  const t = s.trim().replace(',', '.')
  if (t === '') { if (!r.prix || !(k in r.prix)) return false; delete r.prix[k] }
  else (r.prix ||= {})[k] = t === '-' ? null : arrondi(Math.max(0, Number(t) || 0))
  const n = prixDe(e, r, k)
  return [{ type: 'mj', texte: `Prix ${RL[k].toLowerCase()} : ${o == null ? 'aucun' : nbTxt(o) + ' PO'} → ${n == null ? 'aucun' : nbTxt(n) + ' PO'}.` }]
})
const prixTableur = (k: ResKey) => k === 'biere' || k === 'vin' ? `selon la qualité (${PRIX_QUALITE.map(nbTxt).join(' / ')})` : PRIX[k] == null ? 'aucun' : nbTxt(PRIX[k]!) + ' PO'
const setMetier = (m: string, id: string) => modifier((_e, r) => {
  const o = batDuMetier(r, m); if (o === id) return false
  if (id === METIERS[m].bat) { if (r.metiers) delete r.metiers[m] } else (r.metiers ||= {})[m] = id
  return [{ type: 'mj', texte: `${METIERS[m].nom} : demandé par ${id ? nomBat(id) : 'aucun bâtiment'}.` }]
})

// remplace la production et les effets par ceux du tableur du MJ
const confirmerTableur = ref(false)
const appliquerTableur = () => modifier((_e, r) => {
  r.regles = JSON.parse(JSON.stringify(REGLES_TABLEUR))
  r.effets = JSON.parse(JSON.stringify(EFFETS_TABLEUR))
  return [{ type: 'mj', texte: 'Production et effets remplacés par ceux du tableur du MJ.' }]
}).then(() => { confirmerTableur.value = false })
const setEmpl = (k: string, on: boolean) => modifier(e => { e.empl = (e.empl || []).filter(x => x !== k); if (on) e.empl.push(k); return [{ type: 'mj', texte: `Emplacement « ${EMPL[k as keyof typeof EMPL]} » ${on ? 'ajouté' : 'retiré'}.` }] })

function majRegle(id: string, champ: keyof Regle, brut: string) {
  return modifier((_e, r) => {
    const g = r.regles.find(x => x.id === id); if (!g) return false
    const x = g as unknown as Record<string, unknown>
    x[champ] = champ === 'sens' ? Number(brut) : champ === 'n' ? nb(brut) : champ === 'faces' ? Math.max(2, nb(brut) || 100) : brut
    return [{ type: 'mj', texte: `Règle modifiée : ${BI[g.bat]?.nom ?? g.bat}, ${RL[g.res]}.` }]
  })
}
const retirerRegle = (id: string) => modifier((_e, r) => { r.regles = r.regles.filter(x => x.id !== id); return [] })
const ajouterRegle = () => modifier((_e, r) => { r.regles.push({ id: 'r' + Date.now().toString(36), bat: 'champs', res: 'nourriture', sens: 1, mode: 'fixe', n: null }); return [] })

function majEffet(id: string, champ: keyof Effet, brut: string) {
  return modifier((_e, r) => {
    const f = (r.effets ||= []).find(x => x.id === id); if (!f) return false
    const x = f as unknown as Record<string, unknown>
    x[champ] = champ === 'sens' ? Number(brut) : champ === 'val' ? nb(brut) : brut
    return [{ type: 'mj', texte: `Effet modifié : ${BI[f.bat]?.nom ?? f.bat} — ${decrireEffet(f)}.` }]
  })
}
const retirerEffet = (id: string) => modifier((_e, r) => { r.effets = (r.effets || []).filter(x => x.id !== id); return [] })
const ajouterEffet = () => modifier((_e, r) => { (r.effets ||= []).push({ id: 'e' + Date.now().toString(36), bat: 'scierie', type: 'cout', sens: -1, val: null, unit: 'fixe', res: 'bois', cible: 'tous', note: '' }); return [] })

const pas = (id: string, d: number) => modifier(e => {
  e.bat[id] = Math.max(0, (e.bat[id] || 0) + d); if (!e.bat[id]) delete e.bat[id]
  // l'exemplaire retiré est le dernier : sa case redevient libre
  if (d < 0 && e.places) delete e.places[`${id}:${e.bat[id] || 0}`]
  e.ordre = normOrdre(e)
  return [{ type: 'mj', texte: `${BI[id].nom} ${d > 0 ? 'ajouté' : 'retiré'} (sans coût).` }]
})
</script>

<template>
  <section>
    <p v-if="!mj" class="banner info">Seul le MJ peut modifier cette page. Tu peux la consulter pour comprendre les règles du village.</p>
    <p v-else class="muted intro">Ici on corrige tout à la main : stocks, bâtiments déjà présents, production et effets spéciaux. Chaque modification est notée dans le journal.</p>

    <fieldset :disabled="!mj || store.enCours">
      <h3>Date et stocks</h3>
      <p class="muted petit">Un passage de cycle fait avancer d'un mois ; douze mois font une année. L'hiver va de décembre à février.</p>
      <div class="grille">
        <label class="field">Mois<select id="r-mois" :value="moisDe(v.etat.jour)" @change="setMois(val($event))"><option v-for="(m, i) in MOIS" :key="m" :value="i">{{ m }}</option></select></label>
        <label class="field">Année<input id="r-an" type="number" min="1" :value="anDe(v.etat.jour)" @change="setAn(val($event))"></label>
      </div>
      <template v-for="gr in groupesRes" :key="gr.g">
        <h4>{{ gr.l }}</h4>
        <div class="grille">
          <label v-for="r in gr.items" :key="r.k" class="field">{{ r.l }}<input :id="'r-st-' + r.k" type="number" min="0" :step="r.k === 'or' ? 0.01 : 1" :value="v.etat.stocks[r.k] || 0" @change="setStock(r.k, val($event))"></label>
        </div>
      </template>

      <h3>Population</h3>
      <div class="grille">
        <label class="field">Villageois (−1 nourriture chacun par mois)<input id="r-vill" type="number" min="0" placeholder="Inconnu" :value="v.etat.villageois ?? ''" @change="setVill(val($event))"></label>
      </div>
      <p class="muted petit">Artisans compris. La main-d’œuvre libre se calcule : villageois − artisans − postes des bâtiments (voir l’onglet Économie). Tant que le nombre est vide, elle n’est pas vérifiée.</p>
      <h4>Artisans</h4>
      <div class="grille">
        <label v-for="(m, k) in METIERS" :key="k" class="field">{{ m.nom }}<input :id="'r-art-' + k" type="number" min="0" :value="v.etat.artisans?.[k] || 0" @change="setArtisan(String(k), val($event))"></label>
      </div>
      <h4>Armée</h4>
      <div class="grille">
        <label v-for="g in GRADES" :key="g" class="field">{{ MILITAIRES[g].nom }}s<input :id="'r-arm-' + g" type="number" min="0" :value="v.etat.armee?.[g] || 0" @change="setArmee(g, val($event))"></label>
      </div>

      <h3>Jauges et boissons</h3>
      <p class="muted petit">Les jauges se calculent avec les bâtiments construits (chaque exemplaire compte). Ajoute ici les bonus ou malus des événements.</p>
      <div class="grille">
        <label v-for="(l, k) in JAUGES" :key="k" class="field">{{ l }} (ajustement)<input :id="'r-jg-' + k" type="number" :value="v.etat.ajustJauges?.[k] || 0" @change="setJauge(k as JaugeKey, val($event))"></label>
        <label v-for="k in (['biere', 'vin'] as Boisson[])" :key="k" class="field">Qualité {{ k === 'biere' ? 'de la bière' : 'du vin' }} (1 à 4)<input :id="'r-q-' + k" type="number" min="1" max="4" placeholder="Pas tirée" :value="v.etat.qualites?.[k] ?? ''" @change="setQualite(k, val($event))"></label>
      </div>
      <p class="muted petit">La qualité se tire au d20 à la construction du premier brasseur ou vignoble (1-5 : 1, 6-10 : 2, 11-15 : 3, 16-20 : 4).</p>

      <h3>Emplacements du village</h3>
      <div class="checks">
        <label v-for="k in EMPL_CHOICES" :key="k"><input :id="'r-empl-' + k" type="checkbox" :checked="(v.etat.empl || []).includes(k)" @change="setEmpl(k, ($event.target as HTMLInputElement).checked)"> {{ EMPL[k] }}</label>
      </div>

      <h3>Règles du tableur</h3>
      <p class="muted petit">Remplace la production mensuelle et les effets ci-dessous par ceux du tableur du MJ (dés 1d100, 1d20, 2d20, champs, verger, vignoble et brasseur à l’arrêt l’hiver, scierie et maçonnerie…). Le reste du village ne change pas.</p>
      <div v-if="confirmerTableur" class="confirm">
        <span>Remplacer les {{ v.regles.regles.length }} règles de production et les {{ (v.regles.effets || []).length }} effets actuels ?</span>
        <div class="row">
          <button class="btn primary small" type="button" @click="appliquerTableur">Remplacer</button>
          <button class="btn small ghost" type="button" @click="confirmerTableur = false">Annuler</button>
        </div>
      </div>
      <button v-else class="btn small" type="button" @click="confirmerTableur = true">Appliquer les règles du tableur</button>

      <h3>Production et consommation mensuelles</h3>
      <p class="muted petit">« À l'arrêt » : la règle ne s'applique pas pendant les saisons cochées (par exemple les champs enneigés l'hiver).</p>
      <div class="tablewrap">
        <table>
          <thead><tr><th>Bâtiment</th><th>Ressource</th><th>Effet</th><th>Type</th><th>Quantité / bâtiment</th><th>À l'arrêt</th><th></th></tr></thead>
          <tbody>
            <tr v-for="g in v.regles.regles" :key="g.id">
              <td><select :id="'rb-' + g.id" :value="g.bat" @change="majRegle(g.id, 'bat', val($event))"><optgroup v-for="gr in groupes" :key="gr.c" :label="gr.l"><option v-for="b in gr.items" :key="b.id" :value="b.id">{{ b.nom }}</option></optgroup></select></td>
              <td><select :id="'rr-' + g.id" :value="g.res" @change="majRegle(g.id, 'res', val($event))"><option v-for="r in RES" :key="r.k" :value="r.k">{{ r.l }}</option></select></td>
              <td><select :id="'rs-' + g.id" :value="String(g.sens)" @change="majRegle(g.id, 'sens', val($event))"><option value="1">Produit</option><option value="-1">Consomme</option></select></td>
              <td><select :id="'rm-' + g.id" :value="g.mode" @change="majRegle(g.id, 'mode', val($event))"><option value="fixe">Fixe</option><option value="de">Dés</option></select></td>
              <td class="qte"><input :id="'rn-' + g.id" type="number" min="0" placeholder="?" :value="g.n ?? ''" @change="majRegle(g.id, 'n', val($event))"> <template v-if="g.mode === 'de'"><span class="muted">d</span><input :id="'rf-' + g.id" type="number" min="2" class="court" :value="g.faces || 100" @change="majRegle(g.id, 'faces', val($event))"></template> <span v-if="g.n == null" class="flag">à préciser</span></td>
              <td><span class="saisons" role="group" :aria-label="'Saisons à l’arrêt pour ' + (BI[g.bat]?.nom ?? g.bat)">
                <button v-for="sa in ORDRE_SAISONS" :key="sa" type="button" :class="sa" :aria-pressed="!!g.pause?.includes(sa)" :title="SAISONS[sa]" @click="basculerPause(g.id, sa)">{{ SAISONS[sa] }}</button>
              </span></td>
              <td><button class="btn small ghost" type="button" @click="retirerRegle(g.id)">Retirer</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <button class="btn small ajout" type="button" @click="ajouterRegle">Ajouter une règle</button>

      <h3>Effets spéciaux des bâtiments</h3>
      <p class="muted petit">Un effet s'applique dès que le bâtiment est construit (une seule fois, même en plusieurs exemplaires). « Coût » modifie automatiquement le prix des constructions ciblées ; « Note » sert aux effets gérés à la main.</p>
      <div class="tablewrap">
        <table>
          <thead><tr><th>Bâtiment</th><th>Type</th><th>Modification</th><th>Ressource</th><th>Cible</th><th>Note</th><th></th></tr></thead>
          <tbody>
            <tr v-for="f in v.regles.effets || []" :key="f.id">
              <td><select :id="'eb-' + f.id" :value="f.bat" @change="majEffet(f.id, 'bat', val($event))"><optgroup v-for="gr in groupes" :key="gr.c" :label="gr.l"><option v-for="b in gr.items" :key="b.id" :value="b.id">{{ b.nom }}</option></optgroup></select></td>
              <td><select :id="'et-' + f.id" :value="f.type" @change="majEffet(f.id, 'type', val($event))"><option value="cout">Coût</option><option value="note">Note</option></select></td>
              <template v-if="f.type === 'cout'">
                <td class="nowrap">
                  <select :id="'es-' + f.id" class="auto" :value="String(f.sens)" @change="majEffet(f.id, 'sens', val($event))"><option value="-1">−</option><option value="1">+</option></select>
                  <input :id="'ev-' + f.id" type="number" min="0" placeholder="?" class="court" :value="f.val ?? ''" @change="majEffet(f.id, 'val', val($event))">
                  <select :id="'eu-' + f.id" class="auto" :value="f.unit" @change="majEffet(f.id, 'unit', val($event))"><option value="fixe">unités</option><option value="%">%</option><option value="palier">unités (moitié si coût ≤)</option></select>
                </td>
                <td><select :id="'er-' + f.id" :value="f.res" @change="majEffet(f.id, 'res', val($event))"><option v-for="r in RES" :key="r.k" :value="r.k">{{ r.l }}</option></select></td>
                <td>
                  <select :id="'ec-' + f.id" :value="f.cible || 'tous'" @change="majEffet(f.id, 'cible', val($event))">
                    <option value="tous">Toutes les constructions</option>
                    <option v-for="(l, k) in CATS" :key="k" :value="'cat:' + k">Catégorie : {{ l }}</option>
                    <optgroup label="Un bâtiment précis"><option v-for="b in B.filter(x => x.cost)" :key="b.id" :value="b.id">{{ b.nom }}</option></optgroup>
                  </select>
                </td>
              </template>
              <td v-else colspan="3" class="muted">Effet géré à la main</td>
              <td><input :id="'en-' + f.id" type="text" placeholder="Description" class="note" :value="f.note" @change="majEffet(f.id, 'note', val($event))"></td>
              <td><button class="btn small ghost" type="button" @click="retirerEffet(f.id)">Retirer</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="!(v.regles.effets || []).length" class="muted petit">Aucun effet pour l'instant.</p>
      <button class="btn small ajout" type="button" @click="ajouterEffet">Ajouter un effet</button>

      <h3>Prix du marché</h3>
      <p class="muted petit">En pièces d’or, pour l’achat comme la vente. Laisse vide pour reprendre le prix du tableur ; mets « - » pour interdire l’échange.</p>
      <div class="tablewrap">
        <table>
          <thead><tr><th>Ressource</th><th>Tableur</th><th>Prix utilisé</th></tr></thead>
          <tbody>
            <tr v-for="r in RES.filter(x => x.k !== 'or')" :key="r.k">
              <td>{{ r.l }}</td>
              <td class="muted">{{ prixTableur(r.k) }}</td>
              <td class="qte"><input :id="'rp-' + r.k" type="text" inputmode="decimal" :placeholder="prixDe(v.etat, v.regles, r.k) == null ? 'aucun' : nbTxt(prixDe(v.etat, v.regles, r.k)!)"
                :value="v.regles.prix && r.k in v.regles.prix ? (v.regles.prix[r.k] == null ? '-' : nbTxt(v.regles.prix[r.k]!)) : ''" @change="setPrix(r.k, val($event))"> <span class="muted">PO</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>Artisans demandés</h3>
      <p class="muted petit">Bâtiment qui ne peut se construire qu’avec un artisan libre de ce métier (à adapter au besoin).</p>
      <div class="tablewrap">
        <table><tbody>
          <tr v-for="(m, k) in METIERS" :key="k">
            <td>{{ m.nom }}</td>
            <td><select :id="'rmt-' + k" :value="batDuMetier(v.regles, String(k))" @change="setMetier(String(k), val($event))">
              <option value="">Aucun bâtiment</option>
              <optgroup v-for="gr in groupes" :key="gr.c" :label="gr.l"><option v-for="b in gr.items.filter(x => x.cost)" :key="b.id" :value="b.id">{{ b.nom }}</option></optgroup>
            </select></td>
          </tr>
        </tbody></table>
      </div>

      <h3>Durée des chantiers</h3>
      <p class="muted petit">Par défaut, tout chantier dure {{ DUREE_CHANTIER }} mois. Ajoute ici les bâtiments plus longs à construire ; les chantiers déjà lancés gardent leur date de fin.</p>
      <div v-if="durees.length" class="tablewrap">
        <table><tbody>
          <tr v-for="d in durees" :key="d.id">
            <td>{{ d.nom }}</td>
            <td class="qte"><input :id="'rd-' + d.id" type="number" min="1" :value="d.n" @change="setDuree(d.id, nb(val($event)))"> <span class="muted">mois</span></td>
            <td class="r"><button class="btn small ghost" type="button" @click="setDuree(d.id, null)">Remettre à {{ DUREE_CHANTIER }} mois</button></td>
          </tr>
        </tbody></table>
      </div>
      <div class="ajout-bat">
        <select id="r-ajout-duree" v-model="ajoutDuree"><optgroup v-for="gr in groupes" :key="gr.c" :label="gr.l"><option v-for="b in gr.items.filter(x => x.cost && !v.regles.durees?.[x.id])" :key="b.id" :value="b.id">{{ b.nom }}</option></optgroup></select>
        <button class="btn small" type="button" @click="setDuree(ajoutDuree, 2)">Allonger ce chantier (2 mois)</button>
      </div>

      <h3>Chantiers en cours</h3>
      <div v-if="chantiers(v.etat).length" class="tablewrap">
        <table><tbody>
          <tr v-for="(c, i) in chantiers(v.etat)" :key="i">
            <td>{{ libelleChantier(c) }}</td>
            <td class="r nowrap">
              <button class="btn small" type="button" @click="finirChantier(i)">Terminer maintenant</button>
              <button class="btn small ghost" type="button" @click="annulerChantier(i)">Annuler et rembourser</button>
            </td>
          </tr>
        </tbody></table>
      </div>
      <p v-else class="muted petit">Aucun chantier. Un bâtiment lancé dans Construire est payé tout de suite et terminé au passage du mois suivant.</p>

      <h3>Bâtiments déjà présents (sans payer)</h3>
      <p class="muted petit">Pour corriger la liste sans dépenser de ressources. Une vraie construction passe par l'onglet Construire.</p>
      <div class="tablewrap">
        <table><tbody>
          <tr v-for="b in construits" :key="b.id">
            <td>{{ b.nom }}</td>
            <td class="r"><span class="pas">
              <button type="button" :aria-label="'Retirer ' + b.nom" @click="pas(b.id, -1)">−</button>
              <b class="num">{{ cnt(v.etat, b.id) }}</b>
              <button type="button" :aria-label="'Ajouter ' + b.nom" @click="pas(b.id, 1)">+</button>
            </span></td>
          </tr>
        </tbody></table>
      </div>
      <div class="ajout-bat">
        <select id="r-ajout" v-model="ajout"><optgroup v-for="gr in groupes" :key="gr.c" :label="gr.l"><option v-for="b in gr.items" :key="b.id" :value="b.id">{{ b.nom }}</option></optgroup></select>
        <button class="btn small" type="button" @click="pas(ajout, 1)">Ajouter ce bâtiment</button>
      </div>
    </fieldset>
  </section>
</template>

<style scoped>
fieldset { border: 0; padding: 0; margin: 0; min-width: 0 }
.intro { max-width: 65ch }
.grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px }
.checks { display: flex; flex-wrap: wrap; gap: 12px }
.checks label { display: flex; gap: 6px; align-items: center }
.qte input { width: 80px }
.court { width: 64px !important }
.auto { width: auto !important }
.note { min-width: 160px }
.nowrap { white-space: nowrap }
.ajout { margin-top: 8px }
.petit { font-size: .9rem; margin-top: 0; max-width: 65ch }
.saisons { display: inline-flex; gap: 4px; flex-wrap: wrap }
.saisons button { border: 1px solid var(--line); background: var(--raised); color: var(--muted); border-radius: 999px; padding: 2px 8px; font-size: .78rem; font-weight: 700 }
.saisons button[aria-pressed="true"] { color: #fff; border-color: transparent; text-decoration: line-through }
.saisons button.printemps[aria-pressed="true"] { background: #4d8a3a }
.saisons button.ete[aria-pressed="true"] { background: #b8860b }
.saisons button.automne[aria-pressed="true"] { background: #b5531c }
.saisons button.hiver[aria-pressed="true"] { background: #3f6e9e }
h4 { margin: 12px 0 6px; font-size: .85rem; text-transform: uppercase; letter-spacing: .07em; color: var(--muted) }
.confirm { font-size: .9rem; background: var(--accent-soft); border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; max-width: 520px }
.row { display: flex; gap: 6px; flex-wrap: wrap }
.pas { display: inline-flex; align-items: center; gap: 6px }
.pas button { width: 28px; height: 28px; border-radius: 6px; border: 1px solid var(--line); background: var(--raised); font-weight: 800 }
.ajout-bat { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; align-items: center }
.ajout-bat select { max-width: 100%; border: 1px solid var(--line); background: var(--raised); border-radius: 6px; padding: 5px 8px }
</style>
