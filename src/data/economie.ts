// Règles d'économie du tableur du MJ (feuilles « Marchandises », « nouvelles règles de jeu » et « de production »)
import type { ResKey } from './catalogue'
import type { Regle, Effet } from '../logic/regles'

/* ── Marché : prix en pièces d'or (PO), achat et vente au même prix ── */
export interface Marchandise { nom: string; unite: string; prix: number | null; res?: ResKey; ancien?: boolean }
// ancien : pas de nouveau prix dans le tableur, on reprend l'ancien converti en PO
export const MARCHANDISES: Marchandise[] = [
  { nom: 'Agathe', unite: '1 gemme brute', prix: 10 },
  { nom: 'Arme en acier', unite: '1 arme', prix: 35, res: 'arme_acier' },
  { nom: 'Arme en fer', unite: '1 arme', prix: 15, res: 'arme_fer' },
  { nom: 'Armure en cuir', unite: '1 armure complète', prix: 10, res: 'armure_cuir' },
  { nom: 'Armure métallique', unite: '1 armure complète', prix: 75, res: 'armure_fer' },
  { nom: 'Bière', unite: '1 tonneau plein', prix: 3 },
  { nom: 'Blé', unite: '1 sac', prix: 0.5 },
  { nom: 'Bois', unite: '1 fagot / rondin', prix: 1, res: 'bois' },
  { nom: 'Bougie', unite: '1 unité', prix: 0.1 },
  { nom: 'Céramique', unite: '1 pièce', prix: 2 },
  { nom: 'Charbon', unite: '1 sac', prix: 0.5, res: 'charbon' },
  { nom: 'Corde', unite: '10 mètres', prix: 1 },
  { nom: 'Cuir', unite: '1 peau tannée', prix: 2, res: 'cuir' },
  { nom: 'Diamant', unite: '1 gemme brute', prix: 250, res: 'diamant' },
  { nom: 'Émeraude', unite: '1 gemme brute', prix: 150 },
  { nom: 'Farine', unite: '1 sac', prix: 0.12, ancien: true },
  { nom: 'Fer à cheval', unite: '1 unité', prix: 0.5 },
  { nom: 'Fromage', unite: '1 meule', prix: 1.5, ancien: true },
  { nom: 'Fruits', unite: '1 panier', prix: 0.5 },
  { nom: 'Herbes médicinales', unite: '1 bouquet', prix: 2 },
  { nom: 'Houblon', unite: '1 sac', prix: 0.5 },
  { nom: "Lingot d'acier", unite: '1 lingot', prix: 15, res: 'acier' },
  { nom: "Lingot d'argent", unite: '1 lingot', prix: 25 },
  { nom: 'Lingot de cuivre', unite: '1 lingot', prix: 1 },
  { nom: 'Lingot de fer (fer forgé)', unite: '1 lingot', prix: 2, res: 'metal' },
  { nom: "Lingot d'or", unite: '1 lingot', prix: 100, res: 'lingot_or' },
  { nom: 'Millet', unite: '1 sac', prix: 0.5 },
  { nom: "Minerai d'argent", unite: '1 unité', prix: 5, res: 'argent' },
  { nom: 'Minerai de cuivre', unite: '1 unité', prix: 0.2, res: 'cuivre' },
  { nom: 'Minerai de fer', unite: '1 unité', prix: 1, res: 'fer' },
  { nom: "Minerai d'or", unite: '1 unité', prix: 25, res: 'minerai_or' },
  { nom: 'Mouton', unite: '1 animal', prix: 2 },
  { nom: 'Orge', unite: '1 sac', prix: 0.5 },
  { nom: 'Outil en acier', unite: '1 outil', prix: 1.2, ancien: true },
  { nom: 'Outil en fer', unite: '1 outil', prix: 0.5, ancien: true },
  { nom: 'Pain', unite: '1 miche', prix: 0.05 },
  { nom: 'Parfum', unite: '1 flacon', prix: 30 },
  { nom: 'Peau de bête', unite: '1 peau brute', prix: 0.5 },
  { nom: 'Pierre', unite: '1 bloc brut', prix: 1, res: 'pierre' },
  { nom: 'Pierre taillée', unite: '1 bloc taillé', prix: 2, res: 'pt' },
  { nom: 'Porc', unite: '1 animal', prix: 3 },
  { nom: 'Poulet', unite: '1 animal', prix: 0.3, ancien: true },
  { nom: 'Raisin', unite: '1 panier', prix: 0.08, ancien: true },
  { nom: 'Rubis', unite: '1 gemme brute', prix: 100 },
  { nom: 'Saphir', unite: '1 gemme brute', prix: 150 },
  { nom: 'Son', unite: '1 sac', prix: 0.03 },
  { nom: 'Teinture', unite: '1 dose', prix: 1.2, ancien: true },
  { nom: 'Tissu', unite: '1 mètre', prix: 0.5, res: 'tissu' },
  { nom: 'Tonneau', unite: '1 tonneau vide', prix: 1 },
  { nom: 'Topaze', unite: '1 gemme brute', prix: 50 },
  { nom: 'Vache', unite: '1 animal', prix: 10 },
  { nom: 'Verre', unite: '1 vitre / pièce', prix: 2 },
  { nom: 'Vêtements', unite: '1 tenue simple', prix: 0.8, ancien: true },
  { nom: 'Vêtements de luxe', unite: '1 tenue', prix: 150 },
  { nom: 'Viande crue', unite: '1 portion', prix: 0.08, ancien: true },
  { nom: 'Viande séchée', unite: '1 portion', prix: 0.15, ancien: true },
  { nom: 'Vin', unite: '1 bouteille', prix: 0.5, ancien: true },
  { nom: 'Vin de luxe', unite: '1 bouteille', prix: 20 },
]
/** Prix par défaut des ressources du village (le MJ peut les changer dans Règles). */
export const PRIX: Partial<Record<ResKey, number>> = Object.fromEntries(MARCHANDISES.filter(m => m.res && m.prix != null).map(m => [m.res, m.prix]))
/** Bâtiments qui ouvrent le commerce avec l'extérieur */
export const COMMERCE = ['comptoir', 'grand_marche', 'port', 'route_com']

