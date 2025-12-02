#!/bin/bash

if [ -n "$CI" ] || [ -n "$BUILD_SHA" ]; then IS_BUILD="1"; else IS_BUILD=""; fi

set -e

do_run() {
  echo "Installing dependencies..."
  deno install

  export IS_BUILD="$IS_BUILD"

  echo "Starting PM2 processes..."
  pm2 start ecosystem.config.js

  echo "Tailing PM2 logs..."
  pm2 logs
}

do_build() {
  deno install

  echo "Skipping compilation; sandbox now runs directly from source"
}

if [ "$1" = "--run" ]; then
  do_run
elif [ "$1" = "--build" ]; then
  do_build
else
  echo "No command selected."
fi
