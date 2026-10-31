-- ════════════════════════════════════════════════════════════════
--  Morena — schéma Supabase
--  À coller en entier dans Supabase > SQL Editor > New query > Run.
--  Le script peut être relancé : il ne recrée pas ce qui existe déjà
--  et ne remplace pas un village déjà enregistré.
-- ════════════════════════════════════════════════════════════════

-- ── Membres du groupe ───────────────────────────────────────────
-- Une ligne est créée automatiquement pour chaque utilisateur ajouté
-- dans Authentication > Users. Passe ton rôle à 'mj' dans le Table Editor.
create table if not exists public.membres (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  pseudo     text not null default '',
  role       text not null default 'joueur' check (role in ('mj', 'joueur')),
  created_at timestamptz not null default now()
);

create or replace function public.est_membre() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membres where user_id = auth.uid());
$$;

create or replace function public.est_mj() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membres where user_id = auth.uid() and role = 'mj');
$$;

create or replace function public.nouveau_membre() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.membres (user_id, pseudo)
  values (new.id, split_part(coalesce(new.email, ''), '@', 1))
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.nouveau_membre();

-- Les utilisateurs déjà présents avant ce script
insert into public.membres (user_id, pseudo)
select id, split_part(coalesce(email, ''), '@', 1) from auth.users
on conflict (user_id) do nothing;

-- Tenue du personnage en balade (voir src/three/perso.ts pour la liste)
alter table public.membres add column if not exists skin text not null default 'villageois';

