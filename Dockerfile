FROM node:24-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    tini \
    && rm -rf /var/lib/apt/lists/*

RUN if command -v yarn >/dev/null 2>&1; then \
    yarn --version; \
    else \
    corepack enable && corepack prepare yarn@1.22.22 --activate; \
    fi

WORKDIR /app

FROM base AS build

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .
RUN yarn build

FROM base AS production

ENV NODE_ENV=production

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production=true \
    && yarn cache clean

COPY --from=build /app/dist ./dist

EXPOSE 5555

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
