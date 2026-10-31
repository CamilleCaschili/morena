// Catalogue des bâtiments de Morena (repris du document du MJ)
export type ResKey = 'nourriture' | 'metal' | 'bois' | 'pierre' | 'pt' | 'tissu' | 'charbon' | 'fer' | 'vin'
export type CatKey = 'base' | 'sante' | 'commerce' | 'industrie' | 'agri' | 'defense' | 'loisirs' | 'special'
export type EmplKey = 'T' | 'M' | 'F' | 'P' | 'E' | 'C' | 'V' | 'PE'
export type Shape =
  | 'maison' | 'atelier' | 'grand' | 'grange' | 'tour' | 'chapelle' | 'puits' | 'champ' | 'verger' | 'vigne'
  | 'ruches' | 'camp' | 'mine' | 'carriere' | 'place' | 'route' | 'fosse' | 'palissade' | 'mur' | 'porte'
  | 'etal' | 'arene' | 'stele' | 'sanctuaire' | 'moulin'
export interface ShapeOpt { mat?: 'bois' | 'pierre' | 'enduit' | 'sombre'; roof?: 'rouge' | 'ardoise' | 'chaume' | 'vert' | 'bleu'; big?: boolean; cabin?: boolean; flowers?: boolean }
export interface Batiment {
  id: string; nom: string; cat: CatKey; empl: EmplKey
  cost: Partial<Record<ResKey, number>> | null   // null = ne se construit pas (mine déjà présente)
  mo: number
  req: string[][]                                 // ET de groupes OU
  shape: Shape; opt: ShapeOpt
}

export const RES: { k: ResKey; l: string }[] = [
  { k: 'nourriture', l: 'Nourriture' }, { k: 'metal', l: 'Métal' }, { k: 'bois', l: 'Bois' }, { k: 'pierre', l: 'Pierre' },
  { k: 'pt', l: 'Pierre taillée' }, { k: 'tissu', l: 'Tissu' }, { k: 'charbon', l: 'Charbon' }, { k: 'fer', l: 'Fer' }, { k: 'vin', l: 'Vin' },
]
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

