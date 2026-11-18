# Samaki Farm frontend - Angular 21, served by nginx on port 80 at "/".
#
# Jenga: docker build -t chiefmaster/samaki-frontend:<semver> .
# API ni relative (/api, /graphql - environment.prod.ts): nginx ya nje
# (compose ya LSMS) ndiyo inayoelekeza njia hizo kwa samaki-backend.

# ---------- build ----------
# Toleo lile lile la node/npm linalojenga kwenye mashine ya maendeleo
# (package.json: packageManager npm@10.9.2).
FROM node:22.13.1-alpine AS build
WORKDIR /src

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npx ng build --configuration production

# ---------- serve ----------
# Tawi la "stable" la nginx (1.27 ni mainline iliyopitwa). Kagua CVE kwa
# `docker scout cves` kabla ya kila release - base image inabadilika.
FROM nginx:1.28-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist/samakiFarmFront/browser /usr/share/nginx/html
EXPOSE 80
