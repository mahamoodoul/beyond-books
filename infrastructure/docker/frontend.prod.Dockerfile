# Production SPA: static build served by nginx with security headers and an /api reverse proxy.
FROM node:22-slim AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

FROM nginx:1.27-alpine
# nginx's entrypoint renders /etc/nginx/templates/*.template with envsubst.
ENV API_UPSTREAM=http://api:8000 CONNECT_SRC_EXTRA=""
COPY infrastructure/docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