type Raw = [string, string, CatKey, EmplKey, number[] | null, number, string, Shape, ShapeOpt?]
const RAW: Raw[] = [
['puits','Puits','base','T',[12,15,0,0,0,0],0,'','puits'],
['conseil','Maison commune / conseil','base','T',[25,18,0,0,0,8],0,'','grand',{mat:'pierre',roof:'bleu'}],
['maison_bois','Maison individuelle en bois','base','T',[18,0,0,0,0,5],0,'','maison',{mat:'bois',roof:'chaume'}],
['maison_pierre','Maison individuelle en pierre','base','T',[8,20,0,0,0,5],0,'carriere','maison',{mat:'pierre',roof:'ardoise'}],
['entrepot','Entrepôt','base','T',[28,12,0,0,0,0],3,'','grange',{mat:'bois',roof:'ardoise'}],
['cimetiere','Cimetière / mémorial','base','T',[10,15,0,0,0,5],1,'','stele'],
['route','Route pavée reliant les quartiers','base','T',[0,30,0,0,0,0],0,'','route'],
['chapelle','Chapelle / lieu de culte','base','T',[15,20,0,0,0,12],2,'','chapelle'],
['ecole','École / lieu de transmission','base','T',[22,0,0,0,0,8],4,'conseil','maison',{roof:'bleu'}],
['ecuries','Écuries','base','T',[10,10,0,0,0,8],4,'','grange'],
['medecin','Médecin','sante','T',[10,8,0,0,3,8],3,'','maison',{roof:'vert'}],
['barbier','Barbier-chirurgien','sante','T',[8,0,0,0,0,5],2,'','maison',{roof:'bleu'}],
['etal','Étal de marché','commerce','T',[12,0,0,0,0,10],1,'','etal'],
['auberge','Auberge','commerce','T',[30,15,0,12,5,18],5,'','grand',{roof:'rouge'}],
['comptoir','Comptoir commercial','commerce','T',[15,0,0,0,0,8],3,'route','maison',{roof:'vert'}],
['banque','Banque / maison de change','commerce','T',[0,25,0,0,50,0],4,'comptoir','grand',{mat:'pierre',roof:'ardoise'}],
['guilde','Guilde des artisans','commerce','T',[18,15,0,0,10,10],4,'forge|tissage|poterie|menuisier','grand',{mat:'bois',roof:'vert'}],
['cordonnier','Cordonnier','commerce','T',[8,0,0,0,10,0],2,'tannerie','maison'],
['menuisier','Menuisier','commerce','T',[15,0,0,0,15,0],2,'','atelier',{mat:'bois',roof:'chaume'}],
['teinturier','Teinturier','commerce','T',[0,0,0,0,0,15],2,'tissage,alchimiste','atelier',{roof:'bleu'}],
['ceinturier','Maître-ceinturier','commerce','T',[0,0,0,0,0,0],2,'tannerie','maison',{mat:'bois'}],
['boulangerie','Boulangerie','commerce','T',[12,10,0,10,0,0],2,'moulin','atelier',{roof:'rouge'}],
['parfumerie','Parfumerie','commerce','T',[0,0,0,0,0,0],2,'herboristerie','maison',{roof:'bleu'}],
['herboristerie','Herboristerie / apothicaire','commerce','T',[10,0,0,0,0,0],2,'','maison',{roof:'vert'}],
['alchimiste','Atelier d\'alchimiste','commerce','T',[0,15,0,0,15,0],3,'herboristerie','tour',{mat:'enduit',roof:'vert'}],
['forge','Forge','industrie','T',[15,28,0,0,0,0],4,'','atelier',{mat:'pierre',roof:'ardoise'}],
['charbonniere','Charbonnière','industrie','T',[25,0,0,0,0,0],2,'','atelier',{mat:'bois',roof:'ardoise'}],
['moulin','Moulin','industrie','T',[28,12,0,0,10,6],3,'','moulin'],
['tannerie','Tannerie','industrie','T',[22,0,0,0,20,0],2,'','atelier',{mat:'bois',roof:'chaume'}],
['tissage','Atelier de tissage','industrie','T',[25,0,0,0,0,0],3,'elevage','grand',{mat:'bois',roof:'chaume'}],
['boucher','Boucher-charcutier','industrie','T',[8,0,0,12,10,0],2,'elevage','maison',{roof:'rouge'}],
['maconnerie','Maçonnerie','industrie','T',[10,20,0,0,15,0],3,'carriere','atelier',{mat:'pierre',roof:'rouge'}],
['armurerie','Armurerie','industrie','T',[0,10,0,0,25,0],3,'forge','atelier',{mat:'pierre',roof:'ardoise'}],
['marechal','Maréchal-ferrant','industrie','T',[0,0,0,0,10,0],2,'forge','atelier',{mat:'bois',roof:'ardoise'}],
['tonnelier','Tonnelier','industrie','T',[15,0,0,0,15,0],2,'','atelier',{mat:'bois',roof:'chaume'}],
['brasseur','Brasseur','industrie','T',[10,0,0,12,0,0],2,'tonnelier','atelier',{roof:'chaume'}],
['scierie','Scierie','industrie','T',[0,0,0,0,20,0],3,'bucherons','grange',{mat:'bois',roof:'chaume'}],
['bucherons','Camp de bûcherons','industrie','T',[0,0,0,0,0,0],2,'','camp'],
['carriere','Carrière de pierre','industrie','T',[0,0,0,0,0,0],2,'','carriere'],
['tailleur','Tailleur de pierre','industrie','T',[0,15,0,0,10,0],3,'carriere','atelier',{mat:'pierre',roof:'rouge'}],
['verrerie','Verrerie','industrie','T',[10,15,0,0,0,0],3,'charbonniere','atelier',{roof:'bleu'}],
['poterie','Atelier de poterie','industrie','T',[8,10,0,0,0,0],2,'','atelier',{roof:'rouge'}],
['chandelle','Fabrique de chandelles','industrie','T',[8,0,0,0,0,0],2,'apiculteur','maison',{roof:'chaume'}],
['fromagerie','Fromagerie','agri','T',[10,0,0,15,0,0],2,'elevage','maison',{roof:'chaume'}],
['champs','Champs cultivés','agri','T',[15,0,0,0,0,0],4,'puits','champ'],
['verger','Verger','agri','T',[10,0,0,0,0,0],3,'','verger'],
['elevage','Ferme d\'élevage','agri','T',[20,0,0,20,0,0],3,'puits,champs','grange'],
['horticulteur','Horticulteur','agri','T',[15,15,0,0,0,10],2,'','verger',{flowers:true}],
['apiculteur','Apiculteur','agri','T',[10,0,0,0,0,0],2,'','ruches'],
['vignoble','Vignoble','agri','T',[0,0,0,15,0,0],3,'','vigne'],
['moulin_eau','Moulin à eau','agri','PE',[20,15,0,0,0,0],3,'','moulin'],
['palissade','Palissade simple','defense','T',[30,0,0,0,0,0],3,'','palissade'],
['muraille','Muraille en pierre','defense','T',[12,20,45,0,0,0],7,'palissade','mur'],
['tour_guet','Tour de guet','defense','T',[15,10,15,0,10,0],4,'palissade','tour',{mat:'bois',roof:'ardoise'}],
['caserne','Caserne / milice','defense','T',[15,15,0,10,20,15],4,'','grand',{mat:'pierre',roof:'rouge'}],
['fosse','Fossé défensif','defense','T',[0,12,0,0,0,0],5,'','fosse'],
['portes','Portes fortifiées','defense','T',[18,15,20,0,40,0],3,'muraille','porte'],
['bastion','Bastion fortifié','defense','T',[0,55,75,0,80,0],8,'muraille','tour',{mat:'pierre',roof:'ardoise',big:true}],
['place','Place centrale / fontaine','loisirs','T',[12,18,0,0,0,0],0,'puits','place'],
['taverne','Taverne','loisirs','T',[15,0,0,12,0,10],3,'','grand',{mat:'bois',roof:'rouge'}],
['arene','Arène / terrain d\'entraînement','loisirs','T',[18,15,0,0,35,0],4,'','arene'],
['theatre','Théâtre / conteurs itinérants','loisirs','T',[15,0,0,0,0,15],3,'','etal',{roof:'bleu'}],
['bains','Bains publics','loisirs','T',[0,25,0,0,0,12],3,'puits','grand',{mat:'pierre',roof:'bleu'}],
['bibliotheque','Bibliothèque','loisirs','T',[15,10,0,0,0,0],3,'ecole','grand',{mat:'pierre',roof:'ardoise'}],
['chasseurs','Cabane de chasseurs / rôdeurs','special','F',[25,0,0,12,0,8],3,'','camp',{cabin:true}],
['trappeurs','Cabane de trappeurs','special','F',[20,0,0,8,0,10],3,'chasseurs','camp',{cabin:true}],
['scierie_ind','Scierie industrielle','special','F',[25,0,0,0,0,0],3,'scierie','grange',{mat:'bois',roof:'ardoise'}],
['sanctuaire','Sanctuaire druidique','special','F',[15,0,0,0,0,10],4,'','sanctuaire'],
['mine_fer','Mine de fer','special','M',null,0,'','mine'],
['mine_precieuse','Mine précieuse','special','M',null,0,'','mine'],
['orfevrerie','Orfèvrerie','special','M',[0,10,0,0,5,0],4,'mine_precieuse','maison',{mat:'pierre',roof:'bleu'}],
['bastion_roc','Bastion rocheux','special','M',[0,55,25,0,0,0],8,'muraille','tour',{mat:'sombre',roof:'ardoise',big:true}],
['carriere_ind','Carrière industrielle','special','M',[0,25,0,0,0,0],5,'carriere','carriere'],
['forge_maitre','Forge de maître','special','M',[0,30,0,0,15,0],5,'forge','atelier',{mat:'sombre',roof:'rouge',big:true}],
['silos','Silos géants','special','P',[25,15,0,25,0,0],4,'','tour',{mat:'bois',roof:'chaume'}],
['elevage_ext','Élevage extensif','special','P',[25,0,0,20,0,8],4,'elevage','grange'],
['moulin_vent','Moulin à vent','special','P',[28,15,0,0,0,10],4,'','moulin'],
['grand_marche','Grand marché couvert','special','C',[25,15,0,0,0,20],5,'','etal',{big:true}],
['relais','Relais de poste','special','C',[15,0,0,0,0,8],2,'','grange'],
['peage','Poste de péage','special','C',[0,12,0,0,0,0],3,'','tour',{mat:'pierre',roof:'rouge'}],
['port','Port / quai','special','E',[30,15,0,0,0,0],5,'','route'],
['chantier_naval','Chantier naval','special','E',[35,15,0,0,15,20],6,'','grange'],
['phare','Phare','special','E',[15,25,0,0,0,0],3,'','tour',{mat:'enduit',roof:'rouge'}],
['route_com','Route commerciale officielle','special','V',[0,15,0,0,0,0],4,'','route'],
['garnison','Garnison alliée','special','V',[0,15,0,0,0,10],4,'','grand',{mat:'pierre',roof:'rouge'}],
['antenne','Antenne diplomatique','special','V',[15,0,0,0,0,12],3,'','maison',{roof:'bleu'}],
]

export const B: Batiment[] = RAW.map(([id, nom, cat, empl, c, mo, req, shape, opt]) => ({
  id, nom, cat, empl, mo, shape, opt: opt || {},
  cost: c ? Object.fromEntries(COSTK.map((k, i) => [k, c[i]] as const).filter(([, v]) => v > 0)) : null,
  req: req ? req.split(',').map(g => g.split('|')) : [],
}))
export const BI: Record<string, Batiment> = Object.fromEntries(B.map(b => [b.id, b]))
export const nomBat = (id: string) => BI[id]?.nom ?? id
