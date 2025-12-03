FROM ubuntu:noble AS base

RUN apt-get update && apt-get install -y curl unzip ca-certificates

RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh -s -- -y v2.5.6
RUN apt-get install -y npm
RUN npm install -g pm2

WORKDIR /app

FROM base AS build

COPY ./admin-panel ./admin-panel
COPY ./eslint ./eslint
COPY ./eslint.config.ts ./eslint.config.ts
COPY ./packages ./packages

WORKDIR /app/admin-panel

ARG CI
ENV CI=${CI:-}
ARG BUILD_SHA
ENV BUILD_SHA=${BUILD_SHA:-}
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL:-}
RUN ["./manage.sh", "--build"]

FROM build AS dev

ENV NODE_ENV=development
WORKDIR /app/admin-panel
CMD ["./manage.sh", "--run"]

FROM base AS prod

WORKDIR /app/admin-panel

COPY --from=build /app/admin-panel/build /app/admin-panel/build
COPY --from=build /app/admin-panel/node_modules /app/admin-panel/node_modules
COPY --from=build /app/packages /app/packages

COPY ./admin-panel/deno.json /app/admin-panel/deno.json
COPY ./admin-panel/ecosystem.config.cjs /app/admin-panel/ecosystem.config.cjs
COPY ./admin-panel/manage.sh /app/admin-panel/manage.sh

ENV NODE_ENV=production
ARG CI
ENV CI=${CI:-}
ARG BUILD_SHA
ENV BUILD_SHA=${BUILD_SHA:-}
CMD ["./manage.sh", "--run"]
