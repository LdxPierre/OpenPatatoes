# OpenPatatoes

## Développement

Prérequis : Node 22 ou plus, pnpm 10, Docker.

```sh
pnpm install
docker compose -f compose.dev.yml up -d   # PostgreSQL sur le port 55432
cp apps/server/.env.example apps/server/.env
```

Dans `apps/server/.env`, renseignez `OP_BASE_URL` et `OP_TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`). Gardez `COOKIE_SECURE=false` : en développement, l'app tourne en HTTP.

```sh
pnpm db:migrate
pnpm dev
```

- Web : http://localhost:5173. Vite renvoie `/api` vers le serveur, donc le front et l'API partagent la même origine.
- API : http://localhost:3000.

Vérifications :

```sh
pnpm lint        # pnpm lint:fix pour corriger
pnpm typecheck
pnpm test        # tests du serveur, PostgreSQL doit tourner
```

Tests de bout en bout (Playwright, dans `apps/e2e`) :

```sh
pnpm --filter @openpatatoes/e2e exec playwright install chromium   # une fois
pnpm test:e2e
pnpm --filter @openpatatoes/e2e exec playwright test --ui          # mode interactif
```

Ils lancent le front (port 5174) et le serveur (port 3100), sur la base `openpatatoes_e2e` du PostgreSQL de Docker, recréée à chaque lancement. Le serveur parle au faux OpenProject des tests d'intégration : pas besoin d'instance OP. Chaque test déclare son jeu de données avec `test.use({ scenario })` (voir `apps/e2e/tests/fixtures.ts`).

Pour la méthode de travail (branches, validation, relecture), voir [CONTRIBUTING.md](CONTRIBUTING.md).
