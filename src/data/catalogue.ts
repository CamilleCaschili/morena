// Catalogue de Morena, repris du tableur du MJ (batiments_village expé.xlsx)
export type ResKey =
  | 'nourriture' | 'bois' | 'pierre' | 'pt' | 'tissu' | 'charbon' | 'cuir' | 'or'
  | 'fer' | 'cuivre' | 'argent' | 'minerai_or' | 'titane' | 'gres' | 'granit' | 'jade' | 'soufre' | 'diamant'
  | 'metal' | 'acier' | 'lingot_or'
  | 'biere' | 'vin'
  | 'arme_fer' | 'arme_acier' | 'armure_cuir' | 'armure_fer' | 'armure_acier'
export type CatKey = 'base' | 'sante' | 'commerce' | 'industrie' | 'agri' | 'defense' | 'loisirs' | 'special'
export type EmplKey = 'T' | 'M' | 'F' | 'P' | 'E' | 'C' | 'V' | 'PE'
export type Shape =
  | 'maison' | 'atelier' | 'grand' | 'grange' | 'tour' | 'chapelle' | 'puits' | 'champ' | 'verger' | 'vigne'
  | 'ruches' | 'camp' | 'mine' | 'carriere' | 'place' | 'route' | 'fosse' | 'palissade' | 'mur' | 'porte'
  | 'etal' | 'arene' | 'stele' | 'sanctuaire' | 'moulin'
export interface ShapeOpt { mat?: 'bois' | 'pierre' | 'enduit' | 'sombre'; roof?: 'rouge' | 'ardoise' | 'chaume' | 'vert' | 'bleu'; big?: boolean; cabin?: boolean; flowers?: boolean }
/** Prospérité, Cohésion, Sécurité */
export type JaugeKey = 'pro' | 'coh' | 'sec'
export interface Batiment {
  id: string; nom: string; cat: CatKey; empl: EmplKey
  cost: Partial<Record<ResKey, number>> | null   // null = ne se construit pas (mine déjà présente)
  mo: number                                      // main-d'œuvre occupée (miliciens pour les défenses)
  req: string[][]                                 // ET de groupes OU ; '@gisement' = un gisement prospecté libre
  shape: Shape; opt: ShapeOpt
  effet: string                                   // texte du tableur
  jauges: Record<JaugeKey, number>                // apport de chaque exemplaire
}

export type GroupeRes = 'base' | 'minerai' | 'metal' | 'boisson' | 'equip'
export const RES: { k: ResKey; l: string; g: GroupeRes }[] = [
  { k: 'or', l: 'Or (PO)', g: 'base' }, { k: 'nourriture', l: 'Nourriture', g: 'base' }, { k: 'bois', l: 'Bois', g: 'base' },
  { k: 'pierre', l: 'Pierre', g: 'base' }, { k: 'pt', l: 'Pierre taillée', g: 'base' }, { k: 'tissu', l: 'Tissu', g: 'base' },
  { k: 'charbon', l: 'Charbon', g: 'base' }, { k: 'cuir', l: 'Cuir', g: 'base' },
  { k: 'fer', l: 'Minerai de fer', g: 'minerai' }, { k: 'cuivre', l: 'Minerai de cuivre', g: 'minerai' }, { k: 'argent', l: "Minerai d'argent", g: 'minerai' },
  { k: 'minerai_or', l: "Minerai d'or", g: 'minerai' }, { k: 'titane', l: 'Titane', g: 'minerai' }, { k: 'gres', l: 'Grès rouge', g: 'minerai' },
  { k: 'granit', l: 'Granit blanc', g: 'minerai' }, { k: 'jade', l: 'Jade', g: 'minerai' }, { k: 'soufre', l: 'Soufre', g: 'minerai' }, { k: 'diamant', l: 'Diamant', g: 'minerai' },
  { k: 'metal', l: 'Fer forgé', g: 'metal' }, { k: 'acier', l: "Lingot d'acier", g: 'metal' }, { k: 'lingot_or', l: "Lingot d'or", g: 'metal' },
  { k: 'biere', l: 'Bière', g: 'boisson' }, { k: 'vin', l: 'Vin', g: 'boisson' },
  { k: 'arme_fer', l: 'Arme en fer', g: 'equip' }, { k: 'arme_acier', l: 'Arme en acier', g: 'equip' }, { k: 'armure_cuir', l: 'Armure en cuir', g: 'equip' },
  { k: 'armure_fer', l: 'Armure en fer', g: 'equip' }, { k: 'armure_acier', l: 'Armure en acier', g: 'equip' },
]
export const GROUPES_RES: Record<GroupeRes, string> = { base: 'Ressources', minerai: 'Minerais et roches', metal: 'Métaux', boisson: 'Boissons', equip: 'Équipement' }
export const RL = Object.fromEntries(RES.map(r => [r.k, r.l])) as Record<ResKey, string>
const COSTK: ResKey[] = ['bois', 'pierre', 'pt', 'nourriture', 'metal', 'tissu']

