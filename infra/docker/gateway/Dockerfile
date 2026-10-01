FROM node:20-bookworm-slim AS dependencies
WORKDIR /workspace
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json nest-cli.json tsconfig.base.json ./
COPY apps/api-gateway/package.json apps/api-gateway/package.json
# Los workspaces hermanos permiten a `npm ci` reproducir el árbol exacto del lockfile.
COPY apps/auth-service/package.json apps/auth-service/package.json
COPY apps/users-service/package.json apps/users-service/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

FROM dependencies AS build
COPY apps/api-gateway apps/api-gateway
RUN npm run build --workspace @stayhub/api-gateway

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system stayhub && useradd --system --gid stayhub stayhub
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/dist/apps/api-gateway ./dist
USER stayhub
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "process.env.NODE_TLS_REJECT_UNAUTHORIZED='0';fetch('https://127.0.0.1:8080/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
