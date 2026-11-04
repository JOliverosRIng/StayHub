# Build context: repository root. The service installs from its own package.json and
# package-lock.json; it is not registered in the root npm workspaces.
FROM node:20-bookworm-slim AS dependencies
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY tsconfig.base.json ./
COPY apps/accommodations-service/package.json apps/accommodations-service/package-lock.json ./apps/accommodations-service/
WORKDIR /app/apps/accommodations-service
RUN npm ci

FROM dependencies AS build
COPY apps/accommodations-service ./
RUN npm run prisma:generate && npm run build

FROM build AS migration
USER node
CMD ["node", "scripts/migrate.cjs"]

FROM build AS production-dependencies
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /var/lib/stayhub/accommodations/photos && chown -R node:node /var/lib/stayhub/accommodations
WORKDIR /app
ENV NODE_ENV=production
ENV ACCOMMODATIONS_PHOTO_STORAGE_ROOT=/var/lib/stayhub/accommodations/photos
COPY --from=production-dependencies /app/apps/accommodations-service/node_modules ./node_modules
COPY --from=build /app/apps/accommodations-service/dist ./dist
COPY --from=build /app/apps/accommodations-service/package.json ./package.json
USER node
VOLUME ["/var/lib/stayhub/accommodations/photos"]
EXPOSE 3003
HEALTHCHECK --interval=15s --timeout=3s CMD node -e "fetch('http://127.0.0.1:3003/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
