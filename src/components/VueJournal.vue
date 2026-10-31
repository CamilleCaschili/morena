<script setup lang="ts">
import { ref, computed } from 'vue'
import { store, pseudo } from '../logic/store'
import { dateDe } from '../logic/calendrier'

const LAB = { jour: 'Mois écoulé', constr: 'Construction', mj: 'Ajustement' } as const
const filtre = ref<'' | 'jour' | 'constr' | 'mj'>('')
const lignes = computed(() => store.journal.filter(l => !filtre.value || l.type === filtre.value))
const heure = (s: string) => new Date(s).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <section>
    <div class="hd">
      <h2>Journal du village</h2>
      <select id="j-filtre" v-model="filtre" aria-label="Filtrer le journal">
        <option value="">Tout</option><option value="jour">Passages de mois</option><option value="constr">Constructions</option><option value="mj">Ajustements</option>
      </select>
    </div>
    <ul v-if="lignes.length" class="log">
      <li v-for="l in lignes" :key="l.id">
        <span class="dj">{{ dateDe(l.jour) }}</span>
        <span>
          <span class="k" :class="l.type">{{ LAB[l.type] }}</span>{{ l.texte }}
          <span class="qui">{{ pseudo(l.user_id) ? pseudo(l.user_id) + ' · ' : '' }}{{ heure(l.created_at) }}</span>
        </span>
      </li>
    </ul>
    <p v-else class="muted">Rien pour l'instant.</p>
  </section>
</template>

<style scoped>
.hd { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; margin-bottom: 8px }
.hd h2 { margin: 0 }
select { border: 1px solid var(--line); background: var(--raised); border-radius: 8px; padding: 6px 10px }
.log { list-style: none; margin: 0; padding: 0 }
.log li { display: grid; grid-template-columns: 110px 1fr; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--line) }
.dj { font-family: var(--f-display); color: var(--muted) }
.k { font-size: .72rem; text-transform: uppercase; letter-spacing: .07em; font-weight: 800; margin-right: 6px }
.k.jour { color: var(--accent) } .k.constr { color: var(--good) } .k.mj { color: var(--muted) }
.qui { display: block; font-size: .8rem; color: var(--muted); margin-top: 2px }
@media (max-width: 560px) { .log li { grid-template-columns: 84px 1fr } }
</style>
