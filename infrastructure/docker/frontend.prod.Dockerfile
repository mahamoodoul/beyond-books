# Production frontend for Coolify: build the Vite SPA, serve it with nginx on port 3939.
# nginx also reverse-proxies /api to the backend, so only one port is exposed publicly.
FROM node:22-slim AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
COPY frontend/stubs ./stubs
RUN npm ci
# Demo 3D scenes for the Studio (frontend/src/features/three-d/library/runtime/fixtureRegistry.ts
# globs ../packages, i.e. /packages here).
COPY packages/demo-assets/glb /packages/demo-assets/glb
COPY packages/demo-assets/metadata /packages/demo-assets/metadata
COPY packages/three-d-contracts/fixtures /packages/three-d-contracts/fixtures
COPY frontend ./
# Demo sign-in (login-page button + Shift+T/Shift+S) is on for this demo deployment.
# The demo credentials are part of the public JS bundle; build with VITE_DEMO_LOGIN=false to turn it off.
ARG VITE_DEMO_LOGIN=true
ARG VITE_DEMO_TEACHER=""
ARG VITE_DEMO_STUDENT=""
ENV VITE_DEMO_LOGIN=$VITE_DEMO_LOGIN VITE_DEMO_TEACHER=$VITE_DEMO_TEACHER VITE_DEMO_STUDENT=$VITE_DEMO_STUDENT
RUN npm run build

FROM nginx:1.27-alpine
COPY infrastructure/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 3939
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1:3939/ >/dev/null || exit 1
