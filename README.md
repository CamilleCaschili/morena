# Morena

Site du village de Morena : vue 3D (maquette et balade), stocks, constructions, passage des jours aux d100, journal et règles du MJ. Les données sont partagées en temps réel entre les joueurs via Supabase, et seules les personnes que tu as ajoutées peuvent se connecter (lien magique par e-mail).

Stack : Vue 3 + TypeScript, Three.js, Supabase, déployé sur Vercel.

## 0. Tester en 2 minutes (mode démo)

Sans fichier `.env`, le site démarre en **mode démo** avec les données actuelles du village, sans connexion ni Supabase. Rien n'est enregistré.

```bash
npm install
npm run dev              # puis ouvre http://localhost:5173
npm run dev -- --host    # pour tester aussi sur ton téléphone (même wifi), via l'adresse « Network » affichée
```

## 1. Créer la base Supabase

1. Crée un projet sur [supabase.com](https://supabase.com) (région Europe).
2. **SQL Editor > New query** : colle tout le contenu de `supabase/schema.sql` et clique sur **Run**. Le script crée les tables, la sécurité, le temps réel et importe l'état actuel du village.
3. **Authentication > Sign In / Providers** :
   - désactive **Allow new users to sign up** (personne ne peut créer de compte depuis le site) ;
   - vérifie que le fournisseur **Email** est activé.
4. **Project Settings > Realtime** : désactive **Allow public access**. Seuls les canaux privés restent ouverts, et le canal de la balade est réservé aux membres.
5. **Authentication > URL Configuration** : mets l'adresse du site déployé dans **Site URL** (par ex. `https://morena.vercel.app`) et ajoute `http://localhost:5173` dans **Redirect URLs** pour tester en local.

## 2. Ajouter les membres du groupe

**Authentication > Users > Add user** :
- **Send invitation** envoie un e-mail d'invitation ;
- ou **Create new user** avec l'e-mail (coche *Auto Confirm User*, le mot de passe ne servira pas).

Chaque utilisateur ajouté apparaît automatiquement dans la table `membres` avec le rôle `joueur` et un pseudo tiré de son e-mail (modifiable depuis le site, menu en haut à droite).

**Pour te donner le rôle de MJ** : Table Editor > `membres` > passe la colonne `role` de ta ligne à `mj`. Le MJ est le seul à pouvoir modifier l'onglet Règles ; c'est la base qui le vérifie, pas seulement le site.

Pour retirer quelqu'un : supprime-le dans Authentication > Users.

## 3. Lancer en local

```bash
cp .env.example .env    # puis colle l'URL et la clé "anon public" (Project Settings > API)
npm install
npm run dev             # http://localhost:5173
```

## 4. Déployer sur Vercel

1. Pousse le projet sur GitHub, puis **Add New > Project** sur Vercel et importe le dépôt (framework détecté : Vite).
2. Dans **Environment Variables**, ajoute `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.
3. Déploie, puis reporte l'adresse obtenue dans la **Site URL** de Supabase (étape 1.5).

## Bon à savoir

- **Sécurité** : la clé `anon` est publique par nature (elle est dans le code du site). Ce sont les règles RLS de `schema.sql` qui protègent les données : sans connexion d'un membre, la base ne renvoie rien. Le site demande aussi aux moteurs de recherche de ne pas l'indexer.
- **E-mails** : le service d'envoi intégré à Supabase est limité à quelques e-mails par heure. Pour une table de JdR ça suffit ; sinon, branche un SMTP (Authentication > Emails > SMTP Settings).
- **Lien magique** : il doit être ouvert sur l'appareil où l'on veut utiliser le site. La session reste ouverte ensuite.
- **Sauvegarde** : menu en haut à droite > *Télécharger une sauvegarde* (fichier JSON avec le village et le journal).
- **Joueurs simultanés** : si deux personnes agissent en même temps, la deuxième modification est rejouée sur l'état à jour (les stocks sont revérifiés), donc rien n'est écrasé.
- **Balade à plusieurs** : les joueurs qui se promènent en même temps se voient (personnage + pseudo). En mode démo, ça marche entre deux onglets du même navigateur.
- **Ce qui est encore à préciser dans Règles** : consommation de l'auberge, nombre de villageois. La main-d'œuvre est affichée mais pas encore déduite.

## Organisation du code

| Fichier | Rôle |
| --- | --- |
| `src/data/catalogue.ts` | Les 86 bâtiments : coûts, prérequis, emplacement, forme 3D |
| `src/logic/regles.ts` | Calculs purs : coûts après effets, prévisions, attente, passage du jour |
| `src/logic/store.ts` | État partagé, synchro temps réel, écritures sûres (version du village) |
| `src/three/batiments.ts` | Modèles low-poly générés en code, un par forme |
| `src/three/scene.ts` | Terrain, montagnes, forêt, caméra maquette/balade, jour/nuit, fumées |
| `src/components/` | Écrans : connexion, village, construire, journal, règles, passage du jour |
| `supabase/schema.sql` | Tables, sécurité, temps réel, données initiales |
