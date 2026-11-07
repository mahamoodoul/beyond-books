# Production frontend for Coolify: build the Vite SPA, serve it with nginx on port 3939.
# nginx also reverse-proxies /api to the backend, so only one port is exposed publicly.
FROM node:22-slim AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
COPY frontend/stubs ./stubs
RUN npm ci
COPY frontend ./
RUN npm run build

FROM nginx:1.27-alpine
COPY infrastructure/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 3939
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1:3939/ >/dev/null || exit 1
