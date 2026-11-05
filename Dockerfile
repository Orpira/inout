# --- Build ---
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY tsconfig.base.json ./
COPY packages packages
COPY apps apps
RUN npm run build

# --- Runtime: un solo proceso sirve API + frontend ---
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    WEB_DIST=/app/web \
    MIGRATIONS_DIR=/app/drizzle \
    # Solo afecta a los logs del sistema; la lógica de negocio fija America/Bogota por código.
    TZ=America/Bogota
RUN apk add --no-cache tzdata
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev -w @inout/api && npm cache clean --force
COPY --from=build /src/apps/api/dist ./dist
COPY --from=build /src/apps/api/drizzle ./drizzle
COPY --from=build /src/apps/web/dist ./web
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
