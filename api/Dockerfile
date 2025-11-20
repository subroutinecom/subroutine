FROM ubuntu:noble AS base

RUN apt-get update && apt-get install -y curl unzip ca-certificates

RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh -s -- -y v2.5.6
RUN apt-get install -y npm
RUN npm install -g pm2

WORKDIR /app

FROM base AS build

COPY ./api ./api
COPY ./eslint ./eslint
COPY ./eslint.config.ts ./eslint.config.ts
COPY ./packages ./packages

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
COPY --from=build /app/packages /app/packages
COPY ./api/ecosystem.config.js /app/api/ecosystem.config.js
COPY ./api/manage.sh /app/api/manage.sh

ENV NODE_ENV=production
ARG CI
ENV CI=${CI:-}
ARG BUILD_SHA
ENV BUILD_SHA=${BUILD_SHA:-}

CMD ["./manage.sh", "--run"]
