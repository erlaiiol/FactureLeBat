# syntax=docker/dockerfile:1
# Build context is the repo root (see infra/docker-compose*.yml) so this
# image can also pick up infra/nginx.conf for the production stage.

FROM node:24-alpine AS base
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm pkg delete scripts.prepare 2>/dev/null || true

# --- dev: Angular CLI dev server, source is bind-mounted by docker-compose ---
FROM base AS dev
RUN npm ci
COPY frontend/. .
EXPOSE 4200
CMD ["npx", "ng", "serve", "--host", "0.0.0.0", "--port", "4200"]

# --- build: production Angular bundle ---
FROM base AS build
RUN npm ci
COPY frontend/. .
RUN npx ng build --configuration production

# --- prod: static files served by Nginx, /api proxied to the backend service ---
FROM nginx:alpine AS prod
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
