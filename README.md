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

Ils lancent le front sur le port 5174 et simulent l'API dans le navigateur : ni serveur, ni PostgreSQL, ni OpenProject.

Pour la méthode de travail (branches, validation, relecture), voir [CONTRIBUTING.md](CONTRIBUTING.md).
