import { reactive } from 'vue'
import type { Session, RealtimeChannel } from '@supabase/supabase-js'
import { supabase, configOk } from '../lib/supabase'
import type { Etat, Regles, Village, LogEntry } from './regles'
import { VILLAGE_DEMO } from '../data/demo'

/** Sans configuration Supabase, le site tourne en démo locale (rien n'est enregistré). */
export const demo = !configOk
const MOI_DEMO: Membre = { user_id: 'demo', pseudo: 'Démo', role: 'mj', skin: 'villageois' }

export interface Membre { user_id: string; pseudo: string; role: 'mj' | 'joueur'; skin?: string }
export interface Ligne { id: number; created_at: string; jour: number; type: 'jour' | 'constr' | 'mj'; texte: string; user_id: string | null }

export const store = reactive({
  session: null as Session | null,
  pret: false,              // session vérifiée
  chargement: false,
  village: null as Village | null,
  journal: [] as Ligne[],
  membres: {} as Record<string, Membre>,
  erreur: '' as string,
  info: '' as string,
  enCours: false,           // une écriture est en cours
})

export const moi = () => (demo ? store.membres.demo : store.session ? store.membres[store.session.user.id] : undefined)
export const estMj = () => moi()?.role === 'mj'
export const pseudo = (uid: string | null) => (uid ? store.membres[uid]?.pseudo || 'Quelqu’un' : '')

let canal: RealtimeChannel | null = null
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o))

export async function demarrer() {
  if (demo) {
    store.village = clone(VILLAGE_DEMO)
    store.membres = { demo: { ...MOI_DEMO } }
    store.journal = [{ id: 1, created_at: new Date().toISOString(), jour: VILLAGE_DEMO.etat.jour, type: 'mj', texte: 'Mode démo : les modifications ne sont pas enregistrées.', user_id: 'demo' }]
    store.pret = true
    return
  }
  const { data } = await supabase.auth.getSession()
  store.session = data.session
  store.pret = true
  supabase.auth.onAuthStateChange((_ev, session) => {
    const avant = store.session?.user.id
    store.session = session
    if (session && session.user.id !== avant) charger()
    if (!session) { canal?.unsubscribe(); canal = null; clearInterval(secours); secours = 0; store.village = null; store.journal = [] }
  })
  if (data.session) await charger()
}

export async function charger() {
  store.chargement = true
  store.erreur = ''
  const [v, j, m] = await Promise.all([
    supabase.from('village').select('*').eq('id', 1).maybeSingle(),
    supabase.from('journal').select('*').order('created_at', { ascending: false }).limit(300),
    supabase.from('membres').select('*'),
  ])
  if (v.error || j.error || m.error) {
    store.erreur = (v.error || j.error || m.error)!.message
  }
  store.village = (v.data as Village) ?? null
  store.journal = (j.data as Ligne[]) ?? []
  store.membres = Object.fromEntries(((m.data as Membre[]) ?? []).map(x => [x.user_id, x]))
  store.chargement = false
  abonner()
}

let secours = 0
/** Relit le village et le journal sans écran de chargement (retour sur l'onglet, temps réel coupé). */
async function rafraichir() {
  if (!store.session || store.enCours) return
  const [v, j] = await Promise.all([
    supabase.from('village').select('*').eq('id', 1).maybeSingle(),
    supabase.from('journal').select('*').order('created_at', { ascending: false }).limit(300),
  ])
  const n = v.data as Village | null
  if (n && (!store.village || n.version > store.village.version)) store.village = n
  if (j.data) store.journal = j.data as Ligne[]
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !demo) rafraichir() })

