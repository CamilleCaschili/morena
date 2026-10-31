import { supabase } from '../lib/supabase'
import { demo } from './store'
import type { Position } from '../three/scene'

/*
 * Balade à plusieurs : chaque joueur diffuse sa position, les autres la reçoivent.
 * Avec Supabase : canal temps réel privé, réservé aux membres (règles dans schema.sql).
 * En mode démo : entre les onglets du même navigateur, pour tester sans serveur.
 */

export interface Message extends Position { id: string; pseudo: string; skin: string }

export interface Balade {
  envoyer(p: Position, skin: string): void
  /** prévient les autres qu'on quitte la balade */
  partir(): void
  fermer(): void
}

const valide = (m: unknown): m is Message => {
  const x = m as Message
  return !!x && typeof x.id === 'string' && typeof x.pseudo === 'string' && typeof x.skin === 'string' && [x.x, x.z, x.yaw].every(Number.isFinite)
}

export function rejoindreBalade(id: string, pseudo: string, recevoir: (m: Message) => void, depart: (id: string) => void): Balade {
  if (demo) {
    const bc = new BroadcastChannel('morena-balade')
    bc.onmessage = e => {
      const d = e.data
      if (d?.type === 'pos' && valide(d.m) && d.m.id !== id) recevoir(d.m)
      else if (d?.type === 'part' && typeof d.id === 'string') depart(d.id)
    }
    const partir = () => bc.postMessage({ type: 'part', id })
    return {
      envoyer: (p, skin) => bc.postMessage({ type: 'pos', m: { ...p, id, pseudo, skin } }),
      partir,
      fermer: () => { partir(); bc.close() },
    }
  }

  const canal = supabase.channel('balade', { config: { private: true, broadcast: { self: false } } })
  canal
    .on('broadcast', { event: 'pos' }, ({ payload }) => { if (valide(payload) && payload.id !== id) recevoir(payload) })
    .on('broadcast', { event: 'part' }, ({ payload }) => { if (typeof payload?.id === 'string') depart(payload.id) })
  // le canal privé vérifie le jeton de la session : on s'assure qu'il est transmis avant de s'abonner
  supabase.realtime.setAuth().finally(() => canal.subscribe())
  const partir = () => { canal.send({ type: 'broadcast', event: 'part', payload: { id } }) }
  return {
    envoyer: (p, skin) => { canal.send({ type: 'broadcast', event: 'pos', payload: { ...p, id, pseudo, skin } }) },
    partir,
    fermer: () => { partir(); supabase.removeChannel(canal) },
  }
}