/* ── Bière et vin : la qualité (1 à 4) se tire au d20 à la construction et fixe le prix de vente ── */
export const BOISSONS = { brasseur: 'biere', vignoble: 'vin' } as const
export type Boisson = 'biere' | 'vin'
export const PRIX_QUALITE = [0.1, 0.2, 0.5, 1]           // 1 PA, 2 PA, 5 PA, 1 PO
export const qualiteDuJet = (d20: number) => Math.min(4, Math.max(1, Math.ceil(d20 / 5)))

/* ── Fabrication (dans les bâtiments, immédiate) ── */
export interface Recette { id: string; nom: string; bat: string[]; entrees: Partial<Record<ResKey, number>>; sorties: Partial<Record<ResKey, number>>; note?: string }
export const RECETTES: Recette[] = [
  { id: 'lingot_fer', nom: 'Lingot de fer (fer forgé)', bat: ['forge'], entrees: { fer: 1, charbon: 1 }, sorties: { metal: 1 } },
  { id: 'lingot_acier', nom: "Lingot d'acier", bat: ['forge'], entrees: { fer: 2, charbon: 2 }, sorties: { acier: 1 } },
  { id: 'lingot_or', nom: "Lingot d'or", bat: ['forge'], entrees: { minerai_or: 2, charbon: 2 }, sorties: { lingot_or: 1 } },
  { id: 'pierre_taillee', nom: 'Pierre taillée', bat: ['tailleur'], entrees: { pierre: 1 }, sorties: { pt: 1 } },
  { id: 'charbon', nom: 'Charbon', bat: ['charbonniere'], entrees: { bois: 1 }, sorties: { charbon: 1 } },
  { id: 'arme_fer', nom: 'Arme en fer', bat: ['forge_maitre'], entrees: { metal: 2, bois: 1 }, sorties: { arme_fer: 1 } },
  { id: 'arme_acier', nom: 'Arme en acier', bat: ['forge_maitre'], entrees: { acier: 2, bois: 1 }, sorties: { arme_acier: 1 }, note: 'Coût supposé, comme l’arme en fer avec de l’acier' },
  { id: 'armure_cuir', nom: 'Armure en cuir', bat: ['tannerie'], entrees: { cuir: 3 }, sorties: { armure_cuir: 1 }, note: 'Coût supposé, absent du tableur' },
  { id: 'armure_fer', nom: 'Armure en fer', bat: ['armurerie'], entrees: { metal: 3, cuir: 1 }, sorties: { armure_fer: 1 }, note: 'Coût supposé, absent du tableur' },
  { id: 'armure_acier', nom: 'Armure en acier', bat: ['armurerie'], entrees: { acier: 3, cuir: 1 }, sorties: { armure_acier: 1 }, note: 'Coût supposé, absent du tableur' },
]

/* ── Recrutement ── */
export const PRIX_VILLAGEOIS = 0.5
export const DE_ARTISAN = 10, DE_ARTISAN_GUILDE = 4       // 1d10 PO, 1d4 PO avec la guilde des artisans
export const DE_PROSPECTION = 6                           // 1d6 PO
/** Métiers d'artisan et bâtiment qui en demande un (le MJ peut changer le bâtiment dans Règles). */
export const METIERS: Record<string, { nom: string; bat: string }> = {
  macon: { nom: 'Maçon', bat: 'maconnerie' },
  boulanger: { nom: 'Boulanger', bat: 'boulangerie' },
  tailleur: { nom: 'Tailleur de pierre', bat: 'tailleur' },
  brasseur: { nom: 'Brasseur', bat: 'brasseur' },
  forgeron: { nom: 'Forgeron', bat: 'forge_maitre' },
  armurier: { nom: 'Armurier', bat: 'armurerie' },
  tanneur: { nom: 'Tanneur', bat: 'tannerie' },
  verrier: { nom: 'Souffleur de verre', bat: 'verrerie' },
  tonnelier: { nom: 'Tonnelier', bat: 'tonnelier' },
  vigneron: { nom: 'Vigneron', bat: 'vignoble' },
}

