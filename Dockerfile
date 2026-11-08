FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM dependencies AS tools
COPY src ./src
COPY scripts ./scripts
COPY drizzle ./drizzle
COPY static ./static
COPY tests ./tests
COPY dev.sh tsconfig.json vite.config.ts drizzle.config.ts playwright.config.ts ./
RUN npm run prepare

FROM tools AS build
RUN BETTER_AUTH_SECRET=build-only-placeholder-not-a-runtime-secret npm run check && BETTER_AUTH_SECRET=build-only-placeholder-not-a-runtime-secret npm run build

FROM node:24-bookworm-slim AS app
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 UPLOAD_DIR=/app/uploads
COPY --from=build /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/build ./build
COPY scripts/start.ts ./scripts/start.ts
RUN mkdir uploads && chown node:node uploads
USER node
EXPOSE 3000
CMD ["node", "scripts/start.ts"]

FROM mcr.microsoft.com/playwright:v1.64.1-noble AS e2e
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
CMD ["sh", "-c", "npm run check && npm run test:unit && npm run test:integration && npm run test:e2e:run"]
