# Builds the web app and serves it with Caddy, which also proxies the API and
# terminates HTTPS (automatic certificates when SITE_ADDRESS is a domain name).
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Public (pk.) Mapbox token, baked into the browser bundle.
ARG VITE_MAPBOX_ACCESS_TOKEN
ENV VITE_MAPBOX_ACCESS_TOKEN=$VITE_MAPBOX_ACCESS_TOKEN
RUN npm run build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
