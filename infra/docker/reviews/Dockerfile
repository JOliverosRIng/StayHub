FROM node:20-bookworm-slim AS dependencies
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/reviews-service/package.json apps/reviews-service/package.json
RUN npm ci --workspace @stayhub/reviews-service --include-workspace-root

FROM dependencies AS build
COPY tsconfig.base.json nest-cli.json ./
COPY apps/reviews-service apps/reviews-service
RUN npm run prisma:reviews:generate && npm run build:reviews

FROM dependencies AS migration
COPY apps/reviews-service/prisma apps/reviews-service/prisma
CMD ["npm", "run", "prisma:reviews:migrate:deploy"]

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl tini \
  && rm -rf /var/lib/apt/lists/*
COPY --from=dependencies /workspace/node_modules ./node_modules
COPY --from=build /workspace/dist/apps/reviews-service ./dist
USER node
EXPOSE 3007
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3007/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
