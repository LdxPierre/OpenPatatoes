# Contribuer

Chaque travail suit ces étapes, dans l'ordre. L'installation et les commandes sont décrites dans le [README](README.md).

## 1. Créer la branche

Chaque travail a sa propre branche. Créez-la depuis la dernière version de la remote :

```sh
git fetch origin
git switch --no-track -c <nature>/<slug> origin/main
```

Avec `--no-track`, la branche ne suit pas `origin/main`. Au premier push, `git push -u origin HEAD` crée la branche distante et la suit.

Le préfixe `<nature>` indique le type de travail : `feat/`, `fix/`, `refactor/`, `docs/`, `test/`, `chore/`. Le slug est court, en français et en kebab-case. Si le travail porte sur une issue, le slug commence par son numéro : `feat/6-arbre-taches`.

## 2. Implémenter

Implémentez le travail et commitez-le sur la branche.

## 3. Valider

Lancez depuis la racine `pnpm lint:fix` (lint et formatage), puis `pnpm lint`, `pnpm typecheck` et `pnpm test`. Les tests du serveur ont besoin de PostgreSQL (voir le README). L'étape est terminée quand les trois dernières commandes passent sans erreur ni avertissement.

`pnpm lint:fix` reformate aussi `spec.yaml`, la copie de la spec OpenAPI d'OpenProject, et `pnpm lint` y signale des erreurs. Ignorez-les et restaurez le fichier avec `git restore spec.yaml`, sauf si le travail porte sur la spec.

## 4. Faire relire

Faites relire le diff de la branche avant d'ouvrir la PR. Corrigez ce que la relecture remonte, puis reprenez l'étape 3. L'étape est terminée quand la relecture ne remonte plus rien de bloquant.