create or replace function public.changer_skin(s text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.membres set skin = left(trim(s), 40) where user_id = auth.uid();
end $$;

-- Changer son propre pseudo (un joueur ne peut pas changer son rôle)
create or replace function public.changer_pseudo(p text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.membres set pseudo = left(trim(p), 40) where user_id = auth.uid();
end $$;

-- ── Le village ──────────────────────────────────────────────────
-- etat   : jour (numéro du mois, 1 = janvier an 1), stocks, chantiers, bâtiments, ordre de construction, villageois…
-- regles : production quotidienne et effets spéciaux (modifiables par le MJ seulement)
create table if not exists public.village (
  id         int primary key default 1 check (id = 1),
  etat       jsonb not null,
  regles     jsonb not null,
  version    int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create or replace function public.village_avant_maj() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() est vide quand tu modifies depuis le tableau de bord Supabase : autorisé.
  if new.regles is distinct from old.regles and auth.uid() is not null and not public.est_mj() then
    raise exception 'Seul le MJ peut modifier les règles de production et les effets.';
  end if;
  new.version    := old.version + 1;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists village_avant_maj on public.village;
create trigger village_avant_maj
  before update on public.village
  for each row execute function public.village_avant_maj();

-- ── Journal ─────────────────────────────────────────────────────
create table if not exists public.journal (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  jour       int not null,
  type       text not null check (type in ('jour', 'constr', 'mj')),
  texte      text not null,
  user_id    uuid references auth.users(id) default auth.uid()
);
create index if not exists journal_created_at_idx on public.journal (created_at desc);

-- ── Sécurité : rien n'est lisible sans être connecté ET membre ──
alter table public.membres enable row level security;
alter table public.village enable row level security;
alter table public.journal enable row level security;

drop policy if exists "membres_lecture" on public.membres;
create policy "membres_lecture" on public.membres
  for select to authenticated using (public.est_membre());

drop policy if exists "village_lecture" on public.village;
create policy "village_lecture" on public.village
  for select to authenticated using (public.est_membre());

drop policy if exists "village_modif" on public.village;
create policy "village_modif" on public.village
  for update to authenticated using (public.est_membre()) with check (public.est_membre());

drop policy if exists "journal_lecture" on public.journal;
create policy "journal_lecture" on public.journal
  for select to authenticated using (public.est_membre());

drop policy if exists "journal_ajout" on public.journal;
create policy "journal_ajout" on public.journal
  for insert to authenticated with check (public.est_membre() and user_id = auth.uid());

revoke all on public.membres, public.village, public.journal from anon;
grant select on public.membres to authenticated;
grant select, update on public.village to authenticated;
grant select, insert on public.journal to authenticated;
grant execute on function public.changer_pseudo(text) to authenticated;
grant execute on function public.changer_skin(text) to authenticated;

-- ── Temps réel (mise à jour en direct chez tous les joueurs) ────
do $$
begin
  begin alter publication supabase_realtime add table public.village; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.journal; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.membres; exception when duplicate_object then null; end;
end $$;

-- ── Canaux temps réel privés ────────────────────────────────────
-- « morena » : mises à jour du village et du journal ; « balade » : positions des personnages.
-- Seuls les membres peuvent les écouter. Pense aussi à désactiver « Allow public access » dans Realtime > Settings.
drop policy if exists "balade_ecoute" on realtime.messages;
create policy "balade_ecoute" on realtime.messages
  for select to authenticated using (realtime.topic() in ('balade', 'morena') and public.est_membre());

drop policy if exists "balade_envoi" on realtime.messages;
create policy "balade_envoi" on realtime.messages
  for insert to authenticated with check (realtime.topic() = 'balade' and public.est_membre());

-- ── État actuel du village (repris du premier site) ─────────────
insert into public.village (id, etat, regles) values (1,
'{
  "jour": 1,
  "stocks": {"nourriture": 299, "metal": 47, "bois": 14, "pierre": 4, "pt": 0, "tissu": 14, "charbon": 122, "fer": 64, "vin": 0},
  "bat": {"puits": 1, "champs": 1, "elevage": 1, "tissage": 1, "chasseurs": 1, "bucherons": 1, "charbonniere": 1, "forge": 1, "carriere": 1, "auberge": 1, "mine_fer": 1},
  "ordre": ["puits", "champs", "auberge", "forge", "bucherons", "carriere", "mine_fer", "chasseurs", "elevage", "tissage", "charbonniere"],
  "villageois": null,
  "mo": null,
  "empl": ["M", "F"],
  "chantiers": []
}'::jsonb,
'{
  "regles": [
    {"id": "r1",  "bat": "champs",       "res": "nourriture", "sens": 1,  "mode": "de",   "n": 1, "pause": ["hiver"]},
    {"id": "r2",  "bat": "chasseurs",    "res": "nourriture", "sens": 1,  "mode": "de",   "n": 1},
    {"id": "r3",  "bat": "bucherons",    "res": "bois",       "sens": 1,  "mode": "de",   "n": 1},
    {"id": "r4",  "bat": "charbonniere", "res": "charbon",    "sens": 1,  "mode": "de",   "n": 1},
    {"id": "r5",  "bat": "mine_fer",     "res": "fer",        "sens": 1,  "mode": "de",   "n": 1},
    {"id": "r6",  "bat": "tissage",      "res": "tissu",      "sens": 1,  "mode": "fixe", "n": 20},
    {"id": "r7",  "bat": "forge",        "res": "metal",      "sens": 1,  "mode": "fixe", "n": 20},
    {"id": "r8",  "bat": "forge",        "res": "fer",        "sens": -1, "mode": "fixe", "n": 20},
    {"id": "r9",  "bat": "carriere",     "res": "pierre",     "sens": 1,  "mode": "de",   "n": 1},
    {"id": "r10", "bat": "auberge",      "res": "nourriture", "sens": -1, "mode": "fixe", "n": null}
  ],
  "effets": [
    {"id": "e1", "bat": "scierie", "type": "cout", "sens": -1, "val": 10, "unit": "fixe", "res": "bois", "cible": "tous", "note": ""}
  ]
}'::jsonb)
on conflict (id) do nothing;

insert into public.journal (jour, type, texte, user_id)
select 1, 'mj', 'Village installé avec les stocks actuels. Bâtiments à vérifier avant la séance.', null
where not exists (select 1 from public.journal);