export const CATS: Record<CatKey, string> = {
  base: 'Bâtiments de base', sante: 'Services & santé', commerce: 'Commerces', industrie: 'Industries & artisanat',
  agri: 'Agriculture', defense: 'Défenses', loisirs: 'Loisirs & culture', special: 'Spécifique emplacement',
}
export const EMPL: Record<EmplKey, string> = {
  T: 'Tous', M: 'Montagne', F: 'Lisière de forêt', P: 'Plaine', E: 'Bord de mer', C: 'Croisement de routes',
  V: "Proche d'une grande ville", PE: "Plaine ou bord d'eau",
}
export const EMPL_CHOICES: EmplKey[] = ['M', 'F', 'P', 'E', 'C', 'V']
export const JAUGES: Record<JaugeKey, string> = { pro: 'Prospérité', coh: 'Cohésion', sec: 'Sécurité' }

// id, nom, catégorie, emplacement, coût [bois, pierre, pierre taillée, nourriture, fer forgé, tissu], main-d'œuvre,
// prérequis ('a,b' = a ET b, 'a|b' = a OU b), forme 3D, options 3D, effet, jauges [prospérité, cohésion, sécurité]
type Raw = [string, string, CatKey, EmplKey, number[] | null, number, string, Shape, ShapeOpt, string, number[]?]
const RAW: Raw[] = [
['puits','Puits','base','T',[5,15,0,0,0,0],0,'','puits',{},'+1 Prospérité ; évite une crise de sécheresse',[1,0,0]],
['conseil','Maison commune / conseil','base','T',[25,18,0,0,0,0],0,'','grand',{mat:'pierre',roof:'bleu'},'Débloque un vote officiel des survivants sur les décisions futures ; loge jusqu\'à 60 villageois'],
['maison_bois','Maison individuelle en bois','base','T',[18,0,0,0,0,5],0,'','maison',{mat:'bois',roof:'chaume'},'+1 Cohésion (logement décent) ; loge jusqu\'à 8 villageois',[0,1,0]],
['maison_pierre','Maison individuelle en pierre','base','T',[8,20,0,0,0,5],0,'carriere','maison',{mat:'pierre',roof:'ardoise'},'+1 Cohésion, +1 Sécurité (logement solide, résiste mieux aux intempéries et incendies) ; loge jusqu\'à 8 villageois',[0,1,1]],
['entrepot','Entrepôt','base','T',[28,12,0,0,0,0],3,'','grange',{mat:'bois',roof:'ardoise'},'Permet de stocker des ressources pour l\'hiver (évite malus saisonnier)'],
['grenier','Grenier','base','T',[28,12,0,0,0,0],3,'','grange',{mat:'bois',roof:'chaume'},'Permet de stocker de la Nourriture pour l\'hiver (évite malus saisonnier)'],
['cimetiere','Cimetière / mémorial','base','T',[10,15,0,0,0,5],1,'','stele',{},'+2 Cohésion (deuil collectif), scène RP forte',[0,2,0]],
['route','Route pavée reliant les quartiers','base','T',[0,30,0,0,0,0],0,'','route',{},'+1 Cohésion, +1 Prospérité (facilite tout le reste)',[1,1,0]],
['chapelle','Chapelle / lieu de culte','base','T',[15,20,0,0,0,12],2,'','chapelle',{},'+2 Cohésion',[0,2,0]],
['ecole','École / lieu de transmission','base','T',[22,0,0,0,0,8],4,'conseil','maison',{roof:'bleu'},'+1 Cohésion ; accroche narrative (enfant doué, savoir retrouvé)',[0,1,0]],
['ecuries','Écuries','base','T',[10,10,0,0,0,8],4,'','grange',{},''],
['medecin','Médecin','sante','T',[10,8,0,0,3,8],3,'','maison',{roof:'vert'},'+1 Cohésion ; réduit l\'impact des crises sanitaires (épidémies, blessures) et soigne les villageois plus vite',[0,1,0]],
['etal','Étal de marché','commerce','T',[12,0,0,0,0,10],1,'','etal',{},'+1 Prospérité',[1,0,0]],
['auberge','Auberge','commerce','T',[30,15,0,12,5,18],5,'cuisines','grand',{roof:'rouge'},'+1 Cohésion, +1 Prospérité (attire voyageurs)',[1,1,0]],
['comptoir','Comptoir commercial','commerce','T',[15,0,0,0,0,8],3,'route','maison',{roof:'vert'},'+2 Prospérité, ouvre le commerce avec l\'extérieur',[2,0,0]],
['banque','Banque / maison de change','commerce','T',[0,25,0,0,50,0],4,'comptoir','grand',{mat:'pierre',roof:'ardoise'},'+2 Prospérité, mais -1 Cohésion (inégalités visibles)',[2,-1,0]],
['guilde','Guilde des artisans','commerce','T',[18,15,0,0,10,10],4,'comptoir','grand',{mat:'bois',roof:'vert'},'recrutement d\'artisans spécialisés : 1d10 or --> 1d5 or'],
['cordonnier','Cordonnier','commerce','T',[8,0,0,0,10,0],2,'tannerie','maison',{},'+1 Prospérité (chaussures et équipement de qualité pour les villageois)',[1,0,0]],
['menuisier','Menuisier','commerce','T',[15,0,0,0,15,0],2,'','atelier',{mat:'bois',roof:'chaume'},'+1 Prospérité (mobilier, charpentes de qualité)',[1,0,0]],
['teinturier','Teinturier','commerce','T',[0,0,0,0,0,15],2,'tissage,alchimiste','atelier',{roof:'bleu'},'+1 Prospérité (tissus teints, plus grande valeur marchande)',[1,0,0]],
['ceinturier','Maître-ceinturier','commerce','T',[0,0,0,0,0,0],2,'tannerie','maison',{mat:'bois'},'+1 Prospérité (ceintures, sacs, harnais de qualité)',[1,0,0]],
['boulangerie','Boulangerie','commerce','T',[12,10,0,10,0,0],2,'moulin|moulin_eau|moulin_vent','atelier',{roof:'rouge'},'+2 Cohésion, +1 Prospérité (le pain frais rassure et nourrit)',[1,2,0]],
['parfumerie','Parfumerie','commerce','T',[0,0,0,0,0,0],2,'herboristerie','maison',{roof:'bleu'},'+1 Prospérité, +1 Cohésion (produit de luxe, fierté locale)',[1,1,0]],
['herboristerie','Herboristerie / apothicaire','commerce','T',[10,0,0,0,0,0],2,'','maison',{roof:'vert'},'+1 Cohésion (soins de base, remèdes) ; réduit légèrement l\'impact des crises sanitaires',[0,1,0]],
['alchimiste','Atelier d\'alchimiste','commerce','T',[0,15,0,0,15,0],3,'herboristerie','tour',{mat:'enduit',roof:'vert'},'Débloque des potions/ingrédients rares pour les PJ ; bonne accroche narrative'],
['forge','Forge','industrie','T',[15,28,0,0,0,0],4,'','atelier',{mat:'pierre',roof:'ardoise'},'+1 Prospérité, débloque équipement amélioré pour les PJ',[1,0,0]],
['charbonniere','Charbonnière','industrie','T',[25,0,0,0,0,0],2,'','atelier',{mat:'bois',roof:'ardoise'},'Alimente la Forge et la Mine ; sans elle, leur rendement est réduit'],
['moulin','Moulin','industrie','T',[28,12,0,0,0,6],3,'','moulin',{},'+1 Prospérité, +1 Nourriture par tour automatique',[1,0,0]],
['tannerie','Tannerie','industrie','T',[22,0,0,0,8,0],2,'','atelier',{mat:'bois',roof:'chaume'},'+1 Prospérité ; -1 Cohésion si mal placée (odeurs, nuisances)',[1,0,0]],
['tissage','Atelier de tissage','industrie','T',[25,0,0,0,0,0],3,'elevage','grand',{mat:'bois',roof:'chaume'},'+1 Prospérité',[1,0,0]],
['maconnerie','Maçonnerie','industrie','T',[10,20,0,0,15,0],3,'carriere','atelier',{mat:'pierre',roof:'rouge'},'Diminue le coût en Pierre pour la construction de 10 (ou de 5 si déjà inférieur ou égal à 10)'],
['armurerie','Armurerie','industrie','T',[0,10,0,0,25,0],3,'forge,tannerie','atelier',{mat:'pierre',roof:'ardoise'},'+1 Sécurité, +1 Prospérité ; permet forge d\'armures',[1,0,1]],
['forge_maitre','Forge de maître','industrie','T',[0,30,0,0,15,0],5,'forge,tannerie','atelier',{mat:'sombre',roof:'rouge',big:true},'+2 Prospérité, permet forge d\'armes',[2,0,0]],
['marechal','Maréchal-ferrant','industrie','T',[0,0,0,0,10,0],2,'forge','atelier',{mat:'bois',roof:'ardoise'},'+1 Prospérité (chevaux bien ferrés, transport facilité)',[1,0,0]],
['tonnelier','Tonnelier','industrie','T',[15,0,0,0,15,0],2,'','atelier',{mat:'bois',roof:'chaume'},'+1 Prospérité (tonneaux pour stocker et transporter denrées et boissons)',[1,0,0]],
['brasseur','Brasseur','industrie','T',[10,0,0,12,0,0],2,'tonnelier,puits','atelier',{roof:'chaume'},'2 Cohésion, +1 Prospérité +1d20 nourriture',[1,2,0]],
['scierie','Scierie','industrie','T',[0,0,0,0,20,0],3,'bucherons','grange',{mat:'bois',roof:'chaume'},'Diminue le coût en Bois pour la construction de 10 (ou de 5 si déjà inférieur ou égal à 10)'],
['bucherons','Camp de bûcherons','industrie','T',[0,0,0,0,0,0],2,'','camp',{},'Poste de production : produit du Bois (villageois assignés)'],
['carriere','Carrière de pierre','industrie','T',[0,0,0,0,0,0],2,'','carriere',{},'Poste de production : produit de la Pierre (villageois assignés)'],
['tailleur','Tailleur de pierre','industrie','T',[0,15,0,0,10,0],3,'carriere','atelier',{mat:'pierre',roof:'rouge'},'Produit des pierres taillées'],
['verrerie','Verrerie','industrie','T',[10,15,0,0,0,0],3,'charbonniere','atelier',{roof:'bleu'},'+1 Prospérité (vitres, verrerie fine, fierté artisanale) ; nécessite un bon accès au Charbon pour un plein rendement',[1,0,0]],
['poterie','Atelier de poterie','industrie','T',[8,10,0,0,0,0],2,'','atelier',{roof:'rouge'},'+1 Prospérité (poteries et céramiques utilitaires et décoratives)',[1,0,0]],
['chandelle','Fabrique de chandelles','industrie','T',[8,0,0,0,0,0],2,'apiculteur','maison',{roof:'chaume'},'+1 Cohésion (éclairage, veillées) ; petite source de revenu (+1 Prospérité)',[1,1,0]],
['mine','Mine','industrie','T',[0,25,0,0,0,0],5,'@gisement','mine',{},'Exploite un gisement prospecté (minerai, roche…) ; sa production dépend de la qualité du gisement'],
['fromagerie','Fromagerie','agri','T',[10,0,0,15,0,0],2,'elevage,moulin|moulin_eau|moulin_vent','maison',{roof:'chaume'},'+1 Prospérité, +1 Cohésion (spécialité locale appréciée)',[1,1,0]],
['champs','Champs cultivés','agri','T',[15,0,0,0,0,0],4,'puits','champ',{},'+2 Prospérité',[2,0,0]],
['verger','Verger','agri','T',[10,0,0,0,0,0],3,'','verger',{},'+1 Prospérité, +1 Cohésion (symbole de long terme, patience)',[1,1,0]],
['elevage','Ferme d\'élevage','agri','T',[20,0,0,20,0,0],3,'puits,champs','grange',{},'+2 Prospérité (viande, cuir, lait en continu) ; alimente Boucher-Charcutier et Formagerie',[2,0,0]],
['horticulteur','Horticulteur','agri','T',[15,15,0,0,0,10],2,'','verger',{flowers:true},'+1 Prospérité, +1 Cohésion (jardins et petits vergers décoratifs, fierté locale)',[1,1,0]],
['apiculteur','Apiculteur','agri','T',[10,0,0,0,0,0],2,'','ruches',{},'+1 Prospérité (miel, cire) ; débloque la Fabrique de chandelle',[1,0,0]],
['vignoble','Vignoble','agri','T',[0,0,0,15,0,0],3,'tonnelier','vigne',{},'+1 Prospérité, +1 Cohésion (vin local, tradition, fierté)',[1,1,0]],
['chasseurs','Cabane de chasseurs / rôdeurs','agri','T',[25,0,0,12,0,8],3,'','camp',{cabin:true},'+1 Prospérité, +1 Sécurité (éclaireurs contre les menaces de la forêt)',[1,0,1]],
['cuisines','Cuisines communes','agri','T',[20,0,0,20,5,0],3,'moulin|moulin_eau|moulin_vent','grand',{mat:'bois',roof:'rouge'},'Apporte 1d20 Nourriture par mois, même en hiver'],
['boucher','Boucher-charcutier','agri','T',[8,0,0,12,10,0],2,'elevage','maison',{roof:'rouge'},'+1 Prospérité (viande conservée, moins de gaspillage)',[1,0,0]],
['cuisines_chateau','Cuisines de château','agri','T',[15,10,25,30,10,20],3,'bastion|bastion_roc','grand',{mat:'pierre',roof:'ardoise'},'Apporte 1d100 Nourriture par mois, même en hiver'],
['palissade','Palissade simple','defense','T',[30,0,0,0,0,0],3,'','palissade',{},'+1 Sécurité',[0,0,1]],
['muraille','Muraille en pierre','defense','T',[12,20,45,0,0,0],7,'palissade','mur',{},'+2 Sécurité',[0,0,2]],
['tour_guet','Tour de guet','defense','T',[15,10,15,0,10,0],4,'palissade','tour',{mat:'bois',roof:'ardoise'},'+1 Sécurité ; révèle les événements à l\'avance',[0,0,1]],
['caserne','Caserne / milice','defense','T',[15,15,0,10,5,15],4,'','grand',{mat:'pierre',roof:'rouge'},'+2 Sécurité, mais coûte 1 Nourriture par tour (entretien)',[0,0,2]],
['fosse','Fossé défensif','defense','T',[0,12,0,0,0,0],5,'','fosse',{},'+1 Sécurité',[0,0,1]],
['portes','Portes fortifiées','defense','T',[18,15,20,0,40,0],3,'muraille','porte',{},'+1 Sécurité, +1 Prospérité (contrôle du commerce entrant)',[1,0,1]],
['bastion','Bastion fortifié','defense','T',[0,55,75,0,80,0],8,'muraille','tour',{mat:'pierre',roof:'ardoise',big:true},'+3 Sécurité (défense quasi imprenable)',[0,0,3]],
['place','Place centrale / fontaine','loisirs','T',[12,18,0,0,0,0],0,'puits','place',{},'+2 Cohésion',[0,2,0]],
['taverne','Taverne','loisirs','T',[15,0,0,12,0,10],3,'','grand',{mat:'bois',roof:'rouge'},'+2 Cohésion, mais risque d\'un événement "excès" (bagarre, rumeur)',[0,2,0]],
['arene','Arène / terrain d\'entraînement','loisirs','T',[18,15,0,0,35,0],4,'','arene',{},'+1 Cohésion, +1 Sécurité (milice mieux entraînée)',[0,1,1]],
['theatre','Théâtre / conteurs itinérants','loisirs','T',[15,0,0,0,0,15],3,'','etal',{roof:'bleu'},'+2 Cohésion ; peut transmettre l\'histoire du village détruit (mémoire collective)',[0,2,0]],
['bains','Bains publics','loisirs','T',[0,25,0,0,0,12],3,'puits','grand',{mat:'pierre',roof:'bleu'},'+1 Cohésion, +1 Prospérité (attire des visiteurs)',[1,1,0]],
['barbier','Barbier-chirurgien','sante','T',[8,0,0,0,0,5],2,'','maison',{roof:'bleu'},'+1 Cohésion (soins de première urgence, un brin bourru mais efficace)',[0,1,0]],
['bibliotheque','Bibliothèque','loisirs','T',[15,10,0,0,0,0],3,'ecole','grand',{mat:'pierre',roof:'ardoise'},'+2 Cohésion (savoir préservé, transmission) ; peut receler un indice sur le monstre ou le passé du village',[0,2,0]],
['silos','Silos géants','special','P',[25,15,0,25,0,0],4,'','tour',{mat:'bois',roof:'chaume'},'+3 Prospérité, réserve de nourriture qui évite toute famine future',[3,0,0]],
['elevage_ext','Élevage extensif','special','P',[25,0,0,20,0,8],4,'elevage','grange',{},'+2 Prospérité, +1 Cohésion (fierté agricole)',[2,1,0]],
['moulin_vent','Moulin à vent','special','P',[28,15,0,0,0,10],4,'','moulin',{},'+2 Prospérité automatique par tour',[2,0,0]],
['orfevrerie','Orfèvrerie','special','M',[0,10,0,0,5,0],4,'mine_precieuse|mine','maison',{mat:'pierre',roof:'bleu'},'+2 Prospérité, +1 Cohésion',[2,1,0]],
['bastion_roc','Bastion rocheux','special','M',[0,55,25,0,0,0],8,'muraille','tour',{mat:'sombre',roof:'ardoise',big:true},'+3 Sécurité (défense quasi imprenable)',[0,0,3]],
['carriere_ind','Carrière industrielle','special','M',[0,25,0,0,0,0],5,'carriere','carriere',{},'Production de pierre x2'],
['grand_marche','Grand marché couvert','special','C',[25,15,0,0,0,20],5,'','etal',{big:true},'+3 Prospérité, attire marchands et rumeurs (accroches narratives régulières)',[3,0,0]],
['relais','Relais de poste','special','C',[15,0,0,0,0,8],2,'','grange',{},'+1 Prospérité, +1 Cohésion (nouvelles du monde circulent vite)',[1,1,0]],
['peage','Poste de péage','special','C',[0,12,0,0,0,0],3,'','tour',{mat:'pierre',roof:'rouge'},'+2 Or par tour, mais -1 Cohésion (perçu comme injuste par les voyageurs)',[0,-1,0]],
['port','Port / quai','special','E',[30,15,0,0,0,0],5,'','route',{},'+2 Prospérité, ouvre le commerce maritime',[2,0,0]],
['chantier_naval','Chantier naval','special','E',[35,15,0,0,15,20],6,'','grange',{},'+2 Prospérité, débloque un bateau (exploration, fuite, quêtes futures)',[2,0,0]],
['phare','Phare','special','E',[15,25,0,0,0,0],3,'','tour',{mat:'enduit',roof:'rouge'},'+1 Sécurité (avertit des dangers/attaques), +1 Cohésion (symbole d\'espoir)',[0,1,1]],
['route_com','Route commerciale officielle','special','V',[0,15,0,0,0,0],4,'','route',{},'+2 Prospérité, mais implique des taxes régulières (la ville prélève une part)',[2,0,0]],
['garnison','Garnison alliée','special','V',[0,15,0,0,0,10],4,'','grand',{mat:'pierre',roof:'rouge'},'+2 Sécurité, mais dépendance politique (-1 Cohésion, autonomie réduite)',[0,-1,2]],
['antenne','Antenne diplomatique','special','V',[15,0,0,0,0,12],3,'','maison',{roof:'bleu'},'+1 Cohésion, +1 Prospérité ; débloque des quêtes/interactions avec la grande ville',[1,1,0]],
['scierie_ind','Scierie industrielle','special','F',[25,0,0,0,0,0],3,'scierie','grange',{mat:'bois',roof:'ardoise'},'Production de bois x2'],
['trappeurs','Cabane de trappeurs','special','F',[20,0,0,8,0,10],3,'chasseurs','camp',{cabin:true},'Spécialisé dans la traque d\'animaux rares pour leur fourrure ; source de revenu supplémentaire (Or)'],
['sanctuaire','Sanctuaire druidique','special','F',[15,0,0,0,0,10],4,'','sanctuaire',{},'+2 Cohésion ; peut apaiser ou au contraire réveiller quelque chose dans la forêt (accroche narrative à double tranchant)',[0,2,0]],
['moulin_eau','Moulin à eau','agri','PE',[20,15,0,0,0,0],3,'','moulin',{},'+2 Nourriture par tour automatique (plus efficace que le Moulin classique) ; nécessite un cours d\'eau à proximité'],
['mine_fer','Mine de fer','special','M',null,0,'','mine',{},'Gisement déjà exploité au début de la partie'],
['mine_precieuse','Mine précieuse','special','M',null,0,'','mine',{},'Gisement déjà exploité au début de la partie'],
]

export const B: Batiment[] = RAW.map(([id, nom, cat, empl, c, mo, req, shape, opt, effet, j]) => ({
  id, nom, cat, empl, mo, shape, opt, effet,
  jauges: { pro: j?.[0] ?? 0, coh: j?.[1] ?? 0, sec: j?.[2] ?? 0 },
  cost: c ? Object.fromEntries(COSTK.map((k, i) => [k, c[i]] as const).filter(([, v]) => v > 0)) : null,
  req: req ? req.split(',').map(g => g.split('|')) : [],
}))
export const BI: Record<string, Batiment> = Object.fromEntries(B.map(b => [b.id, b]))
export const nomBat = (id: string) => id === '@gisement' ? 'un gisement prospecté' : BI[id]?.nom ?? id
