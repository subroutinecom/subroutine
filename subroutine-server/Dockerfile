FROM ubuntu:noble

RUN apt-get update && apt-get install -y curl unzip ca-certificates nginx

RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh -s -- -y v2.5.6
RUN apt-get install -y npm
RUN npm install -g pm2

WORKDIR /app

COPY ./subroutine-server ./subroutine-server
COPY ./eslint ./eslint
COPY ./eslint.config.ts ./eslint.config.ts

WORKDIR /app/subroutine-server

CMD ["./entrypoint.sh", "--run"]