function abonner() {
  if (canal) return
  // canal privé : l'accès public au temps réel est coupé, seuls les membres peuvent l'écouter (schema.sql)
  canal = supabase.channel('morena', { config: { private: true } })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'village' }, p => {
      const n = p.new as Village
      if (!store.village || n.version >= store.village.version) store.village = n
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'journal' }, p => {
      const l = p.new as Ligne
      if (!store.journal.some(x => x.id === l.id)) store.journal.unshift(l)
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'membres' }, () => { recharger_membres() })
  const c = canal
  supabase.realtime.setAuth().finally(() => c.subscribe(statut => {
    // sans temps réel, on relit le village toutes les 10 s pour rester à jour
    if (statut === 'SUBSCRIBED') { clearInterval(secours); secours = 0; rafraichir() }
    else if ((statut === 'CHANNEL_ERROR' || statut === 'TIMED_OUT') && !secours) {
      console.warn('Temps réel indisponible, relecture toutes les 10 s')
      secours = window.setInterval(rafraichir, 10000)
    }
  }))
}
async function recharger_membres() {
  const { data } = await supabase.from('membres').select('*')
  if (data) store.membres = Object.fromEntries((data as Membre[]).map(x => [x.user_id, x]))
}

/**
 * Modifie le village de façon sûre quand plusieurs joueurs agissent en même temps :
 * la mise à jour n'est acceptée que si personne n'a modifié le village entre-temps,
 * sinon on relit et on rejoue la modification (qui revérifie les stocks).
 * `mut` modifie ses copies et renvoie les lignes de journal, ou `false` pour annuler.
 */
export async function modifier(mut: (e: Etat, r: Regles) => LogEntry[] | false): Promise<boolean> {
  if (!store.village || store.enCours) return false
  if (demo) {
    const e = clone(store.village.etat), r = clone(store.village.regles)
    const logs = mut(e, r)
    if (logs === false) return false
    store.village = { ...store.village, etat: e, regles: r, version: store.village.version + 1 }
    for (const l of logs) store.journal.unshift({ id: Date.now() + Math.random(), created_at: new Date().toISOString(), jour: e.jour, type: l.type, texte: l.texte, user_id: 'demo' })
    return true
  }
  store.enCours = true
  store.erreur = ''
  try {
    for (let essai = 0; essai < 4; essai++) {
      const cur = store.village!
      const e = clone(cur.etat), r = clone(cur.regles)
      const logs = mut(e, r)
      if (logs === false) return false
      const patch: Partial<Village> = { etat: e }
      if (JSON.stringify(r) !== JSON.stringify(cur.regles)) patch.regles = r
      const { data, error } = await supabase.from('village').update(patch).eq('id', 1).eq('version', cur.version).select().maybeSingle()
      if (error) { store.erreur = traduire(error.message); return false }
      if (data) {
        store.village = data as Village
        if (logs.length) {
          const { data: lignes } = await supabase.from('journal')
            .insert(logs.map(l => ({ jour: e.jour, type: l.type, texte: l.texte, user_id: store.session!.user.id })))
            .select()
          for (const l of (lignes as Ligne[]) ?? []) if (!store.journal.some(x => x.id === l.id)) store.journal.unshift(l)
        }
        return true
      }
      // Conflit : quelqu'un d'autre a modifié le village, on relit et on recommence.
      const { data: frais } = await supabase.from('village').select('*').eq('id', 1).single()
      if (frais) store.village = frais as Village
    }
    store.erreur = 'Le village a été modifié par quelqu’un d’autre au même moment. Vérifie et réessaie.'
    return false
  } finally {
    store.enCours = false
  }
}

function traduire(m: string) {
  if (m.includes('Seul le MJ')) return 'Seul le MJ peut modifier les règles de production et les effets.'
  return 'L’enregistrement a échoué : ' + m
}

export async function changerPseudo(p: string) {
  const { error } = await supabase.rpc('changer_pseudo', { p })
  if (error) store.erreur = error.message
  else await recharger_membres()
}

/** Tenue du personnage de balade. */
export async function changerSkin(s: string) {
  if (demo) { const m = store.membres.demo; if (m) m.skin = s; return }
  const { error } = await supabase.rpc('changer_skin', { s })
  if (error) store.erreur = error.message.includes('changer_skin') ? 'La base n’a pas encore la colonne des tenues : relance supabase/schema.sql.' : error.message
  else await recharger_membres()
}

export async function deconnexion() { await supabase.auth.signOut() }

export function exporter(): string {
  return JSON.stringify({ exporte_le: new Date().toISOString(), village: store.village, journal: store.journal }, null, 2)
}
