// Données du mode démo (site lancé sans configuration Supabase) : rien n'est enregistré.
import type { Village } from '../logic/regles'

export const VILLAGE_DEMO: Village = {
  id: 1,
  version: 1,
  updated_at: new Date().toISOString(),
  updated_by: null,
  etat: {
    // novembre de l'an 1 : un passage de mois suffit pour voir arriver l'hiver
    jour: 11,
    // TEST : tout à 999 pour essayer les constructions — à remettre à 0 ensuite
    stocks: { nourriture: 999, metal: 999, bois: 999, pierre: 999, pt: 999, tissu: 999, charbon: 999, fer: 999, vin: 999 },
    bat: { puits: 1, champs: 1, elevage: 1, tissage: 1, chasseurs: 1, bucherons: 1, charbonniere: 1, forge: 1, carriere: 1, auberge: 1, mine_fer: 1 },
    ordre: ['puits', 'champs', 'auberge', 'forge', 'bucherons', 'carriere', 'mine_fer', 'chasseurs', 'elevage', 'tissage', 'charbonniere'],
    villageois: null,
    mo: null,
    empl: ['M', 'F'],
    chantiers: [],
  },
  regles: {
    regles: [
      { id: 'r1', bat: 'champs', res: 'nourriture', sens: 1, mode: 'de', n: 1, pause: ['hiver'] },
      { id: 'r2', bat: 'chasseurs', res: 'nourriture', sens: 1, mode: 'de', n: 1 },
      { id: 'r3', bat: 'bucherons', res: 'bois', sens: 1, mode: 'de', n: 1 },
      { id: 'r4', bat: 'charbonniere', res: 'charbon', sens: 1, mode: 'de', n: 1 },
      { id: 'r5', bat: 'mine_fer', res: 'fer', sens: 1, mode: 'de', n: 1 },
      { id: 'r6', bat: 'tissage', res: 'tissu', sens: 1, mode: 'fixe', n: 20 },
      { id: 'r7', bat: 'forge', res: 'metal', sens: 1, mode: 'fixe', n: 20 },
      { id: 'r8', bat: 'forge', res: 'fer', sens: -1, mode: 'fixe', n: 20 },
      { id: 'r9', bat: 'carriere', res: 'pierre', sens: 1, mode: 'de', n: 1 },
      { id: 'r10', bat: 'auberge', res: 'nourriture', sens: -1, mode: 'fixe', n: null },
    ],
    effets: [
      { id: 'e1', bat: 'scierie', type: 'cout', sens: -1, val: 10, unit: 'fixe', res: 'bois', cible: 'tous', note: '' },
    ],
  },
}
