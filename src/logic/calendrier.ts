/*
 * Calendrier du village : chaque cycle de jeu dure un mois, douze cycles font une année.
 * Le cycle 1 est janvier de l'an 1 ; `etat.jour` compte les cycles depuis le début.
 */

export type Saison = 'printemps' | 'ete' | 'automne' | 'hiver'

export const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
export const SAISONS: Record<Saison, string> = { printemps: 'Printemps', ete: 'Été', automne: 'Automne', hiver: 'Hiver' }
export const ORDRE_SAISONS: Saison[] = ['printemps', 'ete', 'automne', 'hiver']
// décembre, janvier et février sont l'hiver
const SAISON_DU_MOIS: Saison[] = ['hiver', 'hiver', 'printemps', 'printemps', 'printemps', 'ete', 'ete', 'ete', 'automne', 'automne', 'automne', 'hiver']

/** 0 = janvier … 11 = décembre */
export const moisDe = (cycle: number) => (((cycle - 1) % 12) + 12) % 12
export const anDe = (cycle: number) => Math.floor((cycle - 1) / 12) + 1
export const saisonDe = (cycle: number) => SAISON_DU_MOIS[moisDe(cycle)]
export const cycleDe = (mois: number, an: number) => (Math.max(1, an) - 1) * 12 + mois + 1
/** « Mars an 2 » */
export const dateDe = (cycle: number) => `${MOIS[moisDe(cycle)]} an ${anDe(cycle)}`
/** « mars » */
export const nomMois = (cycle: number) => MOIS[moisDe(cycle)].toLowerCase()
/** « mars an 2 », pour l'intérieur des phrases */
export const dateMin = (cycle: number) => `${nomMois(cycle)} an ${anDe(cycle)}`
