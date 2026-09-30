FROM node:20-bookworm-slim AS dependencies
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/users-service/package.json ./apps/users-service/package.json
# El lockfile de workspaces necesita el paquete hermano para reproducir el árbol real:
# sin él, `@nestjs/swagger` se anida en el workspace y no es resoluble en runtime.
COPY apps/auth-service/package.json ./apps/auth-service/package.json
RUN npm ci

FROM dependencies AS build
COPY tsconfig.base.json nest-cli.json ./
COPY apps/users-service ./apps/users-service
COPY scripts ./scripts
RUN npm run prisma:users:generate && npm run build:users

FROM build AS migration
USER node
CMD ["node", "scripts/users-migrate.cjs"]

FROM node:20-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
# `npm prune --omit=dev` en la raíz de workspaces elimina dependencias productivas
# de Users (p. ej. @nestjs/swagger). Se copia node_modules del build, igual que Auth.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3002
HEALTHCHECK --interval=15s --timeout=3s CMD node -e "fetch('http://127.0.0.1:3002/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/apps/users-service/main.js"]
