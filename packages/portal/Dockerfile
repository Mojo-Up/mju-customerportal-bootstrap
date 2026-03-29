FROM node:24-slim AS build
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/portal/package.json packages/portal/
COPY packages/api/package.json packages/api/
COPY packages/mcp-server/package.json packages/mcp-server/
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/portal packages/portal

ARG VITE_API_URL
ARG VITE_ENTRA_EXTERNAL_ID_TENANT
ARG VITE_ENTRA_EXTERNAL_ID_CLIENT_ID

RUN pnpm --filter @{{ORG_SCOPE}}/shared build
RUN pnpm --filter @{{ORG_SCOPE}}/portal build

# Serve with nginx
FROM nginx:alpine
COPY --from=build /app/packages/portal/dist /usr/share/nginx/html
COPY packages/portal/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
