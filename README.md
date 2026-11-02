# OpenPatatoes

## Lancer l'application avec Docker

Prérequis : Docker avec Compose.

```sh
cp .env.example .env
docker compose up --build
```

Dans `.env`, renseignez `OP_BASE_URL`, `OP_TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`), `POSTGRES_PASSWORD` (`openssl rand -hex 24`) et `ADMIN_PASSWORD`. Ce fichier n'est jamais commité.

L'application est sur http://localhost:8080 (`WEB_PORT` pour changer le port). Compose démarre trois services :

- `web` : nginx sert le front construit et renvoie `/api` vers le service `api` ;
- `api` : le serveur Fastify, qui applique les migrations à chaque démarrage ;
- `postgres` : la base, dans le volume `pgdata`.

Le nom d'hôte de `OP_BASE_URL` doit être celui du certificat d'OP, et OP refuse en général d'être appelé par son IP. Deux variables facultatives couvrent les instances internes :

- `OP_HOSTS_ENTRY` (`<nom>=<ip>`) : ajoute le nom d'OP au fichier `/etc/hosts` du service `api`, quand le DNS de Docker ne le résout pas ;
- `OP_CA_CERT` : chemin, sur l'hôte, d'un certificat PEM auquel le service `api` fait aussi confiance. Si OP envoie une chaîne de certificats incomplète, le navigateur la complète mais pas Node, et l'app répond `op_unavailable`. Mettez-y le certificat intermédiaire manquant, téléchargeable depuis l'URL « CA Issuers » du certificat d'OP :

  ```sh
  echo | openssl s_client -connect <ip>:443 -servername <nom> 2>/dev/null | openssl x509 -noout -ext authorityInfoAccess
  curl -s <url CA Issuers> | openssl x509 -inform der -out certs/op-ca.pem
  ```

Le cookie de session est réservé à HTTPS (`COOKIE_SECURE=true`), sauf sur `localhost`, que Chrome et Firefox traitent comme sûr. Pour essayer l'app en HTTP depuis une autre adresse, mettez `COOKIE_SECURE=false`. En production, placez un proxy HTTPS devant le service `web`.

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
