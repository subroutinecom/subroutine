FROM ubuntu:noble AS base

# Install system dependencies including Playwright requirements
RUN apt-get update && apt-get install -y \
    curl \
    unzip \
    ca-certificates \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2t64 \
    libatspi2.0-0 \
    libwayland-client0 \
    libcairo2 \
    libpango-1.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh -s -- -y v2.5.6

WORKDIR /app

COPY ./tests ./tests

WORKDIR /app/tests

# Install Playwright browsers
RUN deno install npm:@playwright/test && \
    deno run --allow-all npm:playwright install chromium

CMD ["sh", "-c", "deno test tests --allow-net && deno run --allow-all npm:@playwright/test test --config=playwright.config.ts"]

FROM base AS ci
CMD ["sh", "-c", "deno test tests --allow-net && deno run --allow-all npm:@playwright/test test --config=playwright.config.ts"]