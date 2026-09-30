FROM node:20-bookworm-slim AS dependencies
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/users-service/package.json ./apps/users-service/package.json
RUN npm ci

FROM dependencies AS build
COPY tsconfig.base.json nest-cli.json ./
COPY apps/users-service ./apps/users-service
COPY scripts ./scripts
RUN npm run prisma:users:generate && npm run build:users

FROM build AS migration
USER node
CMD ["node", "scripts/users-migrate.cjs"]

FROM build AS production-dependencies
RUN npm prune --omit=dev --ignore-scripts

FROM node:20-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3002
HEALTHCHECK --interval=15s --timeout=3s CMD node -e "fetch('http://127.0.0.1:3002/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/apps/users-service/main.js"]
