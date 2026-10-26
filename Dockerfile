# Images de production : `api` (serveur Fastify) et `web` (front construit, servi par nginx).
# Construites par compose.yml, chacune avec sa cible : docker build --target api .

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @openpatatoes/server... --filter @openpatatoes/web...
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY apps/web apps/web
RUN pnpm --filter @openpatatoes/server build \
  && pnpm --filter @openpatatoes/web build \
  && pnpm --filter @openpatatoes/server deploy --prod --legacy /out/server

FROM node:22-alpine AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/server/node_modules node_modules
COPY --from=build /out/server/package.json ./
COPY --from=build /repo/apps/server/dist dist
COPY --from=build /repo/apps/server/drizzle drizzle
USER node
EXPOSE 3000
CMD ["sh", "-c", "node dist/migrate.js && exec node dist/index.js"]

FROM nginx:1.29-alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
