#!/bin/bash

set -e

do_run() {
  deno install

  echo "Starting PM2 processes..."
  pm2 start ecosystem.config.cjs

  echo "Tailing PM2 logs..."
  pm2 logs
}

if [ "$1" = "--run" ]; then
  do_run
else
  echo "No command selected."
fi
