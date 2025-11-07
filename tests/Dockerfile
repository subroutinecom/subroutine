FROM ubuntu:noble AS base

RUN apt-get update && apt-get install -y curl unzip ca-certificates

RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh -s -- -y v2.5.6

WORKDIR /app

COPY ./tests ./tests

WORKDIR /app/tests
CMD ["deno", "test", "tests", "--allow-net", "--fail-fast", "--watch", "tests"]

FROM base AS ci
CMD ["deno", "test", "tests", "--allow-net"]