FROM ubuntu:noble AS base

RUN apt-get update && apt-get install -y \
    curl \
    unzip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
  apt-get install -y nodejs

RUN npm install -g pm2

RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh -s -- -y v2.5.6

WORKDIR /app

COPY ./tests ./tests
COPY ./packages ./packages

WORKDIR /app/tests

ENV TEST_NAMES=""

FROM base AS dev
CMD ["./manage.sh", "--run"]

FROM base AS ci
CMD ["./manage.sh", "--test"]
