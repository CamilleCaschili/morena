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
    // bâtiments déjà construits d'après la liste du MJ (tours 1 à 9)
    bat: { conseil: 1, puits: 1, carriere: 1, bucherons: 1, champs: 1, chasseurs: 1, mine_fer: 1, forge: 1, elevage: 1, tissage: 1, entrepot: 1, maison_pierre: 3, medecin: 1, herboristerie: 1, vignoble: 1, fosse: 2, palissade: 2, scierie: 1, cimetiere: 1, maison_bois: 4, ecole: 1, theatre: 1, route: 1, comptoir: 1, chapelle: 1, tonnelier: 1, apiculteur: 1, brasseur: 1, tailleur: 1, auberge: 1, carriere_ind: 1 },
    ordre: ['conseil', 'puits', 'carriere', 'bucherons', 'champs', 'chasseurs', 'mine_fer', 'forge', 'elevage', 'tissage', 'entrepot', 'maison_pierre', 'maison_pierre', 'maison_pierre', 'medecin', 'herboristerie', 'vignoble', 'fosse', 'fosse', 'palissade', 'palissade', 'scierie', 'cimetiere', 'maison_bois', 'maison_bois', 'maison_bois', 'maison_bois', 'ecole', 'theatre', 'route', 'comptoir', 'chapelle', 'tonnelier', 'apiculteur', 'brasseur', 'tailleur', 'auberge', 'carriere_ind'],
    villageois: 80,
    mo: null,
    empl: ['M', 'F'],
    chantiers: [],
    artisans: { brasseur: 1, tonnelier: 1, tailleur: 1 },
    armee: { milicien: 20 },
    gisements: [{ id: 'g1', res: 'fer', qualite: 2, mine: false }, { id: 'g2', res: 'charbon', qualite: 5, mine: false }],
  },
  regles: {
    regles: clone(REGLES_TABLEUR),
    effets: clone(EFFETS_TABLEUR),
  },
}
