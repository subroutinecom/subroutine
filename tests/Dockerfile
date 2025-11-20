FROM ubuntu:noble AS base

RUN apt-get update && apt-get install -y \
    curl \
    unzip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs
RUN npm install -g pnpm

RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh -s -- -y v2.5.6

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY ./tests ./tests

RUN pnpm install --filter @subroutine/tests...

WORKDIR /app/tests

FROM base AS dev
CMD ["deno", "test", "tests", "--allow-net", "--allow-env", "--allow-read", "--sloppy-imports", "--unstable-worker-options", "--watch"]

FROM base AS ci
CMD ["deno", "test", "tests", "--allow-net", "--allow-env", "--allow-read", "--sloppy-imports", "--unstable-worker-options"]
