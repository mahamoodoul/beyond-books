# Production SPA: static build served by nginx with security headers and an /api reverse proxy.
FROM node:22-slim AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
COPY frontend/stubs ./stubs
RUN npm ci
COPY frontend ./
# demo GLBs, metadata and 3D scene fixtures, bundled by the 3D Studio (../packages from /app)
COPY packages/demo-assets/glb /packages/demo-assets/glb
COPY packages/demo-assets/metadata /packages/demo-assets/metadata
COPY packages/three-d-contracts/fixtures /packages/three-d-contracts/fixtures
RUN npm run build

FROM nginx:1.27-alpine
# nginx's entrypoint renders /etc/nginx/templates/*.template with envsubst.
ENV API_UPSTREAM=http://api:8000 CONNECT_SRC_EXTRA=""
COPY infrastructure/docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
