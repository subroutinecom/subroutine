#!/bin/bash

set -e

do_run() {
  deno install

  # print env
  echo "Environment:"
  env

  echo "Starting PM2 processes..."
  pm2 start ecosystem.config.js

  echo "Tailing PM2 logs..."
  pm2 logs
}

do_build() {
  echo "Building"
  deno install
}

if [ "$1" = "--run" ]; then
  do_run
elif [ "$1" = "--build" ]; then
  do_build
else
  echo "No command selected."
fi
