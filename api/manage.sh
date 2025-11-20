#!/bin/bash

set -e

if [ -n "$CI" ] || [ -n "$BUILD_SHA" ]; then
  IS_BUILD="1"
else
  IS_BUILD=""
fi

install_deps() {
  deno install --node-modules-dir
}

do_run() {
  if [ -n "$IS_BUILD" ] && [ -f "/release/build" ]; then
    echo "The project has been compiled"
  else
    echo "The project is not compiled"
    install_deps
  fi

  export IS_BUILD="$IS_BUILD"

  echo "Starting PM2 processes..."
  pm2 start ecosystem.config.js

  echo "Tailing PM2 logs..."
  pm2 logs
}

do_build() {
  install_deps

  if [ -n "$IS_BUILD" ]; then
    echo "Compiling the API server"
    deno task build
  else
    echo "Skipping compilation"
  fi
}

if [ "$1" = "--run" ]; then
  do_run
elif [ "$1" = "--build" ]; then
  do_build
else
  echo "No command selected."
fi
