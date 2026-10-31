// Données du mode démo (site lancé sans configuration Supabase) : rien n'est enregistré.
import type { Village } from '../logic/regles'
import { REGLES_TABLEUR, EFFETS_TABLEUR } from './economie'

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o))

export const VILLAGE_DEMO: Village = {
  id: 1,
  version: 1,
  updated_at: new Date().toISOString(),
  updated_by: null,
  etat: {
    // novembre de l'an 1 : un passage de mois suffit pour voir arriver l'hiver
    jour: 11,
    // TEST : tout à 999 pour essayer les constructions — à remettre à 0 ensuite
    stocks: { or: 999, nourriture: 999, metal: 999, bois: 999, pierre: 999, pt: 999, tissu: 999, charbon: 999, fer: 999, vin: 999, cuir: 999, acier: 999, arme_fer: 20, armure_fer: 5 },
    bat: { puits: 1, champs: 1, elevage: 1, tissage: 1, chasseurs: 1, bucherons: 1, charbonniere: 1, forge: 1, carriere: 1, auberge: 1, mine_fer: 1 },
    ordre: ['puits', 'champs', 'auberge', 'forge', 'bucherons', 'carriere', 'mine_fer', 'chasseurs', 'elevage', 'tissage', 'charbonniere'],
    villageois: 50,
    mo: null,
    empl: ['M', 'F'],
    chantiers: [],
    artisans: {},
    armee: {},
    gisements: [{ id: 'g1', res: 'fer', qualite: 2, mine: false }, { id: 'g2', res: 'charbon', qualite: 5, mine: false }],
  },
  regles: {
    regles: clone(REGLES_TABLEUR),
    effets: clone(EFFETS_TABLEUR),
  },
}
