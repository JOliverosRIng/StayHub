FROM node:20-bookworm-slim AS dependencies
WORKDIR /workspace
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json nest-cli.json tsconfig.base.json ./
COPY apps/auth-service/package.json apps/auth-service/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

FROM dependencies AS build
COPY apps/auth-service apps/auth-service
RUN npm run prisma:generate --workspace @stayhub/auth-service \
  && npm run build --workspace @stayhub/auth-service

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system stayhub && useradd --system --gid stayhub stayhub
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/dist/apps/auth-service ./dist
COPY --from=build /workspace/apps/auth-service/prisma ./prisma
USER stayhub
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3001/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]