/* ── Armée : entretien par mois ; les militaires remplacent les villageois comme main-d'œuvre des défenses ── */
export type Grade = 'milicien' | 'soldat' | 'chevalier'
export const MILITAIRES: Record<Grade, { nom: string; equipement: Partial<Record<ResKey, number>>; nourriture: number; boisson: number; or: number }> = {
  milicien: { nom: 'Milicien', equipement: { arme_fer: 1 }, nourriture: 1, boisson: 0, or: 0 },
  soldat: { nom: 'Soldat', equipement: { arme_fer: 1, armure_fer: 1 }, nourriture: 2, boisson: 1, or: 0 },
  chevalier: { nom: 'Chevalier', equipement: { arme_acier: 1, armure_acier: 1 }, nourriture: 3, boisson: 1, or: 2 },
}
export const GRADES = Object.keys(MILITAIRES) as Grade[]

/* ── Naissances : tous les 2 mois, 1d10 % de la population ── */
export const NAISSANCE_TOUS = 2, DE_NAISSANCE = 10

/* ── Gisements : dé de production selon la qualité (1 à 5) ── */
const D10 = [10, 20, 30, 40, 50], D4 = [4, 8, 12, 16, 20], D2 = [2, 4, 6, 8, 10]
export const DES_GISEMENT: Partial<Record<ResKey, number[]>> = {
  fer: D10, cuivre: D10, gres: D10, granit: D10, charbon: D10,
  jade: D4, soufre: D4, argent: D4,
  minerai_or: D2, titane: D2,          // le tableur indique 1d210 au niveau 5 : lu comme 1d10
  diamant: [1, 2, 3, 4, 5],
}
export const MINERAIS: ResKey[] = ['fer', 'cuivre', 'argent', 'minerai_or', 'titane', 'gres', 'granit', 'jade', 'soufre', 'diamant', 'charbon', 'pierre']
export const desGisement = (res: ResKey, qualite: number) => (DES_GISEMENT[res] ?? D10)[Math.min(5, Math.max(1, qualite)) - 1]

/* ── Production et effets par défaut, tirés du tableur ── */
const p = (id: string, bat: string, res: ResKey, n: number, faces?: number, sens: 1 | -1 = 1, hiver = false): Regle =>
  ({ id, bat, res, sens, mode: faces ? 'de' : 'fixe', n, ...(faces ? { faces } : {}), ...(hiver ? { pause: ['hiver'] } : {}) })
export const REGLES_TABLEUR: Regle[] = [
  p('t_champs', 'champs', 'nourriture', 1, 100, 1, true),
  p('t_verger', 'verger', 'nourriture', 1, 100, 1, true),
  p('t_elevage', 'elevage', 'nourriture', 1, 100),
  p('t_chasseurs', 'chasseurs', 'nourriture', 1, 100),
  p('t_fromagerie', 'fromagerie', 'nourriture', 1, 20),
  p('t_cuisines', 'cuisines', 'nourriture', 1, 20),
  p('t_auberge', 'auberge', 'nourriture', 2, 20),
  p('t_boulangerie', 'boulangerie', 'nourriture', 1, 20),
  p('t_boucher', 'boucher', 'nourriture', 1, 20),
  p('t_cuisines_chateau', 'cuisines_chateau', 'nourriture', 1, 100),
  p('t_brasseur', 'brasseur', 'biere', 1, 20, 1, true),
  p('t_brasseur_n', 'brasseur', 'nourriture', 1, 20, 1, true),
  p('t_vignoble', 'vignoble', 'vin', 1, 20, 1, true),
  p('t_moulin', 'moulin', 'nourriture', 1),
  p('t_moulin_eau', 'moulin_eau', 'nourriture', 2),
  p('t_caserne', 'caserne', 'nourriture', 1, undefined, -1),
  p('t_peage', 'peage', 'or', 2),
  p('t_bucherons', 'bucherons', 'bois', 1, 100),
  p('t_scierie_ind', 'scierie_ind', 'bois', 1, 100),
  p('t_carriere', 'carriere', 'pierre', 1, 100),
  p('t_carriere_ind', 'carriere_ind', 'pierre', 1, 100),
  p('t_charbonniere', 'charbonniere', 'charbon', 1, 100),
  p('t_mine_fer', 'mine_fer', 'fer', 1, 100),
  p('t_tissage', 'tissage', 'tissu', 20),
]
export const EFFETS_TABLEUR: Effet[] = [
  { id: 't_scierie', bat: 'scierie', type: 'cout', sens: -1, val: 10, unit: 'palier', res: 'bois', cible: 'tous', note: '' },
  { id: 't_maconnerie', bat: 'maconnerie', type: 'cout', sens: -1, val: 10, unit: 'palier', res: 'pierre', cible: 'tous', note: '' },
]
