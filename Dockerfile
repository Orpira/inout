# --- Compilación -------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm run build

# --- Ejecución ---------------------------------------------------------------
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    WEB_DIST=/app/web
WORKDIR /app/api
COPY package.json package-lock.json /app/
COPY packages/core/package.json /app/packages/core/
COPY apps/api/package.json /app/apps/api/
COPY apps/web/package.json /app/apps/web/
RUN cd /app && npm ci --omit=dev -w @inout/api && npm cache clean --force
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/drizzle ./drizzle
COPY --from=build /app/apps/web/dist /app/web
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3000/api/salud || exit 1
# --migrar aplica las migraciones pendientes antes de arrancar.
CMD ["node", "dist/server.js", "--migrar"]
