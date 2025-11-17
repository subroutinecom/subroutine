FROM ubuntu:noble AS base

RUN apt-get update && apt-get install -y \
    curl \
    unzip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh -s -- -y v2.5.6

WORKDIR /app

COPY ./tests ./tests

WORKDIR /app/tests

FROM base AS dev
CMD ["deno", "test", "tests", "--allow-net", "--allow-env", "--allow-read", "--sloppy-imports", "--unstable-worker-options", "--watch"]

FROM base AS ci
CMD ["deno", "test", "tests", "--allow-net", "--allow-env", "--allow-read", "--sloppy-imports", "--unstable-worker-options"]