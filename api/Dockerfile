FROM ubuntu:noble AS base

RUN apt-get update && apt-get install -y curl unzip ca-certificates
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
  apt-get install -y nodejs
RUN npm install -g pnpm pm2

RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh -s -- -y v2.5.6

WORKDIR /app

FROM base AS build

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY ./api ./api
COPY ./eslint ./eslint
COPY ./eslint.config.ts ./eslint.config.ts

WORKDIR /app/api

ARG CI
ENV CI=${CI:-}
ARG BUILD_SHA
ENV BUILD_SHA=${BUILD_SHA:-}

RUN ["./manage.sh", "--build"]

FROM build AS dev

ENV NODE_ENV=development
WORKDIR /app/api
CMD ["./manage.sh", "--run"]

FROM base AS prod

WORKDIR /app/api

COPY --from=build /app/api/api-server /release/build
COPY ./api/ecosystem.config.js /app/api/ecosystem.config.js
COPY ./api/manage.sh /app/api/manage.sh

ENV NODE_ENV=production
ARG CI
ENV CI=${CI:-}
ARG BUILD_SHA
ENV BUILD_SHA=${BUILD_SHA:-}

CMD ["./manage.sh", "--run"]
