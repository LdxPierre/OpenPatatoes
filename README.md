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
