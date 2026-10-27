FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/card-auth-sandbox/package.json apps/card-auth-sandbox/
COPY apps/warroom-server/package.json apps/warroom-server/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
RUN npm ci
COPY . .
# Context: only the web workspace has a build script; the services run their .ts files directly.
RUN npm run build --workspaces --if-present
