FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY apps/search-service/package.json apps/search-service/package.json
RUN npm ci --workspace @stayhub/search-service --include-workspace-root
COPY tsconfig.base.json nest-cli.json ./
COPY apps/search-service apps/search-service
RUN npm run prisma:search:generate && npm run build:search

FROM build AS migration
CMD ["npm", "run", "prisma:search:migrate:deploy"]

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl tini \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system stayhub && useradd --system --gid stayhub stayhub
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/apps/search-service/prisma ./apps/search-service/prisma
USER stayhub
EXPOSE 3004
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/apps/search-service/main.js"]
