# Roadmap — OpenPatatoes

Découpe des tâches par jalons incrémentaux. Chaque jalon produit quelque chose
d'utilisable. Le MVP correspond aux jalons 0 à 4 (lecture seule), l'édition
arrive ensuite. On privilégie des *vertical slices* (chaque tâche traverse
back + front quand c'est pertinent) plutôt que de finir tout le backend avant
de toucher au front.

Tailles indicatives : S (< ½ j), M (½–1 j), L (> 1 j).

---

## Jalon 0 — Fondations techniques

| #   | Tâche                                                                                | Taille |
| --- | ------------------------------------------------------------------------------------ | ------ |
| 0.1 | Configs TypeScript (base + par app), alias vers `@openpatatoes/shared`               | S      |
| 0.2 | Serveur Fastify minimal : route `/health`, config env validée par Zod                | S      |
| 0.3 | App Vue minimale : Vite, Router, VueQueryPlugin, thème PrimeVue, page placeholder    | S      |
| 0.4 | Docker Compose dev : PostgreSQL + script d'init                                      | S      |
| 0.5 | Drizzle : connexion, config drizzle-kit, première migration vide                     | S      |
| 0.6 | (Optionnel) OP CE 17 dans le compose pour dev local                                  | M      |

**Sortie :** `pnpm dev` lance front + back, `/health` répond, la base est accessible.

---

## Jalon 1 — Authentification & utilisateurs

| #   | Tâche                                                                                            | Taille |
| --- | ------------------------------------------------------------------------------------------------ | ------ |
| 1.1 | Schéma DB : `users`, `sessions`                                                                  | S      |
| 1.2 | Service auth : hash Argon2id, création/validation/révocation de session                          | M      |
| 1.3 | Routes `POST /auth/register`, `/login`, `/logout`, `GET /me` — cookie httpOnly, `SameSite=Lax`   | M      |
| 1.4 | Plugin Fastify `requireAuth` (preHandler) + tests Vitest                                         | S      |
| 1.5 | Front : pages login/register, route guard, query `me`, état de chargement                        | M      |

**Sortie :** deux utilisateurs peuvent se connecter chacun avec leur session, sans partage.

---

## Jalon 2 — Connexion OpenProject par utilisateur

| #   | Tâche                                                                                                                        | Taille |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ------ |
| 2.1 | Schéma DB : `op_connections` (url, token chiffré AES-256-GCM, user_id)                                                       | S      |
| 2.2 | Service de chiffrement des jetons (clé depuis env, `crypto` Node)                                                            | S      |
| 2.3 | Client OP minimal : fetch typé + validation Zod des réponses, erreurs taguées (`OpUnreachable`, `OpUnauthorized`, …) via neverthrow | M      |
| 2.4 | Routes `PUT /op/connection`, `GET /op/connection/status` (teste le token contre `/api/v3/users/me`)                          | M      |
| 2.5 | Front : page paramètres (URL OP + clé API), affichage du statut de connexion                                                 | M      |

**Sortie :** chaque utilisateur enregistre sa propre clé OP, l'app vérifie qu'elle fonctionne.

---

## Jalon 3 — Modèle local & synchronisation (lecture)

C'est le cœur de l'indépendance vis-à-vis d'OP.

| #   | Tâche                                                                                                                     | Taille |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ------ |
| 3.1 | Décision d'architecture : mapping local ↔ OP (ex. 1 projet local ↔ 1 projet OP, ou regroupement libre) + table `external_refs` générique | S      |
| 3.2 | Schéma DB : `projects`, `tasks` (hiérarchie par `parent_id`), `external_refs`, `sync_runs`                                | M      |
| 3.3 | Adaptateur OP : projets (`/api/v3/projects`), work packages (pagination, filtres par projet) → entités locales            | L      |
| 3.4 | Job de sync initiale par utilisateur (déclenchement manuel d'abord) + gestion des erreurs partielles                      | M      |
| 3.5 | Sync incrémentale : `updatedAt` cursor ou webhooks OP si dispo ; exécution périodique                                     | M      |
| 3.6 | Endpoints lecture : `GET /projects`, `GET /projects/:id/tasks` (arbre depuis la base locale, jamais d'appel OP synchrone) | M      |

**Sortie :** la base locale contient projets + tâches d'un compte OP réel, servies sans latence OP.

---

## Jalon 4 — Vue liste des tâches (MVP)

| #   | Tâche                                                                                        | Taille |
| --- | -------------------------------------------------------------------------------------------- | ------ |
| 4.1 | Endpoint arbre aplati avec profondeur (adapté au virtual scroll)                             | M      |
| 4.2 | Composant arbre virtualisé (`@tanstack/vue-virtual`) : indentation, expand/collapse, état dans Pinia | L      |
| 4.3 | Colonnes : sujet, état, assigné, temps estimé/restant                                        | M      |
| 4.4 | UX réactivité : skeletons, stale-while-revalidate via vue-query                              | S      |
| 4.5 | Sélecteur de projet                                                                          | S      |

**Sortie :** navigation fluide dans une liste hiérarchique de plusieurs milliers de tâches. **MVP atteint.**

---

## Jalon 5 — Détail d'une tâche

| #   | Tâche                                                                                              | Taille |
| --- | -------------------------------------------------------------------------------------------------- | ------ |
| 5.1 | Endpoint détail : métadonnées locales + activités (journals OP, via adaptateur, avec cache)        | M      |
| 5.2 | Front : panneau ou page détail (route propre, ouverture depuis la liste)                           | M      |
| 5.3 | Rendu markdown de la description (md-editor-v3 en mode preview)                                    | S      |
| 5.4 | Affichage : temps estimé/restant, assignations, fil d'ariane hiérarchique, état, activités         | M      |

---

## Jalon 6 — Édition (write-through)

| #   | Tâche                                                                                          | Taille |
| --- | ---------------------------------------------------------------------------------------------- | ------ |
| 6.1 | Stratégie d'écriture : write-through OP → maj locale, gestion `lockVersion` / conflits 409     | M      |
| 6.2 | Endpoints mutation : état, assignation, temps estimé, temps restant, description               | L      |
| 6.3 | Front : édition inline dans le détail, mutations optimistes vue-query avec rollback            | L      |
| 6.4 | Surface d'erreurs : conflit affiché à l'utilisateur, retry, file d'attente si OP indisponible  | M      |

---

## Jalon 7 — Robustesse & mise en production

| #   | Tâche                                                                          | Taille |
| --- | ------------------------------------------------------------------------------ | ------ |
| 7.1 | Client OP : retry/backoff, timeout, logs structurés                            | M      |
| 7.2 | Dockerfiles server/web, compose de prod (front servi par Fastify ou nginx)     | M      |
| 7.3 | Index DB, mesure des perfs sur gros volumes                                    | S      |
| 7.4 | Sauvegarde PostgreSQL, rotation des clés de chiffrement                        | S      |

---

## Backlog (itérations suivantes, sans ordre figé)

- Tests E2E Playwright
- Filtres, recherche, vues personnalisées de la liste
- Saisie de temps (time entries)
- Création de tâches
- Notifications / activité en temps réel (webhooks OP)
- Support multi-instances OP par utilisateur
- Mode hors-ligne / PWA

---

## Points de décision à trancher avant le jalon 3

1. **Mapping projets** : 1 projet local ↔ 1 projet OP, ou projets locaux libres
   regroupant plusieurs projets OP ? (La seconde option est plus fidèle à
   « ne pas dépendre de la structure OP » mais plus coûteuse.)
2. **Sens de vérité** : OP reste la source de vérité, la base locale est un
   cache dénormalisé — ou l'inverse ? Ça conditionne toute la stratégie de sync.
3. **Conflits d'édition** : dernier écrivain gagne, ou blocage sur
   `lockVersion` périmé ?
