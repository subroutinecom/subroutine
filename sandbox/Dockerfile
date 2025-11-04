FROM ubuntu:noble

RUN apt-get update && apt-get install -y curl unzip ca-certificates bubblewrap ripgrep

RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
  apt-get install -y nodejs

RUN npm install -g yarn pm2

RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh -s -- -y v2.5.6

WORKDIR /app

COPY ./sandbox .

EXPOSE 3000

CMD ["pm2-runtime", "start", "ecosystem.config.js"]
