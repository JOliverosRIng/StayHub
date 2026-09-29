FROM node:20-bookworm-slim AS dependencies
WORKDIR /workspace
COPY package.json package-lock.json nest-cli.json tsconfig.base.json ./
COPY apps/users-service/package.json apps/users-service/package.json
RUN npm ci

FROM dependencies AS build
COPY apps/users-service apps/users-service
RUN npm run prisma:generate --workspace @stayhub/users-service \
  && npm run build --workspace @stayhub/users-service \
  && npm prune --omit=dev

FROM dependencies AS migrate
COPY apps/users-service/prisma apps/users-service/prisma
USER node
CMD ["npm", "run", "prisma:migrate:deploy", "--workspace", "@stayhub/users-service"]

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --system stayhub && useradd --system --gid stayhub stayhub
COPY --from=build --chown=stayhub:stayhub /workspace/node_modules ./node_modules
COPY --from=build --chown=stayhub:stayhub /workspace/dist/apps/users-service ./dist
COPY --from=build --chown=stayhub:stayhub /workspace/apps/users-service/prisma ./prisma
USER stayhub
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3002/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
