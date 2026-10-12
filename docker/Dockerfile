# syntax=docker/dockerfile:1
# Targeti: "aplikacija" (Next.js standalone) i "alati" (dbmate migracije, skripte poput kreiraj-admina).

FROM node:22-alpine AS ovisnosti
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM ovisnosti AS izgradnja
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM ovisnosti AS alati
COPY tsconfig.json ./
COPY db ./db
COPY lib ./lib
COPY scripts ./scripts
CMD ["npx", "tsx", "scripts/db.ts", "migrate"]

FROM node:22-alpine AS aplikacija
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 TZ=Europe/Zagreb
RUN apk add --no-cache tzdata \
 && addgroup -S app && adduser -S app -G app \
 && mkdir -p /data/datoteke && chown app:app /data/datoteke
COPY --from=izgradnja --chown=app:app /app/.next/standalone ./
COPY --from=izgradnja --chown=app:app /app/.next/static ./.next/static
COPY --from=izgradnja --chown=app:app /app/public ./public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/zdravlje || exit 1
CMD ["node", "server.js"]
