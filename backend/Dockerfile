# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
# Git hooks have no purpose inside a container image.
RUN npm pkg delete scripts.prepare

# --- dev: hot-reloading Nest app, source is bind-mounted by docker-compose ---
FROM base AS dev
RUN npm ci
COPY . .
RUN npx prisma generate
RUN chmod +x entrypoint.dev.sh wait-for-db.sh
EXPOSE 3000
CMD ["./entrypoint.dev.sh"]

# --- build: compile to dist/ with a real Postgres-free Prisma client ---
FROM base AS build
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# --- prod: compiled app, production dependencies only ---
FROM node:24-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm pkg delete scripts.prepare && npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/generated ./generated
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/entrypoint.sh /app/wait-for-db.sh ./
RUN chmod +x entrypoint.sh wait-for-db.sh

# Created here (not left to winston-daily-rotate-file's own mkdir at
# runtime) so it exists in the image *before* the chown below and before
# `backend_logs` (docker-compose.prod.yml) is attached — a fresh named
# volume is seeded from the image's content/ownership at its mount point,
# so this is what makes the volume writable by the unprivileged `node`
# user instead of ending up root-owned.
RUN mkdir -p logs
RUN chown -R node:node /app
USER node

EXPOSE 3000
CMD ["./entrypoint.sh"]
