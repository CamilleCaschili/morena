<script setup lang="ts">
import { ref } from 'vue'
import { supabase } from '../lib/supabase'

const email = ref('')
const etat = ref<'saisie' | 'envoi' | 'envoye'>('saisie')
const erreur = ref('')

async function envoyer() {
  erreur.value = ''
  const e = email.value.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { erreur.value = 'Cette adresse e-mail ne semble pas valide.'; return }
  etat.value = 'envoi'
  const { error } = await supabase.auth.signInWithOtp({
    email: e,
    // Personne ne peut créer de compte depuis le site : seuls les membres ajoutés dans Supabase reçoivent un lien.
    options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
  })
  if (error) {
    etat.value = 'saisie'
    const m = error.message.toLowerCase()
    if (m.includes('signup') || m.includes('not allowed') || m.includes('not found')) erreur.value = 'Cette adresse ne fait pas partie du groupe. Demande au MJ de l’ajouter.'
    else if (m.includes('rate') || m.includes('seconds')) erreur.value = 'Trop de demandes d’affilée. Patiente une minute avant de redemander un lien.'
    else erreur.value = 'L’envoi a échoué : ' + error.message
    return
  }
  etat.value = 'envoye'
}
</script>

<template>
  <section class="connexion">
    <svg class="blason" viewBox="0 0 64 64" aria-hidden="true"><path d="M4 54 L22 18 L33 36 L42 24 L60 54 Z" fill="#64717e"/><path d="M22 18 L27.5 29 L17 29 Z" fill="#f4f7f9"/><rect x="26" y="40" width="12" height="10" fill="#d6a057"/><path d="M24 41 L32 33 L40 41 Z" fill="#b5543f"/></svg>
    <h1>Morena</h1>
    <p class="muted">Le village de la campagne. Entre ton adresse e-mail : tu recevras un lien de connexion, sans mot de passe.</p>

    <form v-if="etat !== 'envoye'" @submit.prevent="envoyer">
      <label class="field" for="email">Adresse e-mail</label>
      <input id="email" v-model="email" type="email" autocomplete="email" inputmode="email" required placeholder="toi@exemple.fr">
      <button class="btn primary" type="submit" :disabled="etat === 'envoi'">{{ etat === 'envoi' ? 'Envoi…' : 'Recevoir le lien' }}</button>
      <p v-if="erreur" class="err" role="alert">{{ erreur }}</p>
    </form>
    <div v-else class="ok">
      <p><b>Lien envoyé à {{ email }}.</b></p>
      <p class="muted">Ouvre-le sur l'appareil où tu veux utiliser le site. Pense à regarder les indésirables.</p>
      <button class="btn small ghost" type="button" @click="etat = 'saisie'">Utiliser une autre adresse</button>
    </div>
  </section>
</template>

<style scoped>
.connexion { max-width: 380px; margin: 12vh auto 0; display: flex; flex-direction: column; gap: 10px; text-align: left }
.blason { width: 56px; height: 56px }
h1 { font-family: var(--f-display); font-weight: 400; font-size: 2.6rem; margin: 0; line-height: 1 }
form { display: flex; flex-direction: column; gap: 8px; margin-top: 8px }
input { border: 1px solid var(--line); background: var(--raised); border-radius: 8px; padding: 10px 12px; font-size: 1rem }
.err { color: var(--bad); font-weight: 600; margin: 0 }
.ok { background: var(--raised); border: 1px solid var(--line); border-radius: 10px; padding: 14px; margin-top: 8px }
.ok p { margin: 0 0 6px }
</style>
