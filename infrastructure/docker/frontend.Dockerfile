FROM node:22-slim
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
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
