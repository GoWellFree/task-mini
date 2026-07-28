# Builds the backend service for Railway. Explicit and self-contained on
# purpose: Railway's auto-detecting builders (Railpack, Nixpacks) both ran an
# implicit `npm install` step ahead of the configured build command that
# didn't resolve the `@task-mini/shared` npm workspace correctly from this
# monorepo, regardless of the Root Directory setting. A Dockerfile removes
# that guesswork entirely.

FROM node:22-alpine AS build
WORKDIR /app

# Copy only the manifests first so `npm ci` is cached across source-only
# changes to backend/frontend/shared.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci

COPY packages/shared packages/shared
COPY backend backend
RUN npm run build:shared && npm --workspace backend run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/backend/dist ./backend/dist

EXPOSE 3000
CMD ["node", "backend/dist/index.js"]
