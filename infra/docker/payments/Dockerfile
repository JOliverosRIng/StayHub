FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/payments-service/package.json apps/payments-service/package.json
RUN npm ci --workspace @stayhub/payments-service --include-workspace-root
COPY tsconfig.base.json nest-cli.json ./
COPY apps/payments-service apps/payments-service
RUN npm run prisma:payments:generate \
  && npm run build:payments

FROM build AS migration
USER node
CMD ["npm", "run", "prisma:payments:migrate:deploy"]

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates tini \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system stayhub \
  && useradd --system --gid stayhub stayhub
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist/apps/payments-service ./dist/apps/payments-service
COPY --from=build /app/apps/payments-service/src/infrastructure/persistence/generated/client ./dist/apps/payments-service/infrastructure/persistence/generated/client
COPY --from=build /app/apps/payments-service/node_modules ./dist/apps/payments-service/node_modules
COPY --from=build /app/apps/payments-service/prisma ./apps/payments-service/prisma
USER stayhub
EXPOSE 3006
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3006/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/apps/payments-service/main.js"]
