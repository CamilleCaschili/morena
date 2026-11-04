-- ════════════════════════════════════════════════════════════════
--  Morena — bâtiments déjà construits (liste du MJ, tours 1 à 9)
--  À coller dans Supabase > SQL Editor > New query > Run, une seule fois.
--  Remplace la liste des bâtiments du village par celle du MJ ; le reste
--  (date, stocks, chantiers, gisements, emplacements choisis…) ne change pas.
-- ════════════════════════════════════════════════════════════════
update public.village set etat = etat
  || jsonb_build_object(
    'bat', '{"conseil": 1, "puits": 1, "carriere": 1, "bucherons": 1, "champs": 1, "chasseurs": 1, "mine_fer": 1, "forge": 1, "elevage": 1, "tissage": 1, "entrepot": 1, "maison_pierre": 3, "medecin": 1, "herboristerie": 1, "vignoble": 1, "fosse": 2, "palissade": 2, "scierie": 1, "cimetiere": 1, "maison_bois": 4, "ecole": 1, "theatre": 1, "route": 1, "comptoir": 1, "chapelle": 1, "tonnelier": 1, "apiculteur": 1, "brasseur": 1, "tailleur": 1, "auberge": 1, "carriere_ind": 1}'::jsonb,
    'ordre', '["conseil", "puits", "carriere", "bucherons", "champs", "chasseurs", "mine_fer", "forge", "elevage", "tissage", "entrepot", "maison_pierre", "maison_pierre", "maison_pierre", "medecin", "herboristerie", "vignoble", "fosse", "fosse", "palissade", "palissade", "scierie", "cimetiere", "maison_bois", "maison_bois", "maison_bois", "maison_bois", "ecole", "theatre", "route", "comptoir", "chapelle", "tonnelier", "apiculteur", "brasseur", "tailleur", "auberge", "carriere_ind"]'::jsonb,
    -- « milice x20 miliciens » : 20 miliciens, qui tiennent les fossés et les palissades
    'armee', coalesce(etat->'armee', '{}'::jsonb) || '{"milicien": 20}'::jsonb,
    -- le brasseur, le tonnelier et le tailleur de pierre ont leur artisan (sans écraser un nombre déjà saisi)
    'artisans', '{"brasseur": 1, "tonnelier": 1, "tailleur": 1}'::jsonb || coalesce(etat->'artisans', '{}'::jsonb)
  )
where id = 1;

insert into public.journal (jour, type, texte, user_id)
select (etat->>'jour')::int, 'mj', 'Bâtiments mis à jour d''après la liste du MJ (tours 1 à 9) : 38 bâtiments, 20 miliciens.', null
from public.village where id = 1;
