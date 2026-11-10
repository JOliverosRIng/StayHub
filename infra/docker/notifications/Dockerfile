FROM node:20-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app/apps/notifications-service
COPY apps/notifications-service/package*.json ./
RUN npm ci
COPY tsconfig.base.json /app/tsconfig.base.json
COPY apps/notifications-service/ ./
RUN npm run prisma:generate && npm run build

FROM build AS migration
USER node
CMD ["node", "scripts/migrate-deploy.mjs"]

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini && rm -rf /var/lib/apt/lists/*
WORKDIR /app/apps/notifications-service
COPY --from=build --chown=node:node /app/apps/notifications-service/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/notifications-service/dist ./dist
USER node
EXPOSE 3009
HEALTHCHECK --interval=10s --timeout=5s --retries=10 CMD node -e "fetch('http://127.0.0.1:3009/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
